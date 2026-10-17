import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Challenge } from './Challenge';
import { addDays, todayKey } from '../utils/challenge';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

const mockScheduleBeeps = vi.fn();
const mockPlayBeep = vi.fn();
const mockPlayHappyBeep = vi.fn();
const mockGetClock = vi.fn(() => performance.now() / 1000);

vi.mock('../hooks/useBeep', () => ({
  useBeep: () => ({
    playBeep: mockPlayBeep,
    playFinalBeep: vi.fn(),
    scheduleBeeps: mockScheduleBeeps,
    playHappyBeep: mockPlayHappyBeep,
    getClock: mockGetClock,
  }),
}));

vi.mock('../hooks/useWakeLock', () => ({
  useWakeLock: () => ({}),
}));

const timerState = {
  timeLeft: 120,
  onCompleteCb: null as null | (() => void),
  lastResetSeconds: null as number | null,
  startCalls: 0,
};

const countUpState = {
  elapsed: 0,
  startCalls: 0,
};

// Stateful mock: start()/pause() update real React state so the page
// re-renders exactly like it does with the real useTimer hook.
vi.mock('../hooks/useTimer', async () => {
  const React = await import('react');
  return {
    useTimer: (opts: any) => {
      const [isRunning, setIsRunning] = React.useState(false);
      if (opts?.onComplete) {
        timerState.onCompleteCb = opts.onComplete;
      }
      return {
        timeLeft: timerState.timeLeft,
        isRunning,
        start: () => {
          timerState.startCalls += 1;
          setIsRunning(true);
        },
        pause: () => setIsRunning(false),
        reset: (seconds?: number) => {
          if (typeof seconds === 'number') {
            timerState.lastResetSeconds = seconds;
          }
        },
        skip: () => {},
      };
    },
  };
});

vi.mock('../hooks/useCountUp', async () => {
  const React = await import('react');
  return {
    useCountUp: () => {
      const [isRunning, setIsRunning] = React.useState(false);
      return {
        elapsed: countUpState.elapsed,
        isRunning,
        start: () => {
          countUpState.startCalls += 1;
          setIsRunning(true);
        },
        pause: () => setIsRunning(false),
        reset: () => {
          countUpState.elapsed = 0;
          setIsRunning(false);
        },
        getElapsedMs: () => countUpState.elapsed * 1000,
      };
    },
  };
});

function plankCalls() {
  return (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([key]) => key === 'plankChallenge'
  );
}

function maxPlankCalls() {
  return (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([key]) => key === 'challenge:plank-max'
  );
}

function seedPlank(days: { date: string; seconds: number }[]) {
  (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation((key: string) =>
    key === 'plankChallenge' ? JSON.stringify({ startedAt: '2026-09-26', days }) : null
  );
}

/**
 * Wait real milliseconds OUTSIDE of act(). The page's countdown timers
 * call setState, and updates scheduled inside an async act() are dropped
 * in this environment — letting React process them normally (with the act
 * environment flag off to keep the output clean) is what mirrors real use.
 */
async function waitMs(ms: number) {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = false;
  try {
    await new Promise((resolve) => setTimeout(resolve, ms));
  } finally {
    (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  }
}

describe('Challenge page (plank cohort, Sep 26 – Oct 25)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Oct 17: day 22 of the plank cohort — a plain (non-milestone) day.
    vi.setSystemTime(new Date(2026, 9, 17, 12));
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => null);
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.removeItem as ReturnType<typeof vi.fn>).mockReset();
    timerState.timeLeft = 120;
    timerState.onCompleteCb = null;
    timerState.lastResetSeconds = null;
    timerState.startCalls = 0;
    countUpState.elapsed = 0;
    countUpState.startCalls = 0;
    mockScheduleBeeps.mockReset();
    mockPlayBeep.mockReset();
    mockPlayHappyBeep.mockReset();
    mockGetClock.mockImplementation(() => performance.now() / 1000);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the intro with the open date before the cohort opens', () => {
    vi.setSystemTime(new Date(2026, 8, 1, 12)); // Sep 1: before the Sep 26 open
    render(<ChallengeContainer />);

    expect(screen.getByText('30-Day Plank Challenge')).toBeInTheDocument();
    expect(screen.getByText('Opens September 26')).toBeInTheDocument();
    // A cohort challenge cannot be started early from the page.
    expect(screen.queryByText('Start Challenge')).not.toBeInTheDocument();
  });

  it('shows the ready screen with the plain hold on a running day', async () => {
    // Days 1–21 (Sep 26 – Oct 16) all completed: no deficit, no recovery.
    seedPlank(
      Array.from({ length: 21 }, (_, i) => ({
        date: addDays('2026-09-26', i),
        seconds: 120,
      }))
    );

    render(<ChallengeContainer />);

    expect(await screen.findByText('Day 22')).toBeInTheDocument();
    expect(screen.getByText('Begin 2:00 Plank (+1 pt)')).toBeInTheDocument();
    expect(screen.queryByText(/Hold 2:30/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Begin 3:00/)).not.toBeInTheDocument();
  });

  it('runs a 3-2-1 countdown, schedules beeps, then holds and completes the day', async () => {
    seedPlank(
      Array.from({ length: 21 }, (_, i) => ({
        date: addDays('2026-09-26', i),
        seconds: 120,
      }))
    );

    render(<ChallengeContainer />);
    const user = userEvent.setup();
    await user.click(await screen.findByText('Begin 2:00 Plank (+1 pt)'));

    expect(await screen.findByText('Get ready…')).toBeInTheDocument();
    expect(mockScheduleBeeps).toHaveBeenCalledTimes(1);
    const beeps: { frequency: number; at: number; duration: number }[] = mockScheduleBeeps.mock.calls[0][0];
    expect(beeps[0]).toEqual({ frequency: 800, at: 0, duration: 0.1 });
    // Soft ticks every 30s of the 120s hold, starting 3s in
    expect(beeps.slice(3).map((b) => b.at)).toEqual([33, 63, 93]);

    // 3s countdown + 300ms phase exit animation
    await waitMs(3500);
    expect(timerState.lastResetSeconds).toBe(120);
    expect(timerState.startCalls).toBe(1);
    expect(await screen.findByText('2:00')).toBeInTheDocument();
    expect(await screen.findByText('Running')).toBeInTheDocument();

    act(() => {
      timerState.onCompleteCb?.();
    });

    expect(await screen.findByText('Day 22 complete!')).toBeInTheDocument();
    expect(screen.getByText('+1 pts today')).toBeInTheDocument();
    expect(screen.getByText('View progress')).toBeInTheDocument();
    expect(plankCalls().at(-1)?.[1]).toContain('"seconds":120');
    expect(mockPlayHappyBeep).toHaveBeenCalledTimes(1);
  }, 20000);

  it('offers the 2:30 recovery hold after a missed day', async () => {
    vi.setSystemTime(new Date(2026, 9, 19, 12)); // Oct 19: day 24
    // Every past day completed except day 23 (Oct 18) => deficit 1.
    seedPlank(
      Array.from({ length: 23 }, (_, i) => addDays('2026-09-26', i))
        .filter((date) => date !== '2026-10-18')
        .map((date) => ({ date, seconds: 120 }))
    );

    render(<ChallengeContainer />);
    const user = userEvent.setup();

    expect(await screen.findByText('Begin 2:00 Plank (+1 pt)')).toBeInTheDocument();
    const bonusButton = await screen.findByText('Hold 2:30 (+0.5 extra)');
    expect(bonusButton).toBeInTheDocument();

    await user.click(bonusButton);

    expect(await screen.findByText('Get ready…')).toBeInTheDocument();
    const beeps: { frequency: number; at: number; duration: number }[] = mockScheduleBeeps.mock.calls[0][0];
    expect(beeps.slice(3).map((b) => b.at)).toEqual([33, 63, 93, 123]);

    await waitMs(3500);
    expect(timerState.lastResetSeconds).toBe(150);
    expect(timerState.startCalls).toBe(1);

    act(() => {
      timerState.onCompleteCb?.();
    });

    expect(await screen.findByText('Day 24 complete!')).toBeInTheDocument();
    expect(screen.getByText('+1.5 pts today')).toBeInTheDocument();
    expect(mockPlayHappyBeep).toHaveBeenCalledTimes(1);
    expect(plankCalls().at(-1)?.[1]).toContain('"seconds":150');
  }, 20000);

  it('offers the 3:00 milestone hold on day 30', async () => {
    vi.setSystemTime(new Date(2026, 9, 25, 12)); // Oct 25: day 30, a milestone day
    // 9 days completed among days 1–29 with gaps: a deficit exists, but the
    // recovery hold is not offered on a milestone day.
    seedPlank(
      ['2026-09-27', '2026-09-28', '2026-09-30', '2026-10-02', '2026-10-04',
       '2026-10-06', '2026-10-08', '2026-10-10', '2026-10-12'].map((date) => ({
        date,
        seconds: 120,
      }))
    );

    render(<ChallengeContainer />);
    const user = userEvent.setup();

    expect(await screen.findByText('Day 30 of 30')).toBeInTheDocument();
    expect(await screen.findByText('Begin 2:00 Plank (+1 pt)')).toBeInTheDocument();
    const begin = await screen.findByText('Begin 3:00 Plank (+2 pts)');
    expect(await screen.findByText(/Milestone day/)).toBeInTheDocument();
    expect(screen.queryByText(/Hold 2:30/)).not.toBeInTheDocument();

    await user.click(begin);

    expect(await screen.findByText('Get ready…')).toBeInTheDocument();
    const beeps: { frequency: number; at: number; duration: number }[] = mockScheduleBeeps.mock.calls[0][0];
    expect(beeps.slice(3).map((b) => b.at)).toEqual([33, 63, 93, 123, 153]);

    await waitMs(3500);
    expect(timerState.lastResetSeconds).toBe(180);
    expect(timerState.startCalls).toBe(1);

    act(() => {
      timerState.onCompleteCb?.();
    });

    expect(await screen.findByText('Day 30 complete!')).toBeInTheDocument();
    expect(screen.getByText('+2 pts today')).toBeInTheDocument();
    expect(mockPlayHappyBeep).toHaveBeenCalledTimes(1);
    expect(plankCalls().at(-1)?.[1]).toContain('"seconds":180');
  }, 20000);

  it('shows the finished screen (no new hold) once the challenge is complete', () => {
    vi.setSystemTime(new Date(2026, 9, 26, 12)); // Oct 26: rest gap, plank done
    // 30 days completed Sep 26 – Oct 25: every day in the past.
    const day1 = addDays('2026-10-26', -30);
    const days = Array.from({ length: 30 }, (_, i) => ({
      date: addDays(day1, i),
      seconds: (i + 1) % 10 === 0 ? 180 : 120,
    }));
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ startedAt: day1, days })
    );

    render(<ChallengeContainer />);

    expect(screen.getByText('Day 30 of 30')).toBeInTheDocument();
    expect(screen.getByText('Total score: 33 pts')).toBeInTheDocument();
    expect(
      screen.getByText('You finished the 30-day challenge. Amazing work!')
    ).toBeInTheDocument();
    // No "+0 pts today" line and no way to start another hold
    expect(screen.queryByText(/pts today/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Begin .* Plank/)).not.toBeInTheDocument();
  });

  it('shows the done screen without a chime when today was already completed', () => {
    seedPlank([
      ...Array.from({ length: 21 }, (_, i) => ({
        date: addDays('2026-09-26', i),
        seconds: 120,
      })),
      { date: '2026-10-17', seconds: 120 },
    ]);

    render(<ChallengeContainer />);

    expect(screen.getByText('Day 22 complete!')).toBeInTheDocument();
    expect(mockPlayHappyBeep).not.toHaveBeenCalled();
  });

  describe('plank-max cohort (opens Oct 28)', () => {
    beforeEach(() => {
      vi.setSystemTime(new Date(2026, 9, 28, 12)); // Oct 28: day 1
    });

    it('shows the ready screen with a single start plank button', async () => {
      render(<ChallengeContainer />);

      expect(await screen.findByText('Day 1')).toBeInTheDocument();
      expect(screen.getByText('Start Plank')).toBeInTheDocument();
      expect(screen.queryByText(/Begin .* Plank/)).not.toBeInTheDocument();
    });

    it('counts up after the 3-2-1 and records the held seconds on stop', async () => {
      render(<ChallengeContainer />);
      const user = userEvent.setup();
      await user.click(await screen.findByText('Start Plank'));

      expect(await screen.findByText('Get ready…')).toBeInTheDocument();
      expect(mockScheduleBeeps).toHaveBeenCalledTimes(1);
      const beeps: { frequency: number; at: number; duration: number }[] = mockScheduleBeeps.mock.calls[0][0];
      expect(beeps[0]).toEqual({ frequency: 800, at: 0, duration: 0.1 });
      // Soft ticks every 30s up to the 10-minute cap, starting 3s in
      expect(beeps.slice(3).map((b) => b.at)).toEqual(
        Array.from({ length: 20 }, (_, i) => (i + 1) * 30 + 3)
      );

      // 3s countdown + 300ms phase exit animation
      await waitMs(3500);
      expect(countUpState.startCalls).toBe(1);
      expect(await screen.findByText('0:00')).toBeInTheDocument();
      expect(await screen.findByText('Running')).toBeInTheDocument();
      expect(screen.getByText('Stop')).toBeInTheDocument();

      countUpState.elapsed = 150;
      await user.click(screen.getByText('Stop'));

      expect(await screen.findByText('Day 1 complete!')).toBeInTheDocument();
      expect(screen.getByText('Best hold today: 2:30')).toBeInTheDocument();
      expect(screen.getByText('+1.5 pts today')).toBeInTheDocument();
      expect(mockPlayHappyBeep).toHaveBeenCalledTimes(1);
      // The day lands in the cohort's own blob; the raw projection has no
      // start date (the config supplies it).
      const blob = JSON.parse(maxPlankCalls().at(-1)![1]);
      expect(blob.startedAt).toBeNull();
      expect(blob.days).toEqual([{ date: '2026-10-28', seconds: 150 }]);
      // …and the journal only holds the day op, carrying the sync id.
      const setItem = localStorage.setItem as ReturnType<typeof vi.fn>;
      const journalCall = setItem.mock.calls.find(([key]) => key === 'stretch.journal');
      const journal = JSON.parse(journalCall![1]);
      expect(journal.map((o: { entity: string }) => o.entity)).toEqual(['plankDay']);
      expect(journal[0].data).toEqual({ seconds: 150, challengeId: 'plank-max' });
    }, 20000);

    it('ignores a stop below the minimum hold', async () => {
      render(<ChallengeContainer />);
      const user = userEvent.setup();
      await user.click(await screen.findByText('Start Plank'));
      await waitMs(3500);
      expect(await screen.findByText('Running')).toBeInTheDocument();
      expect(screen.getByText('Hold for at least 10 seconds to count')).toBeInTheDocument();

      countUpState.elapsed = 5;
      await user.click(screen.getByText('Stop'));

      // Still holding: nothing recorded, no done screen.
      expect(screen.queryByText(/Day 1 complete!/)).not.toBeInTheDocument();
      expect(maxPlankCalls()).toHaveLength(0);
      expect(screen.getByText('Stop')).toBeInTheDocument();
    }, 20000);

    it('shows the finished screen (no new hold) once the challenge is complete', () => {
      // Day 30 was yesterday: every day is in the past, challenge complete
      const day1 = addDays(todayKey(), -30);
      const days = Array.from({ length: 30 }, (_, i) => ({
        date: addDays(day1, i),
        seconds: (i + 1) % 10 === 0 ? 180 : 120,
      }));
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({ startedAt: day1, days })
      );

      render(<ChallengeContainer />);

      expect(screen.getByText('Day 30 of 30')).toBeInTheDocument();
      expect(screen.getByText('Total score: 33 pts')).toBeInTheDocument();
      expect(
        screen.getByText('You finished the 30-day challenge. Amazing work!')
      ).toBeInTheDocument();
      // No "+0 pts today" line and no way to start another hold
      expect(screen.queryByText(/pts today/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Start Plank/)).not.toBeInTheDocument();
    });

    it('shows the done screen without a chime when today was already completed', () => {
      const today = todayKey();
      (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
        JSON.stringify({ startedAt: today, days: [{ date: today, seconds: 120 }] })
      );

      render(<ChallengeContainer />);

      expect(screen.getByText('Day 1 complete!')).toBeInTheDocument();
      expect(mockPlayHappyBeep).not.toHaveBeenCalled();
    });
  });
});

function ChallengeContainer() {
  return (
    <MemoryRouter>
      <Challenge />
    </MemoryRouter>
  );
}
