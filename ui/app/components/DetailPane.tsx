import { HistoryChart } from "~/components/HistoryChart";
import type { HistoryPoint, UserLocation } from "~/lib/api";
import { isStale } from "~/lib/time";

type DetailPaneProps = {
  user: UserLocation;
  soloed: boolean;
  historyOpen: boolean;
  onToggleHistory: () => void;
  historyPoints: HistoryPoint[];
  historyLoading: boolean;
  rangeMs: number;
  onRangeChange: (ms: number) => void;
  onClose: () => void;
  onHide: (userid: string) => void;
  onToggleSolo: (userid: string) => void;
};

function formatTimestamp(ts: string): string {
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? ts : d.toLocaleString();
}

const COMPASS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

function compass(deg: number): string {
  return COMPASS[Math.round(deg / 45) % 8];
}

type Metric = { label: string; value: string; unit?: string };

function metrics(user: UserLocation): Metric[] {
  return [
    {
      label: "Speed",
      value: user.speed === null ? "—" : (user.speed * 3.6).toFixed(0),
      unit: "km/h",
    },
    {
      label: "Altitude",
      value: user.altitude === null ? "—" : user.altitude.toFixed(0),
      unit: "m",
    },
    {
      label: "Track",
      value:
        user.course === null
          ? "—"
          : `${user.course.toFixed(0)}° ${compass(user.course)}`,
    },
  ];
}

export function DetailPane({
  user,
  soloed,
  historyOpen,
  onToggleHistory,
  historyPoints,
  historyLoading,
  rangeMs,
  onRangeChange,
  onClose,
  onHide,
  onToggleSolo,
}: DetailPaneProps) {
  const stale = isStale(user.timestamp);

  return (
    <div className="fuuka-detail">
      <div className="fuuka-detail-header">
        {user.github && (
          <img
            className="fuuka-detail-avatar"
            src={`https://github.com/${user.github}.png?size=96`}
            alt=""
          />
        )}
        <div className="fuuka-detail-title">
          <span className="fuuka-detail-name">{user.name}</span>
          <span className="fuuka-detail-sub">{user.source}</span>
        </div>
        <div className="fuuka-detail-actions">
          <button type="button" onClick={() => onHide(user.userid)}>
            Hide
          </button>
          <button
            type="button"
            className={soloed ? "active" : ""}
            onClick={() => onToggleSolo(user.userid)}
          >
            {soloed ? "Unfocus" : "Focus"}
          </button>
        </div>
        <button
          type="button"
          className="fuuka-detail-close"
          onClick={onClose}
          title="Close"
        >
          ×
        </button>
      </div>

      <div className="fuuka-detail-metrics">
        {metrics(user).map((m) => (
          <div key={m.label} className="fuuka-detail-metric">
            <span className="fuuka-detail-metric-value">
              {m.value}
              {m.unit && <span className="fuuka-detail-metric-unit">{m.unit}</span>}
            </span>
            <span className="fuuka-detail-metric-label">{m.label}</span>
          </div>
        ))}
      </div>

      <button
        type="button"
        className="fuuka-detail-chart-toggle"
        aria-expanded={historyOpen}
        onClick={onToggleHistory}
      >
        <span className={`fuuka-detail-chart-caret${historyOpen ? " open" : ""}`}>
          ▸
        </span>
        Altitude / speed history
      </button>
      {historyOpen && (
        <HistoryChart
          points={historyPoints}
          isLoading={historyLoading}
          rangeMs={rangeMs}
          onRangeChange={onRangeChange}
        />
      )}

      <dl className="fuuka-detail-list">
        <dt>Last update</dt>
        <dd className={stale ? "stale" : ""}>
          {formatTimestamp(user.timestamp)}
          {stale ? " (stale)" : ""}
        </dd>
        <dt>Position</dt>
        <dd>
          {user.latitude.toFixed(5)}, {user.longitude.toFixed(5)}
        </dd>
        {user.accuracy !== null && (
          <>
            <dt>Accuracy</dt>
            <dd>±{user.accuracy.toFixed(0)} m</dd>
          </>
        )}
        {user.battery !== null && (
          <>
            <dt>Battery</dt>
            <dd>
              {user.battery}%{user.batteryState ? ` (${user.batteryState})` : ""}
            </dd>
          </>
        )}
      </dl>
    </div>
  );
}
