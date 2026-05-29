import { useCallback, useState } from "react";

export type SoloMode = "gray" | "hide";

export type ViewConfig = {
  hidden: string[];
  solo: string[];
  tracking: boolean;
  soloMode: SoloMode;
};

export const DEFAULT_CONFIG: ViewConfig = {
  hidden: [],
  solo: [],
  tracking: true,
  soloMode: "gray",
};

function splitList(value: string | null): string[] {
  if (!value) return [];
  return value.split(",").filter((s) => s.length > 0);
}

export function parseConfig(search: string): ViewConfig {
  const params = new URLSearchParams(search);
  const track = params.get("track");
  const soloMode = params.get("solo_mode") === "hide" ? "hide" : "gray";
  return {
    hidden: splitList(params.get("hidden")),
    solo: splitList(params.get("solo")),
    tracking: track === null ? DEFAULT_CONFIG.tracking : track === "1",
    soloMode,
  };
}

// Serialize to a query string, omitting keys at their default to keep URLs clean.
export function serializeConfig(config: ViewConfig): string {
  const params = new URLSearchParams();
  if (config.hidden.length > 0) params.set("hidden", config.hidden.join(","));
  if (config.solo.length > 0) params.set("solo", config.solo.join(","));
  if (config.tracking !== DEFAULT_CONFIG.tracking) {
    params.set("track", config.tracking ? "1" : "0");
  }
  if (config.soloMode !== DEFAULT_CONFIG.soloMode) {
    params.set("solo_mode", config.soloMode);
  }
  return params.toString();
}

export function useViewConfig(): [ViewConfig, (patch: Partial<ViewConfig>) => void] {
  const [config, setConfig] = useState<ViewConfig>(() =>
    typeof window === "undefined"
      ? DEFAULT_CONFIG
      : parseConfig(window.location.search),
  );

  const update = useCallback((patch: Partial<ViewConfig>) => {
    setConfig((prev) => {
      const next = { ...prev, ...patch };
      if (typeof window !== "undefined") {
        const query = serializeConfig(next);
        const url = query ? `${window.location.pathname}?${query}` : window.location.pathname;
        window.history.replaceState(window.history.state, "", url);
      }
      return next;
    });
  }, []);

  return [config, update];
}
