import { describe, it, expect } from "vitest";
import { shouldFireReminder } from "./reminder";

const TODAY = "2026-10-18";

describe("shouldFireReminder", () => {
  const base = {
    remindTime: "19:00",
    now: new Date(2026, 9, 18, 12),
    todayDone: false,
    lastReminderDate: null as string | null,
  };

  it("does not fire before the configured time", () => {
    expect(shouldFireReminder(base)).toBe(false);
  });

  it("fires once the configured time has passed", () => {
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 18, 19, 0) })).toBe(true);
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 18, 23, 59) })).toBe(true);
  });

  it("never fires on a day the challenge is already done", () => {
    expect(shouldFireReminder({ ...base, now: new Date(2026, 9, 18, 20), todayDone: true })).toBe(false);
  });

  it("fires at most once per day (the marker is the date it last fired)", () => {
    expect(
      shouldFireReminder({ ...base, now: new Date(2026, 9, 18, 20), lastReminderDate: TODAY })
    ).toBe(false);
    // The next day (past 19:00) it is due again.
    expect(
      shouldFireReminder({ ...base, now: new Date(2026, 9, 19, 19, 30), lastReminderDate: TODAY })
    ).toBe(true);
  });

  it("ignores a malformed time instead of guessing", () => {
    expect(shouldFireReminder({ ...base, remindTime: "25:99", now: new Date(2026, 9, 18, 20) })).toBe(false);
  });
});
