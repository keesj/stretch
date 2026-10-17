import { Card } from "./Card";
import { FREE_ITEMS, SESSION_POINTS, TROPHY_BACKGROUNDS } from "../utils/trophies";
import { MAX_ITEMS, type PlacedItem } from "../sync/types";

/**
 * The decorations picker: background swatches plus the free items.
 * Tapping an item picks it up (the parent tracks `held`); the actual
 * placement happens on the shelf.
 */
export function ShelfInventory({
  items,
  points,
  spent,
  held,
  backgroundId,
  onPick,
  onBackgroundChange,
}: {
  items: PlacedItem[];
  /** Earned shelf points (the value cap). */
  points: number;
  /** Points the current items draw. */
  spent: number;
  held: string | null;
  backgroundId: string;
  onPick: (id: string | null) => void;
  onBackgroundChange: (id: string) => void;
}) {
  const full = items.length >= MAX_ITEMS;
  const remaining = points - spent;

  return (
    <Card className="p-4 mb-4">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">
          Decorations
        </span>
        <span className="text-[11px] text-gray-400 dark:text-gray-500">
          {items.length}/{MAX_ITEMS} · {spent}/{points} pts
        </span>
      </div>
      <div className="mb-4 flex items-center gap-2.5">
        <span className="text-[11px] font-medium text-gray-500 dark:text-gray-400">
          Background
        </span>
        {TROPHY_BACKGROUNDS.map((b) => (
          <button
            key={b.id}
            type="button"
            aria-label={`${b.label} background`}
            aria-pressed={b.id === backgroundId}
            onClick={() => onBackgroundChange(b.id)}
            className={`h-7 w-7 rounded-lg transition-opacity ${b.swatchClassName} ${
              b.id === backgroundId
                ? "ring-2 ring-primary-500 ring-offset-1 dark:ring-offset-gray-900"
                : "opacity-70"
            }`}
          />
        ))}
      </div>
      <p className="mb-2 text-[11px] text-gray-400 dark:text-gray-500">
        {points === 0
          ? `Complete a stretch session to earn your first ${SESSION_POINTS} shelf points.`
          : `${remaining} pts to spend · earn ${SESSION_POINTS} per session`}
      </p>
      <div className="grid grid-cols-4 gap-2">
        {FREE_ITEMS.map((f) => {
          const count = items.filter((it) => it.item === f.id).length;
          const affordable = remaining >= f.cost;
          const disabled = full || !affordable;
          return (
            <button
              key={f.id}
              type="button"
              disabled={disabled}
              aria-pressed={held === f.id}
              aria-label={`Pick up ${f.label}, ${f.cost} points`}
              title={
                disabled && !full ? `Needs ${f.cost} pts — you have ${Math.max(0, remaining)}` : undefined
              }
              onClick={() => onPick(held === f.id ? null : f.id)}
              className={`relative flex flex-col items-center gap-0.5 rounded-lg p-2 transition-colors ${
                held === f.id
                  ? "bg-primary-100 dark:bg-primary-900/40 ring-1 ring-primary-400"
                  : disabled
                    ? "bg-white/40 opacity-50 dark:bg-gray-800/40"
                    : "bg-white/70 dark:bg-gray-800/70"
              }`}
            >
              <div className="text-2xl">{f.emoji}</div>
              <div className="w-full truncate text-center text-[9px] font-medium">
                {f.label}
              </div>
              <div
                className={`text-[9px] ${
                  affordable ? "text-gray-400 dark:text-gray-500" : "text-red-400"
                }`}
              >
                {f.cost} pts
              </div>
              {count > 0 && (
                <div className="absolute -right-1 -top-1 rounded-full bg-primary-500 px-1.5 text-[9px] font-bold text-white">
                  {count}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </Card>
  );
}
