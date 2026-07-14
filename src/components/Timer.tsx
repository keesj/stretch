import { motion } from "framer-motion";

interface TimerProps {
  timeLeft: number;
  isRunning: boolean;
  isPaused: boolean;
  setupCountdown?: number | null;
  transitionCountdown?: number | null;
}

export function Timer({
  timeLeft,
  isRunning,
  isPaused,
  setupCountdown,
  transitionCountdown,
}: TimerProps) {
  const displayTime = setupCountdown ?? transitionCountdown ?? timeLeft;
  const isCountdown = setupCountdown !== null || transitionCountdown !== null;

  return (
    <div className="flex flex-col items-center">
      <motion.div
        key={displayTime}
        initial={{ scale: 1.5, opacity: 0.5 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`text-6xl font-light ${
          isCountdown
            ? "text-primary-500"
            : isPaused
            ? "text-primary-400"
            : "text-gray-800 dark:text-gray-100"
        }`}
      >
        {displayTime}
      </motion.div>
      <div className="mt-2 text-sm font-medium text-gray-400">
        {isPaused
          ? "Paused"
          : isCountdown
          ? "Get Ready"
          : isRunning
          ? "Running"
          : "Ready"}
      </div>
    </div>
  );
}