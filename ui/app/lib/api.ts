export type UserLocation = {
  userid: string;
  name: string;
  github: string | null;
  timestamp: string;
  latitude: number;
  longitude: number;
  battery: number | null;
  batteryState: string | null;
  speed: number | null;
  altitude: number | null;
  accuracy: number | null;
  verticalAccuracy: number | null;
  course: number | null;
  source: string;
};

export type LocationsResponse = {
  users: UserLocation[];
};

export type ConfigResponse = {
  mapboxToken: string;
};

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`request failed: ${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}
