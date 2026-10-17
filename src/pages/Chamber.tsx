import { useEffect, useMemo, useRef, useState } from "react";
import { ShelfCanvas } from "../components/ShelfCanvas";
import { ShelfInventory } from "../components/ShelfInventory";
import { TrophyList } from "../components/TrophyList";
import { ShelfStats } from "../components/ShelfStats";
import {
  TROPHIES,
  backgroundById,
  computeTrophyStats,
  isEarned,
  shelfCost,
  shelfPoints,
  titleFor,
} from "../utils/trophies";
import { challenges } from "../data/challenges";
import { loadChallengeState } from "../utils/challenge";
import { loadFromStorage, type CompletedSession } from "../utils/storage";
import {
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

/**
 * The personal trophy chamber: a lifetime shelf derived from the account's
 * ops, decorated via the synced trophyCase op. Trophies are computed, never
 * stored — the decoration is the only thing journaled.
 *
 * The page owns the synced state (profile, trophy case) and the value cap;
 * the shelf canvas (placement interaction) and the loot list (picker +
 * stats) are the components below.
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
  // The value cap: shelf points are derived from sessions; the placed
  // items may never draw more than the points earned.
  const points = shelfPoints(stats);
  const spent = shelfCost(items);

  const setCase = (patch: Partial<TrophyCaseState>) =>
    setTrophyCase(recordTrophyCase(patch));
  const commitItems = (next: PlacedItem[]) => setCase({ items: next });

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

      <ShelfCanvas
        items={items}
        background={background}
        held={held}
        points={points}
        spent={spent}
        onHeldChange={setHeld}
        onCommitItems={commitItems}
      />

      {/* The loot: decorations + trophies (+ lifetime stats). This is the
          only part of the page that scrolls. */}
      <div className="mt-2 flex-1 overflow-y-auto pb-24">
        <ShelfInventory
          items={items}
          points={points}
          spent={spent}
          held={held}
          backgroundId={background.id}
          onPick={setHeld}
          onBackgroundChange={(id) => setCase({ background: id })}
        />
        <TrophyList stats={stats} items={items} held={held} onPick={setHeld} />
        <ShelfStats stats={stats} points={points} />
      </div>
    </div>
  );
}
