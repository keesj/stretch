import { useSyncExternalStore } from "react";

/**
 * The app's data-change signal.
 *
 * The projection blobs in localStorage remain the source of truth (they
 * survive reloads); this module only tells interested components that the
 * blobs changed, so they re-read them. It replaces the old
 * `window.dispatchEvent(new CustomEvent("stretch:data"))` string event:
 * the trigger now lives next to the subscription, and both sides are
 * typed instead of a magic string.
 *
 * Fired after a sync round folds in remote ops (useSyncStore) — i.e. the
 * same moment the old event fired. Local mutations are picked up by the
 * pages that perform them (the record helpers return the new state) and
 * by every remount, exactly as before.
 */

type Listener = () => void;

const listeners = new Set<Listener>();
let revision = 0;

/** Subscribe to data changes; returns the unsubscribe function. */
export function onDataChanged(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Monotonic revision of the projection blobs (0 until the first change). */
export function dataRevision(): number {
  return revision;
}

/** Call after a projection rewrite has happened (new ops folded in). */
export function notifyDataChanged(): void {
  revision += 1;
  for (const listener of [...listeners]) listener();
}

/**
 * The current data revision as a hook: re-renders the component whenever
 * the projection blobs change (see onDataChanged). Use it as a dependency
 * for blob reads, e.g. `useMemo(() => loadChallengeState(c), [c, revision])`.
 */
export function useDataRevision(): number {
  return useSyncExternalStore(
    (onStoreChange) => onDataChanged(onStoreChange),
    dataRevision
  );
}
