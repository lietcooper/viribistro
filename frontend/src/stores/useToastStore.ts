// One-line app-wide toast queue. Anything that wants to surface a brief
// status (network failure, "order placed", etc.) calls
// `useToastStore.getState().show(...)`. The Toast component reads from
// here and renders the most recent message.
import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'error';

export interface ToastState {
  visible: boolean;
  message: string;
  tone: ToastTone;
  /** When the toast was last shown, in ms — used to retrigger the spring entry. */
  shownAt: number;
  show: (message: string, tone?: ToastTone) => void;
  hide: () => void;
}

export const useToastStore = create<ToastState>((set) => ({
  visible: false,
  message: '',
  tone: 'info',
  shownAt: 0,
  show: (message, tone = 'info') => set({ visible: true, message, tone, shownAt: Date.now() }),
  hide: () => set({ visible: false }),
}));
