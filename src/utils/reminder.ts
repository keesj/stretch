import { REMIND_TIME_RE } from "./storage";
import { todayKey } from "./challenge";

/** `remindTime` on the same calendar day as `now`, or null if malformed. */
function dueTimeAt(remindTime: string, now: Date): Date | null {
  if (!REMIND_TIME_RE.test(remindTime)) return null;
  const due = new Date(now);
  due.setHours(Number(remindTime.slice(0, 2)), Number(remindTime.slice(3, 5)), 0, 0);
  return due;
}

/**
 * Pure decision: should the challenge reminder fire at `now`?
 *
 * It fires at most once per day (the `lastReminderDate` marker), only when
 * the configured time has passed, and never on a day the challenge is
 * already done.
 */
export function shouldFireReminder(args: {
  /** "HH:MM" (24h) the reminder fires at. */
  remindTime: string;
  now: Date;
  /** Today's challenge is already completed. */
  todayDone: boolean;
  /** Date key (YYYY-MM-DD) the reminder last fired on. */
  lastReminderDate: string | null;
}): boolean {
  const { remindTime, now, todayDone, lastReminderDate } = args;
  if (todayDone) return false;
  const today = todayKey(now);
  if (lastReminderDate === today) return false;
  const due = dueTimeAt(remindTime, now);
  return due !== null && now >= due;
}
