export type StorageKey =
  | "completedSessions"
  | "streak"
  | "lastSessionDate"
  | "settings"
  | "activeSession"
  // Legacy blob of the original self-start challenge (syncId "plank");
  // every other challenge projects to `challenge:<syncId>`.
  | "plankChallenge"
  | `challenge:${string}`
  // Display identity for the squad views (name + avatar).
  | "stretch.profile"
  // Trophy chamber decoration (background + shelf layout).
  | "stretch.trophyCase"
  // Last date the challenge reminder fired (per device, not synced).
  | "stretch.reminder";

export interface Settings {
  theme: "light" | "dark" | "system";
  soundEnabled: boolean;
  hapticEnabled: boolean;
  /** Master switch for browser notifications (Web Notification API). */
  notificationsEnabled: boolean;
  /**
   * Challenge reminder: warn once a day at `remindTime` when today's
   * challenge has not been completed yet.
   */
  remindEnabled: boolean;
  /** 24h time ("HH:MM") the challenge reminder fires at. */
  remindTime: string;
}

/** Strict 24h "HH:MM" — used to validate settings.remindTime on every layer. */
export const REMIND_TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

export interface CompletedSession {
  id: string;
  routineId: string;
  routineTitle: string;
  duration: number;
  completedAt: string;
}

export interface ActiveSession {
  routineId: string;
  currentExerciseIndex: number;
  startTime: string;
  elapsedSeconds: number;
  isPaused: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  soundEnabled: true,
  hapticEnabled: true,
  notificationsEnabled: false,
  remindEnabled: false,
  remindTime: "19:00",
};

export function loadFromStorage<T>(key: StorageKey, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch (error) {
    console.warn(`Failed to load from localStorage for key "${key}":`, error instanceof Error ? error.message : error);
    return defaultValue;
  }
}

export function saveToStorage<T>(key: StorageKey, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Failed to save to localStorage for key "${key}":`, error instanceof Error ? error.message : error);
    // Silently fail — app can still function without localStorage
  }
}

export function clearStorage(key: StorageKey): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Failed to remove from localStorage for key "${key}":`, error instanceof Error ? error.message : error);
  }
}