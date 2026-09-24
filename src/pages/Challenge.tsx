import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../components/Button";
import { useTimer } from "../hooks/useTimer";
import { useBeep } from "../hooks/useBeep";
import { useWakeLock } from "../hooks/useWakeLock";
import { formatTime } from "../utils/timer";
import { loadFromStorage, DEFAULT_SETTINGS } from "../utils/storage";
import {
  loadPlankState,
  startPlankChallenge,
  completePlankDay,
  getChallengeStatus,
} from "../utils/challenge";
import type { Challenge, PlankChallengeState } from "../types/challenge";
import type { Stretch } from "../types/stretch";

import challengesData from "../data/challenges.json";
import stretchesData from "../data/stretches.json";

type Phase = "intro" | "ready" | "countdown" | "holding" | "done";

const RING_RADIUS = 120;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function Challenge() {
  const navigate = useNavigate();
  const challenge = useMemo(() => (challengesData as Challenge[])[0], []);
  const exercise = useMemo(
    () => (stretchesData as Stretch[]).find((s) => s.id === challenge.exerciseId),
    [challenge]
  );

  const [soundEnabled] = useState(() =>
    loadFromStorage("settings", DEFAULT_SETTINGS).soundEnabled
  );
  const [plankState, setPlankState] = useState<PlankChallengeState>(() =>
    loadPlankState()
  );
  const status = getChallengeStatus(challenge, plankState);

  const [phase, setPhase] = useState<Phase>(() => {
    const initial = getChallengeStatus(challenge, loadPlankState());
    if (initial.status === "not-started") return "intro";
    if (initial.todayDone) return "done";
    return "ready";
  });
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const [countNumber, setCountNumber] = useState(3);
  const countdownTimeoutsRef = useRef<ReturnType<typeof setTimeout>[] | null>(null);
  const [breathingIn, setBreathingIn] = useState(true);
  const [holdSeconds, setHoldSeconds] = useState(challenge.baseSeconds);

  const { scheduleBeeps, playHappyBeep } = useBeep(soundEnabled);

  const handleHoldComplete = useCallback(() => {
    if (phaseRef.current === "holding") {
      setPlankState(completePlankDay(holdSeconds));
      setPhase("done");
      playHappyBeep();
    }
  }, [holdSeconds, playHappyBeep]);

  const { timeLeft, isRunning, start, pause, reset: resetTimer } = useTimer({
    initialTime: challenge.baseSeconds,
    onComplete: handleHoldComplete,
  });

  useWakeLock({ isActive: isRunning || phase === "countdown" });

  useEffect(() => {
    return () => {
      if (countdownTimeoutsRef.current) {
        countdownTimeoutsRef.current.forEach(clearTimeout);
        countdownTimeoutsRef.current = null;
      }
    };
  }, []);

  // Breathing cue: 4s in / 4s out while actively holding
  useEffect(() => {
    if (phase !== "holding" || !isRunning) return;
    setBreathingIn(true);
    const id = setInterval(() => setBreathingIn((b) => !b), 4000);
    return () => clearInterval(id);
  }, [phase, isRunning]);

  const beginHold = useCallback(
    (seconds: number) => {
      if (countdownTimeoutsRef.current) {
        countdownTimeoutsRef.current.forEach(clearTimeout);
      }
      setHoldSeconds(seconds);
      setCountNumber(3);
      setPhase("countdown");

      const ticks: number[] = [];
      for (let t = 30; t < seconds; t += 30) ticks.push(t);
      scheduleBeeps([
        { frequency: 800, at: 0, duration: 0.1 },
        { frequency: 800, at: 1, duration: 0.1 },
        { frequency: 800, at: 2, duration: 0.1 },
        ...ticks.map((at) => ({ frequency: 560, at: at + 3, duration: 0.08 })),
      ]);

      const timeouts: ReturnType<typeof setTimeout>[] = [];
      timeouts.push(setTimeout(() => setCountNumber(2), 1000));
      timeouts.push(setTimeout(() => setCountNumber(1), 2000));
      timeouts.push(
        setTimeout(() => {
          resetTimer(seconds);
          start();
          setPhase("holding");
        }, 3000)
      );
      countdownTimeoutsRef.current = timeouts;
    },
    [scheduleBeeps, resetTimer, start]
  );

  const handleStartChallenge = useCallback(() => {
    setPlankState(startPlankChallenge());
    setPhase("ready");
  }, []);

  const handleBack = useCallback(() => {
    if (countdownTimeoutsRef.current) {
      countdownTimeoutsRef.current.forEach(clearTimeout);
      countdownTimeoutsRef.current = null;
    }
    navigate("/");
  }, [navigate]);

  const total = holdSeconds;
  const progress = total > 0 ? Math.min(Math.max((total - timeLeft) / total, 0), 1) : 0;

  const isHoldPhase = phase === "holding";

  return (
    <div className="min-h-screen bg-gradient-to-b from-calm-50 via-calm-100 to-calm-200 dark:from-gray-900 dark:via-gray-900 dark:to-gray-800 px-4 py-6 pb-12 max-w-md mx-auto flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <button
          onClick={handleBack}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          ← Back
        </button>
        <div className="text-sm text-gray-500 dark:text-gray-400">
          {status.status !== "not-started"
            ? `Day ${status.dayNumber} of ${challenge.totalDays}`
            : "Challenge"}
        </div>
        <button
          onClick={() => navigate("/challenge/progress")}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Progress
        </button>
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={phase}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -16 }}
          transition={{ duration: 0.3 }}
          className="flex-1 flex flex-col"
        >
          {phase === "intro" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.15 }}
                className="text-7xl mb-6"
              >
                {challenge.illustration}
              </motion.div>
              <h1 className="text-3xl font-bold mb-3">{challenge.title}</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-xs">
                {challenge.description}
              </p>
              <div className="w-full space-y-2 mb-8 text-sm">
                <div className="flex justify-between px-4 py-2 bg-white/60 dark:bg-gray-800/60 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-300">
                    {Math.floor(challenge.baseSeconds / 60)} min plank, every day
                  </span>
                  <span className="font-semibold text-primary-600 dark:text-primary-400">+1 pt</span>
                </div>
                <div className="flex justify-between px-4 py-2 bg-white/60 dark:bg-gray-800/60 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-300">Missed a day</span>
                  <span className="font-semibold text-gray-500 dark:text-gray-400">0 pts</span>
                </div>
                <div className="flex justify-between px-4 py-2 bg-white/60 dark:bg-gray-800/60 rounded-lg">
                  <span className="text-gray-600 dark:text-gray-300">
                    +{challenge.bonusSeconds}s extra hold (after a miss)
                  </span>
                  <span className="font-semibold text-primary-600 dark:text-primary-400">
                    +{challenge.bonusPoints} pts
                  </span>
                </div>
              </div>
              <Button onClick={handleStartChallenge} className="w-full">
                Start Challenge
              </Button>
            </div>
          )}

          {phase === "ready" && exercise && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="text-7xl mb-4">{exercise.illustration}</div>
              <h1 className="text-2xl font-bold mb-2">Day {status.dayNumber}</h1>
              <div className="text-sm text-gray-500 dark:text-gray-400 mb-6">
                Score: {status.score} pts
              </div>
              <div className="w-full bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 mb-8 space-y-2 text-left">
                {exercise.instructions.map((instruction, index) => (
                  <div
                    key={index}
                    className="text-sm text-gray-600 dark:text-gray-300"
                  >
                    {index + 1}. {instruction}
                  </div>
                ))}
              </div>
              <div className="w-full space-y-3">
                <Button onClick={() => beginHold(challenge.baseSeconds)} className="w-full">
                  Begin {formatTime(challenge.baseSeconds)} Plank (+1 pt)
                </Button>
                {status.bonusAvailable && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      beginHold(challenge.baseSeconds + challenge.bonusSeconds)
                    }
                    className="w-full"
                  >
                    Hold {formatTime(challenge.baseSeconds + challenge.bonusSeconds)} (+{challenge.bonusPoints} extra)
                  </Button>
                )}
              </div>
              {status.bonusAvailable && (
                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                  You&apos;re behind the pace — the extra hold counts as +
                  {challenge.bonusPoints} extra pts for today.
                </p>
              )}
            </div>
          )}

          {phase === "countdown" && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="text-gray-500 dark:text-gray-400 mb-6">
                Get ready…
              </div>
              <motion.div
                key={countNumber}
                initial={{ scale: 1.4, opacity: 0.5 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                className="text-8xl font-light text-primary-600 dark:text-primary-400"
              >
                {countNumber}
              </motion.div>
            </div>
          )}

          {isHoldPhase && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <div className="relative w-72 h-72">
                <svg viewBox="0 0 280 280" className="w-full h-full">
                  <circle
                    cx="140"
                    cy="140"
                    r={RING_RADIUS}
                    fill="none"
                    strokeWidth="10"
                    className="stroke-calm-300 dark:stroke-gray-700"
                  />
                  <circle
                    cx="140"
                    cy="140"
                    r={RING_RADIUS}
                    fill="none"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeDasharray={RING_CIRCUMFERENCE}
                    strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
                    transform="rotate(-90 140 140)"
                    className="stroke-primary-500 dark:stroke-primary-400"
                    style={{ transition: "stroke-dashoffset 1s linear" }}
                  />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <motion.div
                    animate={
                      isRunning
                        ? { scale: breathingIn ? 1.25 : 1, opacity: breathingIn ? 0.5 : 0.25 }
                        : { scale: 1, opacity: 0.25 }
                    }
                    transition={{ duration: 4, ease: "easeInOut" }}
                    className="absolute w-44 h-44 rounded-full bg-primary-300 dark:bg-primary-700"
                  />
                  <div className="relative text-6xl font-light text-gray-800 dark:text-gray-100">
                    {formatTime(timeLeft)}
                  </div>
                  <div className="relative mt-2 text-sm font-medium text-primary-600 dark:text-primary-400">
                    {!isRunning
                      ? "Paused"
                      : breathingIn
                        ? "Breathe in"
                        : "Breathe out"}
                  </div>
                </div>
              </div>

              <div className="mt-10 w-full flex gap-3">
                {isRunning ? (
                  <Button variant="secondary" onClick={pause} className="flex-1">
                    Pause
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={start} className="flex-1">
                    Resume
                  </Button>
                )}
              </div>
            </div>
          )}

          {phase === "done" && (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: "spring", stiffness: 200, damping: 12 }}
                className="text-7xl mb-4"
              >
                {status.status === "complete" ? "🏆" : "🌅"}
              </motion.div>
              <h1 className="text-3xl font-bold mb-2">
                Day {status.dayNumber} complete!
              </h1>
              <div className="text-primary-600 dark:text-primary-400 font-semibold mb-2">
                +{status.todayPoints} pts today
              </div>
              <div className="text-gray-600 dark:text-gray-400 mb-2">
                Total score: {status.score} pts
              </div>
              <div className="text-gray-500 dark:text-gray-400 mb-8 max-w-xs">
                {status.status === "complete"
                  ? "You finished the 30-day challenge. Amazing work!"
                  : `${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} to go. Come back tomorrow!`}
              </div>
              <div className="w-full space-y-3">
                <Button onClick={handleBack} className="w-full">
                  Back to Home
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => navigate("/challenge/progress")}
                  className="w-full"
                >
                  View progress
                </Button>
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
