import { Card } from "./Card";
import {
  TROPHIES,
  isEarned,
  trophyProgress,
  trophyProgressLabel,
  type TrophyStats,
} from "../utils/trophies";
import { MAX_ITEMS, type PlacedItem } from "../sync/types";

/**
 * The trophy case: everything earnable. Trophies are free — they are
 * earned from the lifetime stats, never bought with shelf points.
 */
export function TrophyList({
  stats,
  items,
  held,
  onPick,
}: {
  stats: TrophyStats;
  items: PlacedItem[];
  held: string | null;
  onPick: (id: string | null) => void;
}) {
  const full = items.length >= MAX_ITEMS;

  return (
    <Card className="p-4 mb-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Trophies
        </span>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          free — they are earned, not bought
        </span>
      </div>
      <div className="space-y-1.5">
        {TROPHIES.map((t) => {
          const earned = isEarned(t, stats);
          const placed = items.some((it) => it.item === t.id);
          return (
            <button
              key={t.id}
              type="button"
              disabled={!earned || placed || full}
              aria-pressed={held === t.id}
              onClick={() => onPick(held === t.id ? null : t.id)}
              title={earned && !placed && !full ? `Pick up ${t.title}` : undefined}
              className={`flex w-full items-center gap-3 rounded-lg p-2.5 text-left transition-colors ${
                held === t.id
                  ? "bg-primary-100 dark:bg-primary-900/40 ring-1 ring-primary-400"
                  : earned
                    ? "bg-white/70 dark:bg-gray-800/70"
                    : "bg-white/40 opacity-70 dark:bg-gray-800/40"
              }`}
            >
              <div className={`text-3xl ${earned ? "" : "grayscale"}`}>{t.emoji}</div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-semibold">
                  {t.title}
                  {placed && (
                    <span className="ml-1.5 text-[10px] font-normal text-primary-600 dark:text-primary-400">
                      on shelf
                    </span>
                  )}
                </div>
                <div className="truncate text-xs text-gray-500 dark:text-gray-400">
                  {earned ? t.description : trophyProgressLabel(t, stats)}
                </div>
                {!earned && (
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
                    <div
                      className="h-full rounded-full bg-primary-400"
                      style={{ width: `${trophyProgress(t, stats) * 100}%` }}
                    />
                  </div>
                )}
              </div>
              <div
                className={`text-xs font-semibold ${
                  earned
                    ? "text-primary-600 dark:text-primary-400"
                    : "text-gray-400 dark:text-gray-500"
                }`}
              >
                {earned ? "✓ Earned" : "Locked"}
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}
