// Speed is stored in m/s; surface it as km/h for display.
export function speedKmh(speed: number | null): number | null {
  return speed === null ? null : speed * 3.6;
}

// Color ramps from blue (stationary) to red (fast); fully red at 140km/h.
// Interpolate the HSL hue the short way (blue→purple→magenta→red) rather than
// RGB, which would pass through a muddy gray and make slow values look dull.
const SPEED_FULL_RED_KMH = 140;
const HUE_SLOW = 215; // ~#1d6fe0 blue
const HUE_FAST = 360; // red (== 0°)

export function speedColor(speed: number | null): string {
  const kmh = speed === null ? 0 : speed * 3.6;
  const t = Math.max(0, Math.min(1, kmh / SPEED_FULL_RED_KMH));
  const hue = HUE_SLOW + (HUE_FAST - HUE_SLOW) * t;
  return `hsl(${Math.round(hue)}, 77%, 50%)`;
}
