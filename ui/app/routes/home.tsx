import { useMemo, useState } from "react";
import useSWR from "swr";

import { ControlPane } from "~/components/ControlPane";
import { DetailPane } from "~/components/DetailPane";
import { LocationMap, type RenderUser } from "~/components/LocationMap";
import {
  type ConfigResponse,
  type LocationsResponse,
  type UserLocation,
  fetcher,
} from "~/lib/api";
import { useViewConfig } from "~/lib/config";
import { usePageVisible } from "~/lib/visibility";

export function meta() {
  return [{ title: "Fuuka" }];
}

export default function Home() {
  const [config, updateConfig] = useViewConfig();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const visible = usePageVisible();

  const { data: mapConfig, error: configError } = useSWR<ConfigResponse>(
    "/api/config",
    fetcher,
  );
  const { data: locations, error: locationsError } = useSWR<LocationsResponse>(
    "/api/locations",
    fetcher,
    // Suspend polling while the tab is hidden; resume (and revalidate) on return.
    { refreshInterval: visible ? 1000 : 0 },
  );

  const users = useMemo<UserLocation[]>(
    () =>
      [...(locations?.users ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [locations],
  );

  const { renderList, fitUsers } = useMemo(() => {
    const soloActive = config.solo.length > 0;
    const focused = (u: UserLocation) =>
      !soloActive || config.solo.includes(u.userid);
    const visible = users.filter((u) => !config.hidden.includes(u.userid));

    const fit = soloActive ? visible.filter(focused) : visible;

    let render: RenderUser[];
    if (soloActive && config.soloMode === "hide") {
      render = visible.filter(focused).map((user) => ({ user, dimmed: false }));
    } else {
      render = visible.map((user) => ({
        user,
        dimmed: soloActive && !focused(user),
      }));
    }
    return { renderList: render, fitUsers: fit };
  }, [users, config]);

  // Only block the whole screen before we have ever loaded a map token; after
  // that, keep showing the (possibly stale) map and surface failures as a badge.
  if (!mapConfig?.mapboxToken) {
    return (
      <div className="fuuka-error">
        {configError ? `Failed to load: ${String(configError)}` : "Loading…"}
      </div>
    );
  }

  const reloadError = locationsError ?? configError;
  // Resolve against the live list so the detail pane updates as data refreshes.
  const selectedUser = users.find((u) => u.userid === selectedId) ?? null;

  const toggleHidden = (userid: string) =>
    updateConfig({
      hidden: config.hidden.includes(userid)
        ? config.hidden.filter((id) => id !== userid)
        : [...config.hidden, userid],
    });

  const toggleSolo = (userid: string) => {
    const nextSolo = config.solo.includes(userid)
      ? config.solo.filter((id) => id !== userid)
      : [...config.solo, userid];
    // Re-engage tracking when entering solo, so the focused user is framed.
    const startingSolo = config.solo.length === 0 && nextSolo.length > 0;
    updateConfig(startingSolo ? { solo: nextSolo, tracking: true } : { solo: nextSolo });
  };

  return (
    <>
      <LocationMap
        token={mapConfig.mapboxToken}
        users={renderList}
        fitUsers={fitUsers}
        tracking={config.tracking}
        selectedId={selectedId}
        onManualInteraction={() =>
          config.tracking && updateConfig({ tracking: false })
        }
        onSelect={setSelectedId}
        detailOpen={selectedUser !== null}
      />
      <div className="fuuka-panes">
        <ControlPane
          users={users}
          config={config}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onToggleHidden={toggleHidden}
          onSelectAll={() => updateConfig({ hidden: [] })}
          onUnselectAll={() => updateConfig({ hidden: users.map((u) => u.userid) })}
          onToggleSolo={toggleSolo}
          onClearSolo={() => updateConfig({ solo: [] })}
          onSetTracking={(tracking) => updateConfig({ tracking })}
          onSetSoloMode={(soloMode) => updateConfig({ soloMode })}
        />
        {selectedUser && (
          <DetailPane
            user={selectedUser}
            soloed={config.solo.includes(selectedUser.userid)}
            onClose={() => setSelectedId(null)}
            onHide={(userid) => {
              toggleHidden(userid);
              setSelectedId(null);
            }}
            onToggleSolo={toggleSolo}
          />
        )}
      </div>
      {reloadError && (
        <div
          className="fuuka-warning"
          title={`Failed to refresh — showing last known data.\n${String(reloadError)}`}
          role="status"
        >
          ⚠ Reconnecting…
        </div>
      )}
    </>
  );
}
