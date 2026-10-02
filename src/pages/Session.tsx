import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ExerciseSection, type ExercisePhase } from "../components/ExerciseSection";
import { StretchAnimation } from "../components/StretchAnimation";
import { ProgressBar } from "../components/ProgressBar";
import { Button } from "../components/Button";
import { useWorkout } from "../hooks/useWorkout";
import { useBeep } from "../hooks/useBeep";
import { useWakeLock } from "../hooks/useWakeLock";
import { formatDuration } from "../utils/timer";
import { loadFromStorage, DEFAULT_SETTINGS } from "../utils/storage";
import type { Stretch } from "../types/stretch";
import type { Routine } from "../types/routine";

import routinesData from "../data/routines.json";
import stretchesData from "../data/stretches.json";

const routines = routinesData as Routine[];
const stretches = stretchesData as Stretch[];

const difficultyColors = {
  easy: "text-green-600 dark:text-green-400",
  medium: "text-yellow-600 dark:text-yellow-400",
  hard: "text-red-600 dark:text-red-400",
};

// Each exercise fills 85% of the viewport so the next one peeks in at the
// bottom — the "next up" card is now always there, one scroll away.
const SECTION_FRACTION = 0.85;
// Let the "Completed" state land before scrolling on to the next exercise
const ADVANCE_DELAY_MS = 1500;

export function Session() {
  const navigate = useNavigate();
  const [routineId, setRoutineId] = useState<string>(routines[0].id);
  const [isLoading, setIsLoading] = useState(true);
  const [showInstructions, setShowInstructions] = useState(false);
  // Which exercise is in view — the scroll position is the source of truth
  const [activeIndex, setActiveIndex] = useState(0);
  // Exercise that should run its 5s transition countdown once it becomes active
  const [pendingAutoStart, setPendingAutoStart] = useState<number | null>(null);
  // Phase of every section (the wake lock follows the active one)
  const [phases, setPhases] = useState<Record<number, ExercisePhase>>({});
  const scrollRef = useRef<HTMLDivElement>(null);
  const advanceTimeoutRef = useRef<number | null>(null);

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

  const totalExercises = exerciseStretches.length;

  const { isCompleted, finishWorkout, reset } = useWorkout({
    routine,
    stretches: exerciseStretches,
    onComplete: (session) => {
      navigate("/finished", { state: { session } });
    },
  });

  const { scheduleBeeps, playHappyBeep, getClock } = useBeep(soundEnabled);

  const activePhase = phases[activeIndex];
  useWakeLock({ isActive: activePhase === "running" || activePhase === "countdown" });

  const prevCompletedRef = useRef(false);
  useEffect(() => {
    if (isCompleted && !prevCompletedRef.current) {
      playHappyBeep();
    }
    prevCompletedRef.current = isCompleted;
  }, [isCompleted, playHappyBeep]);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el || el.clientHeight <= 0) return;
    const sectionHeight = el.clientHeight * SECTION_FRACTION;
    const index = Math.min(
      Math.max(Math.round(el.scrollTop / sectionHeight), 0),
      totalExercises - 1
    );
    setActiveIndex((prev) => (prev === index ? prev : index));
  }, [totalExercises]);

  const scrollToIndex = useCallback((index: number) => {
    const el = scrollRef.current;
    if (!el || el.clientHeight <= 0) return;
    el.scrollTo({
      top: index * el.clientHeight * SECTION_FRACTION,
      behavior: "smooth",
    });
  }, []);

  const handlePhaseChange = useCallback((index: number, phase: ExercisePhase) => {
    setPhases((prev) => (prev[index] === phase ? prev : { ...prev, [index]: phase }));
  }, []);

  const handleAutoStartConsumed = useCallback(() => {
    setPendingAutoStart(null);
  }, []);

  const handleExerciseCompleted = useCallback(
    (index: number) => {
      if (advanceTimeoutRef.current != null) {
        window.clearTimeout(advanceTimeoutRef.current);
      }
      advanceTimeoutRef.current = window.setTimeout(() => {
        if (index >= totalExercises - 1) {
          finishWorkout();
        } else {
          setPendingAutoStart(index + 1);
          scrollToIndex(index + 1);
        }
      }, ADVANCE_DELAY_MS);
    },
    [totalExercises, finishWorkout, scrollToIndex]
  );

  useEffect(() => {
    return () => {
      if (advanceTimeoutRef.current != null) {
        window.clearTimeout(advanceTimeoutRef.current);
      }
    };
  }, []);

  const handleReturnHome = useCallback(() => {
    reset();
    navigate("/");
  }, [reset, navigate]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-calm-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const activeExercise = exerciseStretches[activeIndex];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="mx-auto flex h-[100dvh] max-w-md flex-col"
    >
      <div className="flex items-center gap-4 px-4 py-3">
        <button
          onClick={handleReturnHome}
          className="shrink-0 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ← Back
        </button>
        <div className="relative flex-1">
          <ProgressBar current={activeIndex + 1} total={totalExercises} />
          <span className="absolute inset-0 flex items-center justify-center">
            <span className="rounded-full bg-calm-50 px-2 py-0.5 text-xs font-medium text-gray-600 dark:bg-gray-900 dark:text-gray-300">
              Exercise {activeIndex + 1} of {totalExercises}
            </span>
          </span>
        </div>
      </div>

      <div
        ref={scrollRef}
        onScroll={handleScroll}
        data-testid="session-scroll"
        className="flex-1 snap-y snap-mandatory overflow-y-auto"
      >
        {exerciseStretches.map((exercise, index) => (
          <section
            // The same stretch can appear twice in a routine (e.g. as an
            // opener and closer), so the index disambiguates the key
            key={`${exercise.id}-${index}`}
            inert={index !== activeIndex}
            className="h-[85%] snap-start"
          >
            <ExerciseSection
              exercise={exercise}
              index={index}
              isActive={index === activeIndex}
              isLast={index === totalExercises - 1}
              autoStart={pendingAutoStart === index}
              onAutoStartConsumed={handleAutoStartConsumed}
              onCompleted={handleExerciseCompleted}
              onPhaseChange={handlePhaseChange}
              scheduleBeeps={scheduleBeeps}
              getClock={getClock}
              onShowInstructions={() => setShowInstructions(true)}
            />
          </section>
        ))}
        <div className="h-[15%]" aria-hidden="true" />
      </div>

      <AnimatePresence>
        {showInstructions && activeExercise && (
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
                {activeExercise.animation ? (
                  <div className="w-full max-w-[220px] mb-3">
                    <StretchAnimation stretch={activeExercise} />
                  </div>
                ) : (
                  <div className="text-6xl mb-3">{activeExercise.illustration}</div>
                )}
                <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-100">
                  {activeExercise.title}
                </h2>
                <div className="mt-2 flex flex-wrap items-center justify-center gap-2">
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-medium ${difficultyColors[activeExercise.difficulty]}`}
                  >
                    {activeExercise.difficulty.charAt(0).toUpperCase() + activeExercise.difficulty.slice(1)}
                  </span>
                  <span className="rounded-full bg-calm-100 px-3 py-1 text-xs text-calm-700 dark:bg-calm-900/50 dark:text-calm-300">
                    {formatDuration(activeExercise.duration)}
                  </span>
                  {activeExercise.bodyParts.map((part) => (
                    <span
                      key={part}
                      className="rounded-full bg-calm-100 px-3 py-1 text-xs text-calm-700 dark:bg-calm-900/50 dark:text-calm-300"
                    >
                      {part}
                    </span>
                  ))}
                </div>
              </div>
              <ol className="space-y-2 mb-6">
                {activeExercise.instructions.map((instruction, index) => (
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
    </motion.div>
  );
}
