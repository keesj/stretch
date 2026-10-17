import { describe, it, expect } from "vitest";
import challengesRaw from "./challenges.json";
import routinesRaw from "./routines.json";
import stretchesRaw from "./stretches.json";
import { challenges } from "./challenges";
import { routines } from "./routines";
import { stretches } from "./stretches";
import {
  DataValidationError,
  validateChallenges,
  validateRoutines,
  validateStretches,
} from "./validate";
import type { Stretch } from "../types/stretch";

type Raw = Record<string, unknown>;

function clone<T>(value: T): Raw {
  return JSON.parse(JSON.stringify(value)) as Raw;
}

function expectFailure(fn: () => unknown, fragment: string) {
  expect(fn).toThrow(DataValidationError);
  expect(fn).toThrow(fragment);
}

/** The real config files must pass validation — this is the import-time check, tested. */
describe("validated config", () => {
  it("the shipped challenges.json passes", () => {
    expect(challenges).toHaveLength(2);
    expect(challenges.map((c) => c.syncId)).toEqual(["plank", "plank-max"]);
  });

  it("the shipped stretches.json passes", () => {
    expect(stretches.length).toBeGreaterThan(0);
    expect(stretches.every((s) => s.id && s.title && s.duration > 0)).toBe(true);
  });

  it("the shipped routines.json passes and references only known stretches", () => {
    expect(routines.length).toBeGreaterThan(0);
    const ids = new Set(stretches.map((s) => s.id));
    for (const r of routines) {
      for (const stretchId of r.stretches) expect(ids.has(stretchId)).toBe(true);
    }
  });
});

describe("validateStretches", () => {
  const good: Raw[] = JSON.parse(JSON.stringify(stretches)) as Raw[];

  it("accepts the shipped file", () => {
    expect(validateStretches(stretchesRaw)).toHaveLength(good.length);
  });

  it("rejects an empty file", () => {
    expectFailure(() => validateStretches([]), "non-empty array");
    expectFailure(() => validateStretches(null), "non-empty array");
  });

  it("rejects a bad difficulty", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[0].difficulty = "expert";
    expectFailure(() => validateStretches(raw), "difficulty must be one of");
  });

  it("rejects a missing duration and a non-positive duration", () => {
    const missing = JSON.parse(JSON.stringify(good)) as Raw[];
    delete missing[0].duration;
    expectFailure(() => validateStretches(missing), "duration");
    const zero = JSON.parse(JSON.stringify(good)) as Raw[];
    zero[0].duration = 0;
    expectFailure(() => validateStretches(zero), "duration");
  });

  it("rejects unknown fields (typos)", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[0].duraton = 30;
    expectFailure(() => validateStretches(raw), 'unknown field "duraton"');
  });

  it("rejects duplicate ids", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[1].id = raw[0].id;
    expectFailure(() => validateStretches(raw), "duplicate id");
  });

  it("rejects a bad side", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[0].side = "both";
    expectFailure(() => validateStretches(raw), "side must be 'left' or 'right'");
  });
});

describe("validateRoutines", () => {
  const good: Raw[] = JSON.parse(JSON.stringify(routines)) as Raw[];

  it("accepts the shipped file", () => {
    expect(validateRoutines(routinesRaw, stretches)).toHaveLength(good.length);
  });

  it("rejects a reference to an unknown stretch", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[0].stretches = ["no-such-stretch"];
    expectFailure(() => validateRoutines(raw, stretches), 'unknown stretch id "no-such-stretch"');
  });

  it("rejects an empty stretch list", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[0].stretches = [];
    expectFailure(() => validateRoutines(raw, stretches), "non-empty array");
  });
});

describe("validateChallenges", () => {
  const good: Raw[] = JSON.parse(JSON.stringify(challenges)) as Raw[];
  const anyStretch: Stretch = stretches[0];

  it("accepts the shipped file", () => {
    expect(validateChallenges(challengesRaw, stretches)).toHaveLength(good.length);
  });

  it("rejects an unknown exerciseId", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[0].exerciseId = "no-such-exercise";
    expectFailure(() => validateChallenges(raw, [anyStretch]), 'exerciseId "no-such-exercise"');
  });

  it("rejects a bad syncId", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[0].syncId = "Plank Max!";
    expectFailure(() => validateChallenges(raw, stretches), "syncId");
  });

  it("rejects a malformed startDate", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[0].startDate = "26/09/2026";
    expectFailure(() => validateChallenges(raw, stretches), "startDate");
  });

  it("rejects missing scoring-variant fields", () => {
    const threshold = clone(good.find((c) => c.scoring === "threshold")!);
    delete threshold.milestoneSeconds;
    expectFailure(() => validateChallenges([threshold], stretches), "milestoneSeconds");

    const duration = clone(good.find((c) => c.scoring === "duration")!);
    delete duration.incrementPoints;
    expectFailure(() => validateChallenges([duration], stretches), "incrementPoints");
  });

  it("rejects unknown fields (typos)", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[0].baseSecond = 120;
    expectFailure(() => validateChallenges(raw, stretches), 'unknown field "baseSecond"');
  });

  it("rejects an unknown scoring value", () => {
    const raw = JSON.parse(JSON.stringify(good)) as Raw[];
    raw[0].scoring = "hybrid";
    expectFailure(() => validateChallenges(raw, stretches), "scoring must be");
  });

  it("rejects maxSeconds below baseSeconds for duration challenges", () => {
    const raw = clone(good.find((c) => c.scoring === "duration")!);
    raw.maxSeconds = 10;
    expectFailure(() => validateChallenges([raw], stretches), "maxSeconds must be at least baseSeconds");
  });
});
