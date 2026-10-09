import { create } from "zustand";
import { bootstrap, pullOps, pushOps, SyncError } from "./syncClient";
import {
  clearRole,
  clearToken,
  deviceLabel,
  getCredentials,
  getToken,
  setRole,
  setToken,
} from "./identity";
import { appendOps, freezeLegacyIfNeeded, loadJournal, projectWith, quarantineOps } from "./journal";
import type { Op } from "./types";
import { useDeviceIdentity } from "./useDeviceIdentity";

interface SyncState {
  lastSyncAt: number | null;
  lastError: string | null;
  syncing: boolean;
  syncNow: () => Promise<void>;
}

/**
 * Make sure this device has a token: after a fresh install (or a token
 * reissue elsewhere) the account has no active tokens, so presenting the
 * account id once bootstraps the first device token (the owner).
 */
async function ensureToken(): Promise<void> {
  if (getToken()) return;
  const { accountId } = getCredentials();
  try {
    const { token, role } = await bootstrap(accountId, deviceLabel());
    setToken(token);
    setRole(role);
    useDeviceIdentity.getState().refresh();
  } catch (err) {
    if (err instanceof SyncError && err.status === 409) {
      throw new Error(
        "This account is already linked elsewhere — paste its pairing code in the Sync card."
      );
    }
    throw err;
  }
}

/** Push the journal (quarantining server-rejected ops), then pull. */
async function syncRound(ops: Op[]): Promise<void> {
  if (ops.length > 0) {
    try {
      await pushOps(ops);
    } catch (err) {
      const rejected = err instanceof SyncError ? err.invalid : undefined;
      if (err instanceof SyncError && err.status === 400 && rejected && rejected.length > 0) {
        quarantineOps(rejected.map((i) => i.id));
        await pushOps(loadJournal());
      } else {
        throw err;
      }
    }
  }

  const { ops: remote } = await pullOps();
  const fresh = remote.filter((op) => !ops.some((local) => local.id === op.id));
  if (fresh.length > 0) {
    const merged = appendOps(fresh);
    projectWith(merged);
    // Same-tab refresh for pages that read the projection blobs.
    window.dispatchEvent(new CustomEvent("stretch:data"));
  }
}

/**
 * One sync round trip: push the whole local journal (idempotent), then
 * pull the account's full journal from the server and fold any new ops in.
 * Pushing first means a pull that races a local edit still sees it.
 */
export const useSyncStore = create<SyncState>((set, get) => ({
  lastSyncAt: null,
  lastError: null,
  syncing: false,

  syncNow: async () => {
    if (get().syncing) return;
    set({ syncing: true });
    try {
      freezeLegacyIfNeeded();
      let journal = loadJournal();
      try {
        await ensureToken();
        await syncRound(journal);
      } catch (err) {
        if (!(err instanceof SyncError) || err.status !== 401) throw err;
        // The token died on the server (revoked, or the account's tokens
        // were reset). Drop it and retry once: bootstrap succeeds when the
        // account has no live tokens (this device becomes the owner) and
        // fails with the pairing-code hint otherwise.
        clearToken();
        clearRole();
        useDeviceIdentity.getState().detach();
        await ensureToken();
        journal = loadJournal();
        await syncRound(journal);
      }
      set({ lastSyncAt: Date.now(), lastError: null });
    } catch (err) {
      set({ lastError: err instanceof Error ? err.message : String(err) });
    } finally {
      set({ syncing: false });
    }
  },
}));
