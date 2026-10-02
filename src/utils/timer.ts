export function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

export function formatDuration(seconds: number): string {
  return seconds >= 60 ? `${Math.floor(seconds / 60)} min` : `${seconds}s`;
}

export function parseTime(timeString: string): number {
  const parts = timeString.split(":").map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}