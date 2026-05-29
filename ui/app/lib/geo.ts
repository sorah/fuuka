import type { Feature, FeatureCollection, LineString, Polygon } from "geojson";

import type { HistoryPoint } from "~/lib/api";
import { speedColor } from "~/lib/speed";

const EARTH_RADIUS_M = 6_378_137;

// Approximates a circle of the given radius (meters) as a GeoJSON polygon,
// so accuracy can be drawn to scale on the map (a circle layer's radius is in
// pixels, which would not reflect real-world meters).
function circlePolygon(
  lon: number,
  lat: number,
  radiusMeters: number,
  steps = 48,
): Feature<Polygon> {
  const coords: [number, number][] = [];
  const latRad = (lat * Math.PI) / 180;
  const dLat = (radiusMeters / EARTH_RADIUS_M) * (180 / Math.PI);
  const dLon = dLat / Math.cos(latRad);

  for (let i = 0; i <= steps; i++) {
    const theta = (i / steps) * 2 * Math.PI;
    coords.push([lon + dLon * Math.cos(theta), lat + dLat * Math.sin(theta)]);
  }

  return {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [coords] },
  };
}

export function accuracyCircles(
  points: { longitude: number; latitude: number; accuracy: number | null }[],
): FeatureCollection<Polygon> {
  return {
    type: "FeatureCollection",
    features: points
      .filter((p) => p.accuracy && p.accuracy > 0)
      .map((p) => circlePolygon(p.longitude, p.latitude, p.accuracy as number)),
  };
}

// One LineString per consecutive pair of readings, each carrying a `color`
// derived from the segment's mean speed, so the track gradates like a
// FlightRadar24 trail (blue→red with speed) via a data-driven line-color.
export function trackSegments(points: HistoryPoint[]): FeatureCollection<LineString> {
  const features: Feature<LineString>[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const speeds = [a.speed, b.speed].filter((s): s is number => s !== null);
    const speed = speeds.length
      ? speeds.reduce((sum, s) => sum + s, 0) / speeds.length
      : null;
    features.push({
      type: "Feature",
      properties: { color: speedColor(speed) },
      geometry: {
        type: "LineString",
        coordinates: [
          [a.longitude, a.latitude],
          [b.longitude, b.latitude],
        ],
      },
    });
  }
  return { type: "FeatureCollection", features };
}
