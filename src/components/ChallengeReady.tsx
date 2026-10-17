import { Button } from "./Button";
import { formatTime } from "../utils/timer";
import type { Challenge, ChallengeStatus } from "../types/challenge";
import type { Stretch } from "../types/stretch";

/**
 * The ready phase: today's instructions and the hold buttons. A duration
 * challenge gets a single "start" button; a threshold challenge gets the
 * base hold, plus milestone and bonus variants when they apply.
 */
export function ChallengeReady({
  exercise,
  status,
  challenge,
  instructions,
  onBeginHold,
  onBeginDuration,
}: {
  exercise: Stretch;
  status: ChallengeStatus;
  challenge: Challenge;
  /** The instruction lines to show (already filtered by scoring type). */
  instructions: string[];
  onBeginHold: (seconds: number) => void;
  onBeginDuration: () => void;
}) {
  const isThreshold = challenge.scoring === "threshold";
  const isDuration = challenge.scoring === "duration";

  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center">
      <div className="text-7xl mb-4">{exercise.illustration}</div>
      <h1 className="text-2xl font-bold mb-2">Day {status.dayNumber}</h1>
      <div className="text-sm text-gray-500 dark:text-gray-400 mb-6">
        Score: {status.score} pts
      </div>
      <div className="w-full bg-white/60 dark:bg-gray-800/60 rounded-xl p-4 mb-8 space-y-2 text-left">
        {instructions.map((instruction, index) => (
          <div
            // Static numbered instructions; the index is the key.
            // oxlint-disable-next-line react/no-array-index-key
            key={index}
            className="text-sm text-gray-600 dark:text-gray-300"
          >
            {index + 1}. {instruction}
          </div>
        ))}
      </div>
      <div className="w-full space-y-3">
        {isDuration && (
          <Button onClick={onBeginDuration} className="w-full">
            Start Plank
          </Button>
        )}
        {isThreshold && (
          <Button
            onClick={() => onBeginHold(challenge.baseSeconds)}
            className="w-full"
          >
            Begin {formatTime(challenge.baseSeconds)} Plank (+1 pt)
          </Button>
        )}
        {isThreshold && status.todayIsMilestone && (
          <Button
            variant="secondary"
            onClick={() => onBeginHold(challenge.milestoneSeconds)}
            className="w-full"
          >
            Begin {formatTime(challenge.milestoneSeconds)} Plank (+{challenge.milestonePoints} pts)
          </Button>
        )}
        {isThreshold && status.bonusAvailable && (
          <Button
            variant="secondary"
            onClick={() =>
              onBeginHold(challenge.baseSeconds + challenge.bonusSeconds)
            }
            className="w-full"
          >
            Hold {formatTime(challenge.baseSeconds + challenge.bonusSeconds)} (+{challenge.bonusPoints} extra)
          </Button>
        )}
      </div>
      {isDuration ? (
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 max-w-xs">
          Hold as long as you can, then press stop. Your best hold of the day counts.
        </p>
      ) : status.bonusAvailable ? (
        <p className="mt-4 text-xs text-gray-500 dark:text-gray-400 max-w-xs">
          You&apos;re behind the pace — the extra hold counts as +
          {challenge.bonusPoints} extra pts for today.
        </p>
      ) : status.todayIsMilestone ? (
        <p className="mt-4 text-xs text-primary-600 dark:text-primary-400 max-w-xs">
          Milestone day — or hold the full {formatTime(challenge.milestoneSeconds)} and earn {challenge.milestonePoints} pts instead.
        </p>
      ) : null}
    </div>
  );
}
