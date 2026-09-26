import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Challenge } from '../Challenge';
import { addDays, todayKey } from '../../utils/challenge';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

const mockScheduleBeeps = vi.fn();
const mockPlayBeep = vi.fn();
const mockPlayHappyBeep = vi.fn();
const mockGetClock = vi.fn(() => performance.now() / 1000);

vi.mock('../../hooks/useBeep', () => ({
  useBeep: () => ({
    playBeep: mockPlayBeep,
    playFinalBeep: vi.fn(),
    scheduleBeeps: mockScheduleBeeps,
    playHappyBeep: mockPlayHappyBeep,
    getClock: mockGetClock,
  }),
}));

vi.mock('../../hooks/useWakeLock', () => ({
  useWakeLock: () => ({}),
}));

const timerState = {
  timeLeft: 120,
  onCompleteCb: null as null | (() => void),
  lastResetSeconds: null as number | null,
  startCalls: 0,
};

// Stateful mock: start()/pause() update real React state so the page
// re-renders exactly like it does with the real useTimer hook.
vi.mock('../../hooks/useTimer', async () => {
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

function plankCalls() {
  return (localStorage.setItem as ReturnType<typeof vi.fn>).mock.calls.filter(
    ([key]) => key === 'plankChallenge'
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

describe('Challenge page', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockImplementation(() => null);
    (localStorage.setItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.removeItem as ReturnType<typeof vi.fn>).mockReset();
    timerState.timeLeft = 120;
    timerState.onCompleteCb = null;
    timerState.lastResetSeconds = null;
    timerState.startCalls = 0;
    mockScheduleBeeps.mockReset();
    mockPlayBeep.mockReset();
    mockPlayHappyBeep.mockReset();
    mockGetClock.mockImplementation(() => performance.now() / 1000);
  });

  it('shows the intro when the challenge has not been started', () => {
    render(<ChallengeContainer />);
    expect(screen.getByText('30-Day Plank Challenge')).toBeInTheDocument();
    expect(screen.getByText('Start Challenge')).toBeInTheDocument();
  });

  it('starts the challenge and shows the ready screen', async () => {
    render(<ChallengeContainer />);
    await userEvent.setup().click(screen.getByText('Start Challenge'));

    expect(await screen.findByText('Day 1')).toBeInTheDocument();
    expect(await screen.findByText('Begin 2:00 Plank (+1 pt)')).toBeInTheDocument();
    // No missed days yet, so the recovery hold is not offered
    expect(screen.queryByText(/Hold 2:30/)).not.toBeInTheDocument();
    expect(plankCalls().length).toBeGreaterThan(0);
    expect(plankCalls().at(-1)?.[1]).toContain('"startedAt"');
  });

  it('runs a 3-2-1 countdown, schedules beeps, then holds', async () => {
    render(<ChallengeContainer />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Start Challenge'));
    await user.click(await screen.findByText('Begin 2:00 Plank (+1 pt)'));

    expect(await screen.findByText('Get ready…')).toBeInTheDocument();
    expect(mockScheduleBeeps).toHaveBeenCalledTimes(1);
    const beeps = mockScheduleBeeps.mock.calls[0][0];
    expect(beeps[0]).toEqual({ frequency: 800, at: 0, duration: 0.1 });
    expect(beeps[1]).toEqual({ frequency: 800, at: 1, duration: 0.1 });
    expect(beeps[2]).toEqual({ frequency: 800, at: 2, duration: 0.1 });
    // Soft ticks during the 2-minute hold start 3s later
    expect(beeps[3].at).toBe(33);
    expect(beeps[4].at).toBe(63);
    expect(beeps[5].at).toBe(93);

    // 3s countdown + 300ms phase exit animation
    await waitMs(3500);

    expect(timerState.lastResetSeconds).toBe(120);
    expect(timerState.startCalls).toBe(1);
    expect(await screen.findByText('2:00')).toBeInTheDocument();
    expect(await screen.findByText('Breathe in')).toBeInTheDocument();
  }, 20000);

  it('completing the hold records the day and shows the done screen', async () => {
    render(<ChallengeContainer />);
    const user = userEvent.setup();
    await user.click(screen.getByText('Start Challenge'));
    await user.click(await screen.findByText('Begin 2:00 Plank (+1 pt)'));

    await waitMs(3500);
    expect(await screen.findByText('2:00')).toBeInTheDocument();

    act(() => {
      timerState.onCompleteCb?.();
    });

    expect(await screen.findByText('Day 1 complete!')).toBeInTheDocument();
    expect(screen.getByText('+1 pts today')).toBeInTheDocument();
    expect(screen.getByText('View progress')).toBeInTheDocument();
    expect(plankCalls().at(-1)?.[1]).toContain('"seconds":120');
    expect(mockPlayHappyBeep).toHaveBeenCalledTimes(1);
  }, 20000);

  it('offers the 2:30 hold at the start after a missed day and records 150 seconds', async () => {
    // Day 1 done, day 2 missed => deficit 1.5 on day 3, bonus available
    const today = todayKey();
    const day1 = addDays(today, -2);
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ startedAt: day1, days: [{ date: day1, seconds: 120 }] })
    );

    render(<ChallengeContainer />);
    const user = userEvent.setup();

    expect(await screen.findByText('Begin 2:00 Plank (+1 pt)')).toBeInTheDocument();
    const bonusButton = await screen.findByText('Hold 2:30 (+0.5 extra)');
    expect(bonusButton).toBeInTheDocument();

    await user.click(bonusButton);

    expect(await screen.findByText('Get ready…')).toBeInTheDocument();
    expect(mockScheduleBeeps).toHaveBeenCalledTimes(1);
    const beeps = mockScheduleBeeps.mock.calls[0][0];
    // Ticks every 30s of the 150s hold, starting 3s into the hold
    expect(beeps.slice(3).map((b) => b.at)).toEqual([33, 63, 93, 123]);

    await waitMs(3500);
    expect(timerState.lastResetSeconds).toBe(150);
    expect(timerState.startCalls).toBe(1);

    act(() => {
      timerState.onCompleteCb?.();
    });

    expect(await screen.findByText('Day 3 complete!')).toBeInTheDocument();
    expect(screen.getByText('+1.5 pts today')).toBeInTheDocument();
    expect(mockPlayHappyBeep).toHaveBeenCalledTimes(1);
    expect(plankCalls().at(-1)?.[1]).toContain('"seconds":150');
  }, 20000);

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

function ChallengeContainer() {
  return (
    <MemoryRouter>
      <Challenge />
    </MemoryRouter>
  );
}
