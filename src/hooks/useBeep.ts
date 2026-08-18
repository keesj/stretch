import { useEffect, useCallback, useRef } from "react";

export function useBeep(enabled: boolean) {
  const audioContextRef = useRef<AudioContext | null>(null);

  const getAudioContext = useCallback((): AudioContext | null => {
    if (audioContextRef.current) {
      return audioContextRef.current;
    }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      if (!AC) return null;
      audioContextRef.current = new AC();
      return audioContextRef.current;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (audioContextRef.current) {
          audioContextRef.current.close();
        }
      } catch {
        // ignore close errors
      }
    };
  }, []);

  const playBeep = useCallback(
    (frequency: number = 800, duration: number = 0.1) => {
      if (!enabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      try {
        const oscillator = ctx.createOscillator();
        const gainNode = ctx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(ctx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = "sine";

        gainNode.gain.setValueAtTime(0.3, ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);

        oscillator.start(ctx.currentTime);
        oscillator.stop(ctx.currentTime + duration);
      } catch {
        // audio failed — beep silently
      }
    },
    [enabled, getAudioContext]
  );

  const playFinalBeep = useCallback(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);

      oscillator.frequency.value = 1200;
      oscillator.type = "sine";

      gainNode.gain.setValueAtTime(0.4, ctx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

      oscillator.start(ctx.currentTime);
      oscillator.stop(ctx.currentTime + 0.3);
    } catch {
      // audio failed — beep silently
    }
  }, [enabled, getAudioContext]);

  return { playBeep, playFinalBeep };
}