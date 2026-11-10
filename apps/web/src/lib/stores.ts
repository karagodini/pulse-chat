import { SessionUser } from '@pulse/shared';
import { create } from 'zustand';

type AuthState = {
  user: SessionUser | null;
  accessToken: string | null;
  setSession: (session: { user: SessionUser; accessToken: string }) => void;
  patchUser: (user: SessionUser) => void;
  clear: () => void;
};

export const useAuth = create<AuthState>((set) => ({
  user: null,
  accessToken: null,
  setSession: (session) => set(session),
  patchUser: (user) => set({ user }),
  clear: () => set({ user: null, accessToken: null }),
}));

type UiState = {
  workspaceId: string | null;
  channelId: string | null;
  threadId: string | null;
  searchOpen: boolean;
  sidebarOpen: boolean;
  setWorkspaceId: (id: string) => void;
  setChannelId: (id: string) => void;
  setThreadId: (id: string | null) => void;
  setSearchOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
};

const memory = new Map<string, string>();
const storage = {
  get(key: string) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return memory.get(key) ?? null;
    }
  },
  set(key: string, value: string) {
    try {
      sessionStorage.setItem(key, value);
    } catch {
      memory.set(key, value);
    }
  },
};

export const useUi = create<UiState>((set) => ({
  workspaceId: storage.get('pulse.workspace'),
  channelId: storage.get('pulse.channel'),
  threadId: null,
  searchOpen: false,
  sidebarOpen: false,
  setWorkspaceId: (id) => {
    storage.set('pulse.workspace', id);
    set({ workspaceId: id, channelId: null, threadId: null });
  },
  setChannelId: (id) => {
    storage.set('pulse.channel', id);
    set({ channelId: id, threadId: null, sidebarOpen: false });
  },
  setThreadId: (id) => set({ threadId: id }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
}));

type Toast = { id: number; text: string };
type ToastState = {
  toasts: Toast[];
  push: (text: string) => void;
  dismiss: (id: number) => void;
};

export const useToasts = create<ToastState>((set) => ({
  toasts: [],
  push: (text) => {
    const id = Date.now() + Math.random();
    set((state) => ({ toasts: [...state.toasts, { id, text }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, 4200);
  },
  dismiss: (id) => set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) })),
}));
