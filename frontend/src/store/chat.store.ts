import { create } from 'zustand';
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}
interface ChatStore {
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
export const useChatStore = create<ChatStore>((set) => ({
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
