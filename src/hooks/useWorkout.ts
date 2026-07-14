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

export function useWorkout({ routine, stretches, onComplete }: UseWorkoutOptions) {
  const [currentExerciseIndex, setCurrentExerciseIndex] = useState(0);
  const [isCompleted, setIsCompleted] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef<number | null>(null);

  const currentExercise = stretches[currentExerciseIndex];
  const totalExercises = routine.stretches.length;

  const startTimer = useCallback(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
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

  const nextExercise = useCallback(() => {
    if (currentExerciseIndex < totalExercises - 1) {
      setCurrentExerciseIndex((prev) => prev + 1);
    } else {
      finishWorkout();
    }
  }, [currentExerciseIndex, totalExercises]);

  const previousExercise = useCallback(() => {
    setCurrentExerciseIndex((prev) => {
      if (prev > 0) {
        return prev - 1;
      }
      return prev;
    });
  }, []);

  const finishWorkout = useCallback(() => {
    stopTimer();
    setIsCompleted(true);

    const completedSession: CompletedSession = {
      id: crypto.randomUUID(),
      routineId: routine.id,
      routineTitle: routine.title,
      duration: elapsedSeconds,
      completedAt: new Date().toISOString(),
    };

    const completedSessions = loadFromStorage<CompletedSession[]>(
      "completedSessions",
      []
    );
    completedSessions.push(completedSession);
    saveToStorage("completedSessions", completedSessions);

    if (onComplete) {
      onComplete(completedSession);
    }
  }, [stopTimer, routine, elapsedSeconds, onComplete]);

  const reset = useCallback(() => {
    setCurrentExerciseIndex(0);
    setIsCompleted(false);
    setElapsedSeconds(0);
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
    elapsedSeconds,
    nextExercise,
    previousExercise,
    finishWorkout,
    reset,
    togglePause,
  };
}