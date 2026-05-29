import { useMemo } from "react";
import useSWR from "swr";

import { type HistoryPoint, type HistoryResponse, fetcher } from "~/lib/api";
import { usePageVisible } from "~/lib/visibility";

export type UserHistory = {
  points: HistoryPoint[];
  isLoading: boolean;
};

// Fetches a user's location history for the FR24-style chart by combining two
// endpoints: a 24h baseline (cacheable ~60s) and a 120s live tail (~5s). The
// baseline is refetched roughly once a minute and the tail every 5s; merging on
// timestamp keeps the chart current without re-downloading the whole day.
// Pass `null` to disable fetching entirely (e.g. while the chart is collapsed).
export function useUserHistory(userid: string | null): UserHistory {
  const visible = usePageVisible();

  const { data: day, isLoading } = useSWR<HistoryResponse>(
    userid ? `/api/history/${userid}/day` : null,
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
    for (const point of day?.points ?? []) byTimestamp.set(point.timestamp, point);
    // The recent tail overlaps the baseline; let it win on shared timestamps.
    for (const point of recent?.points ?? []) byTimestamp.set(point.timestamp, point);
    return [...byTimestamp.values()].sort((a, b) =>
      a.timestamp.localeCompare(b.timestamp),
    );
  }, [day, recent]);

  // Loading only matters until the baseline first resolves; the recent tail
  // refreshing in the background should not flip the chart back to "Loading".
  return { points, isLoading: isLoading && day === undefined };
}
