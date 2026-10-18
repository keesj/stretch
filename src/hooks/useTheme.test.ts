import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useTheme } from './useTheme';
import { DEFAULT_SETTINGS, type Settings } from '../utils/storage';

describe('useTheme', () => {
  beforeEach(() => {
    document.documentElement.className = '';
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('applies light theme', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const settings: Settings = { ...DEFAULT_SETTINGS, theme: 'light' as const };

    renderHook(() => useTheme(settings));

    expect(document.documentElement.className).not.toContain('dark');
  });

  it('applies dark theme', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const settings: Settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const };

    renderHook(() => useTheme(settings));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies system theme based on prefers-color-scheme', () => {
    const mediaQueryMock = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryMock));

    const settings: Settings = { ...DEFAULT_SETTINGS, theme: 'system' as const };

    renderHook(() => useTheme(settings));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('toggles off dark when system prefers light', () => {
    const mediaQueryMock = {
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryMock));

    const settings: Settings = { ...DEFAULT_SETTINGS, theme: 'system' as const };
    document.documentElement.className = 'dark';

    renderHook(() => useTheme(settings));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('toggles dark off when theme is light explicitly', () => {
    const mediaQueryMock = {
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryMock));

    const settings: Settings = { ...DEFAULT_SETTINGS, theme: 'light' as const };
    document.documentElement.className = 'dark';

    renderHook(() => useTheme(settings));

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applies the theme when the setting changes', () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));

    const make = (theme: Settings['theme']): Settings => ({ ...DEFAULT_SETTINGS, theme });
    const { rerender } = renderHook(({ settings }: { settings: Settings }) => useTheme(settings), {
      initialProps: { settings: make('light') },
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);

    rerender({ settings: make('dark') });

    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('re-applies the theme when the system preference changes', () => {
    const handlers: (() => void)[] = [];
    const mediaQueryMock: { matches: boolean; addEventListener: any; removeEventListener: any } = {
      matches: true,
      addEventListener: vi.fn((type: string, handler: () => void) => {
        handlers.push(handler);
      }),
      removeEventListener: vi.fn(),
    };

    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mediaQueryMock));

    const settings: Settings = { ...DEFAULT_SETTINGS, theme: 'system' as const };
    document.documentElement.className = 'dark';

    renderHook(() => useTheme(settings));

    // Initial state with system + prefers dark
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    // Change the mediaQuery match to light
    mediaQueryMock.matches = false;

    // Fire the change handler
    act(() => {
      handlers[0]?.();
    });

    // After change, system + now light preference → dark should be removed
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});