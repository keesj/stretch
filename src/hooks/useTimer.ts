import { useState, useEffect, useCallback, useRef } from "react";

interface UseTimerOptions {
  initialTime?: number;
  onComplete?: () => void;
}

export function useTimer({ initialTime = 60, onComplete }: UseTimerOptions) {
  const [timeLeft, setTimeLeft] = useState(initialTime);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  const hasCompletedRef = useRef(false);

  useEffect(() => {
    onCompleteRef.current = onComplete;
  }, [onComplete]);

  useEffect(() => {
    if (isRunning && timeLeft > 0) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1 && !hasCompletedRef.current) {
            hasCompletedRef.current = true;
            if (onCompleteRef.current) {
              onCompleteRef.current();
            }
          }
          if (prev <= 1) {
            if (intervalRef.current) {
              clearInterval(intervalRef.current);
              intervalRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isRunning]);

  const start = useCallback(() => {
    setIsRunning(true);
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(
    (newTime?: number) => {
      setIsRunning(false);
      setTimeLeft(newTime ?? initialTime);
      hasCompletedRef.current = false;
    },
    [initialTime]
  );

  const skip = useCallback(() => {
    setTimeLeft(0);
  }, []);

  return {
    timeLeft,
    isRunning,
    start,
    pause,
    reset,
    skip,
  };
}