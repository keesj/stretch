import { useState, useEffect, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import type { Routine } from "../types/routine";
import { RoutineCard } from "../components/RoutineCard";
import { ChallengeCard } from "../components/ChallengeCard";
import { Card } from "../components/Card";
import {
  loadFromStorage,
  saveToStorage,
  type CompletedSession,
} from "../utils/storage";
import {
  activeChallenge,
  loadChallengeState,
  startChallenge,
  getChallengeStatus,
  challengeBlobKey,
} from "../utils/challenge";
import type { PlankChallengeState } from "../types/challenge";

import { routines as routinesData } from "../data/routines";
import { stretches as stretchesData } from "../data/stretches";

export function Home() {
  const navigate = useNavigate();
  const [routines] = useState(routinesData);
  const [stretches] = useState(stretchesData);
  const [_completedSessions, setCompletedSessions] = useState<CompletedSession[]>([]);
  const completedSessionsRef = useRef<CompletedSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const plankChallenge = useMemo(() => activeChallenge(), []);
  const [plankState, setPlankState] = useState<PlankChallengeState>(() =>
    loadChallengeState(plankChallenge)
  );

  const plankStatus = getChallengeStatus(plankChallenge, plankState);
  const challengeBlob = challengeBlobKey(plankChallenge.syncId);

  useEffect(() => {
    const loadSessions = () => {
      try {
        const sessions = loadFromStorage<CompletedSession[]>("completedSessions", []);
        setCompletedSessions(sessions);
        completedSessionsRef.current = sessions;
      } catch {
        setCompletedSessions([]);
      }
      setIsLoading(false);
    };

    loadSessions();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "completedSessions") {
        loadSessions();
      }
      if (e.key === challengeBlob) {
        setPlankState(loadChallengeState(plankChallenge));
      }
    };
    // Fired after a sync round absorbs remote ops (same tab).
    const handleDataRefresh = () => {
      loadSessions();
      setPlankState(loadChallengeState(plankChallenge));
    };

    try {
      window.addEventListener("storage", handleStorageChange);
      window.addEventListener("stretch:data", handleDataRefresh);
    } catch { /* storage events not supported */ }

    return () => {
      try {
        window.removeEventListener("storage", handleStorageChange);
        window.removeEventListener("stretch:data", handleDataRefresh);
      } catch { /* cleanup failed */ }
    };
  }, [challengeBlob, plankChallenge]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-calm-50 dark:bg-gray-900">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  const totalSessions = completedSessionsRef.current.length;
  const totalMinutes = completedSessionsRef.current.reduce((sum, s) => sum + s.duration, 0);

  const getRoutineDuration = (routine: Routine) => {
    return routine.stretches
      .map((stretchId) => {
        const stretch = stretches.find((s) => s.id === stretchId);
        return stretch?.duration || 0;
      })
      .reduce((sum, duration) => sum + duration, 0);
  };

  const featuredRoutine = routines[0];
  const otherRoutines = routines.slice(1);

  const handleStartChallenge = () => {
    setPlankState(startChallenge(plankChallenge));
    navigate("/challenge");
  };

  const handleBeginChallenge = () => {
    navigate("/challenge");
  };

  const handleRestartChallenge = () => {
    if (
      typeof confirm === "function" &&
      confirm("Start a new 30-day challenge? Your current progress will be lost.")
    ) {
      setPlankState(startChallenge(plankChallenge));
      navigate("/challenge");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="px-4 py-6 pb-24 max-w-md mx-auto"
    >
      <header className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Stretch</h1>
        <p className="text-gray-600 dark:text-gray-400">
          Your daily flexibility routine
        </p>
      </header>

      {totalSessions > 0 && (
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          <Card className="p-4 mb-6 bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-semibold text-primary-700 dark:text-primary-400">
                  {totalSessions}
                </div>
                <div className="text-sm text-primary-600 dark:text-primary-500">
                  sessions completed
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-semibold text-primary-700 dark:text-primary-400">
                  {Math.floor(totalMinutes / 60)}
                </div>
                <div className="text-sm text-primary-600 dark:text-primary-500">
                  minutes
                </div>
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Challenges</h2>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          <ChallengeCard
            challenge={plankChallenge}
            status={plankStatus}
            onStart={handleStartChallenge}
            onBegin={handleBeginChallenge}
            onRestart={handleRestartChallenge}
            onProgress={() => navigate("/challenge/progress")}
          />
        </motion.div>
      </section>

      <section className="mb-6">
        <h2 className="text-lg font-semibold mb-3">Featured</h2>
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
        >
            <RoutineCard
                routine={featuredRoutine}
                stretchCount={featuredRoutine.stretches.length}
                totalDuration={getRoutineDuration(featuredRoutine)}
                onStart={() => {
                  saveToStorage("activeSession", {
                    routineId: featuredRoutine.id,
                    currentExerciseIndex: 0,
                    startTime: new Date().toISOString(),
                    elapsedSeconds: 0,
                    isPaused: false,
                  });
                  navigate("/session");
                }}
              />
        </motion.div>
      </section>

      <section>
        <h2 className="text-lg font-semibold mb-3">All Routines</h2>
        <div className="space-y-3">
          {otherRoutines.map((routine, index) => (
              <motion.div
                key={routine.id}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 + index * 0.1 }}
              >
                <RoutineCard
                  routine={routine}
                  stretchCount={routine.stretches.length}
                  totalDuration={getRoutineDuration(routine)}
                  onStart={() => {
                    saveToStorage("activeSession", {
                      routineId: routine.id,
                      currentExerciseIndex: 0,
                      startTime: new Date().toISOString(),
                      elapsedSeconds: 0,
                      isPaused: false,
                    });
                    navigate("/session");
                  }}
                />
              </motion.div>
          ))}
        </div>
      </section>
    </motion.div>
  );
}
