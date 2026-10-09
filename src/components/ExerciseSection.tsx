import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ExerciseCard } from "./ExerciseCard";
import { StretchAnimation } from "./StretchAnimation";
import { Timer } from "./Timer";
import { useTimer } from "../hooks/useTimer";
import { useIsLandscape } from "../hooks/useOrientation";
import { formatDuration } from "../utils/timer";
import type { ScheduledBeep } from "../hooks/useBeep";
import type { Stretch } from "../types/stretch";

export type ExercisePhase = "ready" | "countdown" | "running" | "paused" | "completed";

interface ExerciseSectionProps {
  exercise: Stretch;
  index: number;
  isActive: boolean;
  isLast: boolean;
  /** The exercise that follows (shown in the "Up next" card) */
  nextExercise?: Stretch;
  /** Run the 5s transition countdown automatically once this section becomes active */
  autoStart: boolean;
  onAutoStartConsumed: () => void;
  onCompleted: (index: number) => void;
  onPhaseChange: (index: number, phase: ExercisePhase) => void;
  scheduleBeeps: (beeps: ScheduledBeep[]) => void;
  getClock: () => number;
  onShowInstructions: () => void;
  /** Scroll to the next exercise (from the "Up next" card) */
  onNext?: () => void;
}

function SwipeUpHint() {
  return (
    <div className="absolute left-0 right-0 top-2 flex flex-col items-center text-gray-400 dark:text-gray-500">
      <motion.svg
        animate={{ y: [0, -4, 0] }}
        transition={{ repeat: Infinity, duration: 1.6, ease: "easeInOut" }}
        viewBox="0 0 24 24"
        className="h-5 w-5 translate-x-[1px] fill-current"
        aria-hidden="true"
      >
        <path d="M12 7.5l7 7-1.4 1.4L12 10.3l-5.6 5.6L5 14.5z" />
      </motion.svg>
      <span className="mt-0.5 text-[11px]">swipe up</span>
    </div>
  );
}

/** Teaser for the exercise that follows — always visible at the bottom. */
function UpNextCard({ next, onGo }: { next: Stretch; onGo?: () => void }) {
  return (
    <button
      type="button"
      onClick={onGo}
      aria-label={`Go to next exercise: ${next.title}`}
      className="mx-auto flex w-full max-w-xs items-center gap-3 rounded-2xl bg-white/70 p-3 text-left shadow-sm backdrop-blur transition-transform active:scale-[0.99] dark:bg-gray-800/70"
    >
      <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-calm-100/80 dark:bg-calm-900/40">
        {next.animation ? (
          <div className="h-11 w-11">
            <StretchAnimation stretch={next} playing={false} />
          </div>
        ) : (
          <span className="text-3xl">{next.illustration}</span>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-gray-400 dark:text-gray-500">
          Up next
        </div>
        <div className="truncate text-sm font-semibold text-gray-700 dark:text-gray-200">
          {next.title}
        </div>
      </div>
      <div className="shrink-0 text-xs font-medium text-gray-400 dark:text-gray-500">
        {formatDuration(next.duration)}
      </div>
    </button>
  );
}

export function ExerciseSection({
  exercise,
  index,
  isActive,
  isLast,
  nextExercise,
  autoStart,
  onAutoStartConsumed,
  onCompleted,
  onPhaseChange,
  scheduleBeeps,
  getClock,
  onShowInstructions,
  onNext,
}: ExerciseSectionProps) {
  const [phase, setPhase] = useState<ExercisePhase>("ready");
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null);
  const [countdownSeconds, setCountdownSeconds] = useState(3);
  const countdownRafRef = useRef<number | null>(null);
  const phaseRef = useRef(phase);
  phaseRef.current = phase;

  const isLandscape = useIsLandscape();
  const timerSize = isLandscape ? 176 : 220;

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
      className={`relative flex h-full flex-col items-center overflow-hidden px-4 py-3 ${
        phase === "completed" ? "opacity-60" : ""
      }`}
    >
      {isActive && index > 0 && <SwipeUpHint />}

      {/* Portrait: pose above the timer. Landscape: timer sits to the right
          of the pose so both fit in the short viewport. */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 landscape:flex-row landscape:gap-10">
        <ExerciseCard exercise={exercise} playing={phase === "running"} />

        <div className="flex flex-col items-center gap-3">
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
              size={timerSize}
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
        </div>
      </div>

      {nextExercise && <UpNextCard next={nextExercise} onGo={onNext} />}
    </div>
  );
}
