import { useCallback, useEffect, useRef, useState } from "react";

export type WakeLock = { active: boolean; toggle: () => void };

// Toggleable Screen Wake Lock. The browser drops the lock whenever the page is
// hidden, so we remember the desired state and re-acquire it on return.
export function useWakeLock(): WakeLock {
  const [active, setActive] = useState(false);
  const sentinel = useRef<WakeLockSentinel | null>(null);
  const desired = useRef(false);

  const acquire = useCallback(async () => {
    if (!("wakeLock" in navigator)) return;
    try {
      const lock = await navigator.wakeLock.request("screen");
      sentinel.current = lock;
      lock.addEventListener("release", () => setActive(false));
      setActive(true);
    } catch {
      // Request can reject (e.g. not visible, unsupported) — stay released.
      setActive(false);
    }
  }, []);

  const toggle = useCallback(() => {
    desired.current = !desired.current;
    if (desired.current) {
      void acquire();
    } else {
      void sentinel.current?.release();
      sentinel.current = null;
      setActive(false);
    }
  }, [acquire]);

  useEffect(() => {
    const onVisible = () => {
      if (desired.current && document.visibilityState === "visible") {
        void acquire();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [acquire]);

  return { active, toggle };
}
