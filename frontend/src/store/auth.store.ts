import { create } from 'zustand';
import api from '@/lib/api';

interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'STUDENT' | 'TEACHER' | 'PROCTOR' | 'ADMIN';
  mustChangePassword?: boolean;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, phone?: string) => Promise<void>;
  logout: () => Promise<void>;
  fetchMe: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,

  setUser: (user) => set({ user }),

  login: async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user });
  },

  register: async (name, email, password, phone) => {
    const { data } = await api.post('/auth/register', { name, email, password, phone });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    set({ user: data.user });
  },

  logout: async () => {
    try {
      await api.post('/auth/logout');
    } catch {}
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    set({ user: null });
  },

  fetchMe: async () => {
    set({ isLoading: true });
    try {
      const token = localStorage.getItem('accessToken');
      if (!token) { set({ user: null, isLoading: false }); return; }
      const { data } = await api.get('/auth/me');
      set({ user: data, isLoading: false });
    } catch {
      set({ user: null, isLoading: false });
    }
  },
}));
