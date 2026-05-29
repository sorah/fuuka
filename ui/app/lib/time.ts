export const STALE_THRESHOLD_MS = 60 * 60 * 1000;

export function isStale(iso: string): boolean {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t > STALE_THRESHOLD_MS;
}

// Compact relative time, e.g. "just now", "5s ago", "3m ago", "2h ago", "4d ago".
export function formatRelative(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;

  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec}s ago`;

  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;

  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;

  return `${Math.floor(hr / 24)}d ago`;
}
