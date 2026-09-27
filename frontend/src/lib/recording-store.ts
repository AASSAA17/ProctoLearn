export type RecordingKind = 'camera' | 'screen';
export type LocalRecording = {
  id: string;
  ownerId: string;
  examId: string;
  attemptId: string;
  kind: RecordingKind;
  mimeType: string;
  state: 'recording' | 'pending' | 'complete' | 'superseded';
  interrupted: boolean;
  nextIndex: number;
  totalBytes: number;
  uploadId: string | null;
  createdAt: number;
  updatedAt: number;
  sourceSessionId?: string;
  supersededBy?: string;
};
export type StoredChunk = { sessionId: string; index: number; blob: Blob; size: number; sent: 0 | 1 };
export interface RecordingStore {
  create(session: LocalRecording): Promise<void>;
  get(id: string): Promise<LocalRecording>;
  list(ownerId: string, examId?: string): Promise<LocalRecording[]>;
  update(id: string, patch: Partial<LocalRecording>): Promise<LocalRecording>;
  append(id: string, blob: Blob): Promise<void>;
  nextUnsent(id: string): Promise<StoredChunk | null>;
  markSent(id: string, index: number): Promise<void>;
  complete(id: string): Promise<void>;
  cloneForRetry(id: string, replacementId: string): Promise<LocalRecording>;
}

const LOCAL_LIMIT = 512 * 1024 * 1024;
function result<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Local recording storage failed'));
  });
}
function completed(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error ?? new Error('Local recording transaction aborted'));
    transaction.onerror = () => reject(transaction.error ?? new Error('Local recording transaction failed'));
  });
}

/** Blobs and their next sequence number commit in the same IndexedDB transaction. */
export class IndexedDbRecordingStore implements RecordingStore {
  private opened: Promise<IDBDatabase> | null = null;
  async open(): Promise<IDBDatabase> {
    if (!this.opened) this.opened = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') { reject(new Error('Бұл браузер жергілікті жазба сақтауын қолдамайды.')); return; }
      const request = indexedDB.open('proctolearn-recordings-v1', 1);
      request.onupgradeneeded = () => {
        const sessions = request.result.createObjectStore('sessions', { keyPath: 'id' });
        sessions.createIndex('owner', 'ownerId');
        sessions.createIndex('ownerAttempt', ['ownerId', 'attemptId']);
        const chunks = request.result.createObjectStore('chunks', { keyPath: ['sessionId', 'index'] });
        chunks.createIndex('pending', ['sessionId', 'sent', 'index']);
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => { request.result.close(); this.opened = null; };
        resolve(request.result);
      };
      request.onerror = () => { this.opened = null; reject(request.error); };
      request.onblocked = () => { this.opened = null; reject(new Error('Жазба қоймасын ашу үшін ескі қойындыларды жабыңыз.')); };
    });
    return this.opened;
  }
  async create(session: LocalRecording) {
    const db = await this.open();
    const tx = db.transaction('sessions', 'readwrite');
    const done = completed(tx);
    tx.objectStore('sessions').add(session);
    await done;
  }
  async get(id: string) {
    const db = await this.open();
    const session = await result<LocalRecording | undefined>(db.transaction('sessions').objectStore('sessions').get(id));
    if (!session) throw new Error('Local recording not found');
    return session;
  }
  async list(ownerId: string, examId?: string) {
    const db = await this.open();
    const sessions = await result<LocalRecording[]>(db.transaction('sessions').objectStore('sessions').index('owner').getAll(ownerId));
    return sessions.filter((session) => (!examId || session.examId === examId)).sort((a, b) => a.createdAt - b.createdAt);
  }
  async update(id: string, patch: Partial<LocalRecording>) {
    const db = await this.open();
    const tx = db.transaction('sessions', 'readwrite');
    const done = completed(tx);
    const store = tx.objectStore('sessions');
    let updated: LocalRecording;
    const request = store.get(id);
    request.onsuccess = () => {
      if (!request.result) { tx.abort(); return; }
      updated = {
        ...request.result, ...patch, id, updatedAt: Date.now(),
        interrupted: request.result.interrupted || patch.interrupted === true,
        state: ['complete', 'superseded'].includes(request.result.state) ? request.result.state : patch.state ?? request.result.state,
      };
      store.put(updated);
    };
    await done;
    return updated!;
  }
  async append(id: string, blob: Blob) {
    const db = await this.open();
    const tx = db.transaction(['sessions', 'chunks'], 'readwrite');
    const done = completed(tx);
    const sessions = tx.objectStore('sessions');
    let failure: Error | null = null;
    const request = sessions.get(id);
    request.onsuccess = () => {
      const session = request.result as LocalRecording | undefined;
      if (!session || session.state === 'complete' || session.state === 'superseded') { tx.abort(); return; }
      const sameAttempt = sessions.index('ownerAttempt').getAll([session.ownerId, session.attemptId]);
      sameAttempt.onsuccess = () => {
        const total = (sameAttempt.result as LocalRecording[]).filter((item) => !item.supersededBy).reduce((sum, item) => sum + item.totalBytes, 0);
        if (total + blob.size > LOCAL_LIMIT) { failure = new Error('Емтихан жазбасы 512 MiB шегіне жетті.'); tx.abort(); return; }
        tx.objectStore('chunks').add({ sessionId: id, index: session.nextIndex, blob, size: blob.size, sent: 0 } satisfies StoredChunk);
        sessions.put({ ...session, nextIndex: session.nextIndex + 1, totalBytes: session.totalBytes + blob.size, updatedAt: Date.now() });
      };
    };
    try { await done; } catch (error) { throw failure ?? error; }
  }
  async nextUnsent(id: string) {
    const db = await this.open();
    const cursor = await result(db.transaction('chunks').objectStore('chunks').index('pending').openCursor(IDBKeyRange.bound([id, 0, 0], [id, 0, Number.MAX_SAFE_INTEGER])));
    if (!cursor) return null;
    const chunk = cursor.value;
    if (!chunk.blob && chunk.sourceSessionId) {
      const source = await result(db.transaction('chunks').objectStore('chunks').get([chunk.sourceSessionId, chunk.index]));
      if (!source?.blob) throw new Error('Жергілікті жазба бөлігі табылмады.');
      return { ...chunk, blob: source.blob } as StoredChunk;
    }
    return chunk as StoredChunk;
  }
  async markSent(id: string, index: number) {
    const db = await this.open();
    const tx = db.transaction('chunks', 'readwrite');
    const done = completed(tx);
    const store = tx.objectStore('chunks');
    const request = store.get([id, index]);
    request.onsuccess = () => { if (request.result) store.put({ ...request.result, sent: 1 }); else tx.abort(); };
    await done;
  }
  async complete(id: string) {
    const db = await this.open();
    const tx = db.transaction(['sessions', 'chunks'], 'readwrite');
    const done = completed(tx);
    const sessions = tx.objectStore('sessions');
    const request = sessions.get(id);
    request.onsuccess = () => {
      if (!request.result || request.result.supersededBy) { tx.abort(); return; }
      sessions.put({ ...request.result, state: 'complete', updatedAt: Date.now() });
      tx.objectStore('chunks').delete(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
      const sourceId = request.result.sourceSessionId;
      if (sourceId) {
        tx.objectStore('chunks').delete(IDBKeyRange.bound([sourceId, 0], [sourceId, Number.MAX_SAFE_INTEGER]));
      }
    };
    await done;
  }

  async cloneForRetry(id: string, replacementId: string) {
    const db = await this.open();
    const tx = db.transaction(['sessions', 'chunks'], 'readwrite');
    const done = completed(tx);
    const sessions = tx.objectStore('sessions');
    const chunks = tx.objectStore('chunks');
    let replacement: LocalRecording;
    const original = sessions.get(id);
    original.onsuccess = () => {
      const source: LocalRecording = original.result;
      if (!source || source.state === 'complete' || source.supersededBy) { tx.abort(); return; }
      replacement = {
        ...source, id: replacementId, uploadId: null, state: 'pending',
        sourceSessionId: source.sourceSessionId ?? id, supersededBy: undefined,
        interrupted: true, updatedAt: Date.now(),
      };
      sessions.add(replacement);
      sessions.put({ ...source, state: 'superseded', supersededBy: replacementId });
      const cursor = chunks.openCursor(IDBKeyRange.bound([id, 0], [id, Number.MAX_SAFE_INTEGER]));
      cursor.onsuccess = () => {
        const entry = cursor.result;
        if (!entry) return;
        // New manifest references the existing durable bytes until the new server acknowledgement.
        chunks.add({ sessionId: replacementId, index: entry.value.index, size: entry.value.size, sent: 0, sourceSessionId: replacement.sourceSessionId });
        entry.continue();
      };
    };
    await done;
    return replacement!;
  }
}
