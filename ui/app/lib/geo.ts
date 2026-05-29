import type { Feature, FeatureCollection, Polygon } from "geojson";

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
