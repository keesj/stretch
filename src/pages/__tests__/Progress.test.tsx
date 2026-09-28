import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Progress } from '../Progress';
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

  it('shows totals, a month and a year bar chart', () => {
    const today = todayKey();
    // Plank hold today (+1) plus two unique routines today (+2) = 3 total
    setStorage({
      plankChallenge: JSON.stringify({
        startedAt: addDays(today, -1),
        days: [{ date: today, seconds: 120 }],
      }),
      completedSessions: JSON.stringify([
        { id: 's1', routineId: 'wake-up-workout', routineTitle: 'Wake Up', duration: 10, completedAt: iso(today, 8) },
        { id: 's2', routineId: 'evening-unwind', routineTitle: 'Evening', duration: 10, completedAt: iso(today, 19) },
      ]),
    });

    const { container } = render(
      <MemoryRouter>
        <Progress />
      </MemoryRouter>
    );

    // Totals: routines 2 and combined 3 (plank 1 shares the "1" label
    // with the month chart's day-1 tick)
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();

    const now = new Date();
    expect(screen.getByText(monthLabel(now.getFullYear(), now.getMonth()))).toBeInTheDocument();
    expect(screen.getByText(`${now.getFullYear()} · weekly`)).toBeInTheDocument();

    // Two charts (month + year), each with at least one bar
    const charts = container.querySelectorAll('svg[role="img"]');
    expect(charts).toHaveLength(2);
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
});
