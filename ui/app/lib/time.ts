export const STALE_THRESHOLD_MS = 60 * 60 * 1000;

export function isStale(iso: string): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > STALE_THRESHOLD_MS;
}

// Compact relative time without an "ago" suffix, e.g. "now", "5s", "3m", "2h",
// "4d" — kept terse so it fits beside other row content.
export function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;

  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 5) return "now";
  if (sec < 60) return `${sec}s`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h`;

  return `${Math.floor(hr / 24)}d`;
}
