import { motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { createAnimationController } from "../utils/animator";

interface TimerProps {
  displayTime: number;
  isRunning: boolean;
  isPaused: boolean;
  totalDuration?: number;
  countdownDisplay?: number | null;
  isTransitionMessage?: boolean;
}

export function Timer({
  displayTime,
  isRunning,
  isPaused,
  totalDuration = 60,
  countdownDisplay = null,
  isTransitionMessage = false,
}: TimerProps) {
  const isTransition = isTransitionMessage;
  
  const displayText = isTransition
    ? countdownDisplay ?? displayTime
    : displayTime;

  const [displayProgress, setDisplayProgress] = useState(0);
  const animatorRef = useRef<ReturnType<typeof createAnimationController>>(
    createAnimationController(0, 1000)
  );
  // Replace with fresh instance each render for test isolation
  animatorRef.current = createAnimationController(0, 1000);

  animatorRef.current.setProgressCallback(setDisplayProgress);

  useEffect(() => {
    const current = animatorRef.current;
    if (isRunning && !isPaused) {
      const targetProgress = ((totalDuration - displayTime) / totalDuration) * 100;
      current.start(targetProgress);
    } else {
      current.cancel();
      const targetProgress = ((totalDuration - displayTime) / totalDuration) * 100;
      setDisplayProgress(targetProgress);
    }

    return () => {
      current.cancel();
    };
  }, [displayTime, isRunning, isPaused, totalDuration]);

  const displayLabel = isTransition
    ? "Almost Done"
    : isPaused
    ? "Paused"
    : isRunning
    ? "Running"
    : "Ready";

  const textStyle = isTransition
    ? "text-primary-600"
    : isPaused
    ? "text-primary-400"
    : "text-gray-800 dark:text-gray-100";

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <motion.div
        key={displayText}
        initial={{ scale: 1.1, opacity: 0.8 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={`text-6xl font-light ${textStyle}`}
      >
        {displayText}
      </motion.div>
      <div className="mt-2 text-sm font-medium text-gray-400">
        {displayLabel}
      </div>
      <div className="mt-4 w-full">
        <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary-500 transition-all"
            style={{ width: `${displayProgress}%` }}
          />
        </div>
      </div>
    </div>
  );
}