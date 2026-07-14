import { formatTime } from "../utils/timer";

interface TimerProps {
  timeLeft: number;
  isRunning: boolean;
  isPaused: boolean;
}

export function Timer({ timeLeft, isRunning, isPaused }: TimerProps) {
  return (
    <div className="flex flex-col items-center">
      <div
        className={`text-6xl font-light ${isPaused ? "text-primary-400" : "text-gray-800 dark:text-gray-100"}`}
      >
        {formatTime(timeLeft)}
      </div>
      <div
        className={`mt-2 text-sm font-medium ${isRunning ? "text-primary-600" : "text-gray-400"}`}
      >
        {isPaused ? "Paused" : isRunning ? "Running" : "Ready"}
      </div>
    </div>
  );
}