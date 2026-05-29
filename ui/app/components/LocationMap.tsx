import { useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, Source } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import type { FillLayerSpecification } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

import type { UserLocation } from "~/lib/api";
import { accuracyCircles } from "~/lib/geo";
import { speedColor } from "~/lib/speed";
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
  detailOpen: boolean;
  onManualInteraction: () => void;
  onSelect: (userid: string | null) => void;
};

type Padding = { top: number; right: number; bottom: number; left: number };

// Inset the camera by however much the floating panes cover, so followed users
// are framed in the visible area rather than hidden behind the panes. The panes
// are fixed-positioned, so their viewport rects map directly to map padding.
//
// We measure the actual pane elements (not their container, which reserves a
// fixed-width column even when the pane is collapsed) and ignore the axis a
// pane spans fully — e.g. the mobile bottom sheet is full width, so it only
// contributes bottom padding, never left/right.
function paddingForPanes(): Padding {
  const base = 60;
  const pad: Padding = { top: base, right: base, bottom: base, left: base };
  if (typeof window === "undefined") return pad;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const EDGE = 40;
  for (const sel of [".fuuka-control", ".fuuka-detail"]) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    // A pane spanning most of an axis is a bar on the cross axis, not a side
    // pane — don't let it contribute padding on the axis it spans.
    const spansWidth = r.width > vw * 0.7;
    const spansHeight = r.height > vh * 0.7;
    if (!spansWidth) {
      if (vw - r.right < EDGE && vw - r.right < r.left) {
        pad.right = Math.max(pad.right, vw - r.left + 12);
      } else if (r.left < EDGE) {
        pad.left = Math.max(pad.left, r.right + 12);
      }
    }
    if (!spansHeight) {
      if (vh - r.bottom < EDGE && vh - r.bottom < r.top) {
        pad.bottom = Math.max(pad.bottom, vh - r.top + 12);
      } else if (r.top < EDGE) {
        pad.top = Math.max(pad.top, r.bottom + 12);
      }
    }
  }

  // Never crush the usable area to a sliver. A side pane on a narrow portrait
  // screen eats a big fraction of the width, so cap horizontal padding harder
  // in portrait; cap vertical padding harder in landscape (bottom sheets).
  const portrait = vh >= vw;
  const maxLat = vw * (portrait ? 0.3 : 0.5);
  const maxVert = vh * (portrait ? 0.5 : 0.35);
  pad.left = Math.min(pad.left, maxLat);
  pad.right = Math.min(pad.right, maxLat);
  pad.top = Math.min(pad.top, maxVert);
  pad.bottom = Math.min(pad.bottom, maxVert);
  return pad;
}

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

// Whether a lon/lat span fits within the part of the viewport the panes leave
// visible, i.e. the focused users can stay framed without changing zoom.
function spanFitsView(
  map: MapRef,
  lonSpan: number,
  latSpan: number,
  padding: Padding,
): boolean {
  const bounds = map.getBounds();
  if (!bounds) return false;
  const container = map.getContainer();
  const cw = container.clientWidth || 1;
  const ch = container.clientHeight || 1;
  const fracX = Math.max(0.1, (cw - padding.left - padding.right) / cw);
  const fracY = Math.max(0.1, (ch - padding.top - padding.bottom) / ch);
  const viewLon = (bounds.getEast() - bounds.getWest()) * fracX;
  const viewLat = (bounds.getNorth() - bounds.getSouth()) * fracY;
  // Leave 10% margin on each side so markers don't hug the edge.
  return lonSpan <= viewLon * 0.8 && latSpan <= viewLat * 0.8;
}

export function LocationMap({
  token,
  users,
  fitUsers,
  tracking,
  selectedId,
  detailOpen,
  onManualInteraction,
  onSelect,
}: LocationMapProps) {
  const [zoom, setZoom] = useState(INITIAL_ZOOM);
  const mapRef = useRef<MapRef>(null);
  const wasTracking = useRef(false);
  const didInitialFit = useRef(false);

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
    const map = mapRef.current;
    if (!map || fitUsers.length === 0) {
      wasTracking.current = tracking;
      return;
    }

    // Even when not following (e.g. ?track=0), frame all active users once on
    // the first view so the map opens on something useful.
    const initialFit = !didInitialFit.current;
    if (!tracking && !initialFit) {
      wasTracking.current = false;
      return;
    }

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

    // Offset the camera by whatever the floating panes cover so the focused
    // users stay framed in the visible area, not behind a pane.
    const padding = paddingForPanes();

    // Keep the focused users centered as they move, but hold the current zoom
    // as long as they still fit. Only (re-)pick a zoom when follow is first
    // engaged, on the one-shot initial fit, or when they no longer fit.
    const justEngaged = initialFit || !wasTracking.current;
    didInitialFit.current = true;
    wasTracking.current = tracking;
    if (
      !justEngaged &&
      spanFitsView(map, maxLon - minLon, maxLat - minLat, padding)
    ) {
      map.easeTo({ center, padding, duration: 600 });
      return;
    }

    if (fitUsers.length === 1) {
      map.easeTo({ center, zoom: 14, padding, duration: 600 });
      return;
    }

    map.fitBounds(
      [
        [minLon, minLat],
        [maxLon, maxLat],
      ],
      { padding, maxZoom: 15, duration: 600 },
    );
    // fitKey captures position changes; depending on it keeps the view following.
    // detailOpen changes the panes' footprint, so re-frame when it toggles.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking, fitKey, detailOpen]);

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
