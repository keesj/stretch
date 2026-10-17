import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Home } from '../Home';
import routinesData from '../../data/routines.json';

const navigateMockRef = vi.hoisted(() => ({ fn: vi.fn() }));

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: () => navigateMockRef.fn,
  };
});

function mockStoredSessions(sessions: unknown) {
  (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
    key === 'completedSessions' ? JSON.stringify(sessions) : null
  );
}

function activeSessionSaveCalls() {
  return (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([key]) => key === 'activeSession'
  );
}

describe('Home Page', () => {
  beforeEach(() => {
    navigateMockRef.fn.mockClear();
    // Oct 17: day 22 of the plank cohort (Sep 26 – Oct 25).
    vi.setSystemTime(new Date(2026, 9, 17, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the page heading and description', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByText('Stretch')).toBeInTheDocument();
    expect(screen.getByText('Your daily flexibility routine')).toBeInTheDocument();
  });

  it('renders Featured, All Routines, and the Settings link', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.getByText('Featured')).toBeInTheDocument();
    expect(screen.getByText('All Routines')).toBeInTheDocument();
  });

  it('renders a Start button for every routine and the challenge', () => {
    render(<MemoryRouter><Home /></MemoryRouter>);
    // 1 challenge ("Start Day 22") + one "Start" per routine
    expect(screen.getAllByRole('button', { name: /Start/i })).toHaveLength(
      (routinesData as { id: string }[]).length + 1
    );
  });

  it('renders the running plank challenge card', () => {
    mockStoredSessions([]);
    render(<MemoryRouter><Home /></MemoryRouter>);

    expect(screen.getByText('Challenges')).toBeInTheDocument();
    expect(screen.getByText('30-Day Plank Challenge')).toBeInTheDocument();
    expect(screen.getByText('Start Day 22')).toBeInTheDocument();
  });

  it('navigates to /challenge from the day button without a start op', () => {
    mockStoredSessions([]);
    render(<MemoryRouter><Home /></MemoryRouter>);

    fireEvent.click(screen.getByText('Start Day 22'));

    expect(navigateMockRef.fn).toHaveBeenCalledWith('/challenge');
    // The cohort's start date comes from the config, so no start op is
    // recorded for a cohort challenge.
    const plankCalls = (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.filter(
      ([key]) => key === 'plankChallenge' || key === 'challenge:plank-max'
    );
    expect(plankCalls).toHaveLength(0);
  });

  it('shows the finished plank cohort during the rest gap', () => {
    vi.setSystemTime(new Date(2026, 9, 26, 12)); // Oct 26: the window closed, plank-max opens Oct 28
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
      if (key === 'completedSessions') return '[]';
      if (key === 'plankChallenge') {
        return JSON.stringify({
          startedAt: '2026-09-26',
          days: [{ date: '2026-09-26', seconds: 120 }],
        });
      }
      return null;
    });

    render(<MemoryRouter><Home /></MemoryRouter>);

    // The card is the finished plank cohort, not the upcoming plank-max.
    expect(screen.getByText('30-Day Plank Challenge')).toBeInTheDocument();
    expect(screen.getByText('Challenge complete 🏆')).toBeInTheDocument();
    expect(screen.getByText('Finished')).toBeDisabled();
    expect(screen.queryByText('30-Day Plank Max Challenge')).not.toBeInTheDocument();
  });

  it('shows session stats when sessions exist', () => {
    mockStoredSessions([
      { id: '1', routineId: 'r1', routineTitle: 'Morning', duration: 300, completedAt: new Date().toISOString() },
      { id: '2', routineId: 'r2', routineTitle: 'Afternoon', duration: 180, completedAt: new Date().toISOString() },
      { id: '3', routineId: 'r3', routineTitle: 'Evening', duration: 240, completedAt: new Date().toISOString() },
    ]);

    render(<MemoryRouter><Home /></MemoryRouter>);

    const stats = screen.getByText('sessions completed').closest('.flex')!;
    expect(within(stats).getByText('3')).toBeInTheDocument();
    // 300 + 180 + 240 = 720 seconds = 12 minutes
    expect(within(stats).getByText('12')).toBeInTheDocument();
  });

  it('hides session stats when no sessions exist', () => {
    mockStoredSessions([]);
    render(<MemoryRouter><Home /></MemoryRouter>);
    expect(screen.queryByText('sessions completed')).not.toBeInTheDocument();
  });

  it('saves the active session and navigates to /session when starting the featured routine', () => {
    mockStoredSessions([]);
    render(<MemoryRouter><Home /></MemoryRouter>);

    // Index 0 is the challenge's "Start Day 22"; the featured routine is index 1
    fireEvent.click(screen.getAllByRole('button', { name: /Start/i })[1]);

    expect(navigateMockRef.fn).toHaveBeenCalledWith('/session');
    expect(activeSessionSaveCalls()).toHaveLength(1);
    expect(JSON.parse(activeSessionSaveCalls()[0][1])).toMatchObject({
      routineId: 'wake-up-workout',
      currentExerciseIndex: 0,
    });
  });

  it('starts the routine from the All Routines section', () => {
    mockStoredSessions([]);
    render(<MemoryRouter><Home /></MemoryRouter>);

    // Last routine in the All Routines section
    // (index 0 is the challenge button, 1 is featured, 2+ are the rest)
    const startButtons = screen.getAllByRole('button', { name: /Start/i });
    fireEvent.click(startButtons[startButtons.length - 1]);

    expect(navigateMockRef.fn).toHaveBeenCalledWith('/session');
    expect(JSON.parse(activeSessionSaveCalls()[0][1])).toMatchObject({
      routineId: 'shin-calf-release',
    });
  });

  it('updates session stats when a storage event fires', () => {
    let stored = '[]';
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
      key === 'completedSessions' ? stored : null
    );

    render(<MemoryRouter><Home /></MemoryRouter>);

    expect(screen.queryByText('sessions completed')).not.toBeInTheDocument();

    act(() => {
      stored = JSON.stringify([
        { id: '1', routineId: 'r1', routineTitle: 'Test', duration: 120, completedAt: new Date().toISOString() },
      ]);
      window.dispatchEvent(new StorageEvent('storage', { key: 'completedSessions' }));
    });

    const stats = screen.getByText('sessions completed').closest('.flex')!;
    expect(within(stats).getByText('1')).toBeInTheDocument();
  });
});
