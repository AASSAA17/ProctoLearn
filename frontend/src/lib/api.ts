import axios from 'axios';
import { CsrfCoordinator, isCsrfFailure, isUnauthorized, SessionCoordinator, SessionLock } from './session-coordinator';

export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
// An empty build-time value deliberately selects the browser's current origin.
// This lets the controlled pilot keep Socket.IO behind the same HTTPS host
// without baking a provider hostname into the JavaScript bundle.
export const WS_URL = process.env.NEXT_PUBLIC_WS_URL || (typeof window !== 'undefined' ? window.location.origin : 'ws://localhost:4000');
const options = { baseURL: API_URL, withCredentials: true, timeout: 20000, headers: { 'Content-Type': 'application/json' } };
const raw = axios.create(options);
export const api = axios.create(options);
const csrf = new CsrfCoordinator(async () => (await raw.get('/auth/csrf')).data.csrfToken);
const withSessionLock: SessionLock = async (operation) => {
  if (typeof navigator === 'undefined' || !navigator.locks) throw new Error('Сессияны қауіпсіз жаңарту үшін Web Locks қолдайтын заманауи браузер қажет.');
  return navigator.locks.request('proctolearn-auth-session', operation);
};
const rawPost = <T>(url: string, data: unknown, actor?: string) => csrf.run((token) => raw.post<T>(url, data, { headers: { 'X-CSRF-Token': token, ...(actor ? { 'X-Session-User': actor } : {}) } }));
const sessions = new SessionCoordinator(async () => (await raw.get('/auth/me')).data, () => rawPost('/auth/refresh', {}), withSessionLock);
type AuthEvent = 'changed' | 'expired';
const authListeners = new Set<(event: AuthEvent) => void>();
export function onAuthEvent(listener: (event: AuthEvent) => void) { authListeners.add(listener); return () => { authListeners.delete(listener); }; }
function notifyAuth(event: AuthEvent) { authListeners.forEach((listener) => listener(event)); }
function handleSessionMismatch(error: any) {
  if (error.response?.data?.code === 'AUTH_CHANGED') {
    csrf.invalidate(); sessions.changed(true); sessions.setPrincipal(); notifyAuth('changed');
  } else if (error.rebootstrap) notifyAuth('changed');
}
const channel = typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('proctolearn-session') : null;
channel?.addEventListener('message', (event) => {
  if (event.data !== 'changed') return;
  csrf.invalidate();
  sessions.changed(true);
  notifyAuth('changed');
});

export function clearLegacyAuth() {
  if (typeof window === 'undefined') return;
  try { for (const key of ['accessToken', 'refreshToken', 'proctolearn-auth']) localStorage.removeItem(key); } catch { /* Storage may be disabled; cookies still work. */ }
}

/** Serialize cookie-changing actions with refresh so a late refresh cannot undo logout. */
export async function authMutation<T = unknown>(url: string, data: unknown = {}, authenticated = false) {
  clearLegacyAuth();
  const actor = authenticated ? sessions.principal : undefined;
  let response;
  try {
    response = await sessions.mutate(async () => {
      const answer = await rawPost<T>(url, data, actor);
      csrf.invalidate();
      return answer;
    }, authenticated);
  } catch (error: any) { handleSessionMismatch(error); throw error; }
  sessions.setPrincipal((response.data as { user?: { id: string } })?.user?.id);
  channel?.postMessage('changed');
  return response;
}

api.interceptors.request.use(async (config) => {
  const request = config as typeof config & { _authGeneration?: number; _authIdentity?: number };
  request._authGeneration = sessions.generation;
  request._authIdentity ??= sessions.identity;
  sessions.assertIdentity(request._authIdentity);
  if (sessions.principal && !config.headers.has('X-Session-User')) config.headers.set('X-Session-User', sessions.principal);
  if (!['get', 'head', 'options'].includes((config.method ?? 'get').toLowerCase())) config.headers.set('X-CSRF-Token', await csrf.get());
  sessions.assertIdentity(request._authIdentity);
  return config;
});
api.interceptors.response.use((response) => {
  sessions.assertIdentity((response.config as typeof response.config & { _authIdentity: number })._authIdentity);
  if (/\/auth\/me(?:\?|$)/.test(response.config.url ?? '')) {
    try { sessions.observePrincipal(response.data.id); }
    catch (error: any) { if (error.rebootstrap) notifyAuth('changed'); throw error; }
  }
  return response;
}, async (error) => {
  const request = error.config;
  if (!request) return Promise.reject(error);
  sessions.assertIdentity(request._authIdentity);
  if (error.response?.data?.code === 'AUTH_CHANGED') { handleSessionMismatch(error); return Promise.reject(error); }
  if (isCsrfFailure(error) && !request._csrfRetry) {
    request._csrfRetry = true;
    csrf.invalidate(request.headers?.get?.('X-CSRF-Token') ?? request.headers?.['X-CSRF-Token']);
    if (sessions.principal) {
      try { await sessions.recover(request._authGeneration, request._authIdentity); }
      catch (refreshError: any) { if (refreshError.rebootstrap) notifyAuth('changed'); if (isUnauthorized(refreshError)) notifyAuth('expired'); throw refreshError; }
    }
    return api(request);
  }
  const anonymousAuth = /\/auth\/(login|register|refresh|logout|forgot-password|reset-password|csrf)(?:\?|$)/.test(request.url ?? '');
  if (isUnauthorized(error) && !request._authRetry && !anonymousAuth) {
    request._authRetry = true;
    try {
      await sessions.recover(request._authGeneration ?? sessions.generation, request._authIdentity);
      return api(request);
    } catch (refreshError: any) {
      if (refreshError.rebootstrap) notifyAuth('changed');
      if (isUnauthorized(refreshError)) notifyAuth('expired');
      // Network and server failures preserve the current user and the durable exam state.
      return Promise.reject(refreshError);
    }
  }
  return Promise.reject(error);
});

export default api;
