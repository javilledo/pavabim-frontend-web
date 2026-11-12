/**
 * Formats a numeric value using `.` as thousands separator and `,` as decimal separator.
 * Always groups integers with 4+ digits (e.g., 1234.5 -> "1.234,50").
 */
export function formatDecimalEs(value: number | null | undefined, decimals = 2): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return '—';
  }
  const safeDecimals = Math.max(0, Math.min(20, Math.trunc(decimals)));
  const threshold = 0.5 / 10 ** safeDecimals;
  const normalized = Math.abs(value) < threshold ? 0 : value;
  const fixed = Math.abs(normalized).toFixed(safeDecimals);
  const [intPart, fracPart] = fixed.split('.');
  const groupedInt = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const sign = normalized < 0 && Number(fixed) > 0 ? '-' : '';
  return fracPart !== undefined ? `${sign}${groupedInt},${fracPart}` : `${sign}${groupedInt}`;
}

export function formatCoordinateEs(value: number | null | undefined, decimals = 3): string {
  return formatDecimalEs(value, decimals);
}

