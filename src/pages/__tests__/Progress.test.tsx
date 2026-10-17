import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Progress } from '../Progress';
import { addDays, todayKey } from '../../utils/challenge';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
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

function monthLabel(year: number, month: number): string {
  return new Date(year, month, 1).toLocaleDateString('en-US', {
    month: 'long',
  }) + ` ${year}`;
}

describe('Progress page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => null);
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockReset();
    setStorage({});
  });

  it('shows an empty state without any data', () => {
    render(
      <MemoryRouter>
        <Progress />
      </MemoryRouter>
    );

    expect(screen.getByText('Progress')).toBeInTheDocument();
    expect(screen.getByText('No progress yet')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('shows week comparison, recent days, totals, and the bar charts', () => {
    const today = todayKey();
    // Today: a 2-minute plank (+1) plus three unique routines (+3) = 4 in
    // the current window. Fourteen days ago: another plank day, outside
    // both 7-day windows, so the all-time totals (2 plank / 3 routine /
    // 5 total) differ from the current window.
    setStorage({
      'challenge:plank-max': JSON.stringify({
        startedAt: addDays(today, -15),
        days: [
          { date: today, seconds: 120 },
          { date: addDays(today, -14), seconds: 120 },
        ],
      }),
      completedSessions: JSON.stringify([
        { id: 's1', routineId: 'wake-up-workout', routineTitle: 'Wake Up', duration: 10, completedAt: iso(today, 8) },
        { id: 's2', routineId: 'evening-unwind', routineTitle: 'Evening', duration: 10, completedAt: iso(today, 12) },
        { id: 's3', routineId: 'midday-reset', routineTitle: 'Midday', duration: 10, completedAt: iso(today, 19) },
      ]),
    });

    const { container } = render(
      <MemoryRouter>
        <Progress />
      </MemoryRouter>
    );

    // Week comparison: 4 pts in the current window, none before it.
    expect(screen.getByText('This week vs last week')).toBeInTheDocument();
    expect(screen.getByText('Last 7 days')).toBeInTheDocument();
    expect(screen.getByText('Previous 7 days')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('+4 pts')).toBeInTheDocument();

    // Recent days list: today's row with its points.
    expect(screen.getByText('Recent days')).toBeInTheDocument();
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText('+4')).toBeInTheDocument();

    // All-time totals: plank 2, routines 3, total 5.
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();

    const now = new Date();
    expect(screen.getByText(monthLabel(now.getFullYear(), now.getMonth()))).toBeInTheDocument();
    expect(screen.getByText(`${now.getFullYear()} · weekly`)).toBeInTheDocument();

    // Four charts: two 7-day mini charts plus month and year.
    const charts = container.querySelectorAll('svg[role="img"]');
    expect(charts).toHaveLength(4);
    expect(container.querySelectorAll('rect').length).toBeGreaterThan(0);

    // Navigation: next month is disabled on the current month, previous works
    expect(screen.getByLabelText('Next month')).toBeDisabled();
    return userEvent.setup().click(screen.getByLabelText('Previous month')).then(() => {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      expect(
        screen.getByText(monthLabel(prev.getFullYear(), prev.getMonth()))
      ).toBeInTheDocument();
    });
  });

  it('shows a down trend when the previous week was stronger', () => {
    const today = todayKey();
    // Three routine days in the previous window, one today: 1 vs 3 pts.
    setStorage({
      completedSessions: JSON.stringify([
        { id: 's1', routineId: 'r1', routineTitle: 'T', duration: 10, completedAt: iso(addDays(today, -8)) },
        { id: 's2', routineId: 'r2', routineTitle: 'T', duration: 10, completedAt: iso(addDays(today, -9)) },
        { id: 's3', routineId: 'r3', routineTitle: 'T', duration: 10, completedAt: iso(addDays(today, -10)) },
        { id: 's4', routineId: 'r1', routineTitle: 'T', duration: 10, completedAt: iso(today) },
      ]),
    });

    render(
      <MemoryRouter>
        <Progress />
      </MemoryRouter>
    );

    expect(screen.getByText('▼ 67%')).toBeInTheDocument();
  });
});
