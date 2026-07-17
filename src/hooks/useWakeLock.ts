import { useEffect, useCallback, useRef, useState } from "react";

interface UseWakeLockOptions {
  isActive?: boolean;
}

interface WakeLockResult {
  wakeLock: WakeLockSentinel | null;
  requestWakeLock: () => Promise<void>;
  releaseWakeLock: () => void;
}

export function useWakeLock({ isActive = true }: UseWakeLockOptions): WakeLockResult {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  useEffect(() => {
    setIsSupported("wakeLock" in navigator);
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!isSupported || !isActive) return;

    try {
      if (wakeLockRef.current) {
        return;
      }

      wakeLockRef.current = await navigator.wakeLock.request("screen");

      wakeLockRef.current.addEventListener("release", () => {
        wakeLockRef.current = null;
      });
    } catch (err) {
      console.error("Failed to acquire wake lock:", err);
    }
  }, [isSupported, isActive]);

  const releaseWakeLock = useCallback(() => {
    if (wakeLockRef.current) {
      wakeLockRef.current.release().catch((err) => {
        console.error("Failed to release wake lock:", err);
      });
      wakeLockRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (isActive) {
      requestWakeLock();
    } else {
      releaseWakeLock();
    }
  }, [isActive, requestWakeLock, releaseWakeLock]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && isActive && wakeLockRef.current) {
        releaseWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isActive, releaseWakeLock]);

  return {
    wakeLock: wakeLockRef.current,
    requestWakeLock,
    releaseWakeLock,
  };
}