import { useEffect, useCallback, useRef } from "react";

export interface ScheduledBeep {
  frequency: number;
  /** Offset in seconds from now */
  at: number;
  duration: number;
}

function scheduleOnContext(
  ctx: AudioContext,
  frequency: number,
  when: number,
  duration: number,
  volume: number
) {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);

  oscillator.frequency.value = frequency;
  oscillator.type = "sine";

  gainNode.gain.setValueAtTime(volume, when);
  gainNode.gain.exponentialRampToValueAtTime(0.01, when + duration);

  oscillator.start(when);
  oscillator.stop(when + duration);
}

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
        scheduleOnContext(ctx, frequency, ctx.currentTime, duration, 0.3);
      } catch {
        // audio failed — beep silently
      }
    },
    [enabled, getAudioContext]
  );

  /**
   * Schedule a batch of beeps on the Web Audio clock. Spacing between
   * beeps is sample-accurate, independent of main-thread timing or
   * setTimeout drift.
   */
  const scheduleBeeps = useCallback(
    (beeps: ScheduledBeep[]) => {
      if (!enabled) return;
      const ctx = getAudioContext();
      if (!ctx) return;

      try {
        for (const { frequency, at, duration } of beeps) {
          scheduleOnContext(ctx, frequency, ctx.currentTime + at, duration, 0.3);
        }
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
      scheduleOnContext(ctx, 1200, ctx.currentTime, 0.3, 0.4);
    } catch {
      // audio failed — beep silently
    }
  }, [enabled, getAudioContext]);

  /** Cheerful ascending arpeggio (C5-E5-G5-C6) for finishing a workout. */
  const playHappyBeep = useCallback(() => {
    if (!enabled) return;
    const ctx = getAudioContext();
    if (!ctx) return;

    try {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      const step = 0.15;
      const duration = 0.35;
      notes.forEach((frequency, index) => {
        scheduleOnContext(ctx, frequency, ctx.currentTime + index * step, duration, 0.35);
      });
    } catch {
      // audio failed — beep silently
    }
  }, [enabled, getAudioContext]);

  return { playBeep, playFinalBeep, scheduleBeeps, playHappyBeep };
}
