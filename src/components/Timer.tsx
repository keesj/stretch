import { motion } from "framer-motion";

interface TimerProps {
  displayTime: number;
  isRunning: boolean;
  isPaused: boolean;
  isSetupCountdown?: boolean;
  isTransitionCountdown?: boolean;
  totalDuration?: number;
  countdownDisplay?: number | null;
}

export function Timer({
  displayTime,
  isRunning,
  isPaused,
  isSetupCountdown = false,
  isTransitionCountdown = false,
  totalDuration = 60,
  countdownDisplay = null,
}: TimerProps) {
  const showTime = isSetupCountdown && countdownDisplay !== null ? countdownDisplay : displayTime;
  const progress = isSetupCountdown 
    ? 0 
    : isPaused
    ? ((totalDuration - showTime) / totalDuration) * 100
    : ((totalDuration - showTime) / totalDuration) * 100;

  const displayLabel = isPaused
    ? "Paused"
    : isSetupCountdown
    ? "Starting"
    : isTransitionCountdown
    ? "DONE"
    : isRunning
    ? "Running"
    : "Ready";

  return (
    <div className="flex flex-col items-center w-full max-w-xs">
      <motion.div
        key={showTime}
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
        {showTime}
      </motion.div>
      <div className="mt-2 text-sm font-medium text-gray-400">
        {displayLabel}
      </div>
      <div className="mt-4 w-full">
        <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary-500"
            initial={{ width: `${progress}%` }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          />
        </div>
      </div>
    </div>
  );
}