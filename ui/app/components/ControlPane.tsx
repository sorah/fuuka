import { useState } from "react";

import type { UserLocation } from "~/lib/api";
import type { SoloMode, ViewConfig } from "~/lib/config";
import { formatRelative, isStale } from "~/lib/time";

type ControlPaneProps = {
  users: UserLocation[];
  config: ViewConfig;
  onToggleHidden: (userid: string) => void;
  onSelectAll: () => void;
  onUnselectAll: () => void;
  onToggleSolo: (userid: string) => void;
  onClearSolo: () => void;
  onSetTracking: (tracking: boolean) => void;
  onSetSoloMode: (mode: SoloMode) => void;
};

export function ControlPane({
  users,
  config,
  onToggleHidden,
  onSelectAll,
  onUnselectAll,
  onToggleSolo,
  onClearSolo,
  onSetTracking,
  onSetSoloMode,
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
        <button
          type="button"
          className="fuuka-control-collapse"
          onClick={() => setCollapsed(true)}
          title="Collapse"
        >
          Users ({users.length}) ▾
        </button>
        <div className="fuuka-control-actions">
          <button type="button" onClick={onSelectAll}>
            Select all
          </button>
          <button type="button" onClick={onUnselectAll}>
            Unselect all
          </button>
        </div>
      </div>

      <label className="fuuka-control-row fuuka-control-toggle">
        <input
          type="checkbox"
          checked={config.tracking}
          onChange={(e) => onSetTracking(e.target.checked)}
        />
        <span>Track {config.tracking ? "(following)" : "(unlocked — pan to follow)"}</span>
      </label>

      {soloActive && (
        <div className="fuuka-control-row fuuka-control-solomode">
          <span>Solo:</span>
          <div className="fuuka-segmented">
            <button
              type="button"
              className={config.soloMode === "gray" ? "active" : ""}
              onClick={() => onSetSoloMode("gray")}
            >
              Gray
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
          const stale = isStale(user.timestamp);
          return (
            <li key={user.userid} className="fuuka-control-item">
              <label className="fuuka-control-user">
                <input
                  type="checkbox"
                  checked={visible}
                  onChange={() => onToggleHidden(user.userid)}
                />
                <span className="fuuka-control-name">{user.name}</span>
                <span className={`fuuka-control-time${stale ? " stale" : ""}`}>
                  {formatRelative(user.timestamp)}
                </span>
              </label>
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
