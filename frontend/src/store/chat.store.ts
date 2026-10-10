import { create } from 'zustand';
import api from '@/lib/api';
let pendingChat: AbortController | null = null;
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
interface ChatStore {
  ownerId: string | null;
  sessionVersion: number;
  setOwner: (ownerId: string | null) => void;
  sendMessage: (content: string, sessionVersion: number) => Promise<void>;
  isOpen: boolean;
  isLoading: boolean;
  messages: ChatMessage[];
  courseId: string | undefined;
  toggleChat: () => void;
  openChat: () => void;
  closeChat: () => void;
  setCourseId: (id: string | undefined) => void;
  addMessage: (msg: Omit<ChatMessage, 'id' | 'timestamp'>) => void;
  setLoading: (v: boolean) => void;
  clearMessages: () => void;
}
export const useChatStore = create<ChatStore>((set, get) => ({
  ownerId: null,
  sessionVersion: 0,
  setOwner: (ownerId) => set((state) => {
    if (state.ownerId === ownerId) return state;
    pendingChat?.abort();
    pendingChat = null;
    return { ownerId, sessionVersion: state.sessionVersion + 1, messages: [],
      isOpen: false, isLoading: false, courseId: undefined };
  }),
  sendMessage: async (content, sessionVersion) => {
    const state = get();
    const message = content.trim();
    if (!message || !state.ownerId || state.isLoading || state.sessionVersion !== sessionVersion) return;
    const history = state.messages.slice(-6).map(({ role, content }) => ({ role, content }));
    state.addMessage({ role: 'user', content: message });
    set({ isLoading: true });
    const request = new AbortController();
    pendingChat = request;
    try {
      const { data } = await api.post<{ reply: string }>('/ai/chat', { message, history, courseId: state.courseId }, {
        headers: { 'X-Session-User': state.ownerId },
        timeout: 125000,
        signal: request.signal,
      });
      if (get().sessionVersion === sessionVersion) get().addMessage({ role: 'assistant', content: data.reply });
    } catch {
      if (get().sessionVersion === sessionVersion) get().addMessage({ role: 'assistant', content: 'Қате орын алды. Сәл кейін қайталаңыз.' });
    } finally {
      if (pendingChat === request) pendingChat = null;
      if (get().sessionVersion === sessionVersion) set({ isLoading: false });
    }
  },
  isOpen: false,
  isLoading: false,
  messages: [],
  courseId: undefined,
  toggleChat: () => set((s) => ({ isOpen: !s.isOpen })),
  openChat: () => set({ isOpen: true }),
  closeChat: () => set({ isOpen: false }),
  setCourseId: (id) => set({ courseId: id }),
  addMessage: (msg) =>
    set((s) => ({
      messages: [
        ...s.messages,
        { ...msg, id: crypto.randomUUID(), timestamp: new Date() },
      ],
    })),
  setLoading: (v) => set({ isLoading: v }),
  clearMessages: () => set({ messages: [] }),
}));
