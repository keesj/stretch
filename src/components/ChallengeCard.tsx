import type { ReactNode } from "react";
import { Card } from "./Card";
import { Button } from "./Button";
import type { Challenge, ChallengeStatus } from "../types/challenge";

interface ChallengeCardProps {
  challenge: Challenge;
  status: ChallengeStatus;
  onStart: () => void;
  onBegin: () => void;
  onRestart: () => void;
  onProgress?: () => void;
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

  let button: ReactNode;
  if (phase === "not-started") {
    button = (
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
  } else {
    button = (
      <Button onClick={onRestart} className="w-full">
        Start New Challenge
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
            ? `${challenge.totalDays} days • ${Math.floor(challenge.baseSeconds / 60)} min plank per day`
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
          Missed days: {missedDays} (−{(missedDays * challenge.missedDayPenalty).toString()} pts)
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
