import { useState, useEffect, useCallback, useRef } from "react";

const TICK_INTERVAL_MS = 100;

/**
 * A count-up timer (the reversed plank challenge: hold as long as you
 * can, then stop). Elapsed time is derived from the wall clock on every
 * tick so delayed or throttled ticks self-correct instead of drifting,
 * and `getElapsedMs` reads the refs for an exact value at stop time.
 */
export function useCountUp() {
  const [elapsed, setElapsed] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startAtRef = useRef<number | null>(null);
  const accumulatedMsRef = useRef(0);

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => stopInterval, [stopInterval]);

  const getElapsedMs = useCallback((): number => {
    const runningMs =
      startAtRef.current != null ? Date.now() - startAtRef.current : 0;
    return accumulatedMsRef.current + Math.max(runningMs, 0);
  }, []);

  const tick = useCallback(() => {
    setElapsed(Math.ceil(getElapsedMs() / 1000));
  }, [getElapsedMs]);

  /** Start or resume (resuming continues from the paused total). */
  const start = useCallback(() => {
    if (startAtRef.current != null) return;
    startAtRef.current = Date.now();
    setIsRunning(true);
    intervalRef.current = setInterval(tick, TICK_INTERVAL_MS);
  }, [tick]);

  const pause = useCallback(() => {
    if (startAtRef.current != null) {
      accumulatedMsRef.current += Date.now() - startAtRef.current;
      startAtRef.current = null;
    }
    stopInterval();
    setIsRunning(false);
    setElapsed(Math.ceil(accumulatedMsRef.current / 1000));
  }, [stopInterval]);

  const reset = useCallback(() => {
    stopInterval();
    startAtRef.current = null;
    accumulatedMsRef.current = 0;
    setIsRunning(false);
    setElapsed(0);
  }, [stopInterval]);

  return { elapsed, isRunning, start, pause, reset, getElapsedMs };
}
