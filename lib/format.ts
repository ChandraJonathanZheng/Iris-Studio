export function formatCurrency(cents: number): string {
  const dollars = Math.round(cents / 100)
  return `NT$ ${dollars.toLocaleString('en-US')}`
}
