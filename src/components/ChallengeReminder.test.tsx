import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { ChallengeReminder } from "./ChallengeReminder";
import { DEFAULT_SETTINGS, type Settings } from "../utils/storage";

const mockUseNavigate = vi.hoisted(() => vi.fn());

vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return {
    ...actual,
    useNavigate: () => mockUseNavigate,
  };
});

/**
 * Fixed "now": Sat Oct 18, 2026, noon. The plank cohort (opened
 * 2026-09-26) is mid-run, so it is the active challenge on this day.
 */
const NOW = new Date(2026, 9, 18, 12);
const TODAY = "2026-10-18";

function seedSettings(overrides: Partial<Settings> = {}) {
  localStorage.setItem("settings", JSON.stringify({ ...DEFAULT_SETTINGS, ...overrides }));
}

/** The plank cohort, mid-run, with today not yet done. */
function seedPlankActive(todayDone = false) {
  const days = todayDone
    ? [{ date: TODAY, seconds: 120 }]
    : [{ date: "2026-10-17", seconds: 120 }];
  // The legacy challenge keeps its historical storage key.
  localStorage.setItem("plankChallenge", JSON.stringify({ startedAt: "2026-09-26", days }));
}

/** A stub Notification with a fixed permission, recording instances. */
function mockNotification(permission: "default" | "granted" | "denied") {
  const instances: { title: string; options?: NotificationOptions }[] = [];
  class MockNotification {
    static permission = permission;
    constructor(title: string, options?: NotificationOptions) {
      instances.push({ title, options });
    }
  }
  vi.stubGlobal("Notification", MockNotification);
  return instances;
}

describe("ChallengeReminder", () => {
  beforeEach(() => {
    mockUseNavigate.mockClear();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("renders nothing while the reminder is disabled (the default)", () => {
    seedSettings();
    seedPlankActive();
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.queryByText("Time for your challenge")).not.toBeInTheDocument();
  });

  it("shows the banner once the time is up and today's challenge is pending", () => {
    seedSettings({ remindEnabled: true, remindTime: "08:00" });
    seedPlankActive();
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.getByText("Time for your challenge")).toBeInTheDocument();
    expect(screen.getByText("You haven't done today's hold yet.")).toBeInTheDocument();
  });

  it("does not show the banner before the configured time", () => {
    seedSettings({ remindEnabled: true, remindTime: "21:00" });
    seedPlankActive();
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.queryByText("Time for your challenge")).not.toBeInTheDocument();
  });

  it("does not show the banner when today's challenge is already done", () => {
    seedSettings({ remindEnabled: true, remindTime: "08:00" });
    seedPlankActive(true);
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.queryByText("Time for your challenge")).not.toBeInTheDocument();
  });

  it("does not show the banner before the cohort has opened", () => {
    vi.setSystemTime(new Date(2026, 8, 1, 12)); // Sep 1: before the Sep 26 open
    seedSettings({ remindEnabled: true, remindTime: "08:00" });
    seedPlankActive();
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.queryByText("Time for your challenge")).not.toBeInTheDocument();
  });

  it("writes the once-a-day marker when it fires, and does not re-fire the same day", () => {
    seedSettings({ remindEnabled: true, remindTime: "08:00" });
    seedPlankActive();
    const { unmount } = render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.getByText("Time for your challenge")).toBeInTheDocument();
    // saveToStorage JSON-encodes the value.
    expect(JSON.parse(localStorage.getItem("stretch.reminder") ?? "")).toBe(TODAY);
    unmount();

    // Same day, marker present: mounting again stays quiet.
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.queryByText("Time for your challenge")).not.toBeInTheDocument();
  });

  it("dismisses with the close button", async () => {
    const user = userEvent.setup();
    seedSettings({ remindEnabled: true, remindTime: "08:00" });
    seedPlankActive();
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.getByText("Time for your challenge")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Dismiss reminder" }));
    expect(screen.queryByText("Time for your challenge")).not.toBeInTheDocument();
  });

  it("Do it now dismisses the banner and navigates to the challenge", async () => {
    const user = userEvent.setup();
    seedSettings({ remindEnabled: true, remindTime: "08:00" });
    seedPlankActive();
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    await user.click(screen.getByRole("button", { name: "Do it now" }));
    expect(mockUseNavigate).toHaveBeenCalledWith("/challenge");
    expect(screen.queryByText("Time for your challenge")).not.toBeInTheDocument();
  });

  it("also sends a browser notification when notifications are on and allowed", () => {
    const instances = mockNotification("granted");
    seedSettings({ remindEnabled: true, remindTime: "08:00", notificationsEnabled: true });
    seedPlankActive();
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.getByText("Time for your challenge")).toBeInTheDocument();
    expect(instances).toHaveLength(1);
    expect(instances[0].title).toBe("Time for your challenge");
  });

  it("skips the browser notification when notifications are off", () => {
    const instances = mockNotification("granted");
    seedSettings({ remindEnabled: true, remindTime: "08:00", notificationsEnabled: false });
    seedPlankActive();
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.getByText("Time for your challenge")).toBeInTheDocument();
    expect(instances).toHaveLength(0);
  });

  it("skips the browser notification without permission (the banner still shows)", () => {
    const instances = mockNotification("denied");
    seedSettings({ remindEnabled: true, remindTime: "08:00", notificationsEnabled: true });
    seedPlankActive();
    render(
      <MemoryRouter>
        <ChallengeReminder />
      </MemoryRouter>
    );
    expect(screen.getByText("Time for your challenge")).toBeInTheDocument();
    expect(instances).toHaveLength(0);
  });
});
