import { create } from 'zustand';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
}

interface ConversationState {
  messages: ChatMessage[];
  streaming: boolean;
  streamBuffer: string;
  addMessage: (message: ChatMessage) => void;
  appendToStream: (chunk: string) => void;
  finalizeStream: () => void;
  clearMessages: () => void;
}

export const useConversationStore = create<ConversationState>((set, get) => ({
  messages: [],
  streaming: false,
  streamBuffer: '',
  addMessage: (message) =>
    set((state) => ({ messages: [...state.messages, message] })),
  appendToStream: (chunk) =>
    set((state) => ({
      streaming: true,
      streamBuffer: state.streamBuffer + chunk,
    })),
  finalizeStream: () => {
    const { streamBuffer } = get();
    if (streamBuffer) {
      set((state) => ({
        messages: [
          ...state.messages,
          {
            role: 'assistant',
            content: streamBuffer,
            timestamp: new Date().toISOString(),
          },
        ],
        streaming: false,
        streamBuffer: '',
      }));
    } else {
      set({ streaming: false, streamBuffer: '' });
    }
  },
  clearMessages: () => set({ messages: [], streaming: false, streamBuffer: '' }),
}));
