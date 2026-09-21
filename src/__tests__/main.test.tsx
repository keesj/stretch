import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { ThemeInitializer } from '../main';
import type { Settings as SettingsType } from '../utils/storage';

function settingsWith(theme: SettingsType['theme']): string {
  return JSON.stringify({ theme, soundEnabled: true, hapticEnabled: true });
}

describe('ThemeInitializer', () => {
  let handlers: (() => void)[];
  let mockMatchMedia: {
    matches: boolean;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    document.documentElement.className = '';
    handlers = [];
    mockMatchMedia = {
      matches: false,
      addEventListener: vi.fn((type: string, handler: () => void) => {
        if (type === 'change') {
          handlers.push(handler);
        }
      }),
      removeEventListener: vi.fn(),
    };
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mockMatchMedia));
  });

  it('renders null', () => {
    render(<ThemeInitializer />);
    expect(screen.queryByText(/ThemeInitializer/i)).not.toBeInTheDocument();
  });

  it('applies dark theme from localStorage on mount', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(settingsWith('dark'));
    render(<ThemeInitializer />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('applies system theme when the system prefers dark', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(settingsWith('system'));
    mockMatchMedia.matches = true;
    render(<ThemeInitializer />);
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('does not apply dark when the system prefers light', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(settingsWith('system'));
    mockMatchMedia.matches = false;
    render(<ThemeInitializer />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('applies light theme explicitly', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(settingsWith('light'));
    render(<ThemeInitializer />);
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('re-applies the theme when the system preference changes', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(settingsWith('system'));
    mockMatchMedia.matches = true;

    render(<ThemeInitializer />);

    expect(handlers.length).toBeGreaterThan(0);
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    mockMatchMedia.matches = false;
    act(() => {
      handlers[0]?.();
    });

    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('mounts the app into #root on module load', async () => {
    const root = document.getElementById('root')!;
    await waitFor(() => {
      expect(root).toHaveTextContent('Your daily flexibility routine');
    });
  });
});
