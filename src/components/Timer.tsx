import { motion } from "framer-motion";

interface TimerProps {
  displayTime: number;
  isRunning: boolean;
  isPaused: boolean;
  totalDuration?: number;
  countdownDisplay?: number | null;
  isSetupCountdown?: boolean;
  isTransitionMessage?: boolean;
}

export function Timer({
  displayTime,
  isRunning,
  isPaused,
  totalDuration = 60,
  countdownDisplay = null,
  isSetupCountdown = false,
  isTransitionMessage = false,
}: TimerProps) {
  const isTransition = isTransitionMessage;
  
  const displayText = isSetupCountdown
    ? `${totalDuration}${'.'.repeat(4 - countdownDisplay!)} `
    : isTransition
    ? countdownDisplay ?? displayTime
    : displayTime;
  
  const progress = ((totalDuration - displayTime) / totalDuration) * 100;

  const displayLabel = isPaused
    ? "Paused"
    : isSetupCountdown
    ? "Get Ready"
    : isTransition
    ? "Almost Done"
    : isRunning
    ? "Running"
    : "Ready";

  const textStyle = isSetupCountdown
    ? "text-primary-400"
    : isTransition
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
            initial={{ width: `${progress}%` }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          />
        </div>
      </div>
    </div>
  );
}