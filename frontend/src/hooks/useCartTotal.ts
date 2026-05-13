// Re-export for the canonical hook location specified in the plan. The
// implementation lives in `stores/useCartStore` so the selector can stay
// next to the state it reads from.
export { useCartTotal } from '@/stores/useCartStore';
