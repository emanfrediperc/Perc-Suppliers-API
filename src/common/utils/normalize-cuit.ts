export function normalizeCuit(cuit: string): string {
  return cuit.replace(/-/g, '');
}

export function formatCuit(cuit: string): string {
  const clean = cuit.replace(/-/g, '');
  if (clean.length !== 11) return cuit;
  return `${clean.slice(0, 2)}-${clean.slice(2, 10)}-${clean.slice(10)}`;
}
