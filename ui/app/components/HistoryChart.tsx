import { useEffect, useMemo, useRef, useState } from "react";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import type { HistoryPoint } from "~/lib/api";
import { speedColor, speedKmh } from "~/lib/speed";

const CHART_HEIGHT = 120;

const MINUTE = 60_000;
const RANGES: { label: string; ms: number }[] = [
  { label: "15m", ms: 15 * MINUTE },
  { label: "1h", ms: 60 * MINUTE },
  { label: "2h", ms: 120 * MINUTE },
  { label: "4h", ms: 240 * MINUTE },
  { label: "6h", ms: 360 * MINUTE },
  { label: "12h", ms: 720 * MINUTE },
  { label: "1d", ms: 1440 * MINUTE },
];
const DEFAULT_RANGE_MS = 60 * MINUTE;

const ALT_STROKE = "#2e7d32";
const ALT_FILL = "rgba(46, 125, 50, 0.18)";
const AXIS_COLOR = "#888";
const GRID_COLOR = "rgba(0, 0, 0, 0.08)";

// Vertical gradient over the speed scale: slow (bottom) → fast (top), reusing
// the shared speed→color ramp so the line matches the map markers and pills.
// uPlot also calls this for the legend swatch before the plot area and scales
// exist, so fall back to a solid color when the geometry isn't finite yet.
function speedGradient(u: uPlot): CanvasGradient | string {
  const { top, height } = u.bbox;
  const max = u.scales.spd?.max;
  const min = u.scales.spd?.min;
  if (
    !Number.isFinite(top) ||
    !Number.isFinite(height) ||
    max == null ||
    min == null
  ) {
    return speedColor(max == null ? null : max / 3.6);
  }

  const grad = u.ctx.createLinearGradient(0, top, 0, top + height);
  const stops = 6;
  for (let i = 0; i <= stops; i++) {
    const f = i / stops; // 0 at the top of the plot (fastest)
    const kmh = max - (max - min) * f;
    grad.addColorStop(f, speedColor(kmh / 3.6));
  }
  return grad;
}

// Speed always reads from 0; without this the auto-range collapses (and the
// right axis renders no ticks) whenever speed is sparse, all-zero, or all-null.
function speedRange(_u: uPlot, _min: number, max: number): uPlot.Range.MinMax {
  if (max == null || !Number.isFinite(max) || max <= 0) return [0, 10];
  return [0, max * 1.1];
}

function makeOptions(width: number): uPlot.Options {
  return {
    width,
    height: CHART_HEIGHT,
    scales: {
      x: { time: true },
      // Altitude keeps uPlot's default auto-range (nice rounded ticks).
      alt: {},
      spd: { range: speedRange },
    },
    axes: [
      { stroke: AXIS_COLOR, grid: { stroke: GRID_COLOR, width: 1 } },
      {
        scale: "alt",
        stroke: AXIS_COLOR,
        grid: { stroke: GRID_COLOR, width: 1 },
        size: 44,
      },
      {
        scale: "spd",
        side: 1,
        stroke: AXIS_COLOR,
        grid: { show: false },
        size: 44,
      },
    ],
    series: [
      {},
      {
        label: "Alt",
        scale: "alt",
        stroke: ALT_STROKE,
        fill: ALT_FILL,
        width: 1.5,
        points: { show: false },
        value: (_u, v) => (v == null ? "—" : `${v.toFixed(0)} m`),
      },
      {
        label: "Spd",
        scale: "spd",
        stroke: speedGradient,
        width: 2,
        points: { show: false },
        value: (_u, v) => (v == null ? "—" : `${v.toFixed(0)} km/h`),
      },
    ],
    legend: { show: true },
  };
}

function toAlignedData(points: HistoryPoint[]): uPlot.AlignedData {
  const xs: number[] = [];
  const alts: (number | null)[] = [];
  const spds: (number | null)[] = [];
  for (const p of points) {
    xs.push(Date.parse(p.timestamp) / 1000);
    alts.push(p.altitude);
    spds.push(speedKmh(p.speed));
  }
  return [xs, alts, spds];
}

// Inner chart: only mounted once there is enough data, so the canvas is created
// at the right width and torn down cleanly if the user runs out of history.
function Chart({ points }: { points: HistoryPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<uPlot | null>(null);
  const data = useMemo(() => toAlignedData(points), [points]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = new uPlot(makeOptions(el.clientWidth || 300), data, el);
    chartRef.current = chart;
    const observer = new ResizeObserver(() =>
      chart.setSize({ width: el.clientWidth, height: CHART_HEIGHT }),
    );
    observer.observe(el);
    return () => {
      observer.disconnect();
      chart.destroy();
      chartRef.current = null;
    };
    // Create once; data updates are handled in the effect below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    chartRef.current?.setData(data);
  }, [data]);

  return <div ref={containerRef} />;
}

type HistoryChartProps = {
  points: HistoryPoint[];
  isLoading: boolean;
};

export function HistoryChart({ points, isLoading }: HistoryChartProps) {
  const [rangeMs, setRangeMs] = useState(DEFAULT_RANGE_MS);

  // Anchor the window on the newest reading rather than wall-clock now, so the
  // selected range always ends at real data even when the feed is stale.
  const filtered = useMemo(() => {
    if (points.length === 0) return points;
    const newest = Date.parse(points[points.length - 1].timestamp);
    const cutoff = newest - rangeMs;
    return points.filter((p) => Date.parse(p.timestamp) >= cutoff);
  }, [points, rangeMs]);

  let body;
  if (isLoading) {
    body = <div className="fuuka-detail-chart-empty">Loading…</div>;
  } else if (filtered.length < 2) {
    body = <div className="fuuka-detail-chart-empty">No history in range</div>;
  } else {
    body = <Chart points={filtered} />;
  }

  return (
    <div className="fuuka-detail-chart">
      <div className="fuuka-detail-chart-ranges">
        {RANGES.map((r) => (
          <button
            key={r.label}
            type="button"
            className={r.ms === rangeMs ? "active" : ""}
            onClick={() => setRangeMs(r.ms)}
          >
            {r.label}
          </button>
        ))}
      </div>
      {body}
    </div>
  );
}
