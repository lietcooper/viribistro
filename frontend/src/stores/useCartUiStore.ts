// Open / closed state for the global CartDrawer plus the post-checkout
// success overlay. Kept separate from `useCartStore` so the drawer's UI
// doesn't trigger re-renders in components that only care about cart
// item state.
import { create } from 'zustand';

interface CartUiState {
  open: boolean;
  successOpen: boolean;
  openDrawer: () => void;
  closeDrawer: () => void;
  toggleDrawer: () => void;
  showSuccess: () => void;
  dismissSuccess: () => void;
}

export const useCartUiStore = create<CartUiState>((set) => ({
  open: false,
  successOpen: false,
  openDrawer: () => set({ open: true }),
  closeDrawer: () => set({ open: false }),
  toggleDrawer: () => set((s) => ({ open: !s.open })),
  showSuccess: () => set({ successOpen: true }),
  dismissSuccess: () => set({ successOpen: false }),
}));
