import { describe, it, expect } from 'vitest';
import { formatTime, parseTime } from '../timer';

describe('formatTime', () => {
  it('formats seconds correctly (0-59)', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(1)).toBe('0:01');
    expect(formatTime(5)).toBe('0:05');
    expect(formatTime(9)).toBe('0:09');
    expect(formatTime(59)).toBe('0:59');
  });

  it('formats seconds with minutes correctly', () => {
    expect(formatTime(60)).toBe('1:00');
    expect(formatTime(61)).toBe('1:01');
    expect(formatTime(90)).toBe('1:30');
  });

  it('formats larger times correctly', () => {
    expect(formatTime(120)).toBe('2:00');
    expect(formatTime(185)).toBe('3:05');
    expect(formatTime(3661)).toBe('61:01');
    expect(formatTime(0)).toBe('0:00');
  });
});

describe('parseTime', () => {
  it('parses valid time strings', () => {
    expect(parseTime('1:00')).toBe(60);
    expect(parseTime('0:30')).toBe(30);
    expect(parseTime('2:15')).toBe(135);
    expect(parseTime('0:05')).toBe(5);
  });

  it('returns 0 for invalid time strings', () => {
    expect(parseTime('abc')).toBe(0);
    expect(parseTime('123')).toBe(0);
    expect(parseTime('')).toBe(0);
    expect(parseTime('1:2:3')).toBe(0);
  });
});