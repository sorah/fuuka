import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, Source } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import type { FillLayerSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { UserLocation } from "~/lib/api";
import { accuracyCircles } from "~/lib/geo";
import { isStale } from "~/lib/time";

const ACCURACY_LAYER: FillLayerSpecification = {
  id: "accuracy-circles",
  type: "fill",
  source: "accuracy",
  paint: {
    "fill-color": "#1d6fe0",
    "fill-opacity": 0.12,
  },
};

export type RenderUser = {
  user: UserLocation;
  dimmed: boolean;
};

type LocationMapProps = {
  token: string;
  users: RenderUser[];
  fitUsers: UserLocation[];
  tracking: boolean;
  selectedId: string | null;
  onManualInteraction: () => void;
  onSelect: (userid: string | null) => void;
};

const INITIAL_ZOOM = 9;

// Only the icon (arrow/dot) scales with zoom — bigger when zoomed out so it
// stays visible, smaller when zoomed in. The label+avatar keep their CSS size.
const ICON_MIN_ZOOM = 8;
const ICON_MAX_ZOOM = 16;
const ICON_SCALE_ZOOMED_OUT = 1.6;
const ICON_SCALE_ZOOMED_IN = 0.9;

function iconScale(zoom: number): number {
  const t = (zoom - ICON_MIN_ZOOM) / (ICON_MAX_ZOOM - ICON_MIN_ZOOM);
  const clamped = Math.max(0, Math.min(1, t));
  return ICON_SCALE_ZOOMED_OUT + clamped * (ICON_SCALE_ZOOMED_IN - ICON_SCALE_ZOOMED_OUT);
}

// Live markers ramp from blue (stationary) to red (fast); fully red at 140km/h.
// Interpolate the HSL hue the short way (blue→purple→magenta→red) rather than
// RGB, which would pass through a muddy gray and make slow markers look dull.
// Going via 360° avoids the green/yellow detour the 215→7 direction would take.
const SPEED_FULL_RED_KMH = 140;
const HUE_SLOW = 215; // ~#1d6fe0 blue
const HUE_FAST = 360; // red (== 0°)

function speedColor(speed: number | null): string {
  const kmh = speed === null ? 0 : speed * 3.6;
  const t = Math.max(0, Math.min(1, kmh / SPEED_FULL_RED_KMH));
  const hue = HUE_SLOW + (HUE_FAST - HUE_SLOW) * t;
  return `hsl(${Math.round(hue)}, 77%, 50%)`;
}

// Whether a lon/lat span fits within the current zoom's viewport with margin,
// i.e. the focused users can stay framed without changing zoom.
function spanFitsView(
  map: MapRef,
  lonSpan: number,
  latSpan: number,
): boolean {
  const bounds = map.getBounds();
  if (!bounds) return false;
  const viewLon = bounds.getEast() - bounds.getWest();
  const viewLat = bounds.getNorth() - bounds.getSouth();
  // Leave 10% margin on each side so markers don't hug the edge.
  return lonSpan <= viewLon * 0.8 && latSpan <= viewLat * 0.8;
}

export function LocationMap({
  token,
  users,
  fitUsers,
  tracking,
  selectedId,
  onManualInteraction,
  onSelect,
}: LocationMapProps) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const mapRef = useRef<MapRef>(null);
  const wasTracking = useRef(false);

  const icon = iconScale(zoom);

  const undimmed = useMemo(
    () => users.filter((u) => !u.dimmed).map((u) => u.user),
    [users],
  );
  const circles = useMemo(() => accuracyCircles(undimmed), [undimmed]);

  // Key changes whenever the tracked set or their (rounded) positions move.
  const fitKey = useMemo(
    () =>
      fitUsers
        .map((u) => `${u.userid}:${u.latitude.toFixed(4)},${u.longitude.toFixed(4)}`)
        .sort()
        .join("|"),
    [fitUsers],
  );

  useEffect(() => {
    if (!tracking || fitUsers.length === 0) {
      wasTracking.current = tracking;
      return;
    }
    const map = mapRef.current;
    if (!map) return;

    let minLon = Infinity;
    let minLat = Infinity;
    let maxLon = -Infinity;
    let maxLat = -Infinity;
    for (const u of fitUsers) {
      minLon = Math.min(minLon, u.longitude);
      maxLon = Math.max(maxLon, u.longitude);
      minLat = Math.min(minLat, u.latitude);
      maxLat = Math.max(maxLat, u.latitude);
    }
    const center: [number, number] = [
      (minLon + maxLon) / 2,
      (minLat + maxLat) / 2,
    ];

    // Keep the focused users centered as they move, but hold the current zoom
    // as long as they still fit. Only (re-)pick a zoom when follow is first
    // engaged or they no longer fit the viewport.
    const justEngaged = !wasTracking.current;
    wasTracking.current = true;
    if (!justEngaged && spanFitsView(map, maxLon - minLon, maxLat - minLat)) {
      map.easeTo({ center, duration: 600 });
      return;
    }

    if (fitUsers.length === 1) {
      map.easeTo({ center, zoom: 14, duration: 600 });
      return;
    }

    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding: 80, maxZoom: 15, duration: 600 },
    );
    // fitKey captures position changes; depending on it keeps the view following.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking, fitKey]);

  return (
    <Map
      ref={mapRef}
      mapboxAccessToken={token}
      initialViewState={{ longitude: 139.767, latitude: 35.681, zoom: INITIAL_ZOOM }}
      onZoom={(e) => setZoom(e.viewState.zoom)}
      mapStyle="mapbox://styles/mapbox/streets-v12"
      style={{ position: "absolute", inset: 0 }}
      onClick={() => onSelect(null)}
      onDragStart={(e) => {
        // Unlock tracking only when the user pans (drag), not on zoom.
        // `originalEvent` is set only for user-initiated gestures; programmatic
        // fitBounds/easeTo have none. (The event type under-declares this field.)
        if ((e as { originalEvent?: unknown }).originalEvent) onManualInteraction();
      }}
    >
      <Source id="accuracy" type="geojson" data={circles}>
        <Layer {...ACCURACY_LAYER} />
      </Source>

      {users.map(({ user, dimmed }) => {
        const stale = isStale(user.timestamp);
        const className = [
          "fuuka-marker",
          dimmed ? "fuuka-marker--dimmed" : "",
          stale ? "fuuka-marker--stale" : "",
          user.userid === selectedId ? "fuuka-marker--selected" : "",
        ]
          .filter(Boolean)
          .join(" ");
        return (
          <Marker
            key={user.userid}
            longitude={user.longitude}
            latitude={user.latitude}
            anchor="center"
            onClick={(e) => {
              e.originalEvent.stopPropagation();
              onSelect(user.userid);
            }}
          >
            <div
              className={className}
              title={user.name}
              // Stale markers keep their CSS color; live ones ramp with speed.
              style={stale ? undefined : { color: speedColor(user.speed) }}
            >
              {user.course !== null ? (
                <svg
                  className="fuuka-marker-arrow"
                  viewBox="0 0 24 24"
                  style={{ transform: `rotate(${user.course}deg) scale(${icon})` }}
                  aria-hidden="true"
                >
                  <path d="M12 2 L19 21 L12 16 L5 21 Z" fill="currentColor" />
                </svg>
              ) : (
                <span
                  className="fuuka-marker-dot"
                  style={{ transform: `scale(${icon})` }}
                />
              )}
              <span className="fuuka-marker-label">
                {user.github && (
                  <img
                    className="fuuka-marker-avatar"
                    src={`https://github.com/${user.github}.png?size=56`}
                    alt=""
                  />
                )}
                {user.name}
              </span>
            </div>
          </Marker>
        );
      })}
    </Map>
  );
}
