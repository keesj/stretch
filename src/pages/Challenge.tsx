import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "../components/Button";
import { Timer } from "../components/Timer";
import { ChallengeIntro } from "../components/ChallengeIntro";
import { ChallengeReady } from "../components/ChallengeReady";
import { ChallengeDone } from "../components/ChallengeDone";
import { useTimer } from "../hooks/useTimer";
import { useCountUp } from "../hooks/useCountUp";
import { useBeep } from "../hooks/useBeep";
import { useWakeLock } from "../hooks/useWakeLock";
import { formatTime } from "../utils/timer";
import { loadFromStorage, DEFAULT_SETTINGS } from "../utils/storage";
import { useDataRevision } from "../sync/dataChange";
import {
  activeChallenge,
  loadChallengeState,
  startChallenge,
  completeChallengeDay,
  getChallengeStatus,
  durationChallengeMaxPoints,
  todayKey,
} from "../utils/challenge";
import { MIN_VALID_HOLD_SECONDS } from "../types/challenge";
import type { PlankChallengeState } from "../types/challenge";

import { stretches as stretchesData } from "../data/stretches";

type Phase = "intro" | "ready" | "countdown" | "holding" | "done";

/**
 * The challenge page: a phase machine (intro → ready → countdown →
 * holding → done) around the active challenge. The phase screens are
 * presentational components; the countdown + live holds stay here because
 * they are driven directly by the timer hooks.
 */
export function Challenge() {
  const navigate = useNavigate();
  const revision = useDataRevision();
  // Re-selected when the projection blobs change (e.g. a cohort opening
  // on another device mid-session).
  // oxlint-disable-next-line react/memo-dependencies react-hooks/exhaustive-deps
  const challenge = useMemo(() => activeChallenge(), [revision]);
  const exercise = useMemo(
    () => stretchesData.find((s) => s.id === challenge.exerciseId),
    [challenge]
  );

  const [soundEnabled] = useState(() =>
    loadFromStorage("settings", DEFAULT_SETTINGS).soundEnabled
  );
  const [plankState, setPlankState] = useState<PlankChallengeState>(() =>
    loadChallengeState(challenge)
  );
  const status = getChallengeStatus(challenge, plankState);

  const [phase, setPhase] = useState<Phase>(() => {
    const initial = getChallengeStatus(challenge, loadChallengeState(challenge));
    if (initial.status === "not-started") return "intro";
    // A completed challenge shows the done screen (with a restart option
    // via the home card) instead of offering another hold for day 30.
    if (initial.status === "complete" || initial.todayDone) return "done";
    return "ready";
  });
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const [countNumber, setCountNumber] = useState(3);
  const countdownRafRef = useRef<number | null>(null);
  const [holdSeconds, setHoldSeconds] = useState(challenge.baseSeconds);

  const { scheduleBeeps, playHappyBeep, getClock } = useBeep(soundEnabled);

  // A sync round that absorbs remote ops rewrites the projection blobs;
  // pick the new state up without leaving the page. Skips the mount (the
  // state is already fresh).
  const firstDataChange = useRef(true);
  useEffect(() => {
    if (firstDataChange.current) {
      firstDataChange.current = false;
      return;
    }
    setPlankState(loadChallengeState(challenge));
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [revision, challenge]);

  const cancelCountdown = useCallback(() => {
    if (countdownRafRef.current != null) {
      cancelAnimationFrame(countdownRafRef.current);
      countdownRafRef.current = null;
    }
  }, []);

  const { timeLeft, isRunning, start, pause, reset: resetTimer } = useTimer({
    initialTime: challenge.baseSeconds,
    onComplete: () => {
      if (phaseRef.current === "holding") {
        setPlankState(completeChallengeDay(challenge, holdSeconds));
        setPhase("done");
        playHappyBeep();
      }
    },
  });

  const {
    elapsed: countUpElapsed,
    isRunning: countUpRunning,
    start: startCountUp,
    pause: pauseCountUp,
    reset: resetCountUp,
    getElapsedMs: getCountUpMs,
  } = useCountUp();

  useWakeLock({
    isActive: isRunning || countUpRunning || phase === "countdown",
  });

  useEffect(() => cancelCountdown, [cancelCountdown]);

  /** Run the 3-2-1 countdown, then call `onReady` on the same clock. */
  const runCountdown = useCallback(
    (beeps: { frequency: number; at: number; duration: number }[], onReady: () => void) => {
      cancelCountdown();
      setCountNumber(3);
      setPhase("countdown");
      scheduleBeeps(beeps);

      // Derive the countdown from the clock every frame instead of
      // stacking setTimeouts: the numbers stay in sync with the beeps
      // (same clock family) and self-correct after dropped frames.
      const t0 = getClock();
      const t0Perf = performance.now() / 1000;
      const elapsedAt = () =>
        Math.max(getClock() - t0, performance.now() / 1000 - t0Perf);

      const tick = () => {
        const elapsed = elapsedAt();
        if (elapsed >= 3) {
          countdownRafRef.current = null;
          onReady();
          return;
        }
        setCountNumber(Math.max(3 - Math.floor(elapsed), 1));
        countdownRafRef.current = requestAnimationFrame(tick);
      };
      countdownRafRef.current = requestAnimationFrame(tick);
    },
    [cancelCountdown, scheduleBeeps, getClock]
  );

  const beginHold = useCallback(
    (seconds: number) => {
      setHoldSeconds(seconds);
      const ticks: number[] = [];
      for (let t = 30; t < seconds; t += 30) ticks.push(t);
      runCountdown(
        [
          { frequency: 800, at: 0, duration: 0.1 },
          { frequency: 800, at: 1, duration: 0.1 },
          { frequency: 800, at: 2, duration: 0.1 },
          ...ticks.map((at) => ({ frequency: 560, at: at + 3, duration: 0.08 })),
        ],
        () => {
          resetTimer(seconds);
          start();
          setPhase("holding");
        }
      );
    },
    [runCountdown, resetTimer, start]
  );

  const beginDurationHold = useCallback(() => {
    if (challenge.scoring !== "duration") return;
    const max = challenge.maxSeconds;
    resetCountUp();
    const ticks: number[] = [];
    for (let t = 30; t <= max; t += 30) ticks.push(t);
    runCountdown(
      [
        { frequency: 800, at: 0, duration: 0.1 },
        { frequency: 800, at: 1, duration: 0.1 },
        { frequency: 800, at: 2, duration: 0.1 },
        ...ticks.map((at) => ({ frequency: 560, at: at + 3, duration: 0.08 })),
      ],
      () => {
        startCountUp();
        setPhase("holding");
      }
    );
  }, [challenge, runCountdown, resetCountUp, startCountUp]);

  /** Stop the duration hold and record the elapsed time (best of day). */
  const handleStopDuration = useCallback(() => {
    if (challenge.scoring !== "duration" || phaseRef.current !== "holding") return;
    const seconds = Math.round(getCountUpMs() / 1000);
    if (seconds < MIN_VALID_HOLD_SECONDS) return;
    pauseCountUp();
    setPlankState(completeChallengeDay(challenge, seconds));
    setPhase("done");
    playHappyBeep();
  }, [challenge, getCountUpMs, pauseCountUp, playHappyBeep]);

  const handleStartChallenge = useCallback(() => {
    setPlankState(startChallenge(challenge));
    setPhase("ready");
  }, [challenge]);

  const handleBack = useCallback(() => {
    cancelCountdown();
    navigate("/");
  }, [cancelCountdown, navigate]);

  const isThreshold = challenge.scoring === "threshold";
  const isDuration = challenge.scoring === "duration";
  const maxSeconds = isDuration ? challenge.maxSeconds : challenge.baseSeconds;
  const maxPoints = isDuration ? durationChallengeMaxPoints(challenge) : 0;
  // A cohort challenge that has not opened yet: no start button, only the
  // date it opens on (the account's effective start date).
  const opensAt =
    status.status === "not-started" && plankState.startedAt && plankState.startedAt > todayKey()
      ? plankState.startedAt
      : null;

  const total = holdSeconds;

  // The last stretch instruction is the fixed-hold rule of the threshold
  // challenge ("Hold for 2 minutes (30 extra seconds earns bonus points)");
  // a duration challenge explains its own rules below the button instead.
  const readyInstructions = isDuration
    ? exercise?.instructions.filter((line) => !/bonus points/i.test(line)) ?? []
    : exercise?.instructions ?? [];

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
            <ChallengeIntro
              challenge={challenge}
              maxPoints={maxPoints}
              opensAt={opensAt}
              onStart={handleStartChallenge}
            />
          )}

          {phase === "ready" && exercise && (
            <ChallengeReady
              exercise={exercise}
              status={status}
              challenge={challenge}
              instructions={readyInstructions}
              onBeginHold={beginHold}
              onBeginDuration={beginDurationHold}
            />
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

          {isHoldPhase && isThreshold && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Timer
                displayTime={timeLeft}
                totalDuration={total}
                isRunning={isRunning}
                isPaused={!isRunning}
                displayText={formatTime(timeLeft)}
                breathing
              />

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

          {isHoldPhase && isDuration && (
            <div className="flex-1 flex flex-col items-center justify-center">
              <Timer
                displayTime={Math.max(maxSeconds - Math.min(countUpElapsed, maxSeconds), 0)}
                totalDuration={maxSeconds}
                isRunning={countUpRunning}
                isPaused={!countUpRunning}
                displayText={formatTime(countUpElapsed)}
                breathing
              />

              <div className="mt-10 w-full flex gap-3">
                <Button onClick={handleStopDuration} className="flex-1">
                  Stop
                </Button>
                {countUpRunning ? (
                  <Button variant="secondary" onClick={pauseCountUp} className="flex-1">
                    Pause
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={startCountUp} className="flex-1">
                    Resume
                  </Button>
                )}
              </div>
              {countUpElapsed < MIN_VALID_HOLD_SECONDS && (
                <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 max-w-xs">
                  Hold for at least {MIN_VALID_HOLD_SECONDS} seconds to count
                </p>
              )}
            </div>
          )}

          {phase === "done" && (
            <ChallengeDone
              status={status}
              isDuration={isDuration}
              onBack={handleBack}
              onProgress={() => navigate("/challenge/progress")}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
