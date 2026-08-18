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
  } catch (error: any) {
    console.warn(`Failed to load from localStorage for key "${key}":`, error?.message || error);
    return defaultValue;
  }
}

export function saveToStorage<T>(key: StorageKey, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error: any) {
    console.warn(`Failed to save to localStorage for key "${key}":`, error?.message || error);
    // Silently fail — app can still function without localStorage
  }
}

export function clearStorage(key: StorageKey): void {
  try {
    localStorage.removeItem(key);
  } catch (error: any) {
    console.warn(`Failed to remove from localStorage for key "${key}":`, error?.message || error);
  }
}