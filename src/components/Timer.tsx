import { useState, useEffect, useRef, useCallback } from "react";
import { motion, useAnimation } from "framer-motion";

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
  
  const controls = useAnimation();
  const progressRef = useRef(0);
  const lastDisplayTimeRef = useRef(displayTime);
  const animationFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const newProgress = ((totalDuration - displayTime) / totalDuration) * 100;
    const oldProgress = ((totalDuration - lastDisplayTimeRef.current) / totalDuration) * 100;
    
    if (isRunning && !isPaused) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }

      const startTime = performance.now();
      const duration = 1000;

      const animate = (currentTime: number) => {
        const elapsed = Math.min((currentTime - startTime) / duration, 1);
        const easeOut = 1 - Math.pow(1 - elapsed, 3);
        const currentProgress = oldProgress + (newProgress - oldProgress) * easeOut;
        
        progressRef.current = currentProgress;
        controls.start({ width: `${currentProgress}%` });

        if (elapsed < 1) {
          animationFrameRef.current = requestAnimationFrame(animate);
        }
      };

      animationFrameRef.current = requestAnimationFrame(animate);
    } else {
      controls.start({ width: `${newProgress}%` });
      progressRef.current = newProgress;
    }

    lastDisplayTimeRef.current = displayTime;

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [displayTime, isRunning, isPaused, totalDuration, controls]);

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
          <motion.div
            className="h-full bg-primary-500"
            animate={controls}
          />
        </div>
      </div>
    </div>
  );
}