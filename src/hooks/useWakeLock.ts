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
    try {
      setIsSupported("wakeLock" in navigator);
    } catch {
      setIsSupported(false);
    }
  }, []);

  const requestWakeLock = useCallback(async () => {
    if (!isSupported || !isActive) return;

    try {
      // Guard against navigator.wakeLock being null or request not being a function
      const wakeLock = (navigator as any).wakeLock;
      if (!wakeLock || typeof wakeLock.request !== "function") return;

      if (wakeLockRef.current) {
        return;
      }

      wakeLockRef.current = await wakeLock.request("screen");

      if (!wakeLockRef.current) {
        return;
      }

      const currentLock = wakeLockRef.current;
      currentLock.addEventListener("release", () => {
        currentLock.release().catch(() => { /* already released */ });
        wakeLockRef.current = null;
      });
    } catch (err) {
      console.warn("Failed to acquire wake lock:", err);
      wakeLockRef.current = null;
    }
  }, [isSupported, isActive]);

  const releaseWakeLock = useCallback(() => {
    try {
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {
          // ignore release errors
        });
        wakeLockRef.current = null;
      }
    } catch (err) {
      console.warn("Failed to release wake lock:", err);
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
    try {
      const handleVisibilityChange = () => {
        if (document.hidden && isActive && wakeLockRef.current) {
          releaseWakeLock();
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);
      return () => {
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    } catch {
      // visibilitychange not supported in this environment
    }
  }, [isActive, releaseWakeLock]);

  return {
    wakeLock: wakeLockRef.current,
    requestWakeLock,
    releaseWakeLock,
  };
}