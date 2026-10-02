import { motion } from "framer-motion";

interface TimerProps {
  displayTime: number;
  isRunning: boolean;
  isPaused: boolean;
  /** Countdown phase: "Get ready…" label and pulsing number */
  isCounting?: boolean;
  totalDuration?: number;
  /** Lead-in seconds marked on the ring in a different color (0 = none) */
  countdownSeconds?: number;
  /** Remaining lead-in seconds, shown as "+ N" next to the main time */
  countdownRemaining?: number | null;
  /** Override for the time shown in the center (e.g. formatted "2:30") */
  displayText?: string;
  /** Soft pulsing circle behind the time while running */
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
  countdownSeconds = 0,
  countdownRemaining = null,
  displayText,
  breathing = false,
  label,
  size = 288,
}: TimerProps) {
  // The ring has a warm lead-in segment (the start countdown) that fills
  // first, then the main blue progress takes over for the exercise itself.
  const countSeconds = Math.min(countdownSeconds, totalDuration);
  const elapsed =
    totalDuration > 0
      ? Math.min(Math.max(totalDuration - displayTime, 0), totalDuration)
      : 0;
  const countLen = (countSeconds / totalDuration) * RING_CIRCUMFERENCE;
  const fillLen = (elapsed / totalDuration) * RING_CIRCUMFERENCE;
  const countFill = Math.min(fillLen, countLen);
  const mainFill = Math.max(0, fillLen - countLen);

  const statusLabel = isCounting
    ? "Get ready…"
    : label ??
      (isPaused ? "Paused" : isRunning ? "Running" : "Ready");

  const showPlay = !isRunning && !isCounting;
  const mainValue =
    countdownRemaining != null
      ? displayTime - countdownRemaining
      : (displayText ?? displayTime);

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
          {countLen > 0 && (
            <circle
              cx={VIEW_SIZE / 2}
              cy={VIEW_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              strokeWidth="10"
              strokeDasharray={`${countLen} ${RING_CIRCUMFERENCE}`}
              transform={`rotate(-90 ${VIEW_SIZE / 2} ${VIEW_SIZE / 2})`}
              className="stroke-calm-500 dark:stroke-gray-500"
            />
          )}
          {countLen > 0 && (
            <circle
              cx={VIEW_SIZE / 2}
              cy={VIEW_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              strokeWidth="10"
              strokeDasharray={`${countFill} ${RING_CIRCUMFERENCE}`}
              transform={`rotate(-90 ${VIEW_SIZE / 2} ${VIEW_SIZE / 2})`}
              className="stroke-calm-600 dark:stroke-gray-400"
              style={{ transition: "stroke-dasharray 1s linear" }}
            />
          )}
          {mainFill > 0 && (
            <circle
              cx={VIEW_SIZE / 2}
              cy={VIEW_SIZE / 2}
              r={RING_RADIUS}
              fill="none"
              strokeWidth="10"
              strokeLinecap="round"
              strokeDasharray={`${mainFill} ${RING_CIRCUMFERENCE}`}
              strokeDashoffset={-countLen}
              transform={`rotate(-90 ${VIEW_SIZE / 2} ${VIEW_SIZE / 2})`}
              className="stroke-primary-500 dark:stroke-primary-400"
              style={{ transition: "stroke-dasharray 1s linear" }}
            />
          )}
        </svg>
        <div className="absolute inset-0">
          {breathing && (
            <motion.div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-300 dark:bg-primary-700"
              style={{ width: size * 0.61, height: size * 0.61 }}
              animate={
                isRunning
                  ? { scale: [1, 1.25, 1], opacity: [0.25, 0.5, 0.25] }
                  : { scale: 1, opacity: 0.25 }
              }
              transition={
                isRunning
                  ? { duration: 8, repeat: Infinity, ease: "easeInOut" }
                  : { duration: 0.6 }
              }
            />
          )}
          {showPlay ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="relative">
                {countdownRemaining != null ? (
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-5xl font-light text-gray-800 dark:text-gray-100">
                      {mainValue}
                    </span>
                    <span className="text-2xl font-medium text-primary-600 dark:text-primary-400">
                      + {countdownRemaining}
                    </span>
                  </div>
                ) : (
                  <div className="text-5xl font-light text-gray-800 dark:text-gray-100">
                    {mainValue}
                  </div>
                )}
                {/* Play button floats in front of the time on its own layer */}
                <div className="absolute left-1/2 top-1/2 z-10 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white/70 shadow-md backdrop-blur-[2px] dark:bg-gray-800/70">
                  <svg
                    viewBox="0 0 24 24"
                    className="h-8 w-8 translate-x-[2px] text-primary-600 dark:text-primary-300"
                    fill="currentColor"
                    aria-hidden="true"
                  >
                    <path d="M8 5v14l11-7z" />
                  </svg>
                </div>
              </div>
              <div className="mt-2 text-sm font-medium text-primary-600 dark:text-primary-400">
                {statusLabel}
              </div>
            </div>
          ) : (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {countdownRemaining != null ? (
                <motion.div
                  key={countdownRemaining}
                  initial={{ scale: 1.1, opacity: 0.8 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  className="relative flex items-baseline gap-1.5"
                >
                  <span className="text-5xl font-light text-gray-800 dark:text-gray-100">
                    {mainValue}
                  </span>
                  <span className="text-2xl font-medium text-primary-600 dark:text-primary-400">
                    + {countdownRemaining}
                  </span>
                </motion.div>
              ) : (
                <div className="relative text-6xl font-light text-gray-800 dark:text-gray-100">
                  {mainValue}
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
          )}
        </div>
      </div>
    </div>
  );
}
