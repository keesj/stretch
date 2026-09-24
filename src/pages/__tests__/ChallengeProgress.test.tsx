import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChallengeProgress } from '../ChallengeProgress';
import { addDays, todayKey } from '../../utils/challenge';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

function setStorage(obj: Record<string, string>) {
  (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(
    (key: string) => obj[key] ?? null
  );
}

function iso(dateKey: string, hour = 8): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, hour, 0, 0).toISOString();
}

describe('ChallengeProgress page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => null);
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockReset();
    setStorage({});
  });

  it('shows an empty state when the challenge has not started', () => {
    render(
      <MemoryRouter>
        <ChallengeProgress />
      </MemoryRouter>
    );

    expect(screen.getByText('Point progress')).toBeInTheDocument();
    expect(screen.getByText('No challenge yet')).toBeInTheDocument();
    expect(screen.getByText('Start Challenge')).toBeInTheDocument();
  });

  it('shows per-day plank and routine points with a running total', () => {
    const today = todayKey();
    const day1 = addDays(today, -2);
    const day2 = addDays(today, -1);

    setStorage({
      plankChallenge: JSON.stringify({
        startedAt: day1,
        days: [{ date: day1, seconds: 120 }],
      }),
      completedSessions: JSON.stringify([
        { id: 's1', routineId: 'wake-up-workout', routineTitle: 'Wake Up', duration: 10, completedAt: iso(day1, 8) },
        { id: 's2', routineId: 'wake-up-workout', routineTitle: 'Wake Up', duration: 10, completedAt: iso(day1, 9) },
        { id: 's3', routineId: 'midday-decompress', routineTitle: 'Midday', duration: 10, completedAt: iso(day1, 12) },
        { id: 's4', routineId: 'evening-unwind', routineTitle: 'Evening', duration: 10, completedAt: iso(day2, 19) },
      ]),
    });

    const { container } = render(
      <MemoryRouter>
        <ChallengeProgress />
      </MemoryRouter>
    );

    // Header + pace (day 1 = two days ago, so today is day 3; one missed
    // day = 1 point of deficit)
    expect(screen.getByText('Day 3 of 30')).toBeInTheDocument();
    expect(screen.getByText('1 pts behind pace')).toBeInTheDocument();

    // Totals: plank 1 (missed days earn 0, today is pending)
    expect(screen.getByText('1')).toBeInTheDocument();
    // Routines 3: stat card + day 1 row. Combined 4: stat card +
    // day 2 row + day 3 (today, still pending) row.
    expect(screen.getAllByText('3')).toHaveLength(2);
    expect(screen.getAllByText('4')).toHaveLength(3);
    // The missed day shows a red 0
    expect(screen.getByText('0')).toBeInTheDocument();

    // Chart is rendered
    expect(container.querySelector('polyline')).toBeInTheDocument();

    // Day rows: day1 +1 plank / +2 unique routines / running 3
    expect(screen.getByText('D1')).toBeInTheDocument();
    expect(screen.getByText('D2')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
  });
});
