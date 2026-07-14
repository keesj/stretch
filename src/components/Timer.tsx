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
  const isSetupCountdown = setupCountdown !== null;
  const isTransitionCountdown = transitionCountdown !== null;
  const isCountdown = isSetupCountdown || isTransitionCountdown;

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <motion.div
        key={displayTime}
        initial={isTransitionCountdown ? { scale: 1.1, opacity: 0.8 } : {}}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className={`text-6xl font-light ${
          isTransitionCountdown
            ? "text-primary-500"
            : isSetupCountdown
            ? "text-primary-400"
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
          : isSetupCountdown
          ? "Get Ready"
          : isTransitionCountdown
          ? "Almost Done"
          : isRunning
          ? "Running"
          : "Ready"}
      </div>
      {isTransitionCountdown && (
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