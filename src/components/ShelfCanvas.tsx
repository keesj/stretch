import { useRef, useState, type MouseEvent, type PointerEvent } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { costOf, itemFor, type TrophyBackground } from "../utils/trophies";
import { MAX_ITEMS, type PlacedItem } from "../sync/types";

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
 * The shelf: a free-form canvas on the chosen background, with all of the
 * placement interaction — tap an item in the inventory to pick it up, tap
 * the shelf to place it; placed items can be dragged to new spots, tapped
 * to select (then ✕ to remove), double-tapped to grow. Items may overlap —
 * the shelf is a little diorama, not a grid.
 *
 * The parent owns the item list and the value cap; this component owns
 * everything transient (selection, drag, bursts).
 */
export function ShelfCanvas({
  items,
  background,
  held,
  points,
  spent,
  onHeldChange,
  onCommitItems,
}: {
  items: PlacedItem[];
  background: TrophyBackground;
  held: string | null;
  /** Earned shelf points (the value cap). */
  points: number;
  /** Points the current items draw. */
  spent: number;
  onHeldChange: (id: string | null) => void;
  onCommitItems: (next: PlacedItem[]) => void;
}) {
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

  const full = items.length >= MAX_ITEMS;

  const addBurst = (x: number, y: number) => {
    burstSeq.current += 1;
    const id = burstSeq.current;
    setBursts((b) => [...b, { id, x, y }]);
    window.setTimeout(
      () => setBursts((b) => b.filter((it) => it.id !== id)),
      900
    );
  };

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
      onCommitItems([...items, { item: held, ...pos, size: 1 }]);
      addBurst(pos.x, pos.y);
      onHeldChange(null);
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
      onCommitItems(next);
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
    onCommitItems(items.filter((_, i) => i !== index));
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
    onCommitItems(items.map((item, i) => (i === index ? { ...item, size } : item)));
  };

  const heldInfo = held ? itemFor(held) : null;

  return (
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
              onClick={() => onHeldChange(null)}
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
              onCommitItems([]);
              setSelected(null);
            }}
            className="ml-3 shrink-0 text-[11px] font-semibold text-gray-500 underline dark:text-gray-400"
          >
            Clear shelf
          </button>
        )}
      </div>
    </div>
  );
}
