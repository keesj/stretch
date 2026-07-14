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
  const totalDuration = isCountdown ? 3 : 60;

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <motion.div
        key={displayTime}
        initial={{ scale: 1.1, opacity: 0.8 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
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
      {isCountdown && (
        <div className="mt-4 w-full">
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <motion.div
              key={displayTime}
              className="h-full bg-primary-500"
              initial={{ width: "100%" }}
              animate={{ width: "0%" }}
              transition={{ duration: 3, ease: "linear" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}