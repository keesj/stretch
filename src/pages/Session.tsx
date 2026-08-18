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
  const countdownTimersRef = useRef<ReturnType<typeof setTimeout>[] | null>(null);
  const countdownCompleteRef = useRef(false);
  const isTransitioningRef = useRef(false);
  const lastTickTimeRef = useRef<number>(60);

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
      nextExercise();
    },
  });

  const { playBeep, playFinalBeep } = useBeep(true);
  useWakeLock({ isActive: isRunning && !isPaused });

  const startCountdown = useCallback(() => {
    if (countdownTimersRef.current) {
      countdownTimersRef.current.forEach(clearTimeout);
      countdownTimersRef.current = null;
    }
    
    countdownCompleteRef.current = false;

    const timers: ReturnType<typeof setTimeout>[] = [];

    playBeep(800, 0.1);
    timers.push(setTimeout(() => playBeep(800, 0.1), 1000));
    timers.push(setTimeout(() => playBeep(800, 0.1), 2000));
    timers.push(setTimeout(() => {
      countdownCompleteRef.current = true;
      isTransitioningRef.current = false;
      playFinalBeep();
      if (!isCompleted) {
        start();
      }
    }, 3000));

    countdownTimersRef.current = timers;
  }, [playBeep, playFinalBeep, start, isCompleted]);

  const stopCountdown = useCallback(() => {
    if (countdownTimersRef.current) {
      countdownTimersRef.current.forEach(clearTimeout);
      countdownTimersRef.current = null;
    }
    countdownCompleteRef.current = false;
    isTransitioningRef.current = false;
  }, []);

  const goToNext = useCallback(() => {
    if (currentExerciseIndex < totalExercises - 1) {
      isTransitioningRef.current = true;
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
    if (countdownTimersRef.current) {
      countdownTimersRef.current.forEach(clearTimeout);
      countdownTimersRef.current = null;
    }
    countdownCompleteRef.current = false;
    resetTimer(currentExercise.duration);
    countdownCompleteRef.current = false;
    isTransitioningRef.current = false;
    lastTickTimeRef.current = currentExercise.duration;

    if (currentExerciseIndex > 0 && !isCompleted && !isTransitioningRef.current) {
      startCountdown();
    }
  }, [currentExercise, resetTimer, currentExerciseIndex, isCompleted, startCountdown]);

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
          displayTime={timeLeft}
          isRunning={isRunning}
          isPaused={isPaused}
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