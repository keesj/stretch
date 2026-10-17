import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ChallengeProgress } from '../ChallengeProgress';

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
    // Oct 30: day 3 of the plank-max window that opens 2026-10-28.
    vi.setSystemTime(new Date(2026, 9, 30, 12));
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => null);
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockReset();
    setStorage({});
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the (empty) window before the first cohort opens', () => {
    vi.setSystemTime(new Date(2026, 8, 1, 12)); // Sep 1: before the Sep 26 open
    const { container } = render(
      <MemoryRouter>
        <ChallengeProgress />
      </MemoryRouter>
    );

    // The configured start date already "starts" the challenge, so the
    // window renders even though no day has happened yet.
    expect(screen.getByText('Point progress')).toBeInTheDocument();
    expect(screen.getByText('Day 1 of 30')).toBeInTheDocument();
    expect(screen.getByText('On pace')).toBeInTheDocument();
    expect(screen.getByText('Plank points')).toBeInTheDocument();
    expect(container.querySelector('polyline')).toBeInTheDocument();
    expect(container.querySelectorAll('li')).toHaveLength(0);
    expect(screen.queryByText('No challenge yet')).not.toBeInTheDocument();
  });

  it('shows per-day plank points with a running total, ignoring routines', () => {
    // Day 1 (Oct 28) done, day 2 (Oct 29) missed => 1 point of deficit

    // Routine sessions exist but must not appear on this (plank-only) page
    setStorage({
      'challenge:plank-max': JSON.stringify({
        startedAt: '2026-10-28',
        days: [{ date: '2026-10-28', seconds: 120 }],
      }),
      completedSessions: JSON.stringify([
        { id: 's1', routineId: 'wake-up-workout', routineTitle: 'Wake Up', duration: 10, completedAt: iso('2026-10-28', 8) },
        { id: 's2', routineId: 'evening-unwind', routineTitle: 'Evening', duration: 10, completedAt: iso('2026-10-29', 19) },
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

    // Plank only: the stat card (1) plus the running total (1) shown on
    // the day 1, day 2 and today rows
    expect(screen.getAllByText('1')).toHaveLength(4);
    // The missed day shows a red 0
    expect(screen.getByText('0')).toBeInTheDocument();
    // No routine column values
    expect(screen.queryByText('+2')).not.toBeInTheDocument();

    // Chart is rendered
    expect(container.querySelector('polyline')).toBeInTheDocument();

    // Day rows
    expect(screen.getByText('D1')).toBeInTheDocument();
    expect(screen.getByText('D2')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();

    // The list is newest-first: today on top, day 1 at the bottom.
    const rows = container.querySelectorAll('li');
    expect(rows[0].textContent).toContain('D3');
    expect(rows[rows.length - 1].textContent).toContain('D1');
  });
});
