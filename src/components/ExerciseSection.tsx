import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ExerciseCard } from "./ExerciseCard";
import { Timer } from "./Timer";
import { useTimer } from "../hooks/useTimer";
import type { ScheduledBeep } from "../hooks/useBeep";
import type { Stretch } from "../types/stretch";

export type ExercisePhase = "ready" | "countdown" | "running" | "paused" | "completed";

interface ExerciseSectionProps {
  exercise: Stretch;
  index: number;
  isActive: boolean;
  isLast: boolean;
  /** Run the 5s transition countdown automatically once this section becomes active */
  autoStart: boolean;
  onAutoStartConsumed: () => void;
  onCompleted: (index: number) => void;
  onPhaseChange: (index: number, phase: ExercisePhase) => void;
  scheduleBeeps: (beeps: ScheduledBeep[]) => void;
  getClock: () => number;
  onShowInstructions: () => void;
}

function SwipeHint({ direction }: { direction: "up" | "down" }) {
  return (
    <div
      className={`absolute left-0 right-0 flex flex-col items-center text-gray-400 dark:text-gray-500 ${
        direction === "up" ? "top-2" : "bottom-2"
      }`}
    >
      {direction === "down" && <span className="mb-0.5 text-[11px]">swipe down</span>}
      <motion.svg
        animate={{ y: [0, direction === "down" ? 4 : -4, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        viewBox="0 0 24 24"
        className="h-5 w-5 translate-x-[1px] fill-current"
        aria-hidden="true"
      >
        <path
          d={
            direction === "down"
              ? "M12 16.5 5 9.5l1.4-1.4L12 13.7l5.6-5.6L19 9.5z"
              : "M12 7.5l7 7-1.4 1.4L12 10.3l-5.6 5.6L5 14.5z"
          }
        />
      </motion.svg>
      {direction === "up" && <span className="mt-0.5 text-[11px]">swipe up</span>}
    </div>
  );
}

export function ExerciseSection({
  exercise,
  index,
  isActive,
  isLast,
  autoStart,
  onAutoStartConsumed,
  onCompleted,
  onPhaseChange,
  scheduleBeeps,
  getClock,
  onShowInstructions,
}: ExerciseSectionProps) {
  const [phase, setPhase] = useState<ExercisePhase>("ready");
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const countdownRafRef = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const { timeLeft, start, pause } = useTimer({
    initialTime: exercise.duration,
    onComplete: () => {
      setPhase("completed");
      onCompleted(index);
    },
  });

  useEffect(() => {
    onPhaseChange(index, phase);
  }, [index, phase, onPhaseChange]);

  const cancelCountdown = useCallback(() => {
    if (countdownRafRef.current != null) {
      cancelAnimationFrame(countdownRafRef.current);
      countdownRafRef.current = null;
    }
    setCountdownNumber(null);
  }, []);

  const startCountdown = useCallback(
    (seconds: number) => {
      if (phaseRef.current === "completed") {
        return;
      }
      cancelCountdown();
      setCountdownSeconds(seconds);
      setCountdownNumber(seconds);
      setPhase("countdown");

      // Schedule all beeps on the Web Audio clock so the countdown spacing is
      // sample-accurate instead of riding on setTimeout jitter.
      scheduleBeeps([
        ...Array.from({ length: seconds }, (_, i) => ({
          frequency: 800,
          at: i,
          duration: 0.1,
        })),
        { frequency: 1200, at: seconds, duration: 0.3 },
      ]);

      // Derive the countdown from the clock every frame (same clock family
      // as the beeps) so the numbers and the start stay in sync with the
      // sound and self-correct after dropped frames.
      const t0 = getClock();
      const t0Perf = performance.now() / 1000;
      const elapsedAt = () =>
        Math.max(getClock() - t0, performance.now() / 1000 - t0Perf);

      const tick = () => {
        const elapsed = elapsedAt();
        if (elapsed >= seconds) {
          countdownRafRef.current = null;
          setCountdownNumber(null);
          if (phaseRef.current === "countdown") {
            start();
            setPhase("running");
          }
          return;
        }
        setCountdownNumber(Math.max(seconds - Math.floor(elapsed), 1));
        countdownRafRef.current = requestAnimationFrame(tick);
      };
      countdownRafRef.current = requestAnimationFrame(tick);
    },
    [cancelCountdown, scheduleBeeps, getClock, start]
  );

  // Scrolling away pauses whatever is in flight so only the visible
  // exercise's clock ever runs.
  useEffect(() => {
    if (!isActive && (phase === "running" || phase === "countdown")) {
      cancelCountdown();
      pause();
      setPhase("paused");
    }
  }, [isActive, phase, cancelCountdown, pause]);

  useEffect(() => {
    if (isActive && autoStart && phase === "ready") {
      startCountdown(5);
      onAutoStartConsumed();
    }
  }, [isActive, autoStart, phase, startCountdown, onAutoStartConsumed]);

  useEffect(() => cancelCountdown, [cancelCountdown]);

  const handleTimerClick = useCallback(() => {
    if (phase === "countdown") {
      cancelCountdown();
      setPhase("ready");
    } else if (phase === "running") {
      pause();
      setPhase("paused");
    } else if (phase === "paused") {
      start();
      setPhase("running");
    } else if (phase === "ready") {
      startCountdown(3);
    }
  }, [phase, cancelCountdown, pause, start, startCountdown]);

  // Lead-in seconds still to go (shown as "30 + 3" and on the ring)
  const countdownRemaining =
    phase === "countdown"
      ? countdownNumber
      : phase === "ready"
        ? countdownSeconds
        : null;
  const displayTime =
    countdownRemaining != null ? exercise.duration + countdownRemaining : timeLeft;
  const label =
    phase === "completed"
      ? "Completed"
      : phase === "running" && timeLeft <= 8 && !isLast
        ? "Almost Done"
        : phase === "ready"
          ? "Ready"
          : undefined;
  const timerAriaLabel =
    phase === "countdown"
      ? "Cancel countdown"
      : phase === "running"
        ? "Pause"
        : phase === "paused"
          ? "Resume"
          : phase === "ready"
            ? "Start"
            : undefined;

  return (
    <div
      data-testid="exercise-section"
      className={`relative flex h-full flex-col items-center justify-center gap-5 px-4 ${
        phase === "completed" ? "opacity-60" : ""
      }`}
    >
      {isActive && index > 0 && <SwipeHint direction="up" />}

      <ExerciseCard exercise={exercise} playing={phase === "running"} />

      <motion.button
        type="button"
        disabled={phase === "completed"}
        onClick={handleTimerClick}
        aria-label={timerAriaLabel}
        animate={phase === "ready" ? { scale: [1, 1.03, 1] } : { scale: 1 }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        whileTap={{ scale: 0.96 }}
        className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:cursor-default"
      >
        <Timer
          displayTime={displayTime}
          isRunning={phase === "running"}
          isCounting={phase === "countdown"}
          isPaused={phase === "paused"}
          totalDuration={exercise.duration + countdownSeconds}
          countdownSeconds={countdownSeconds}
          countdownRemaining={countdownRemaining}
          breathing={phase === "running"}
          label={label}
          size={220}
        />
      </motion.button>

      {isActive && (
        <button
          onClick={onShowInstructions}
          className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
        >
          Instructions
        </button>
      )}

      {isActive && !isLast && <SwipeHint direction="down" />}
    </div>
  );
}
