/** Area scales with likes, with a visible minimum for zero and very small values. */
export function likeBubbleRadius(likes: number, maximum: number) {
  if (maximum <= 0 || !Number.isFinite(maximum)) return 3;
  const value = Number.isFinite(likes) ? Math.max(0, Math.min(maximum, likes)) : 0;
  return Math.max(3, 15 * Math.sqrt(value / maximum));
}
