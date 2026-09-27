type HttpFailure = { response?: { status?: number; data?: { code?: string } } };
export const isUnauthorized = (error: unknown) => (error as HttpFailure)?.response?.status === 401;
export const isCsrfFailure = (error: unknown) => (error as HttpFailure)?.response?.status === 403 && (error as HttpFailure)?.response?.data?.code === 'CSRF_INVALID';
export type SessionLock = <T>(operation: () => Promise<T>) => Promise<T>;

/** A generation marks the cookies used by an outgoing request, without reading those cookies. */
export class SessionCoordinator {
  private currentGeneration = 0;
  private currentIdentity = 0;
  private principalId: string | undefined;
  private pending: Promise<void> | null = null;
  constructor(private readonly check: () => Promise<{ id: string }>, private readonly refresh: () => Promise<unknown>, private readonly lock: SessionLock) {}
  get generation() { return this.currentGeneration; }
  get identity() { return this.currentIdentity; }
  get principal() { return this.principalId; }
  setPrincipal(id?: string) { this.principalId = id; }
  changed(identity = false) { this.currentGeneration++; if (identity) this.currentIdentity++; }
  assertIdentity(observedIdentity: number) {
    if (observedIdentity !== this.currentIdentity) throw Object.assign(new Error('Аккаунт басқа қойындыда өзгерді. Бетті жаңартыңыз.'), { code: 'AUTH_CHANGED' });
  }
  async verifyInsideLock() {
    let user: { id: string };
    try { user = await this.check(); }
    catch (error) { if (!isUnauthorized(error)) throw error; await this.refresh(); user = await this.check(); }
    this.observePrincipal(user.id);
  }
  observePrincipal(id: string) {
    if (this.principalId && id !== this.principalId) {
      this.setPrincipal(id);
      this.changed(true);
      throw Object.assign(new Error('Аккаунт басқа қойындыда өзгерді. Бетті жаңартыңыз.'), { code: 'AUTH_CHANGED', rebootstrap: true });
    }
    this.setPrincipal(id);
  }
  recover(observedGeneration: number, observedIdentity = this.identity): Promise<void> {
    this.assertIdentity(observedIdentity);
    if (!this.pending) {
      this.pending = this.lock(async () => {
        this.assertIdentity(observedIdentity);
        // Another tab may have rotated the shared cookies while we waited for its lock.
        await this.verifyInsideLock();
        this.assertIdentity(observedIdentity);
        this.changed();
      }).finally(() => { this.pending = null; });
    }
    return this.pending;
  }
  mutate<T>(operation: () => Promise<T>, authenticated = false): Promise<T> {
    const identity = this.identity;
    return this.lock(async () => {
      this.assertIdentity(identity);
      if (authenticated) await this.verifyInsideLock();
      this.assertIdentity(identity);
      const response = await operation();
      this.assertIdentity(identity);
      this.changed(true);
      return response;
    });
  }
}

/** CSRF tokens stay in memory. Only an explicit CSRF rejection allows one bootstrap/retry. */
export class CsrfCoordinator {
  private token: string | null = null;
  private pending: Promise<string> | null = null;
  constructor(private readonly bootstrap: () => Promise<string>) {}
  invalidate(rejectedToken?: string) {
    if (rejectedToken && rejectedToken !== this.token) return;
    this.token = null;
    this.pending = null;
  }
  get(): Promise<string> {
    if (this.token) return Promise.resolve(this.token);
    if (!this.pending) {
      const request = this.bootstrap().then((token) => {
        if (!token) throw new Error('CSRF қорғанысын дайындау мүмкін болмады.');
        if (this.pending === request) this.token = token;
        return token;
      }).finally(() => { if (this.pending === request) this.pending = null; });
      this.pending = request;
    }
    return this.pending;
  }
  async run<T>(operation: (token: string) => Promise<T>): Promise<T> {
    const token = await this.get();
    try { return await operation(token); }
    catch (error) {
      if (!isCsrfFailure(error)) throw error;
      this.invalidate(token);
      return operation(await this.get());
    }
  }
}
