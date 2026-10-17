/**
 * Runtime validation for the hand-edited data files
 * (challenges.json / stretches.json / routines.json).
 *
 * These files are configuration, not code: a typo in a field name would
 * otherwise slip past the TypeScript `as` casts at import time and surface
 * as a runtime surprise weeks later. Each validator takes the raw parsed
 * JSON and throws with a precise message naming the offending entry, so a
 * bad file fails the app (and the tests) immediately, at import time.
 *
 * The validators are strict on purpose: unknown fields are rejected,
 * because that is how typos are caught.
 */
import type { Challenge, DurationChallenge, ThresholdChallenge } from "../types/challenge";
import type { Routine } from "../types/routine";
import type { Stretch } from "../types/stretch";
import { SYNC_ID_RE } from "../sync/types";

export class DataValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DataValidationError";
  }
}

function fail(path: string, problem: string): never {
  throw new DataValidationError(`Invalid data at ${path}: ${problem}`);
}

function asObject(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    fail(path, "must be an object");
  }
  return value as Record<string, unknown>;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isInt(value: unknown): value is number {
  return Number.isInteger(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isString);
}

function str(field: Record<string, unknown>, name: string, path: string, min = 1): string {
  const value = field[name];
  if (!isString(value) || value.length < min) {
    fail(path, `${name} must be a non-empty string`);
  }
  return value;
}

function num(field: Record<string, unknown>, name: string, path: string, check: (v: number) => boolean): number {
  const value = field[name];
  if (!isNumber(value) || !check(value)) {
    fail(path, `${name} is missing or not a valid number`);
  }
  return value;
}

/** Rejects any key outside the allowed set — this is how typos are caught. */
function rejectUnknown(field: Record<string, unknown>, allowed: readonly string[], path: string): void {
  for (const key of Object.keys(field)) {
    if (!allowed.includes(key)) {
      fail(path, `unknown field "${key}" (expected one of: ${allowed.join(", ")})`);
    }
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const DIFFICULTIES = new Set(["easy", "medium", "hard"]);
const SIDES = new Set(["left", "right"]);

// --- stretches.json ----------------------------------------------------

export function validateStretches(raw: unknown): Stretch[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail("stretches.json", "must be a non-empty array");
  }
  const allowed = ["id", "title", "duration", "instructions", "bodyParts", "difficulty", "illustration", "animation", "side"];
  const seen = new Set<string>();
  return raw.map((entry, i) => {
    const path = `stretches.json[${i}]`;
    const s = asObject(entry, path);
    rejectUnknown(s, allowed, path);
    const id = str(s, "id", path);
    if (seen.has(id)) fail(path, `duplicate id "${id}"`);
    seen.add(id);
    str(s, "title", path);
    num(s, "duration", path, (v) => v > 0);
    if (!isStringArray(s.instructions) || s.instructions.length === 0) {
      fail(path, "instructions must be a non-empty array of strings");
    }
    if (!isStringArray(s.bodyParts)) {
      fail(path, "bodyParts must be an array of strings");
    }
    if (!isString(s.difficulty) || !DIFFICULTIES.has(s.difficulty)) {
      fail(path, "difficulty must be one of: easy, medium, hard");
    }
    str(s, "illustration", path, 0);
    if (s.animation !== undefined && !isString(s.animation)) {
      fail(path, "animation must be a string");
    }
    if (s.side !== undefined && (!isString(s.side) || !SIDES.has(s.side))) {
      fail(path, "side must be 'left' or 'right'");
    }
    return s as unknown as Stretch;
  });
}

// --- routines.json -------------------------------------------------------

export function validateRoutines(raw: unknown, stretches: readonly Stretch[]): Routine[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail("routines.json", "must be a non-empty array");
  }
  const stretchIds = new Set(stretches.map((s) => s.id));
  const allowed = ["id", "title", "description", "stretches"];
  const seen = new Set<string>();
  return raw.map((entry, i) => {
    const path = `routines.json[${i}]`;
    const r = asObject(entry, path);
    rejectUnknown(r, allowed, path);
    const id = str(r, "id", path);
    if (seen.has(id)) fail(path, `duplicate id "${id}"`);
    seen.add(id);
    str(r, "title", path);
    str(r, "description", path);
    if (!isStringArray(r.stretches) || r.stretches.length === 0) {
      fail(path, "stretches must be a non-empty array of stretch ids");
    }
    for (const stretchId of r.stretches) {
      if (!stretchIds.has(stretchId)) {
        fail(path, `unknown stretch id "${stretchId}" (not in stretches.json)`);
      }
    }
    return r as unknown as Routine;
  });
}

// --- challenges.json -----------------------------------------------------

const CHALLENGE_BASE_FIELDS = [
  "id",
  "syncId",
  "title",
  "description",
  "exerciseId",
  "totalDays",
  "startDate",
  "scoring",
  "baseSeconds",
  "illustration",
];

const THRESHOLD_FIELDS = ["bonusSeconds", "bonusPoints", "milestoneEvery", "milestoneSeconds", "milestonePoints"];
const DURATION_FIELDS = ["basePoints", "incrementSeconds", "incrementPoints", "maxSeconds"];

export function validateChallenges(raw: unknown, stretches: readonly Stretch[]): Challenge[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    fail("challenges.json", "must be a non-empty array");
  }
  const stretchIds = new Set(stretches.map((s) => s.id));
  const seenSync = new Set<string>();
  return raw.map((entry, i) => {
    const path = `challenges.json[${i}]`;
    const c = asObject(entry, path);

    // Base shape (shared by both scoring variants).
    str(c, "id", path);
    const syncId = str(c, "syncId", path);
    if (!SYNC_ID_RE.test(syncId)) {
      fail(path, `syncId "${syncId}" must match ${SYNC_ID_RE} (lowercase, digits, dashes)`);
    }
    if (seenSync.has(syncId)) fail(path, `duplicate syncId "${syncId}"`);
    seenSync.add(syncId);
    str(c, "title", path);
    str(c, "description", path);
    const exerciseId = str(c, "exerciseId", path);
    if (!stretchIds.has(exerciseId)) {
      fail(path, `exerciseId "${exerciseId}" is not a stretch in stretches.json`);
    }
    num(c, "totalDays", path, (v) => isInt(v) && v >= 1);
    num(c, "baseSeconds", path, (v) => v >= 0);
    str(c, "illustration", path, 0);
    if (c.startDate !== undefined && (c.startDate === null || !isString(c.startDate) || !DATE_RE.test(c.startDate))) {
      fail(path, "startDate must be a YYYY-MM-DD string (or omitted for self-start challenges)");
    }

    // Scoring variant.
    if (c.scoring === "threshold") {
      rejectUnknown(c, [...CHALLENGE_BASE_FIELDS, ...THRESHOLD_FIELDS], path);
      num(c, "bonusSeconds", path, (v) => v >= 0);
      num(c, "bonusPoints", path, (v) => v >= 0);
      num(c, "milestoneEvery", path, (v) => isInt(v) && v >= 0);
      num(c, "milestoneSeconds", path, (v) => isInt(v) && v > 0);
      num(c, "milestonePoints", path, (v) => v > 0);
      return c as unknown as ThresholdChallenge;
    }
    if (c.scoring === "duration") {
      rejectUnknown(c, [...CHALLENGE_BASE_FIELDS, ...DURATION_FIELDS], path);
      num(c, "basePoints", path, (v) => v > 0);
      num(c, "incrementSeconds", path, (v) => isInt(v) && v > 0);
      num(c, "incrementPoints", path, (v) => v > 0);
      const maxSeconds = num(c, "maxSeconds", path, (v) => isInt(v) && v > 0);
      if (maxSeconds < num(c, "baseSeconds", path, () => true)) {
        fail(path, "maxSeconds must be at least baseSeconds");
      }
      return c as unknown as DurationChallenge;
    }
    fail(path, "scoring must be 'threshold' or 'duration'");
  });
}
