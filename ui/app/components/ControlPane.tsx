import { useEffect, useRef, useState } from "react";

import type { UserLocation } from "~/lib/api";
import type { SoloMode, ViewConfig } from "~/lib/config";
import { speedColor, speedKmh } from "~/lib/speed";
import { formatRelative, isStale } from "~/lib/time";
import type { WakeLock } from "~/lib/wakeLock";

// Window for pairing two Follow clicks into a double click. The single click
// acts immediately, so a generous window costs no latency — it just makes the
// double-tap (wake-lock toggle) easier to land.
const DOUBLE_CLICK_MS = 450;

type ControlPaneProps = {
  users: UserLocation[];
  config: ViewConfig;
  wakeLock: WakeLock;
  selectedId: string | null;
  onToggleHidden: (userid: string) => void;
  onSelectAll: () => void;
  onUnselectAll: () => void;
  onToggleSolo: (userid: string) => void;
  onClearSolo: () => void;
  onToggleTracking: () => void;
  onSetSoloMode: (mode: SoloMode) => void;
  onSelect: (userid: string) => void;
};

export function ControlPane({
  users,
  config,
  wakeLock,
  selectedId,
  onToggleHidden,
  onSelectAll,
  onUnselectAll,
  onToggleSolo,
  onClearSolo,
  onToggleTracking,
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

  // Every click toggles follow immediately (responsive). A double click then
  // toggles twice — the functional flips cancel out — and additionally toggles
  // the screen wake lock, so a double-tap leaves follow unchanged.
  const followClickTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (followClickTimer.current !== null) {
        window.clearTimeout(followClickTimer.current);
      }
    },
    [],
  );
  const handleFollowClick = () => {
    onToggleTracking();
    if (followClickTimer.current !== null) {
      window.clearTimeout(followClickTimer.current);
      followClickTimer.current = null;
      wakeLock.toggle();
      return;
    }
    followClickTimer.current = window.setTimeout(() => {
      followClickTimer.current = null;
    }, DOUBLE_CLICK_MS);
  };

  const followToggle = (
    <button
      type="button"
      className={`fuuka-control-follow${config.tracking ? " active" : ""}${
        wakeLock.active ? " wake" : ""
      }`}
      onClick={handleFollowClick}
      aria-pressed={config.tracking}
      title={
        wakeLock.active
          ? "Following — screen kept awake (double-tap to release)"
          : "Follow (double-tap to keep screen awake)"
      }
    >
      Follow
    </button>
  );

  if (collapsed) {
    return (
      <div className="fuuka-control fuuka-control--collapsed">
        {followToggle}
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
          {followToggle}
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
