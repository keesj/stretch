import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ExerciseCard } from "../components/ExerciseCard";
import { StretchAnimation } from "../components/StretchAnimation";
import { Timer } from "../components/Timer";
import { ProgressBar } from "../components/ProgressBar";
import { Button } from "../components/Button";
import { useTimer } from "../hooks/useTimer";
import { useWorkout } from "../hooks/useWorkout";
import { useBeep } from "../hooks/useBeep";
import { useWakeLock } from "../hooks/useWakeLock";
import { Card } from "../components/Card";
import { loadFromStorage, DEFAULT_SETTINGS } from "../utils/storage";
import type { Stretch } from "../types/stretch";
import type { Routine } from "../types/routine";

import routinesData from "../data/routines.json";
import stretchesData from "../data/stretches.json";

const routines = routinesData as Routine[];
const stretches = stretchesData as Stretch[];

export function Session() {
  const navigate = useNavigate();
  const [routineId, setRoutineId] = useState<string>(routines[0].id);
  const [isLoading, setIsLoading] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  const [showNextPreview, setShowNextPreview] = useState(false);
  const [showTransitionMessage, setShowTransitionMessage] = useState(false);
  const countdownRafRef = useRef<number | null>(null);
  const countdownCompleteRef = useRef(false);
  const autoAdvanceRef = useRef(false);
  const prevCompletedRef = useRef(false);
  // 3-2-1 shown while the start countdown runs (null otherwise)
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null);
  // Length of the lead-in countdown (3s to start, 5s between exercises),
  // included in the displayed total and marked on the ring
  const [countdownSeconds, setCountdownSeconds] = useState(3);

  const cancelCountdown = useCallback(() => {
    if (countdownRafRef.current != null) {
      cancelAnimationFrame(countdownRafRef.current);
      countdownRafRef.current = null;
    }
    setCountdownNumber(null);
  }, []);
  const [soundEnabled] = useState(() =>
    loadFromStorage("settings", DEFAULT_SETTINGS).soundEnabled
  );

  useEffect(() => {
    try {
      const stored = localStorage.getItem("activeSession");
      if (stored) {
        try {
          const session = JSON.parse(stored);
          localStorage.removeItem("activeSession");
          setRoutineId(session.routineId || routines[0].id);
        } catch {
          localStorage.removeItem("activeSession");
        }
      }
    } catch { /* storage unavailable */ }
    setIsLoading(false);
  }, []);

  const routine = useMemo(() => 
    routines.find((r) => r.id === routineId) || routines[0]
  , [routineId]);

  const exerciseStretches = useMemo(() => 
    routine.stretches
      .map((id) => stretches.find((s) => s.id === id))
      .filter((s): s is Stretch => !!s)
  , [routine]);

  const {
    currentExercise,
    currentExerciseIndex,
    totalExercises,
    isCompleted,
    isPaused,
    nextExercise,
    previousExercise,
    reset,
  } = useWorkout({
    routine,
    stretches: exerciseStretches,
    onComplete: (session) => {
      navigate("/finished", { state: { session } });
    },
  });

  const { timeLeft, start, pause, reset: resetTimer, skip, isRunning } = useTimer({
    initialTime: currentExercise.duration,
    onComplete: () => {
      autoAdvanceRef.current = true;
      nextExercise();
    },
  });

  // True once the current exercise's timer has run (so "Paused" is shown
  // instead of "Ready" when the user pauses partway through).
  const isStarted = isRunning || timeLeft < currentExercise.duration;
  // Lead-in seconds still to go (shown as "60 + 3" and on the ring)
  const countdownRemaining = countdownNumber != null
    ? countdownNumber
    : !isStarted && !isPaused
      ? countdownSeconds
      : null;
  const displayTime =
    countdownRemaining != null
      ? currentExercise.duration + countdownRemaining
      : timeLeft;

  const { scheduleBeeps, playHappyBeep, getClock } = useBeep(soundEnabled);
  useWakeLock({ isActive: isRunning && !isPaused || countdownNumber != null });

  useEffect(() => {
    if (isCompleted && !prevCompletedRef.current) {
      playHappyBeep();
    }
    prevCompletedRef.current = isCompleted;
  }, [isCompleted, playHappyBeep]);

  const startCountdown = useCallback((seconds = 3) => {
    cancelCountdown();

    countdownCompleteRef.current = false;
    setCountdownNumber(seconds);
    setCountdownSeconds(seconds);

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
        countdownCompleteRef.current = true;
        if (!isCompleted) {
          start();
        }
        return;
      }
      setCountdownNumber(Math.max(seconds - Math.floor(elapsed), 1));
      countdownRafRef.current = requestAnimationFrame(tick);
    };
    countdownRafRef.current = requestAnimationFrame(tick);
  }, [cancelCountdown, scheduleBeeps, getClock, start, isCompleted]);

  const stopCountdown = useCallback(() => {
    cancelCountdown();
    countdownCompleteRef.current = false;
  }, [cancelCountdown]);

  const goToNext = useCallback(() => {
    if (currentExerciseIndex < totalExercises - 1) {
      stopCountdown();
      skip();
      nextExercise();
    }
  }, [currentExerciseIndex, totalExercises, stopCountdown, skip, nextExercise]);

  const goToPrevious = useCallback(() => {
    stopCountdown();
    if (currentExerciseIndex > 0) {
      previousExercise();
    }
  }, [stopCountdown, previousExercise, currentExerciseIndex]);

  const handleTimerClick = useCallback(() => {
    if (countdownNumber != null) {
      stopCountdown();
      return;
    }
    if (isRunning) {
      pause();
    } else if (isStarted) {
      // Resume from a pause — straight back to the paused time, no countdown
      start();
    } else {
      startCountdown();
    }
  }, [countdownNumber, stopCountdown, isRunning, isStarted, pause, start, startCountdown]);

  useEffect(() => {
    stopCountdown();
    setCountdownSeconds(3);
    resetTimer(currentExercise.duration);

    // Only auto-start the next exercise when the previous one finished
    // naturally (timer hit 0). Manual Next/Prev stays in "Ready". The
    // transition countdown is longer than the initial 3-2-1 so there is
    // time to move into the next position.
    const shouldAutoStart = autoAdvanceRef.current && currentExerciseIndex > 0 && !isCompleted;
    autoAdvanceRef.current = false;
    if (shouldAutoStart) {
      startCountdown(5);
    }
  }, [currentExercise, resetTimer, currentExerciseIndex, isCompleted, startCountdown, stopCountdown]);

  useEffect(() => {
    if (!isPaused && !isCompleted && timeLeft <= 8 && currentExerciseIndex < totalExercises - 1) {
      setShowTransitionMessage(true);
    } else {
      setShowTransitionMessage(false);
    }
  }, [timeLeft, isPaused, isCompleted, currentExerciseIndex, totalExercises]);

  useEffect(() => {
    if (!isPaused && !isCompleted && timeLeft <= 15 && currentExerciseIndex < totalExercises - 1) {
      setShowNextPreview(true);
    } else {
      setShowNextPreview(false);
    }
  }, [timeLeft, isPaused, isCompleted, currentExerciseIndex, totalExercises]);

  useEffect(() => cancelCountdown, [cancelCountdown]);

  const handleReturnHome = useCallback(() => {
    stopCountdown();
    reset();
    resetTimer(0);
    navigate("/");
  }, [stopCountdown, reset, resetTimer, navigate]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-calm-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="px-4 py-6 pb-24 max-w-md mx-auto"
    >
      <div className="flex items-center justify-between mb-6">
        <button
          onClick={handleReturnHome}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ← Back
        </button>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Exercise {currentExerciseIndex + 1} of {totalExercises}
        </div>
      </div>
      <ProgressBar current={currentExerciseIndex + 1} total={totalExercises} />

      <AnimatePresence mode="wait">
        <motion.div
          key={currentExercise.id}
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -50 }}
          transition={{ duration: 0.3 }}
        >
          <ExerciseCard
            exercise={currentExercise}
            aside={
              <motion.button
                type="button"
                onClick={handleTimerClick}
                aria-label={
                  countdownNumber != null
                    ? "Cancel countdown"
                    : isRunning
                      ? "Pause"
                      : isStarted
                        ? "Resume"
                        : "Start"
                }
                animate={
                  countdownNumber == null && !isRunning && !isStarted
                    ? { scale: [1, 1.03, 1] }
                    : { scale: 1 }
                }
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                whileTap={{ scale: 0.96 }}
                className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <Timer
                  displayTime={displayTime}
                  isRunning={isRunning}
                  isCounting={countdownNumber != null}
                  isPaused={
                    isPaused ||
                    (isStarted && !isRunning && timeLeft > 0)
                  }
                  totalDuration={currentExercise.duration + countdownSeconds}
                  countdownSeconds={countdownSeconds}
                  countdownRemaining={countdownRemaining}
                  breathing
                  label={showTransitionMessage ? "Almost Done" : undefined}
                  size={200}
                />
              </motion.button>
            }
          />
        </motion.div>
      </AnimatePresence>

      {showNextPreview && currentExerciseIndex < totalExercises - 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-6"
        >
          <Card className="p-4 bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
            <div className="text-center">
              <div className="text-sm text-primary-600 dark:text-primary-300 mb-2">
                Next up
              </div>
              <div className="text-lg font-semibold mb-1 text-primary-700 dark:text-primary-200">
                {exerciseStretches[currentExerciseIndex + 1]?.title}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-300">
                {exerciseStretches[currentExerciseIndex + 1]?.illustration}
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      <button
        onClick={() => setShowInstructions(true)}
        className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-3"
      >
        Instructions
      </button>

      <AnimatePresence>
        {showInstructions && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4"
            onClick={() => setShowInstructions(false)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 16 }}
              transition={{ duration: 0.2 }}
              className="w-full max-w-sm max-h-[85vh] overflow-y-auto bg-white dark:bg-gray-800 rounded-2xl p-6 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex flex-col items-center text-center mb-4">
                {currentExercise.animation ? (
                  <div className="w-full max-w-[220px] mb-3">
                    <StretchAnimation stretch={currentExercise} />
                  </div>
                ) : (
                  <div className="text-6xl mb-3">{currentExercise.illustration}</div>
                )}
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                  {currentExercise.title}
                </h2>
              </div>
              <ol className="space-y-2 mb-6">
                {currentExercise.instructions.map((instruction, index) => (
                  <li key={index} className="flex gap-3 text-sm text-gray-600 dark:text-gray-300">
                    <span className="font-semibold text-primary-600 dark:text-primary-400">
                      {index + 1}.
                    </span>
                    <span>{instruction}</span>
                  </li>
                ))}
              </ol>
              <Button onClick={() => setShowInstructions(false)} className="w-full">
                Got it
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-8 flex gap-3">
        <Button
          variant="outline"
          onClick={goToPrevious}
          disabled={currentExerciseIndex === 0}
          className="flex-1"
        >
          Previous
        </Button>

        <Button onClick={goToNext} className="flex-1">
          Next
        </Button>
      </div>
    </motion.div>
  );
}