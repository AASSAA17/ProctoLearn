import { create } from 'zustand';
import { useChatStore } from './chat.store';
import api, { authMutation, clearLegacyAuth, onAuthEvent } from '@/lib/api';
import { isUnauthorized } from '@/lib/session-coordinator';

export interface User {
  id: string; name: string; email: string; phone?: string;
  role: 'STUDENT' | 'TEACHER' | 'PROCTOR' | 'ADMIN'; mustChangePassword?: boolean;
}
interface AuthState {
  user: User | null;
  isLoading: boolean;
  initialized: boolean;
  error: string | null;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}
let generation = 0;
let bootstrap: Promise<void> | null = null;
export const useAuthStore = create<AuthState>((set) => ({
  user: null, isLoading: false, initialized: false, error: null,
  setUser: (user) => { generation++; set({ user, initialized: true, error: null }); },
  login: async (email, password) => {
    const expected = ++generation;
    const { data } = await authMutation<{ user: User }>('/auth/login', { email, password });
    if (expected !== generation) throw new Error('Сессия басқа қойындыда өзгерді. Қайта көріңіз.');
    set({ user: data.user, initialized: true, error: null, isLoading: false });
  },
  register: async (name, email, password, phone) => {
    const expected = ++generation;
    const { data } = await authMutation<{ user: User }>('/auth/register', { name, email, password, phone });
    if (expected !== generation) throw new Error('Сессия басқа қойындыда өзгерді. Қайта көріңіз.');
    set({ user: data.user, initialized: true, error: null, isLoading: false });
  },
  logout: async () => {
    const expected = ++generation;
    // HttpOnly cookies must be cleared by the server, even if no user is currently in memory.
    await authMutation('/auth/logout');
    if (expected !== generation) return;
    set({ user: null, initialized: true, error: null, isLoading: false });
  },
  fetchMe: () => {
    if (bootstrap) return bootstrap;
    const expected = generation;
    clearLegacyAuth();
    set({ isLoading: true, error: null });
    bootstrap = (async () => {
      try {
        const { data } = await api.get<User>('/auth/me');
        if (expected === generation) set({ user: data, initialized: true, error: null });
      } catch (error) {
        if (expected !== generation) return;
        if (isUnauthorized(error)) set({ user: null, initialized: true, error: null });
        else set({ initialized: true, error: 'Сервермен байланыс жоқ. Сессияны тексеруді қайта көріңіз.' });
      } finally { if (expected === generation) set({ isLoading: false }); }
    })().finally(() => { bootstrap = null; });
    return bootstrap;
  },
}));

// Synchronous subscription covers login, logout, bootstrap and cross-tab expiry/change.
useAuthStore.subscribe((state) => useChatStore.getState().setOwner(state.user?.id ?? null));

onAuthEvent((event) => {
  generation++;
  if (event === 'expired') useAuthStore.setState({ user: null, initialized: true, isLoading: false, error: null });
  else {
    // A different tab may have switched accounts: never keep the old exam owner's in-memory state.
    useAuthStore.setState({ user: null, initialized: false, isLoading: true, error: null });
    const previous = bootstrap;
    void Promise.resolve(previous).then(() => useAuthStore.getState().fetchMe());
  }
});
