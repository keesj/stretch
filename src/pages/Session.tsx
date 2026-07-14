import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { ExerciseCard } from "../components/ExerciseCard";
import { Timer } from "../components/Timer";
import { ProgressBar } from "../components/ProgressBar";
import { Button } from "../components/Button";
import { useTimer } from "../hooks/useTimer";
import { useWorkout } from "../hooks/useWorkout";
import { Card } from "../components/Card";
import type { Stretch } from "../types/stretch";
import type { Routine } from "../types/routine";

import routinesData from "../data/routines.json";
import stretchesData from "../data/stretches.json";

const routines = routinesData as Routine[];
const stretches = stretchesData as Stretch[];

export function Session() {
  const navigate = useNavigate();
  const routineId = useState<string>(() => {
    const stored = localStorage.getItem("activeRoutine");
    if (stored) {
      localStorage.removeItem("activeRoutine");
      return stored;
    }
    return routines[0].id;
  })[0];

  const routine = routines.find((r) => r.id === routineId) || routines[0];
  const exerciseStretches = routine.stretches
    .map((id) => stretches.find((s) => s.id === id))
    .filter((s): s is Stretch => !!s);

  const {
    currentExercise,
    currentExerciseIndex,
    totalExercises,
    isCompleted,
    isPaused,
    elapsedSeconds,
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

  const [setupCountdown, setSetupCountdown] = useState<number | null>(null);
  const [transitionCountdown, setTransitionCountdown] = useState<number | null>(null);
  const [waitingForStart, setWaitingForStart] = useState(false);

  const { timeLeft, start, pause, reset: resetTimer, skip, isRunning } = useTimer({
    initialTime: currentExercise.duration,
    onComplete: nextExercise,
  });

  const [showNextPreview, setShowNextPreview] = useState(false);

  useEffect(() => {
    if (!isPaused && !isCompleted && timeLeft <= 3 && currentExerciseIndex < totalExercises - 1) {
      setShowNextPreview(true);
      setTransitionCountdown(timeLeft);
    } else {
      setShowNextPreview(false);
      setTransitionCountdown(null);
    }
  }, [timeLeft, isPaused, isCompleted, currentExerciseIndex, totalExercises]);

  useEffect(() => {
    setWaitingForStart(true);
  }, [currentExercise]);

  const handleSkip = () => {
    skip();
    nextExercise();
  };

  const handlePrevious = () => {
    if (currentExerciseIndex > 0) {
      previousExercise();
    }
  };

  const handleReturnHome = () => {
    reset();
    resetTimer(0);
    navigate("/");
  };

  if (isCompleted) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="px-4 py-12 pb-24 max-w-md mx-auto"
      >
        <div className="text-center">
          <div className="text-6xl mb-4">🎉</div>
          <h1 className="text-3xl font-bold mb-2">Great Job!</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            You completed {routine.title}
          </p>

          <Card className="p-6 mb-6">
            <div className="text-center">
              <div className="text-4xl font-light mb-2">
                {Math.floor(elapsedSeconds / 60)}:
                {(elapsedSeconds % 60).toString().padStart(2, "0")}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Total Time
              </div>
            </div>
          </Card>

          <div className="mb-6">
            <p className="text-lg text-gray-700 dark:text-gray-300 italic">
              "A stretched body is a happy body."
            </p>
          </div>

          <Button onClick={handleReturnHome} className="w-full">
            Back to Home
          </Button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="px-4 py-6 pb-24 max-w-md mx-auto"
    >
      <div className="mb-6">
        <div className="text-sm text-gray-500 dark:text-gray-400 mb-2">
          Exercise {currentExerciseIndex + 1} of {totalExercises}
        </div>
        <ProgressBar current={currentExerciseIndex + 1} total={totalExercises} />
      </div>

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

      {showNextPreview && currentExerciseIndex < totalExercises - 1 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="my-6"
        >
          <Card className="p-4 bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-800">
            <div className="text-center">
              <div className="text-sm text-primary-600 dark:text-primary-400 mb-2">
                Next up
              </div>
              <div className="text-lg font-semibold mb-1">
                {exerciseStretches[currentExerciseIndex + 1]?.title}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                {exerciseStretches[currentExerciseIndex + 1]?.illustration}
              </div>
            </div>
          </Card>
        </motion.div>
      )}

      <div className="my-8">
        <Timer
          timeLeft={timeLeft}
          isRunning={isRunning}
          isPaused={isPaused}
          setupCountdown={setupCountdown}
          transitionCountdown={transitionCountdown}
          totalDuration={currentExercise.duration}
        />
      </div>

      <div className="space-y-3">
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
      </div>

      <div className="mt-8 flex gap-3">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentExerciseIndex === 0}
          className="flex-1"
        >
          Previous
        </Button>

        <Button
          variant={setupCountdown !== null || isPaused ? "primary" : "secondary"}
          onClick={() => {
            if (setupCountdown !== null) {
              return;
            }
            if (waitingForStart) {
              setSetupCountdown(3);
              setWaitingForStart(false);
              const timer = setInterval(() => {
                setSetupCountdown((prev) => {
                  if (prev === null || prev <= 1) {
                    clearInterval(timer);
                    setSetupCountdown(null);
                    start();
                    return null;
                  }
                  return prev - 1;
                });
              }, 1000);
            } else if (isPaused) {
              start();
            } else {
              pause();
            }
          }}
          className="flex-1"
        >
          {setupCountdown !== null ? setupCountdown : waitingForStart ? "Start" : isPaused ? "Resume" : "Pause"}
        </Button>

        <Button onClick={handleSkip} className="flex-1">
          Next
        </Button>
      </div>
    </motion.div>
  );
}