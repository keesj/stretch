import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Button } from "./Button";
import {
  loadFromStorage,
  saveToStorage,
  DEFAULT_SETTINGS,
  type Settings,
} from "../utils/storage";
import {
  activeChallenge,
  getChallengeStatus,
  loadChallengeState,
  todayKey,
} from "../utils/challenge";
import { shouldFireReminder } from "../utils/reminder";
import { useDataRevision } from "../sync/dataChange";

/** How often the due time is re-checked while the app is open. */
const CHECK_INTERVAL_MS = 30 * 1000;

/**
 * The challenge reminder: once a day at the configured time, warns (an
 * in-app banner plus, when browser notifications are allowed, a Web
 * Notification) that today's challenge is still pending. Mounted once in
 * App so it works on every page.
 *
 * The "last fired" marker is per device (not synced): reminding is a
 * delivery detail, not account data.
 */
export function ChallengeReminder() {
  const navigate = useNavigate();
  const [visible, setVisible] = useState(false);
  const revision = useDataRevision();
  const firstDataChange = useRef(true);

  const check = useCallback(() => {
    const now = new Date();
    const settings = loadFromStorage<Settings>("settings", DEFAULT_SETTINGS);
    if (!settings.remindEnabled) return;
    const challenge = activeChallenge(now);
    const status = getChallengeStatus(challenge, loadChallengeState(challenge), now);
    // Only nudge while the challenge is actually running: not before it
    // opens, not after it finished.
    if (status.status !== "active" || status.todayDone) return;
    const last = loadFromStorage("stretch.reminder", "");
    if (
      !shouldFireReminder({
        remindTime: settings.remindTime,
        now,
        todayDone: status.todayDone,
        lastReminderDate: last === "" ? null : last,
      })
    ) {
      return;
    }
    // Fire: mark the day, show the banner, and — when allowed — also a
    // browser notification.
    saveToStorage("stretch.reminder", todayKey(now));
    setVisible(true);
    if (
      settings.notificationsEnabled &&
      typeof Notification !== "undefined" &&
      Notification.permission === "granted"
    ) {
      try {
        // Web Notifications are only available through the constructor, and
        // the instance is intentionally not used.
        // oxlint-disable-next-line eslint/no-new
        new Notification("Time for your challenge", {
          body: "You haven't done today's challenge yet.",
          tag: "stretch-challenge-reminder",
        });
      } catch {
        // Notifications unavailable (unsupported context) — the in-app
        // banner still covers the warning.
      }
    }
  }, []);

  useEffect(() => {
    check();
    const interval = window.setInterval(check, CHECK_INTERVAL_MS);
    // Opening the app later in the day fires immediately (catch-up).
    const onFocus = () => check();
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [check]);

  // A sync round may have completed today's challenge (here or on another
  // device): stop nagging.
  useEffect(() => {
    if (firstDataChange.current) {
      firstDataChange.current = false;
      return;
    }
    const now = new Date();
    const challenge = activeChallenge(now);
    const status = getChallengeStatus(challenge, loadChallengeState(challenge), now);
    if (status.status !== "active" || status.todayDone) setVisible(false);
    // revision is the data-change trigger, not a value the body reads.
    // oxlint-disable-next-line react/exhaustive-effect-dependencies
  }, [revision]);

  if (!visible) return null;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      role="alert"
      className="fixed inset-x-4 bottom-20 z-50 mx-auto max-w-md"
    >
      <div className="flex items-center gap-3 rounded-xl bg-white/95 p-4 shadow-lg backdrop-blur dark:bg-gray-800/95">
        <span className="text-2xl" aria-hidden>
          ⏰
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Time for your challenge</p>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            You haven't done today's hold yet.
          </p>
        </div>
        <Button
          onClick={() => {
            setVisible(false);
            navigate("/challenge");
          }}
        >
          Do it now
        </Button>
        <button
          type="button"
          aria-label="Dismiss reminder"
          onClick={() => setVisible(false)}
          className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
        >
          ✕
        </button>
      </div>
    </motion.div>
  );
}
