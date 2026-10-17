import { motion } from "framer-motion";
import { Button } from "./Button";
import { formatTime } from "../utils/timer";
import type { ChallengeStatus } from "../types/challenge";

/** The done phase: today's result (or the finished challenge) plus ways on. */
export function ChallengeDone({
  status,
  isDuration,
  onBack,
  onProgress,
}: {
  status: ChallengeStatus;
  isDuration: boolean;
  onBack: () => void;
  onProgress: () => void;
}) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: "spring", stiffness: 200, damping: 12 }}
        className="text-7xl mb-4"
      >
        {status.status === "complete" || status.daysLeft === 0
          ? "🏆"
          : "🌅"}
      </motion.div>
      <h1 className="text-3xl font-bold mb-2">
        Day {status.dayNumber} complete!
      </h1>
      {status.status !== "complete" && status.todaySeconds > 0 && (
        <div className="text-gray-600 dark:text-gray-400 mb-2">
          {isDuration ? `Best hold today: ${formatTime(status.todaySeconds)}` : null}
        </div>
      )}
      {status.status !== "complete" && (
        <div className="text-primary-600 dark:text-primary-400 font-semibold mb-2">
          +{status.todayPoints} pts today
        </div>
      )}
      <div className="text-gray-600 dark:text-gray-400 mb-2">
        Total score: {status.score} pts
      </div>
      <div className="text-gray-500 dark:text-gray-400 mb-8 max-w-xs">
        {status.status === "complete" || status.daysLeft === 0
          ? "You finished the 30-day challenge. Amazing work!"
          : `${status.daysLeft} day${status.daysLeft === 1 ? "" : "s"} to go. Come back tomorrow!`}
      </div>
      <div className="w-full space-y-3">
        <Button onClick={onBack} className="w-full">
          Back to Home
        </Button>
        <Button
          variant="secondary"
          onClick={onProgress}
          className="w-full"
        >
          View progress
        </Button>
      </div>
    </div>
  );
}
