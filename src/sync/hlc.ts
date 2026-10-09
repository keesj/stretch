/**
 * Hybrid logical clock encoded as a sortable string:
 *   <ms:8 base36><counter:3 base36><device:8>
 * Lexicographic comparison is total order: time first, then the per-ms
 * counter (multiple ops in the same millisecond), then the device suffix
 * (equal time + counter on different devices). No wall-clock agreement is
 * required between devices — receiving a later remote op simply advances
 * the local clock, which is how skewed clocks are handled.
 */

const MS_WIDTH = 8;
const COUNTER_WIDTH = 3;
const DEVICE_WIDTH = 8;

export interface ParsedHlc {
  ms: number;
  counter: number;
  device: string;
}

export function parseHlc(hlc: string): ParsedHlc {
  return {
    ms: parseInt(hlc.slice(0, MS_WIDTH), 36) || 0,
    counter: parseInt(hlc.slice(MS_WIDTH, MS_WIDTH + COUNTER_WIDTH), 36) || 0,
    device: hlc.slice(MS_WIDTH + COUNTER_WIDTH, MS_WIDTH + COUNTER_WIDTH + DEVICE_WIDTH)
  };
}

// First 8 alphanumerics of the device id, zero-padded: keeps the hlc in
// base36 (and lexicographically ordered) for any device id shape.
function deviceSuffix(device: string): string {
  return device
    .toLowerCase()
    .replace(/[^0-9a-z]/g, "")
    .slice(0, DEVICE_WIDTH)
    .padEnd(DEVICE_WIDTH, "0");
}

function encode(ms: number, counter: number, device: string): string {
  return (
    ms.toString(36).padStart(MS_WIDTH, "0") +
    counter.toString(36).padStart(COUNTER_WIDTH, "0") +
    deviceSuffix(device)
  );
}

/**
 * The next local clock value: at least the wall clock, and strictly after
 * `lastHlc` (the highest clock this device has seen, local or remote).
 */
export function makeHlc(lastHlc: string | null, nowMs: number, device: string): string {
  const last = lastHlc ? parseHlc(lastHlc) : null;
  const ms = Math.max(nowMs, last?.ms ?? 0);
  const counter = last && last.ms === ms ? last.counter + 1 : 0;
  return encode(ms, counter, device);
}

/** Strict total order: -1, 0, 1. */
export function compareHlc(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The wall-clock milliseconds carried by an hlc (approximate for skew cases). */
export function hlcMs(hlc: string): number {
  return parseHlc(hlc).ms;
}

/** The highest of the given hlc values, or null for an empty list. */
export function maxHlc(hlcs: string[]): string | null {
  let max: string | null = null;
  for (const hlc of hlcs) {
    if (max === null || compareHlc(hlc, max) > 0) max = hlc;
  }
  return max;
}
