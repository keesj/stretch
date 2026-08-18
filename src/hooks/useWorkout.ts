import { useState, useCallback, useEffect, useRef } from "react";
import type { Routine } from "../types/routine";
import type { Stretch } from "../types/stretch";
import {
  loadFromStorage,
  saveToStorage,
  type CompletedSession,
} from "../utils/storage";

interface UseWorkoutOptions {
  routine: Routine;
  stretches: Stretch[];
  onComplete?: (session: CompletedSession) => void;
}

function generateId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto (older Android WebView, etc.)
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function useWorkout({ routine, stretches, onComplete }: UseWorkoutOptions) {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const elapsedSecondsRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const completeCallbackRef = useRef(onComplete);
  const routineRef = useRef(routine);
  const stretchesRef = useRef(stretches);
  const isCompletedRef = useRef(isCompleted);

  completeCallbackRef.current = onComplete;
  routineRef.current = routine;
  stretchesRef.current = stretches;
  isCompletedRef.current = isCompleted;

  const currentExercise = stretchesRef.current[currentExerciseIndex];
  const totalExercises = routineRef.current.stretches.length;

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      elapsedSecondsRef.current += 1;
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!isPaused && !isCompleted) {
      startTimer();
    } else {
      stopTimer();
    }

    return () => {
      stopTimer();
    };
  }, [isPaused, isCompleted, startTimer, stopTimer]);

  const finishWorkout = useCallback(() => {
    stopTimer();
    setIsCompleted(true);

    const completedSession: CompletedSession = {
      id: generateId(),
      routineId: routineRef.current.id,
      routineTitle: routineRef.current.title,
      duration: elapsedSecondsRef.current,
      completedAt: new Date().toISOString(),
    };

    const completedSessions = loadFromStorage<CompletedSession[]>(
      "completedSessions",
      []
    );
    completedSessions.push(completedSession);
    saveToStorage("completedSessions", completedSessions);

    if (completeCallbackRef.current) {
      completeCallbackRef.current(completedSession);
    }
  }, [stopTimer]);

  const nextExercise = useCallback(() => {
    setCurrentExerciseIndex((prev) => {
      const newIndex = prev + 1;
      if (newIndex >= totalExercises) {
        finishWorkout();
        return prev;
      }
      return newIndex;
    });
  }, [totalExercises, finishWorkout]);

  const previousExercise = useCallback(() => {
    setCurrentExerciseIndex((prev) => {
      if (prev > 0) {
        return prev - 1;
      }
      return prev;
    });
  }, []);

  const reset = useCallback(() => {
    setCurrentExerciseIndex(0);
    setIsCompleted(false);
    elapsedSecondsRef.current = 0;
    setIsPaused(false);
    stopTimer();
  }, [stopTimer]);

  const togglePause = useCallback(() => {
    setIsPaused((prev) => !prev);
  }, []);

  return {
    currentExercise,
    currentExerciseIndex,
    totalExercises,
    isCompleted,
    isPaused,
    elapsedSeconds: elapsedSecondsRef.current,
    nextExercise,
    previousExercise,
    finishWorkout,
    reset,
    togglePause,
  };
}