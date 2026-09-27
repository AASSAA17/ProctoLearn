import type { LocalRecording, RecordingStore } from './recording-store';

export type RecordingManifest = {
  id: string; attemptId: string; kind: 'camera' | 'screen'; clientSessionId: string; mimeType: string;
  state: 'OPEN' | 'FINALIZING' | 'COMPLETE' | 'ABORTED'; bytes: number; expectedChunks: number | null;
  interrupted: boolean; expiresAt: string; evidenceId: string | null; chunks: { index: number; sha256: string; size: number }[];
};
export interface RecordingTransport {
  init(session: LocalRecording): Promise<RecordingManifest>;
  get(id: string): Promise<RecordingManifest>;
  put(id: string, index: number, blob: Blob): Promise<RecordingManifest>;
  finish(id: string, expectedChunks: number, interrupted: boolean): Promise<RecordingManifest>;
}
export type RecordingQueueState = { status: 'recording' | 'saving' | 'uploading' | 'offline' | 'storage-error' | 'error' | 'complete'; bufferedBytes: number; message?: string; code?: string };
const CHUNK_BYTES = 2 * 1024 * 1024;
const PAUSE_BYTES = 8 * 1024 * 1024;

/** Durable producer and network consumer use independent serial queues. Blobs survive lost acknowledgements. */
export class DurableRecording {
  private buffers: { blob: Blob; offset: number }[] = [];
  private persisting: Promise<void> | null = null;
  private uploading: Promise<void> | null = null;
  private finishing: Promise<void> | null = null;
  private uploadRequested = 0;
  private uploadProcessed = 0;
  private networkBlocked = false;
  private storageBlocked = false;
  private sealed = false;
  private disposed = false;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private failures = 0;
  private pressure = false;
  private stateValue: RecordingQueueState = { status: 'recording', bufferedBytes: 0 };

  constructor(
    readonly id: string,
    private readonly store: RecordingStore,
    private readonly transport: RecordingTransport,
    private readonly changed: (state: RecordingQueueState) => void = () => {},
    private readonly backpressure: (paused: boolean) => void = () => {},
    private readonly chunkBytes = CHUNK_BYTES,
  ) {}

  get state() { return this.stateValue; }
  get bufferedBytes() { return this.buffers.reduce((sum, entry) => sum + entry.blob.size - entry.offset, 0); }

  append(blob: Blob): Promise<void> {
    if (this.disposed || this.sealed) return Promise.reject(new Error('Recording writer is closed'));
    if (!blob.size) return Promise.resolve();
    this.buffers.push({ blob, offset: 0 });
    this.updatePressure();
    return this.flushLocal();
  }

  async flushLocal(): Promise<void> {
    if (this.disposed) throw new Error('Recording writer is closed');
    if (!this.persisting) {
      this.storageBlocked = false;
      this.persisting = this.persist().finally(() => { this.persisting = null; });
    }
    await this.persisting;
    // An append can join just after the previous loop drained but before its promise settled.
    if (this.buffers.length) await this.flushLocal();
  }

  async finish(interrupted = false): Promise<void> {
    if (this.finishing) return this.finishing;
    this.finishing = this.finishSession(interrupted);
    try { await this.finishing; } finally { this.finishing = null; }
  }

  private async finishSession(interrupted: boolean): Promise<void> {
    this.sealed = true;
    await this.flushLocal();
    const local = await this.store.get(this.id);
    if (local.state === 'complete') return;
    await this.store.update(this.id, { state: 'pending', interrupted: local.interrupted || interrupted });
    await this.retry();
    const saved = await this.store.get(this.id);
    if (saved.state !== 'complete') throw new Error(this.stateValue.message || 'Recording upload is incomplete');
  }

  async retry(): Promise<void> {
    clearTimeout(this.retryTimer);
    this.networkBlocked = false;
    await this.flushLocal();
    await this.requestUpload();
  }

  async markInterrupted() {
    const local = await this.store.get(this.id);
    if (local.state !== 'complete') await this.store.update(this.id, { interrupted: true });
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.retryTimer);
  }

  async close() {
    this.dispose();
    await Promise.allSettled([this.persisting, this.uploading].filter(Boolean));
  }

  private emit(status: RecordingQueueState['status'], message?: string, code?: string) {
    if (this.storageBlocked && status !== 'storage-error') {
      status = 'storage-error';
      message = this.stateValue.message || 'Жергілікті жазбаны сақтау мүмкін болмады.';
    }
    this.stateValue = { status, bufferedBytes: this.bufferedBytes, ...(message ? { message } : {}), ...(code ? { code } : {}) };
    if (!this.disposed) this.changed(this.stateValue);
  }

  private updatePressure() {
    const pause = this.storageBlocked || this.bufferedBytes >= PAUSE_BYTES;
    if (this.pressure !== pause) { this.pressure = pause; if (!this.disposed) this.backpressure(pause); }
  }

  private async persist() {
    try {
      while (this.buffers.length && !this.disposed) {
        const entry = this.buffers[0];
        const chunk = entry.blob.slice(entry.offset, entry.offset + this.chunkBytes, entry.blob.type);
        this.emit('saving');
        await this.store.append(this.id, chunk);
        entry.offset += chunk.size;
        if (entry.offset === entry.blob.size) this.buffers.shift();
        this.updatePressure();
        if (!this.networkBlocked) void this.requestUpload();
      }
      if (!this.disposed && !this.uploading && !this.networkBlocked) this.emit('recording');
    } catch (error: any) {
      this.storageBlocked = true;
      this.updatePressure();
      this.emit('storage-error', error?.message || 'Жергілікті жазбаны сақтау мүмкін болмады.');
      throw error;
    }
  }

  private async requestUpload(): Promise<void> {
    if (this.disposed || this.networkBlocked) return;
    const requested = ++this.uploadRequested;
    while (this.uploadProcessed < requested && !this.networkBlocked && !this.disposed) {
      if (!this.uploading) this.uploading = this.uploadLoop().finally(() => { this.uploading = null; });
      await this.uploading;
    }
  }

  private async uploadLoop() {
    try {
      while (this.uploadProcessed < this.uploadRequested && !this.disposed) {
        const requested = this.uploadRequested;
        let local = await this.store.get(this.id);
        if (local.state === 'complete') { this.uploadProcessed = this.uploadRequested; this.emit('complete'); return; }
        this.emit('uploading');
        // Idempotent init also renews an expired upload when a permitted appeal reopens evidence.
        let manifest = await this.transport.init(local);
        if (local.uploadId && local.uploadId !== manifest.id) throw Object.assign(new Error('Жазба сәйкестендіргіші сәйкес келмейді.'), { permanent: true });
        if (!local.uploadId) local = await this.store.update(this.id, { uploadId: manifest.id });
        if (manifest.state === 'COMPLETE') {
          await this.acceptComplete(local, manifest);
          this.uploadProcessed = this.uploadRequested;
          return;
        }
        if (manifest.state === 'ABORTED') throw Object.assign(new Error('Сервер бұл жүктеуді тоқтатқан. Жергілікті көшірмені жаңа жүктеу арқылы қалпына келтіруге болады.'), { permanent: true, code: 'UPLOAD_ABORTED' });
        if (manifest.state === 'FINALIZING') {
          // Only complete can reclaim an expired server lease after its worker crashes.
          if (local.state !== 'pending' || this.buffers.length) throw { response: { status: 409, data: { code: 'UPLOAD_FINALIZING' } } };
          manifest = await this.transport.finish(manifest.id, local.nextIndex, local.interrupted);
          await this.acceptComplete(local, manifest);
          this.uploadProcessed = this.uploadRequested;
          return;
        }
        for (;;) {
          const chunk = await this.store.nextUnsent(this.id);
          if (!chunk || this.disposed) break;
          manifest = await this.transport.put(manifest.id, chunk.index, chunk.blob);
          await this.store.markSent(this.id, chunk.index);
        }
        local = await this.store.get(this.id);
        if (local.state === 'pending' && !this.buffers.length) {
          if (!local.nextIndex) throw Object.assign(new Error('Жазба деректері жоқ. Тексерушіге хабарласыңыз.'), { permanent: true });
          manifest = await this.transport.finish(manifest.id, local.nextIndex, local.interrupted);
          await this.acceptComplete(local, manifest);
        } else if (!this.disposed) this.emit('recording');
        this.uploadProcessed = requested;
        this.failures = 0;
      }
    } catch (error: any) {
      if (this.disposed) return;
      this.networkBlocked = true;
      const transient = !error?.permanent && (!error?.response || error.response.status >= 500 || error.response.data?.code === 'UPLOAD_FINALIZING');
      const message = typeof error?.response?.data?.message === 'string' ? error.response.data.message : error?.message || 'Жазба серверге жүктелмеді. Жергілікті көшірме сақталған.';
      this.emit(transient ? 'offline' : 'error', message, error?.response?.data?.code ?? error?.code);
      if (transient) {
        const wait = Math.min(30000, 1000 * 2 ** Math.min(this.failures++, 5));
        this.retryTimer = setTimeout(() => { void this.retry().catch(() => {}); }, wait);
      }
    }
  }

  private async acceptComplete(local: LocalRecording, manifest: RecordingManifest) {
    if (manifest.state !== 'COMPLETE' || !manifest.evidenceId || manifest.clientSessionId !== local.id || manifest.attemptId !== local.attemptId || local.state !== 'pending' || manifest.expectedChunks !== local.nextIndex || manifest.bytes !== local.totalBytes) {
      throw Object.assign(new Error('Жазба толық қабылданғаны расталмады. Жергілікті көшірме сақталған.'), { permanent: true });
    }
    await this.store.complete(this.id);
    this.emit('complete');
  }
}
