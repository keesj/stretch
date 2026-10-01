import { useEffect, useState } from "react";
import { motion } from "framer-motion";

interface TimerProps {
  displayTime: number;
  isRunning: boolean;
  isPaused: boolean;
  /** Show the 3-2-1 start countdown inside the ring */
  isCounting?: boolean;
  totalDuration?: number;
  /** Override for the time shown in the center (e.g. formatted "2:30") */
  displayText?: string;
  /** Breathing pulse behind the time and "Breathe in/out" cue while running */
  breathing?: boolean;
  /** Override for the label under the time (e.g. "Almost Done") */
  label?: string;
  /** Ring diameter in px */
  size?: number;
}

const VIEW_SIZE = 280;
const RING_RADIUS = 120;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

export function Timer({
  displayTime,
  isRunning,
  isPaused,
  isCounting = false,
  totalDuration = 60,
  displayText,
  breathing = false,
  label,
  size = 288,
}: TimerProps) {
  const [breathingIn, setBreathingIn] = useState(true);

  // Breathing cue: 4s in / 4s out while actively running
  useEffect(() => {
    if (!breathing || !isRunning) return;
    const id = setInterval(() => setBreathingIn((b) => !b), 4000);
    return () => clearInterval(id);
  }, [breathing, isRunning]);

  // While counting the ring stays empty — the countdown sits in the center
  const progress = isCounting
    ? 0
    : totalDuration > 0
      ? Math.min(Math.max((totalDuration - displayTime) / totalDuration, 0), 1)
      : 0;

  const statusLabel = isCounting
    ? "Get ready…"
    : label ??
      (isPaused
        ? "Paused"
        : isRunning
          ? breathing
            ? breathingIn
              ? "Breathe in"
              : "Breathe out"
            : "Running"
          : "Ready");

  return (
    <div
      className="flex flex-col items-center w-full"
      style={{ maxWidth: size }}
    >
      <div className="relative" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`} className="w-full h-full">
          <circle
            cx={VIEW_SIZE / 2}
            cy={VIEW_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth="10"
            className="stroke-calm-300 dark:stroke-gray-700"
          />
          <circle
            cx={VIEW_SIZE / 2}
            cy={VIEW_SIZE / 2}
            r={RING_RADIUS}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE}
            strokeDashoffset={RING_CIRCUMFERENCE * (1 - progress)}
            transform={`rotate(-90 ${VIEW_SIZE / 2} ${VIEW_SIZE / 2})`}
            className="stroke-primary-500 dark:stroke-primary-400"
            style={{ transition: "stroke-dashoffset 1s linear" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          {breathing && !isCounting && (
            <motion.div
              animate={
                isRunning
                  ? { scale: breathingIn ? 1.25 : 1, opacity: breathingIn ? 0.5 : 0.25 }
                  : { scale: 1, opacity: 0.25 }
              }
              transition={{ duration: 4, ease: "easeInOut" }}
              className="absolute rounded-full bg-primary-300 dark:bg-primary-700"
              style={{ width: size * 0.61, height: size * 0.61 }}
            />
          )}
          {isCounting ? (
            <motion.div
              key={displayText ?? displayTime}
              initial={{ scale: 1.4, opacity: 0.5 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              className="relative text-8xl font-light text-primary-600 dark:text-primary-400"
            >
              {displayText ?? displayTime}
            </motion.div>
          ) : (
            <div className="relative text-6xl font-light text-gray-800 dark:text-gray-100">
              {displayText ?? displayTime}
            </div>
          )}
          <div
            className={`relative mt-2 text-sm font-medium ${
              isCounting ? "text-gray-400" : "text-primary-600 dark:text-primary-400"
            }`}
          >
            {statusLabel}
          </div>
        </div>
      </div>
    </div>
  );
}
