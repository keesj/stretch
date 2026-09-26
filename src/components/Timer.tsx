import { motion } from "framer-motion";

interface TimerProps {
  displayTime: number;
  isRunning: boolean;
  isPaused: boolean;
  /** Show a 3-2-1 start countdown instead of the timer */
  isCounting?: boolean;
  totalDuration?: number;
  countdownDisplay?: number | null;
  isTransitionMessage?: boolean;
}

export function Timer({
  displayTime,
  isRunning,
  isPaused,
  isCounting = false,
  totalDuration = 60,
  countdownDisplay = null,
  isTransitionMessage = false,
}: TimerProps) {
  const isTransition = !isCounting && isTransitionMessage;

  const displayText = isTransition
    ? countdownDisplay ?? displayTime
    : displayTime;

  const progress =
    totalDuration > 0
      ? Math.min(
          Math.max(((totalDuration - displayTime) / totalDuration) * 100, 0),
          100
        )
      : 0;

  const displayLabel = isTransition
    ? "Almost Done"
    : isCounting
    ? "Get ready…"
    : isPaused
    ? "Paused"
    : isRunning
    ? "Running"
    : "Ready";

  const textStyle = isTransition || isCounting
    ? "text-primary-600 dark:text-primary-400"
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
      {!isCounting && (
        <div className="mt-4 w-full">
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary-500 transition-[width] duration-1000 ease-linear"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
