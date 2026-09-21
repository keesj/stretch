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
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const elapsedRef = useRef(0);
  const indexRef = useRef(0);
  const isCompletedRef = useRef(false);
  const isPausedRef = useRef(false);
  const completeCallbackRef = useRef(onComplete);
  const routineRef = useRef(routine);
  const stretchesRef = useRef(stretches);

  completeCallbackRef.current = onComplete;
  routineRef.current = routine;
  stretchesRef.current = stretches;
  isCompletedRef.current = isCompleted;

  const currentExercise = stretchesRef.current[currentExerciseIndex];
  const totalExercises = routineRef.current.stretches.length;

  const startTimer = useCallback(() => {
    if (timerRef.current) {
      return;
    }
    timerRef.current = setInterval(() => {
      elapsedRef.current += 1;
      setElapsedSeconds(elapsedRef.current);
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  useEffect(() => {
    startTimer();
    return () => {
      stopTimer();
    };
  }, [startTimer, stopTimer]);

  const finishWorkout = useCallback(() => {
    if (isCompletedRef.current) {
      return;
    }
    isCompletedRef.current = true;
    stopTimer();
    setIsCompleted(true);

    const completedSession: CompletedSession = {
      id: generateId(),
      routineId: routineRef.current.id,
      routineTitle: routineRef.current.title,
      duration: elapsedRef.current,
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
    if (isCompletedRef.current) {
      return;
    }

    const index = indexRef.current;
    if (index >= totalExercises - 1) {
      finishWorkout();
    } else {
      const next = index + 1;
      indexRef.current = next;
      setCurrentExerciseIndex(next);
    }
  }, [totalExercises, finishWorkout]);

  const previousExercise = useCallback(() => {
    const prev = indexRef.current;
    if (prev > 0) {
      indexRef.current = prev - 1;
      setCurrentExerciseIndex(prev - 1);
    }
  }, []);

  const reset = useCallback(() => {
    stopTimer();
    startTimer();
    indexRef.current = 0;
    setCurrentExerciseIndex(0);
    isCompletedRef.current = false;
    setIsCompleted(false);
    isPausedRef.current = false;
    setIsPaused(false);
    elapsedRef.current = 0;
    setElapsedSeconds(0);
  }, [startTimer, stopTimer]);

  const togglePause = useCallback(() => {
    const next = !isPausedRef.current;
    isPausedRef.current = next;
    setIsPaused(next);
    if (next) {
      stopTimer();
    } else if (!isCompletedRef.current) {
      startTimer();
    }
  }, [startTimer, stopTimer]);

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
