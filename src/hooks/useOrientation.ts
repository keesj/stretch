import { useState, useEffect } from "react";

/**
 * True when the viewport is in landscape orientation. Falls back to
 * false when matchMedia is unavailable (e.g. in tests).
 */
export function useIsLandscape(): boolean {
  const [isLandscape, setIsLandscape] = useState(() => {
    try {
      return window.matchMedia("(orientation: landscape)").matches;
    } catch {
      return false;
    }
  });

  useEffect(() => {
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia("(orientation: landscape)");
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => setIsLandscape(event.matches);
    try {
      mq.addEventListener("change", onChange);
    } catch {
      return;
    }
    return () => {
      try {
        mq.removeEventListener("change", onChange);
      } catch {
        // already detached
      }
    };
  }, []);

  return isLandscape;
}
