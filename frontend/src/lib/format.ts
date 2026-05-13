// Money formatter. The wire format is a decimal string ('12.50'); we render
// it with a $ prefix and always two decimal places.
export function formatMoney(value: string | number): string {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '$0.00';
  return `$${n.toFixed(2)}`;
}
