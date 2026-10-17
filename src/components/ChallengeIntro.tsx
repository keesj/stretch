import { motion } from "framer-motion";
import { Button } from "./Button";
import { formatTime } from "../utils/timer";
import type { Challenge } from "../types/challenge";

function formatOpenDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
}

/** One scoring-rule row: label left, points right. */
function RuleRow({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="flex justify-between px-4 py-2 bg-white/60 dark:bg-gray-800/60 rounded-lg">
      <span className="text-gray-600 dark:text-gray-300">{label}</span>
      <span
        className={`font-semibold ${
          muted ? "text-gray-500 dark:text-gray-400" : "text-primary-600 dark:text-primary-400"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The intro phase: what the challenge is, how it scores, and the start
 * button — or, for a cohort that has not opened yet, the date it opens.
 */
export function ChallengeIntro({
  challenge,
  maxPoints,
  opensAt,
  onStart,
}: {
  challenge: Challenge;
  /** Max points of a full duration hold (duration challenges only). */
  maxPoints: number;
  /** The account's effective start date when it is in the future. */
  opensAt: string | null;
  onStart: () => void;
}) {
  const isThreshold = challenge.scoring === "threshold";
  const isDuration = challenge.scoring === "duration";

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.15 }}
        className="text-7xl mb-6"
      >
        {challenge.illustration}
      </motion.div>
      <h1 className="text-3xl font-bold mb-3">{challenge.title}</h1>
      <p className="text-gray-600 dark:text-gray-400 mb-8 max-w-xs">
        {challenge.description}
      </p>
      <div className="w-full space-y-2 mb-8 text-sm">
        {isThreshold && (
          <>
            <RuleRow
              label={`${Math.floor(challenge.baseSeconds / 60)} min plank, every day`}
              value="+1 pt"
            />
            <RuleRow
              label={`Every ${challenge.milestoneEvery}th day: ${formatTime(challenge.milestoneSeconds)} plank (instead of ${formatTime(challenge.baseSeconds)})`}
              value={`${challenge.milestonePoints} pts`}
            />
            <RuleRow
              label={`+${challenge.bonusSeconds}s extra hold (after a miss)`}
              value={`+${challenge.bonusPoints} pts`}
            />
            <RuleRow label="Missed a day" value="0 pts" muted />
          </>
        )}
        {isDuration && (
          <>
            <RuleRow
              label={`First ${Math.floor(challenge.baseSeconds / 60)} min`}
              value={`+${challenge.basePoints} pt`}
            />
            <RuleRow
              label={`Each extra ${challenge.incrementSeconds}s`}
              value={`+${challenge.incrementPoints} pts`}
            />
            <RuleRow
              label={`${Math.floor(challenge.maxSeconds / 60)} min hold (max)`}
              value={`${maxPoints} pts`}
            />
            <RuleRow label="Missed a day" value="0 pts" muted />
          </>
        )}
      </div>
      {opensAt ? (
        <div className="w-full rounded-lg bg-white/60 dark:bg-gray-800/60 px-4 py-3 text-sm font-semibold text-gray-600 dark:text-gray-300">
          Opens {formatOpenDate(opensAt)}
        </div>
      ) : (
        <Button onClick={onStart} className="w-full">
          Start Challenge
        </Button>
      )}
    </div>
  );
}
