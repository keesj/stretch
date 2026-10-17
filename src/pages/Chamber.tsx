import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
  type PointerEvent,
} from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Card } from "../components/Card";
import {
  TROPHIES,
  FREE_ITEMS,
  TROPHY_BACKGROUNDS,
  SESSION_POINTS,
  backgroundById,
  computeTrophyStats,
  costOf,
  isEarned,
  itemFor,
  shelfCost,
  shelfPoints,
  titleFor,
  trophyProgress,
  trophyProgressLabel,
} from "../utils/trophies";
import { challenges } from "../data/challenges";
import { loadChallengeState } from "../utils/challenge";
import { loadFromStorage, type CompletedSession } from "../utils/storage";
import {
  MAX_ITEMS,
  DEFAULT_PROFILE,
  DEFAULT_TROPHY_CASE,
  type PlacedItem,
  type Profile,
  type TrophyCaseState,
} from "../sync/types";
import { recordTrophyCase } from "../sync/record";
import { useDataRevision } from "../sync/dataChange";
import { normalizeTrophyCaseState } from "../sync/replay";
import { getUserId } from "../sync/identity";
import { displayName, displayAvatar, nameColor } from "../utils/display";
import { formatTime } from "../utils/timer";

const DRAG_THRESHOLD_PX = 8;

/** Shelf render size per kind and scale (each step is exactly 2x). */
const SIZE_CLASS: Record<1 | 2, Record<"trophy" | "free", string>> = {
  1: { trophy: "text-4xl", free: "text-2xl" },
  2: { trophy: "text-7xl", free: "text-5xl" },
};

/**
 * A few ambient sparkles: purely decorative twinkle on the shelf. Fixed
 * positions (so they never jump between renders), behind the items,
 * invisible to the pointer and to screen readers, and skipped entirely
 * when the user prefers reduced motion.
 */
const SPARKLES = [
  { x: 12, y: 22, size: 14, delay: 0.0, duration: 2.6, glyph: "✦" },
  { x: 78, y: 16, size: 11, delay: 0.9, duration: 3.2, glyph: "✧" },
  { x: 30, y: 70, size: 12, delay: 1.6, duration: 2.9, glyph: "⋆" },
  { x: 88, y: 60, size: 14, delay: 0.4, duration: 3.6, glyph: "✦" },
  { x: 55, y: 36, size: 10, delay: 2.1, duration: 2.4, glyph: "✧" },
  { x: 16, y: 82, size: 12, delay: 1.2, duration: 3.0, glyph: "⋆" },
];

function Sparkles() {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <>
      {SPARKLES.map((s, i) => (
        <motion.span
          // Static const array; the index is a stable key.
          // oxlint-disable-next-line react/no-array-index-key
          key={i}
          data-sparkle
          aria-hidden
          className="pointer-events-none absolute select-none text-amber-200/80 drop-shadow-sm"
          style={{ left: `${s.x}%`, top: `${s.y}%`, fontSize: s.size, zIndex: 5 }}
          initial={{ opacity: 0, scale: 0.5 }}
          animate={{ opacity: [0, 0.9, 0], scale: [0.5, 1, 0.5] }}
          transition={{
            duration: s.duration,
            delay: s.delay,
            repeat: Infinity,
            ease: "easeInOut",
          }}
        >
          {s.glyph}
        </motion.span>
      ))}
    </>
  );
}

/** Directions the burst particles fly (a small star around the spot). */
const BURST_PARTICLES = [
  { dx: 0, dy: -18 },
  { dx: -14, dy: -8 },
  { dx: 14, dy: -8 },
  { dx: -8, dy: 12 },
  { dx: 8, dy: 12 },
];

/** A short-lived sparkle burst at a placement spot; self-removes via the
    parent's timeout once the twinkle has faded (~0.7s). */
function SparkleBurst({ x, y }: { x: number; y: number }) {
  const reduceMotion = useReducedMotion();
  if (reduceMotion) return null;
  return (
    <span
      data-burst
      aria-hidden
      className="pointer-events-none absolute"
      style={{ left: `${x}%`, top: `${y}%`, zIndex: 35 }}
    >
      {BURST_PARTICLES.map((p, i) => (
        <motion.span
          // Static const array; the index is a stable key.
          // oxlint-disable-next-line react/no-array-index-key
          key={i}
          className="absolute select-none text-amber-200 drop-shadow-sm"
          style={{ fontSize: 12 }}
          initial={{ opacity: 1, x: 0, y: 0, scale: 0.4 }}
          animate={{ opacity: 0, x: p.dx, y: p.dy, scale: 1.1 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        >
          ✦
        </motion.span>
      ))}
    </span>
  );
}

/**
 * The personal trophy chamber: a lifetime shelf derived from the account's
 * ops, decorated via the synced trophyCase op. Trophies are computed, never
 * stored — the decoration is the only thing journaled.
 *
 * Placement model: a free canvas. Tap an item in the inventory to pick it
 * up, tap the shelf to place it at that spot. Placed items can be dragged
 * to new spots, tapped to select (then ✕ to remove). Items may overlap —
 * the shelf is a little diorama, not a grid.
 */
export function Chamber() {
  // Bumped on every data refresh so the derived stats re-read the blobs.
  const [tick, setTick] = useState(0);
  const [profile, setProfile] = useState<Profile>(() =>
    loadFromStorage("stretch.profile", DEFAULT_PROFILE)
  );
  const [trophyCase, setTrophyCase] = useState<TrophyCaseState>(() =>
    normalizeTrophyCaseState(loadFromStorage<unknown>("stretch.trophyCase", DEFAULT_TROPHY_CASE))
  );
  const [held, setHeld] = useState<string | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  // Live position of the item being dragged (committed on release).
  const [draft, setDraft] = useState<{ index: number; x: number; y: number } | null>(null);

  // Sparkle bursts at recent placement spots; each self-removes via a
  // timeout so there is no exit animation to coordinate.
  const [bursts, setBursts] = useState<{ id: number; x: number; y: number }[]>([]);
  const burstSeq = useRef(0);

  const canvasRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ index: number; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);

  const addBurst = (x: number, y: number) => {
    burstSeq.current += 1;
    const id = burstSeq.current;
    setBursts((b) => [...b, { id, x, y }]);
    window.setTimeout(
      () => setBursts((b) => b.filter((it) => it.id !== id)),
      900
    );
  };

  // A sync round that absorbs remote ops rewrites the projection blobs;
  // pick the new profile / trophy case up without leaving the page.
  // Skips the mount (the state is already fresh).
  const revision = useDataRevision();
  const firstDataChange = useRef(true);
  useEffect(() => {
    if (firstDataChange.current) {
      firstDataChange.current = false;
      return;
    }
    setProfile(loadFromStorage("stretch.profile", DEFAULT_PROFILE));
    setTrophyCase(normalizeTrophyCaseState(loadFromStorage<unknown>("stretch.trophyCase", DEFAULT_TROPHY_CASE)));
    setTick((t) => t + 1);
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [revision]);

  const stats = useMemo(() => {
    void tick;
    const sessions = loadFromStorage<CompletedSession[]>("completedSessions", []);
    return computeTrophyStats(
      challenges.map((c) => ({ challenge: c, state: loadChallengeState(c) })),
      sessions
    );
    // oxlint-disable-next-line react/memo-dependencies
  }, [tick]);

  const items = trophyCase.items;
  const background = backgroundById(trophyCase.background);
  const earnedCount = TROPHIES.filter((t) => isEarned(t, stats)).length;
  const title = titleFor(stats);
  const full = items.length >= MAX_ITEMS;
  // The value cap: shelf points are derived from sessions; the placed
  // items may never draw more than the points earned.
  const points = shelfPoints(stats);
  const spent = shelfCost(items);
  const remaining = points - spent;

  const setCase = (patch: Partial<TrophyCaseState>) =>
    setTrophyCase(recordTrophyCase(patch));
  const commitItems = (next: PlacedItem[]) => setCase({ items: next });

  const toPct = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const left = rect?.left ?? 0;
    const top = rect?.top ?? 0;
    const width = rect?.width || 1;
    const height = rect?.height || 1;
    return {
      x: Math.min(98, Math.max(2, ((e.clientX - left) / width) * 100)),
      y: Math.min(98, Math.max(2, ((e.clientY - top) / height) * 100)),
    };
  };

  const onCanvasClick = (e: MouseEvent) => {
    if (held) {
      // The picker already disables unaffordable items; this keeps the
      // cap authoritative in one place.
      if (full || spent + costOf(held) > points) return;
      const pos = toPct(e);
      commitItems([...items, { item: held, ...pos, size: 1 }]);
      addBurst(pos.x, pos.y);
      setHeld(null);
    } else {
      setSelected(null);
    }
  };

  const onItemPointerDown = (e: PointerEvent, index: number) => {
    if (held) return;
    dragRef.current = { index, startX: e.clientX, startY: e.clientY, moved: false };
    // Capture so fast drags outside the item still track (guarded: not
    // available in every test environment).
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };

  const onCanvasPointerMove = (e: PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > DRAG_THRESHOLD_PX) {
      drag.moved = true;
    }
    if (!drag.moved) return;
    setDraft({ index: drag.index, ...toPct(e) });
  };

  const onCanvasPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag) return;
    if (drag.moved && draft && draft.index === drag.index) {
      const next = items.map((it, i) => (i === drag.index ? { ...it, x: draft.x, y: draft.y } : it));
      commitItems(next);
      // The browser will synthesize a click after the drag — ignore it.
      suppressClick.current = true;
    }
    setDraft(null);
  };

  const onItemClick = (e: MouseEvent, index: number) => {
    e.stopPropagation();
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    setSelected((s) => (s === index ? null : index));
  };

  const onRemoveClick = (e: MouseEvent, index: number) => {
    e.stopPropagation();
    commitItems(items.filter((_, i) => i !== index));
    setSelected(null);
  };

  // Double-tap toggles an item's size. Growing draws an extra `cost` from
  // the value cap (so it is blocked when unaffordable); shrinking always
  // frees capacity. The two clicks of the double-tap toggle the selection
  // back to where it started, so only the size changes.
  const onItemDoubleClick = (e: MouseEvent, index: number) => {
    e.stopPropagation();
    if (held) return;
    const it = items[index];
    if (!it) return;
    const size: 1 | 2 = it.size === 1 ? 2 : 1;
    if (size === 2 && spent + costOf(it.item) > points) return;
    commitItems(items.map((item, i) => (i === index ? { ...item, size } : item)));
  };

  const heldInfo = held ? itemFor(held) : null;

  return (
    <div className="mx-auto flex h-dvh max-w-md flex-col overflow-hidden bg-calm-50 px-4 dark:bg-gray-900">
      {/* Header + shelf stay pinned; only the loot below scrolls. */}
      <header className="shrink-0 pt-6 pb-4">
        <h1 className="text-3xl font-bold mb-2">Trophy Chamber</h1>
        <div className="flex items-center gap-2">
          <span className="text-xl">{displayAvatar(profile.avatar)}</span>
          <span
            className="text-sm font-semibold"
            style={{ color: nameColor(getUserId()) }}
          >
            {displayName(profile.name)}
          </span>
          {title ? (
            <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-semibold text-gray-600 dark:bg-gray-800/70 dark:text-gray-300">
              {title.emoji} {title.label}
            </span>
          ) : (
            <span className="text-[11px] text-gray-400 dark:text-gray-500">no title yet</span>
          )}
          <span className="text-xs text-gray-500 dark:text-gray-400">
            · {earnedCount}/{TROPHIES.length} earned
          </span>
        </div>
      </header>

      {/* The shelf: a free-form canvas on the chosen background. */}
      <div className={`shrink-0 rounded-2xl p-2 ${background.className}`}>
        <div
          ref={canvasRef}
          role="group"
          aria-label="Shelf"
          onClick={onCanvasClick}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          className={`relative aspect-[4/3] w-full overflow-hidden rounded-xl ${
            held ? "cursor-crosshair" : ""
          }`}
        >
          <Sparkles />
          {bursts.map((b) => (
            <SparkleBurst key={b.id} x={b.x} y={b.y} />
          ))}
          {/* Placing hint: an overlay so picking up an item never moves
              the shelf (the canvas keeps its aspect-ratio height). Clicks
              on the bar must not count as placements. */}
          {held && heldInfo && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-2 top-2 z-40 flex items-center justify-between rounded-lg bg-white/80 px-3 py-2 text-xs shadow backdrop-blur-sm dark:bg-gray-800/80"
            >
              <span>
                <span className="mr-1 text-base">{heldInfo.emoji}</span>
                Placing <span className="font-semibold">{heldInfo.label}</span> — tap
                the shelf
              </span>
              <button
                type="button"
                onClick={() => setHeld(null)}
                className="font-semibold text-primary-600 dark:text-primary-400"
              >
                Drop
              </button>
            </div>
          )}
          {items.length === 0 && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
              <p className="text-center text-xs text-gray-500 dark:text-gray-300">
                Your shelf is empty — pick an item below, then tap here to place
                it.
              </p>
            </div>
          )}
          {items.map((it, i) => {
            const info = itemFor(it.item);
            if (!info) return null; // unknown id: kept in data, never rendered
            const isDraft = draft?.index === i;
            const x = isDraft ? draft.x : it.x;
            const y = isDraft ? draft.y : it.y;
            const isSelected = selected === i;
            return (
              <div
                // Fixed grid of slot positions; the index is the slot.
                // oxlint-disable-next-line react/no-array-index-key
                key={i}
                className={`absolute ${held ? "pointer-events-none" : ""}`}
                style={{
                  left: `${x}%`,
                  top: `${y}%`,
                  transform: "translate(-50%, -50%)",
                  zIndex: isDraft || isSelected ? 30 : 10,
                }}
              >
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.9 }}
                  aria-label={`${info.label} on the shelf${it.size === 2 ? " (grown)" : ""}`}
                  title={it.size === 2 ? `${info.label} (grown)` : info.label}
                  onPointerDown={(e) => onItemPointerDown(e, i)}
                  onClick={(e) => onItemClick(e, i)}
                  onDoubleClick={(e) => onItemDoubleClick(e, i)}
                  className={`select-none leading-none touch-none ${SIZE_CLASS[it.size][info.kind]} ${
                    isDraft ? "scale-125 drop-shadow-lg" : ""
                  } ${isSelected ? "drop-shadow-lg" : ""} ${
                    held ? "" : "cursor-grab active:cursor-grabbing"
                  }`}
                >
                  {info.emoji}
                </motion.button>
                {isSelected && !held && (
                  <button
                    type="button"
                    aria-label={`Remove ${info.label}`}
                    onClick={(e) => onRemoveClick(e, i)}
                    className="absolute -right-3 -top-3 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <div className="mt-2 flex items-center justify-between px-1">
          <p className="text-[11px] text-gray-500 dark:text-gray-400">
            Tap an item, then the shelf, to place it. Drag to move · tap to
            select, ✕ to remove · double-tap to grow (2× pts).
          </p>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => {
                commitItems([]);
                setSelected(null);
              }}
              className="ml-3 shrink-0 text-[11px] font-semibold text-gray-500 underline dark:text-gray-400"
            >
              Clear shelf
            </button>
          )}
        </div>
      </div>

      {/* The loot: decorations + trophies (+ lifetime stats). This is the
          only part of the page that scrolls. */}
      <div className="mt-2 flex-1 overflow-y-auto pb-24">
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
              aria-pressed={b.id === background.id}
              onClick={() => setCase({ background: b.id })}
              className={`h-7 w-7 rounded-lg transition-opacity ${b.swatchClassName} ${
                b.id === background.id
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
                onClick={() => setHeld((h) => (h === f.id ? null : f.id))}
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

      {/* The trophy case: everything earnable. */}
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
                onClick={() => setHeld((h) => (h === t.id ? null : t.id))}
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

      {/* Lifetime stats. */}
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
      </div>
    </div>
  );
}
