import { Card } from "./Card";
import { SESSION_POINTS, type TrophyStats } from "../utils/trophies";
import { formatTime } from "../utils/timer";

/** The lifetime stats card under the loot list. */
export function ShelfStats({ stats, points }: { stats: TrophyStats; points: number }) {
  return (
    <Card className="p-4">
      <div className="grid grid-cols-4 gap-2 text-center">
        <div>
          <div className="text-base font-bold">
            {stats.bestHoldSeconds > 0 ? formatTime(stats.bestHoldSeconds) : "—"}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">Best hold</div>
        </div>
        <div>
          <div className="text-base font-bold">
            {stats.longestStreak > 0 ? `${stats.longestStreak} days` : "—"}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">Longest streak</div>
        </div>
        <div>
          <div className="text-base font-bold">
            {stats.sessionsCompleted > 0 ? stats.sessionsCompleted : "—"}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">Sessions</div>
        </div>
        <div>
          <div className="text-base font-bold">
            {points > 0 ? `${points} pts` : "—"}
          </div>
          <div className="text-[11px] text-gray-500 dark:text-gray-400">Shelf points</div>
        </div>
      </div>
      <p className="mt-4 text-[11px] text-gray-400 dark:text-gray-500">
        Your shelf and background sync to your other devices. Trophies are
        always earned, never given — decorations cost shelf points, {SESSION_POINTS} per
        completed session.
      </p>
    </Card>
  );
}
