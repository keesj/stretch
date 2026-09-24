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
  // Elapsed seconds banked from finished segments, plus a live segment that
  // is derived from the wall clock on every tick (no tick-count drift).
  const accumulatedRef = useRef(0);
  const segmentStartRef = useRef<number | null>(null);
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

  const currentElapsed = useCallback(() => {
    const live =
      segmentStartRef.current != null
        ? Math.floor((Date.now() - segmentStartRef.current) / 1000)
        : 0;
    return accumulatedRef.current + live;
  }, []);

  const startTimer = useCallback(() => {
    if (timerRef.current) {
      return;
    }
    if (segmentStartRef.current == null) {
      segmentStartRef.current = Date.now();
    }
    timerRef.current = setInterval(() => {
      const start = segmentStartRef.current ?? Date.now();
      setElapsedSeconds(
        accumulatedRef.current + Math.floor((Date.now() - start) / 1000)
      );
    }, 1000);
  }, []);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (segmentStartRef.current != null) {
      accumulatedRef.current += Math.floor(
        (Date.now() - segmentStartRef.current) / 1000
      );
      segmentStartRef.current = null;
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
    const duration = currentElapsed();
    stopTimer();
    setIsCompleted(true);

    const completedSession: CompletedSession = {
      id: generateId(),
      routineId: routineRef.current.id,
      routineTitle: routineRef.current.title,
      duration,
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
  }, [currentElapsed, stopTimer]);

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
    accumulatedRef.current = 0;
    segmentStartRef.current = null;
    startTimer();
    indexRef.current = 0;
    setCurrentExerciseIndex(0);
    isCompletedRef.current = false;
    setIsCompleted(false);
    isPausedRef.current = false;
    setIsPaused(false);
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
