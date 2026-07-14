export type StorageKey =
  | "completedSessions"
  | "streak"
  | "lastSessionDate"
  | "settings"
  | "activeSession";

export interface Settings {
  theme: "light" | "dark" | "system";
  soundEnabled: boolean;
  hapticEnabled: boolean;
}

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
};

export function loadFromStorage<T>(key: StorageKey, defaultValue: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : defaultValue;
  } catch {
    return defaultValue;
  }
}

export function saveToStorage<T>(key: StorageKey, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Error saving to localStorage for key "${key}":`, error);
  }
}

export function clearStorage(key: StorageKey): void {
  localStorage.removeItem(key);
}