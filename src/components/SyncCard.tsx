import { useState } from "react";
import { Card } from "./Card";
import { Button } from "./Button";
import { useSyncStore } from "../sync/useSyncStore";
import { useDeviceIdentity } from "../sync/useDeviceIdentity";
import { joinWith } from "../sync/join";
import {
  mintMergeCode,
  mintPairCode,
  redeemMergeCode,
  revokeSelf,
} from "../sync/syncClient";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * The Sync card: link this device to an account (or create one), link
 * other devices, and merge a separate account in (or out). The plain
 * "Sync now" status line doubles as the offline indicator.
 */
export function SyncCard() {
  const { lastSyncAt, lastError, syncing, syncNow } = useSyncStore();
  const { accountId, linked, role, refresh, detach, rotate } = useDeviceIdentity();

  const [pairCode, setPairCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [mergeOutCode, setMergeOutCode] = useState<{ code: string; expiresAt: number } | null>(null);
  const [joinInput, setJoinInput] = useState("");
  const [mergeInInput, setMergeInInput] = useState("");
  const [mergedMessage, setMergedMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const failed = Boolean(lastError) && !syncing;
  const status = syncing
    ? "Syncing…"
    : failed
      ? `Sync failed — ${lastError}`
      : lastSyncAt
        ? `Synced ${formatTime(lastSyncAt)}`
        : "Not synced yet";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const linkDevice = () =>
    run(async () => {
      const code = await mintPairCode();
      setPairCode(code);
      setMergeOutCode(null);
    });

  const join = () =>
    run(async () => {
      await joinWith(joinInput);
      refresh();
      setJoinInput("");
      await syncNow();
    });

  const mergeOut = () =>
    run(async () => {
      const code = await mintMergeCode();
      setMergeOutCode(code);
      setPairCode(null);
    });

  const mergeIn = () =>
    run(async () => {
      const { copied } = await redeemMergeCode(mergeInInput.trim());
      setMergeInInput("");
      setMergeOutCode(null);
      await syncNow();
      setMergedMessage(
        copied > 0
          ? `Merged ${copied} record${copied === 1 ? "" : "s"} from the other account.`
          : "The other account had no new records to merge."
      );
    });

  const signOut = () =>
    run(async () => {
      if (
        typeof confirm === "function" &&
        !confirm("Sign out this device? Its token is revoked now; the account and its data are untouched.")
      ) {
        return;
      }
      await revokeSelf();
      detach();
    });

  const newAccount = () =>
    run(async () => {
      if (
        typeof confirm === "function" &&
        !confirm(
          "Create a brand-new sync account? This device starts fresh (its local records move with it); other devices keep syncing to the old account."
        )
      ) {
        return;
      }
      rotate();
      setMergedMessage(null);
    });

  const codeBlock = (value: string, expiresAt: number) => (
    <div className="mt-2 bg-calm-100 dark:bg-gray-800 rounded-lg p-2">
      <code className="block text-sm select-all break-all">{value}</code>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
        Valid until {formatTime(expiresAt)}.
      </p>
    </div>
  );

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2 mb-1">
        <h2 className="text-lg font-semibold">Sync</h2>
        <Button variant="secondary" onClick={syncNow} disabled={syncing} className="shrink-0">
          Sync now
        </Button>
      </div>
      <p className={`text-sm mb-4 ${failed ? "text-red-500" : "text-gray-500 dark:text-gray-400"}`}>
        {status}
      </p>

      <div>
        <p className="text-xs text-gray-500 dark:text-gray-400">Account id</p>
        <div className="flex items-center gap-2 mt-1">
          <code className="text-xs bg-calm-100 dark:bg-gray-800 rounded px-2 py-1 select-all break-all min-w-0">
            {accountId}
          </code>
          {linked && role && (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 shrink-0">
              {role === "owner" ? "owner device" : "linked device"}
            </span>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">Devices</p>
        {linked ? (
          <div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={linkDevice} disabled={busy || role !== "owner"}>
                Link a device
              </Button>
              <Button variant="secondary" onClick={mergeOut} disabled={busy || role !== "owner"}>
                Get merge code
              </Button>
            </div>
            {role !== "owner" && (
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-2">
                Ask the owner device to create the code.
              </p>
            )}
            {pairCode && (
              <>
                {codeBlock(pairCode.code, pairCode.expiresAt)}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  On the other device: Settings → Sync → paste the code and Join.
                </p>
              </>
            )}
            {mergeOutCode && (
              <>
                {codeBlock(mergeOutCode.code, mergeOutCode.expiresAt)}
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  On the account to merge INTO: Settings → Sync → “Merge another account” → paste
                  this code. That account takes a copy of this account’s records.
                </p>
              </>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <input
              value={joinInput}
              onChange={(e) => {
                setJoinInput(e.target.value);
                setError(null);
              }}
              placeholder="Paste a pairing code or account id"
              aria-label="Paste a pairing code or account id"
              className="input flex-1 min-w-0 py-1.5 px-2 text-sm"
            />
            <Button onClick={join} disabled={busy || !joinInput.trim()} className="shrink-0">
              Join
            </Button>
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3">
        <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
          Merge another account
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mb-2">
          Copy records from a separate account (e.g. a replacement phone that kept its own
          history) into this account.
        </p>
        <div className="flex items-center gap-2">
          <input
            value={mergeInInput}
            onChange={(e) => {
              setMergeInInput(e.target.value);
              setError(null);
            }}
            placeholder="Merge code from the other device"
            aria-label="Merge code from the other device"
            className="input flex-1 min-w-0 py-1.5 px-2 text-sm"
          />
          <Button
            variant="secondary"
            onClick={mergeIn}
            disabled={busy || !mergeInInput.trim() || role !== "owner"}
            className="shrink-0"
          >
            Merge in
          </Button>
        </div>
        {mergedMessage && (
          <p className="text-xs text-primary-600 dark:text-primary-400 mt-2">{mergedMessage}</p>
        )}
      </div>

      <div className="mt-3 border-t border-gray-200 dark:border-gray-700 pt-3 space-y-2">
        {error && <p className="text-xs text-red-500">{error}</p>}
        {linked && (
          <Button variant="outline" onClick={signOut} disabled={busy} className="w-full text-sm">
            Sign out this device
          </Button>
        )}
        <Button variant="outline" onClick={newAccount} disabled={busy} className="w-full text-sm">
          New account
        </Button>
      </div>
    </Card>
  );
}
