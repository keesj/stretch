import { describe, test, expect } from 'vitest';
import { makeHlc, parseHlc, compareHlc, hlcMs, maxHlc } from './hlc';

const deviceA = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
const deviceB = 'ffff-0000-1111-2222-333333333333';

describe('makeHlc', () => {
  test('starts at the wall clock with counter zero', () => {
    const hlc = makeHlc(null, 1_000_000, deviceA);
    expect(parseHlc(hlc)).toEqual({ ms: 1_000_000, counter: 0, device: 'aaaaaaaa' });
  });

  test('increments the counter for multiple ops in the same millisecond', () => {
    const last = makeHlc(null, 1_000_000, deviceA);
    const second = makeHlc(last, 1_000_000, deviceA);
    const third = makeHlc(second, 1_000_000, deviceA);
    expect(parseHlc(second).counter).toBe(1);
    expect(parseHlc(third).counter).toBe(2);
    expect(compareHlc(third, second)).toBe(1);
    expect(compareHlc(second, last)).toBe(1);
  });

  test('resets the counter when the wall clock advances', () => {
    let last = makeHlc(null, 1_000_000, deviceA);
    last = makeHlc(last, 1_000_000, deviceA);
    const later = makeHlc(last, 1_000_001, deviceA);
    expect(parseHlc(later)).toMatchObject({ ms: 1_000_001, counter: 0 });
  });

  test('advances past a skewed (behind) wall clock', () => {
    const advanced = makeHlc(null, 2_000_000, deviceA);
    // Local clock is broken/skewed: wall time is far in the past
    const next = makeHlc(advanced, 500, deviceA);
    expect(compareHlc(next, advanced)).toBe(1);
    expect(parseHlc(next).ms).toBe(2_000_000);
  });

  test('advances past a received remote clock', () => {
    const remote = makeHlc(null, 3_000_000, deviceB);
    // Device A receives the remote op and records it as its last seen hlc
    const next = makeHlc(remote, 1_000_000, deviceA);
    expect(compareHlc(next, remote)).toBe(1);
    expect(hlcMs(next)).toBe(3_000_000);
  });

  test('different devices at equal time+counter get a deterministic tie-break', () => {
    const a = makeHlc(null, 1_000_000, deviceA);
    const b = makeHlc(null, 1_000_000, deviceB);
    expect(a).not.toBe(b);
    expect(compareHlc(a, b)).toBe(-1); // 'aaaaaaaa' < 'ffff'
    expect(compareHlc(b, a)).toBe(1);
    expect(compareHlc(a, a)).toBe(0);
  });
});

describe('device id sanitization', () => {
  test('hyphens are stripped so the hlc stays base36', () => {
    const hlc = makeHlc(null, 1_000_000, 'dev-1790455059405');
    expect(hlc).toMatch(/^[0-9a-z]{19}$/);
    expect(parseHlc(hlc).device).toBe('dev17904');
  });

  test('short device ids are zero-padded to width 8', () => {
    const hlc = makeHlc(null, 1_000_000, 'ab');
    expect(hlc).toMatch(/^[0-9a-z]{19}$/);
    expect(parseHlc(hlc).device).toBe('ab000000');
  });
});

describe('maxHlc', () => {
  test('returns null for an empty list and the max otherwise', () => {
    expect(maxHlc([])).toBeNull();
    const a = makeHlc(null, 1_000_000, deviceA);
    const b = makeHlc(a, 1_000_000, deviceA);
    expect(maxHlc([a, b])).toBe(b);
    expect(maxHlc([b, a])).toBe(b);
  });
});
