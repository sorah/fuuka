import { useState } from "react";

import type { UserLocation } from "~/lib/api";
import type { SoloMode, ViewConfig } from "~/lib/config";
import { speedColor, speedKmh } from "~/lib/speed";
import { formatRelative, isStale } from "~/lib/time";

type ControlPaneProps = {
  users: UserLocation[];
  config: ViewConfig;
  selectedId: string | null;
  onToggleHidden: (userid: string) => void;
  onSelectAll: () => void;
  onUnselectAll: () => void;
  onToggleSolo: (userid: string) => void;
  onClearSolo: () => void;
  onSetTracking: (tracking: boolean) => void;
  onSetSoloMode: (mode: SoloMode) => void;
  onSelect: (userid: string) => void;
};

export function ControlPane({
  users,
  config,
  selectedId,
  onToggleHidden,
  onSelectAll,
  onUnselectAll,
  onToggleSolo,
  onClearSolo,
  onSetTracking,
  onSetSoloMode,
  onSelect,
}: ControlPaneProps) {
  const soloActive = config.solo.length > 0;
  // Default collapsed on small screens.
  const [collapsed, setCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 640px)").matches,
  );

  if (collapsed) {
    return (
      <div className="fuuka-control fuuka-control--collapsed">
        <button
          type="button"
          className="fuuka-control-collapse"
          onClick={() => setCollapsed(false)}
          title="Show controls"
        >
          Users ({users.length}) ▸
        </button>
      </div>
    );
  }

  return (
    <div className="fuuka-control">
      <div className="fuuka-control-header">
        <span className="fuuka-control-title">Users ({users.length})</span>
        <div className="fuuka-control-actions">
          <label
            className={`fuuka-control-follow${config.tracking ? " active" : ""}`}
          >
            <input
              type="checkbox"
              checked={config.tracking}
              onChange={(e) => onSetTracking(e.target.checked)}
            />
            Follow
          </label>
          <button type="button" onClick={onSelectAll}>
            All
          </button>
          <button type="button" onClick={onUnselectAll}>
            None
          </button>
        </div>
        <button
          type="button"
          className="fuuka-control-collapse"
          onClick={() => setCollapsed(true)}
          title="Collapse"
        >
          ▾
        </button>
      </div>

      {soloActive && (
        <div className="fuuka-control-row fuuka-control-solomode">
          <span>Solo:</span>
          <div className="fuuka-segmented">
            <button
              type="button"
              className={config.soloMode === "gray" ? "active" : ""}
              onClick={() => onSetSoloMode("gray")}
            >
              Dimmed
            </button>
            <button
              type="button"
              className={config.soloMode === "hide" ? "active" : ""}
              onClick={() => onSetSoloMode("hide")}
            >
              Hide
            </button>
          </div>
          <button type="button" onClick={onClearSolo}>
            Clear
          </button>
        </div>
      )}

      <ul className="fuuka-control-list">
        {users.map((user) => {
          const visible = !config.hidden.includes(user.userid);
          const soloed = config.solo.includes(user.userid);
          const selected = user.userid === selectedId;
          const stale = isStale(user.timestamp);
          const kmh = speedKmh(user.speed);
          return (
            <li
              key={user.userid}
              className={`fuuka-control-item${selected ? " selected" : ""}`}
            >
              <input
                type="checkbox"
                className="fuuka-control-check"
                checked={visible}
                onChange={() => onToggleHidden(user.userid)}
                title={visible ? "Hide" : "Show"}
              />
              <button
                type="button"
                className="fuuka-control-user"
                onClick={() => onSelect(user.userid)}
              >
                <span className="fuuka-control-name">{user.name}</span>
                <span className="fuuka-control-meta">
                  {kmh !== null && kmh >= 1 && (
                    <span
                      className="fuuka-control-speed"
                      style={{ background: speedColor(user.speed) }}
                      title={`${kmh.toFixed(0)} km/h`}
                    >
                      {kmh.toFixed(0)}
                    </span>
                  )}
                  <span className={`fuuka-control-time${stale ? " stale" : ""}`}>
                    {formatRelative(user.timestamp)}
                  </span>
                </span>
              </button>
              <button
                type="button"
                className={`fuuka-solo-button${soloed ? " active" : ""}`}
                onClick={() => onToggleSolo(user.userid)}
                title="Solo"
              >
                S
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
