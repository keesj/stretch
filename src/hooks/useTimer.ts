import { useState, useEffect, useCallback, useRef } from "react";

interface UseTimerOptions {
  initialTime?: number;
  onComplete?: () => void;
}

const TICK_INTERVAL_MS = 100;

export function useTimer({ initialTime = 60, onComplete }: UseTimerOptions) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const endAtRef = useRef<number | null>(null);
  const remainingMsRef = useRef(initialTime * 1000);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  onCompleteRef.current = onComplete;

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => stopInterval, [stopInterval]);

  const tick = useCallback(() => {
    const endAt = endAtRef.current;
    if (endAt == null) {
      return;
    }
    // Derive the remaining time from the wall clock so delayed or
    // throttled ticks self-correct instead of accumulating drift.
    const remainingMs = endAt - Date.now();
    if (remainingMs <= 0) {
      endAtRef.current = null;
      remainingMsRef.current = 0;
      setTimeLeft(0);
      stopInterval();
      setIsRunning(false);
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }
    remainingMsRef.current = remainingMs;
    setTimeLeft(Math.ceil(remainingMs / 1000));
  }, [stopInterval]);

  const start = useCallback(() => {
    if (remainingMsRef.current <= 0 || hasCompletedRef.current || intervalRef.current) {
      return;
    }
    hasCompletedRef.current = false;
    endAtRef.current = Date.now() + Math.round(remainingMsRef.current);
    setIsRunning(true);
    intervalRef.current = setInterval(tick, TICK_INTERVAL_MS);
  }, [tick]);

  const pause = useCallback(() => {
    if (endAtRef.current != null) {
      remainingMsRef.current = Math.max(endAtRef.current - Date.now(), 0);
      endAtRef.current = null;
      setTimeLeft(Math.ceil(remainingMsRef.current / 1000));
    }
    stopInterval();
    setIsRunning(false);
  }, [stopInterval]);

  const reset = useCallback(
    (newTime?: number) => {
      stopInterval();
      endAtRef.current = null;
      setIsRunning(false);
      const next = newTime ?? initialTime;
      remainingMsRef.current = next * 1000;
      setTimeLeft(next);
      hasCompletedRef.current = false;
    },
    [initialTime, stopInterval]
  );

  const skip = useCallback(() => {
    stopInterval();
    endAtRef.current = null;
    remainingMsRef.current = 0;
    setTimeLeft(0);
    setIsRunning(false);
  }, [stopInterval]);

  return {
    timeLeft,
    isRunning,
    start,
    pause,
    reset,
    skip,
  };
}
