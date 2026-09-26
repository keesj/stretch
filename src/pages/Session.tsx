import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ExerciseCard } from "../components/ExerciseCard";
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
  // True once the current exercise's countdown finished and the timer ran
  // (so "Paused" is shown instead of "Ready" when the user hits Pause).
  const hasStartedRef = useRef(false);
  // 3-2-1 shown while the start countdown runs (null otherwise)
  const [countdownNumber, setCountdownNumber] = useState<number | null>(null);

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

  const { scheduleBeeps, playHappyBeep, getClock } = useBeep(soundEnabled);
  useWakeLock({ isActive: isRunning && !isPaused || countdownNumber != null });

  useEffect(() => {
    if (isCompleted && !prevCompletedRef.current) {
      playHappyBeep();
    }
    prevCompletedRef.current = isCompleted;
  }, [isCompleted, playHappyBeep]);

  const startCountdown = useCallback(() => {
    cancelCountdown();

    countdownCompleteRef.current = false;
    setCountdownNumber(3);

    // Schedule all beeps on the Web Audio clock so the 3-2-1 spacing is
    // sample-accurate instead of riding on setTimeout jitter.
    scheduleBeeps([
      { frequency: 800, at: 0, duration: 0.1 },
      { frequency: 800, at: 1, duration: 0.1 },
      { frequency: 800, at: 2, duration: 0.1 },
      { frequency: 1200, at: 3, duration: 0.3 },
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
      if (elapsed >= 3) {
        countdownRafRef.current = null;
        setCountdownNumber(null);
        countdownCompleteRef.current = true;
        hasStartedRef.current = true;
        if (!isCompleted) {
          start();
        }
        return;
      }
      setCountdownNumber(Math.max(3 - Math.floor(elapsed), 1));
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

  const handleStartPause = useCallback(() => {
    if (isRunning) {
      pause();
    } else {
      startCountdown();
    }
  }, [isRunning, pause, startCountdown]);

  useEffect(() => {
    stopCountdown();
    hasStartedRef.current = false;
    resetTimer(currentExercise.duration);

    // Only auto-start the next exercise when the previous one finished
    // naturally (timer hit 0). Manual Next/Prev stays in "Ready".
    const shouldAutoStart = autoAdvanceRef.current && currentExerciseIndex > 0 && !isCompleted;
    autoAdvanceRef.current = false;
    if (shouldAutoStart) {
      startCountdown();
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
          <ExerciseCard exercise={currentExercise} />
        </motion.div>
      </AnimatePresence>

      <div className="my-8">
        <Timer
          displayTime={countdownNumber ?? timeLeft}
          isRunning={isRunning}
          isCounting={countdownNumber != null}
          isPaused={
            isPaused ||
            (hasStartedRef.current && !isRunning && timeLeft > 0)
          }
          totalDuration={currentExercise.duration}
          countdownDisplay={showNextPreview ? timeLeft : null}
          isTransitionMessage={showTransitionMessage}
        />
      </div>

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
        onClick={() => setShowInstructions(!showInstructions)}
        className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-3"
      >
        {showInstructions ? "Hide Instructions" : "Show Instructions"}
      </button>

      <AnimatePresence>
        {showInstructions && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-3"
          >
            {currentExercise.instructions.map((instruction, index) => (
              <motion.p
                key={index}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: index * 0.1 }}
                className="text-center text-gray-600 dark:text-gray-400 text-sm"
              >
                {index + 1}. {instruction}
              </motion.p>
            ))}
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

        <Button
          variant="secondary"
          onClick={handleStartPause}
          className="flex-1"
        >
          {isRunning ? "Pause" : "Start"}
        </Button>

        <Button onClick={goToNext} className="flex-1">
          Next
        </Button>
      </div>
    </motion.div>
  );
}