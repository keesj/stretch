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
  const timeLeftRef = useRef(initialTime);
  timeLeftRef.current = timeLeft;

  useEffect(() => {
    onCompleteRef.current = onComplete;
    return () => { onCompleteRef.current = undefined; };
  }, [onComplete]);

  useEffect(() => {
    if (isRunning && timeLeftRef.current > 0 && !hasCompletedRef.current) {
      intervalRef.current = setInterval(() => {
        setTimeLeft((prev) => {
          if (prev <= 1) {
            hasCompletedRef.current = true;
            if (onCompleteRef.current) {
              onCompleteRef.current();
            }
            clearInterval(intervalRef.current!);
            intervalRef.current = null;
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
    if (timeLeftRef.current > 0) {
      hasCompletedRef.current = false;
      setIsRunning(true);
    }
  }, []);

  const pause = useCallback(() => {
    setIsRunning(false);
  }, []);

  const reset = useCallback(
    (newTime?: number) => {
      clearInterval(intervalRef.current!);
      intervalRef.current = null;
      setIsRunning(false);
      setTimeLeft(newTime ?? initialTime);
      hasCompletedRef.current = false;
    },
    [initialTime]
  );

  const skip = useCallback(() => {
    setTimeLeft(0);
    setIsRunning(false);
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