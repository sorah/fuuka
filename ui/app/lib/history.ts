import { useMemo } from "react";
import useSWR from "swr";

import { type HistoryPoint, type HistoryResponse, fetcher } from "~/lib/api";
import { usePageVisible } from "~/lib/visibility";

const MINUTE = 60_000;
export const RANGES: { label: string; ms: number }[] = [
  { label: "15m", ms: 15 * MINUTE },
  { label: "1h", ms: 60 * MINUTE },
  { label: "2h", ms: 120 * MINUTE },
  { label: "4h", ms: 240 * MINUTE },
  { label: "6h", ms: 360 * MINUTE },
  { label: "12h", ms: 720 * MINUTE },
  { label: "1d", ms: 1440 * MINUTE },
];
export const DEFAULT_RANGE_MS = 60 * MINUTE;

// Trim history to the selected window, anchored on the newest reading rather
// than wall-clock now, so the window always ends at real data even when stale.
export function filterHistoryByRange(
  points: HistoryPoint[],
  rangeMs: number,
): HistoryPoint[] {
  if (points.length === 0) return points;
  const newest = Date.parse(points[points.length - 1].timestamp);
  const cutoff = newest - rangeMs;
  return points.filter((p) => Date.parse(p.timestamp) >= cutoff);
}

export type UserHistory = {
  points: HistoryPoint[];
  isLoading: boolean;
};

// Fetches a user's location history by combining two endpoints: a 24h baseline
// (cacheable ~60s) and a 120s live tail (~5s), merged on timestamp so the data
// stays current without re-downloading the day every few seconds.
//
// The recent tail is always fetched while a user is selected (cheap, drives the
// default track); the 24h baseline is only loaded when `day` is set (i.e. the
// chart is expanded). Pass `null` userid to disable fetching entirely.
export function useUserHistory(
  userid: string | null,
  { day = false }: { day?: boolean } = {},
): UserHistory {
  const visible = usePageVisible();

  const { data: dayData, isLoading } = useSWR<HistoryResponse>(
    userid && day ? `/api/history/${userid}/day` : null,
    fetcher,
    { refreshInterval: visible ? 60_000 : 0 },
  );
  const { data: recent } = useSWR<HistoryResponse>(
    userid ? `/api/history/${userid}/recent` : null,
    fetcher,
    { refreshInterval: visible ? 5_000 : 0 },
  );

  const points = useMemo(() => {
    const byTimestamp = new Map<string, HistoryPoint>();
    for (const point of dayData?.points ?? []) byTimestamp.set(point.timestamp, point);
    // The recent tail overlaps the baseline; let it win on shared timestamps.
    for (const point of recent?.points ?? []) byTimestamp.set(point.timestamp, point);
    return [...byTimestamp.values()].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
  }, [dayData, recent]);

  // Only "loading" when there is nothing to show yet; if the recent tail has
  // already arrived, render it while the day baseline is still in flight.
  return { points, isLoading: day && isLoading && points.length === 0 };
}
