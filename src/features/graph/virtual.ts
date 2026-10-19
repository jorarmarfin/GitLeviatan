export const ROW_HEIGHT = 28;
export const OVERSCAN = 8;

/** Filas a montar para el scroll actual (ventana + margen). */
export function visibleRange(
  scrollTop: number,
  viewportHeight: number,
  count: number,
  rowHeight = ROW_HEIGHT,
  overscan = OVERSCAN,
): { start: number; end: number } {
  if (count <= 0) return { start: 0, end: 0 };
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const last = Math.ceil((Math.max(0, scrollTop) + viewportHeight) / rowHeight);
  const end = Math.min(count, last + overscan);
  return { start: Math.min(Math.max(0, first - overscan), end), end };
}
