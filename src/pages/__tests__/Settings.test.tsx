import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Settings } from '../Settings';

const mockUseNavigate = vi.hoisted(() => vi.fn());

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => mockUseNavigate,
  };
});

function lastSavedSettings(): Record<string, unknown> | null {
  const calls = (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([key]) => key === 'settings'
  );
  return calls.length ? JSON.parse(calls[calls.length - 1][1]) : null;
}

describe('Settings Page', () => {
  beforeEach(() => {
    mockUseNavigate.mockClear();
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }));
  });

  it('renders the page heading and subtitle', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(screen.getByText('Settings')).toBeInTheDocument();
    expect(screen.getByText('Customize your experience')).toBeInTheDocument();
  });

  it('renders Appearance, Preferences, Statistics, and Data sections', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(screen.getByText('Appearance')).toBeInTheDocument();
    expect(screen.getByText('Preferences')).toBeInTheDocument();
    expect(screen.getByText('Statistics')).toBeInTheDocument();
    expect(screen.getByText('Data')).toBeInTheDocument();
  });

  it('renders the theme selector with the stored default', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    const select = screen.getByRole('combobox') as HTMLSelectElement;
    expect(select.value).toBe('system');
  });

  it('renders Sound and Haptic Feedback toggles', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(screen.getByText('Sound')).toBeInTheDocument();
    expect(screen.getByText('Haptic Feedback')).toBeInTheDocument();
  });

  it('renders Reset Progress and Done buttons', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);
    expect(screen.getByText('Reset Progress')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('shows completed sessions stats', () => {
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      key === 'completedSessions'
        ? JSON.stringify([{ id: '1', routineId: 'r1', routineTitle: 'Test', duration: 180, completedAt: new Date().toISOString() }])
        : null
    );

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const row = screen.getByText('Total Sessions').closest('.flex')!;
    expect(within(row).getByText('1')).toBeInTheDocument();
  });

  it('navigates home when Done is clicked', async () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);

    const user = userEvent.setup();
    await user.click(screen.getByText('Done'));

    expect(mockUseNavigate).toHaveBeenCalledWith('/');
  });

  it('does not reset progress when the confirmation is cancelled', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const user = userEvent.setup();
    await user.click(screen.getByText('Reset Progress'));

    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('clears completed sessions when the reset is confirmed', async () => {
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    vi.stubGlobal('alert', vi.fn());

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const user = userEvent.setup();
    await user.click(screen.getByText('Reset Progress'));

    expect(localStorage.removeItem).toHaveBeenCalledWith('completedSessions');
  });

  it('persists the sound preference when the toggle changes', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);

    const checkbox = screen.getByText('Sound').closest('.flex')!
      .querySelector('input[type="checkbox"]') as HTMLInputElement;

    fireEvent.click(checkbox);

    expect(lastSavedSettings()).toMatchObject({ soundEnabled: false });
  });

  it('persists the haptic preference when the toggle changes', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);

    const checkbox = screen.getByText('Haptic Feedback').closest('.flex')!
      .querySelector('input[type="checkbox"]') as HTMLInputElement;

    fireEvent.click(checkbox);

    expect(lastSavedSettings()).toMatchObject({ hapticEnabled: false });
  });

  it('applies and persists the selected theme', () => {
    render(<MemoryRouter><Settings /></MemoryRouter>);

    const select = screen.getByRole('combobox') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'dark' } });

    expect(lastSavedSettings()).toMatchObject({ theme: 'dark' });
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('updates session stats when a storage event fires', () => {
    let stored = '[]';
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      key === 'completedSessions' ? stored : null
    );

    render(<MemoryRouter><Settings /></MemoryRouter>);

    const row = screen.getByText('Total Sessions').closest('.flex')!;
    expect(within(row).getByText('0')).toBeInTheDocument();

    act(() => {
      stored = JSON.stringify([
        { id: '1', routineId: 'r1', routineTitle: 'Test', duration: 120, completedAt: new Date().toISOString() },
      ]);
      window.dispatchEvent(new StorageEvent('storage', { key: 'completedSessions' }));
    });

    expect(within(row).getByText('1')).toBeInTheDocument();
  });
});
