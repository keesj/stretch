import type { ReactNode } from "react";
import { Card } from "./Card";
import { Button } from "./Button";
import { formatTime } from "../utils/timer";
import { loadChallengeState, todayKey } from "../utils/challenge";
import type { Challenge, ChallengeStatus } from "../types/challenge";

interface ChallengeCardProps {
  challenge: Challenge;
  status: ChallengeStatus;
  onStart: () => void;
  onBegin: () => void;
  onRestart: () => void;
  onProgress?: () => void;
}

function formatOpenDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, {
    month: "long",
    day: "numeric",
  });
}

export function ChallengeCard({
  challenge,
  status,
  onStart,
  onBegin,
  onRestart,
  onProgress,
}: ChallengeCardProps) {
  const {
    status: phase,
    dayNumber,
    daysLeft,
    todayDone,
    todayPoints,
    score,
    missedDays,
  } = status;

  const isSelfStart = !challenge.startDate;
  // A cohort challenge that has not opened yet cannot be started. The open
  // date is the account's effective start (start op, or the configured one).
  const effectiveStart = loadChallengeState(challenge).startedAt;
  const opensAt =
    phase === "not-started" && effectiveStart && effectiveStart > todayKey()
      ? effectiveStart
      : null;

  let button: ReactNode;
  if (phase === "not-started") {
    button = opensAt ? (
      <Button disabled className="w-full">
        Opens {formatOpenDate(opensAt)}
      </Button>
    ) : (
      <Button onClick={onStart} className="w-full">
        Start Day 1
      </Button>
    );
  } else if (phase === "active" && !todayDone) {
    button = (
      <Button onClick={onBegin} className="w-full">
        Start Day {dayNumber}
      </Button>
    );
  } else if (phase === "active") {
    button = (
      <Button variant="outline" disabled className="w-full">
        Completed today • +{todayPoints} pts
      </Button>
    );
  } else if (isSelfStart) {
    button = (
      <Button onClick={onRestart} className="w-full">
        Start New Challenge
      </Button>
    );
  } else {
    button = (
      <Button variant="outline" disabled className="w-full">
        Finished
      </Button>
    );
  }

  return (
    <Card className="p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-xl font-semibold mb-1">{challenge.title}</h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {challenge.description}
          </p>
        </div>
        <div className="text-4xl ml-3">{challenge.illustration}</div>
      </div>
      <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-2">
        <span>
          {phase === "not-started"
            ? challenge.scoring === "duration"
              ? `${challenge.totalDays} days • hold as long as you can`
              : `${challenge.totalDays} days • ${Math.floor(challenge.baseSeconds / 60)} min plank per day`
            : phase === "complete"
              ? "Challenge complete 🏆"
              : `Day ${dayNumber} of ${challenge.totalDays} • ${daysLeft} left`}
        </span>
        <span className="font-semibold text-primary-600 dark:text-primary-400">
          {score} pts
        </span>
      </div>
      {phase !== "not-started" && (
        <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden mb-2">
          <div
            className="h-full bg-primary-500"
            style={{
              width: `${Math.min((dayNumber / challenge.totalDays) * 100, 100)}%`,
            }}
          />
        </div>
      )}
      {phase === "active" && missedDays > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 mb-3">
          Missed days: {missedDays}
        </div>
      )}
      {phase === "active" &&
        !todayDone &&
        status.todayIsMilestone &&
        challenge.scoring === "threshold" && (
          <div className="text-xs font-medium text-primary-600 dark:text-primary-400 mb-3">
            Milestone day: {formatTime(challenge.milestoneSeconds)} plank for {challenge.milestonePoints} pts
          </div>
        )}
      <div className="space-y-3">
        {button}
        {phase !== "not-started" && onProgress && (
          <Button variant="outline" onClick={onProgress} className="w-full">
            View progress
          </Button>
        )}
      </div>
    </Card>
  );
}
