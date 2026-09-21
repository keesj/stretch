import { useState, useEffect, useCallback, useRef } from "react";

interface UseTimerOptions {
  initialTime?: number;
  onComplete?: () => void;
}

export function useTimer({ initialTime = 60, onComplete }: UseTimerOptions) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeLeftRef = useRef(initialTime);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  timeLeftRef.current = timeLeft;
  onCompleteRef.current = onComplete;

  const stopInterval = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => stopInterval, [stopInterval]);

  const tick = useCallback(() => {
    const prev = timeLeftRef.current;
    if (prev <= 1) {
      timeLeftRef.current = 0;
      setTimeLeft(0);
      stopInterval();
      setIsRunning(false);
      if (!hasCompletedRef.current) {
        hasCompletedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }
    timeLeftRef.current = prev - 1;
    setTimeLeft(prev - 1);
  }, [stopInterval]);

  const start = useCallback(() => {
    if (timeLeftRef.current <= 0 || hasCompletedRef.current || intervalRef.current) {
      return;
    }
    hasCompletedRef.current = false;
    setIsRunning(true);
    intervalRef.current = setInterval(tick, 1000);
  }, [tick]);

  const pause = useCallback(() => {
    stopInterval();
    setIsRunning(false);
  }, [stopInterval]);

  const reset = useCallback(
    (newTime?: number) => {
      stopInterval();
      setIsRunning(false);
      const next = newTime ?? initialTime;
      timeLeftRef.current = next;
      setTimeLeft(next);
      hasCompletedRef.current = false;
    },
    [initialTime, stopInterval]
  );

  const skip = useCallback(() => {
    stopInterval();
    timeLeftRef.current = 0;
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
