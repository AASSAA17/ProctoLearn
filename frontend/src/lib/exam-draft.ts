export type DraftAnswer = { questionId: string; answer: string };
export type ExamDraft = { answers: DraftAnswer[]; revision: number; updatedAt: string | null };
export type DraftStatus = 'saved' | 'unsaved' | 'saving' | 'offline' | 'conflict' | 'closed' | 'error' | 'stopped';
export type DraftState = { status: DraftStatus; revision: number; updatedAt: string | null; dirty: boolean };
type DraftWriter = (value: { answers: DraftAnswer[]; revision: number }, signal: AbortSignal) => Promise<ExamDraft>;

export function answerList(answers: Record<string, string>): DraftAnswer[] {
  return Object.entries(answers).filter(([, answer]) => answer.trim()).map(([questionId, answer]) => ({ questionId, answer }));
}

export function answerMap(draft: ExamDraft): Record<string, string> {
  return Object.fromEntries(draft.answers.map(({ questionId, answer }) => [questionId, answer]));
}

function fingerprint(answers: DraftAnswer[]): string {
  return JSON.stringify([...answers].sort((a, b) => a.questionId.localeCompare(b.questionId)));
}

/** One writer at a time. A response acknowledges its own snapshot, never newer edits. */
export class ExamDraftSaver {
  private revision: number;
  private updatedAt: string | null;
  private latest: DraftAnswer[];
  private savedFingerprint: string;
  private status: DraftStatus = 'saved';
  private timer: ReturnType<typeof setTimeout> | undefined;
  private inFlight: Promise<void> | null = null;
  private controller: AbortController | null = null;
  private disposed = false;

  constructor(
    draft: ExamDraft,
    private readonly write: DraftWriter,
    private readonly changed: (state: DraftState) => void,
    private readonly delay = 600,
  ) {
    this.revision = draft.revision;
    this.updatedAt = draft.updatedAt;
    this.latest = structuredClone(draft.answers);
    this.savedFingerprint = fingerprint(this.latest);
  }

  get state(): DraftState {
    return { status: this.status, revision: this.revision, updatedAt: this.updatedAt, dirty: fingerprint(this.latest) !== this.savedFingerprint };
  }

  update(answers: Record<string, string>) {
    if (this.disposed) return;
    this.latest = answerList(answers);
    if (['conflict', 'closed', 'offline', 'error'].includes(this.status)) { this.emit(); return; }
    clearTimeout(this.timer);
    this.status = this.inFlight ? 'saving' : this.state.dirty ? 'unsaved' : 'saved';
    this.emit();
    if (this.state.dirty && !this.inFlight) this.timer = setTimeout(() => { void this.flush(); }, this.delay);
  }

  async flush(): Promise<void> {
    clearTimeout(this.timer);
    if (this.disposed || this.status === 'conflict' || this.status === 'closed') return;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.drain();
    try { await this.inFlight; } finally { this.inFlight = null; }
  }

  /** Explicit recovery: callers show the newly loaded server answers before allowing editing. */
  replaceFromServer(draft: ExamDraft) {
    if (this.disposed || this.inFlight) throw new Error('Draft write is still active');
    clearTimeout(this.timer);
    this.latest = structuredClone(draft.answers);
    this.savedFingerprint = fingerprint(this.latest);
    this.revision = draft.revision;
    this.updatedAt = draft.updatedAt;
    this.status = 'saved';
    this.emit();
  }

  dispose() {
    this.disposed = true;
    clearTimeout(this.timer);
    this.controller?.abort();
    this.status = 'stopped';
  }

  private emit() { if (!this.disposed) this.changed(this.state); }

  private async drain() {
    while (!this.disposed && this.state.dirty) {
      const snapshot = structuredClone(this.latest);
      const sentFingerprint = fingerprint(snapshot);
      this.controller = new AbortController();
      this.status = 'saving';
      this.emit();
      try {
        const saved = await this.write({ revision: this.revision, answers: snapshot }, this.controller.signal);
        if (this.disposed) return;
        this.revision = saved.revision;
        this.updatedAt = saved.updatedAt;
        this.savedFingerprint = sentFingerprint;
      } catch (error: any) {
        if (this.disposed) return;
        const code = error?.response?.data?.code;
        this.status = code === 'DRAFT_CONFLICT' ? 'conflict'
          : ['ATTEMPT_CLOSED', 'EXAM_EXPIRED'].includes(code) ? 'closed'
          : !error?.response || error?.response?.status >= 500 ? 'offline' : 'error';
        this.emit();
        return;
      }
    }
    if (!this.disposed) { this.status = 'saved'; this.emit(); }
  }
}
