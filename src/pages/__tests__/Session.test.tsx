import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { Session } from '../Session';

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    useNavigate: vi.fn(),
  };
});

const mockScheduleBeeps = vi.fn();
const mockPlayHappyBeep = vi.fn();
// Stable identity — a fresh getClock per render would change the
// countdown's identity and cancel it right after it starts.
const mockGetClock = vi.fn(() => performance.now() / 1000);

vi.mock('../../hooks/useBeep', () => ({
  useBeep: () => ({
    playBeep: vi.fn(),
    playFinalBeep: vi.fn(),
    scheduleBeeps: mockScheduleBeeps,
    playHappyBeep: mockPlayHappyBeep,
    getClock: mockGetClock,
  }),
}));

// Single shared timer state: every exercise section in a test reads/writes
// this, so a test drives whichever section is under test.
const timerState = {
  timeLeft: 30,
  isRunning: false,
  isPaused: false,
};
// One entry per useTimer call (one per exercise section), in mount order
const timerInstances: Array<{ onComplete?: () => void }> = [];

const mockStart = vi.fn(() => {
  timerState.isRunning = true;
});
const mockPause = vi.fn(() => {
  timerState.isRunning = false;
});

vi.mock('../../hooks/useTimer', () => ({
  useTimer: (opts: any) => {
    timerInstances.push({ onComplete: opts?.onComplete });
    return {
      timeLeft: timerState.timeLeft,
      isRunning: timerState.isRunning,
      isPaused: timerState.isPaused,
      start: mockStart,
      pause: mockPause,
      reset: vi.fn(),
      skip: vi.fn(),
    };
  },
}));

const workoutState = {
  isCompleted: false,
  finishCount: 0,
  onCompleteCb: [] as ((session: any) => void)[],
  setCompleted: [] as ((completed: boolean) => void)[],
  resetFn: [] as (() => void)[],
};

vi.mock('../../hooks/useWorkout', async () => {
  const React = await import('react');
  return {
    useWorkout: (opts: any) => {
      const [completed, setCompleted] = React.useState(workoutState.isCompleted);
      workoutState.onCompleteCb[0] = opts.onComplete;
      workoutState.setCompleted[0] = setCompleted;
      return {
        isCompleted: completed,
        finishWorkout: () => {
          workoutState.finishCount += 1;
          setCompleted(true);
        },
        reset: () => {
          workoutState.resetFn[0]?.();
          setCompleted(false);
        },
      };
    },
  };
});

const SCROLL_HEIGHT = 800;
const EXERCISES = 9; // wake-up-workout has nine stretches

function getScrollContainer() {
  return screen.getByTestId('session-scroll') as HTMLDivElement;
}

function sectionEl(index: number) {
  return screen.getAllByTestId('exercise-section')[index];
}

// Which section the scroll position points at (mirrors the page's activeIndex)
let currentSection = 0;

/** Scope for queries: only the visible (active) exercise section */
function activeSection() {
  return within(sectionEl(currentSection));
}

async function scrollToSection(n: number) {
  const el = getScrollContainer();
  Object.defineProperty(el, 'clientHeight', { value: SCROLL_HEIGHT, configurable: true });
  el.scrollTop = n * SCROLL_HEIGHT;
  act(() => {
    el.dispatchEvent(new Event('scroll'));
  });
  currentSection = n;
}

/**
 * Wait real milliseconds OUTSIDE of act(). The page's countdown timers call
 * setState, and updates scheduled inside an async act() are dropped in this
 * environment — letting React process them normally (with the act
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

describe('Session (scrollable feed)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.removeItem as ReturnType<typeof vi.fn>).mockReset();
    (localStorage.getItem as ReturnType<typeof vi.fn>).mockReturnValue(
      JSON.stringify({ routineId: 'wake-up-workout' })
    );
    timerState.timeLeft = 30;
    timerState.isRunning = false;
    timerState.isPaused = false;
    timerInstances.length = 0;
    mockStart.mockClear();
    mockPause.mockClear();
    mockScheduleBeeps.mockReset();
    mockPlayHappyBeep.mockReset();
    mockGetClock.mockImplementation(() => performance.now() / 1000);
    currentSection = 0;
    workoutState.isCompleted = false;
    workoutState.finishCount = 0;
    workoutState.resetFn[0] = vi.fn();
  });

  it('renders the exercise feed with an "Up next" teaser for the following exercise', () => {
    render(<SessionContainer />);
    // The wake-up routine bookends with Upward Salute (first and last);
    // the second appearance is doubled by the up-next teaser of day 8
    expect(screen.getAllByText('Upward Salute')).toHaveLength(3);
    // The next exercise appears in its own section plus the teaser
    expect(screen.getAllByText('Toe Touch')).toHaveLength(2);
    expect(screen.getAllByText('Up next')).toHaveLength(EXERCISES - 1);
  });

  it('tapping the "Up next" card scrolls to the next exercise', async () => {
    render(<SessionContainer />);
    const el = getScrollContainer();
    Object.defineProperty(el, 'clientHeight', { value: SCROLL_HEIGHT, configurable: true });
    const scrollToSpy = vi.fn();
    Object.defineProperty(el, 'scrollTo', { value: scrollToSpy, configurable: true });

    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Go to next exercise: Toe Touch' }));

    expect(scrollToSpy).toHaveBeenCalledWith({ top: SCROLL_HEIGHT, behavior: 'smooth' });
  });

  it('has no Previous/Next buttons; the feed is scrolled instead', () => {
    render(<SessionContainer />);
    expect(screen.getByText('← Back')).toBeInTheDocument();
    expect(screen.queryByText('Previous')).not.toBeInTheDocument();
    expect(screen.queryByText('Next')).not.toBeInTheDocument();
  });

  it('shows the up-next teaser and swipe-up hint for the active exercise', async () => {
    render(<SessionContainer />);
    // First exercise: up-next teaser (Toe Touch), no swipe-up hint
    expect(sectionEl(0)).toHaveTextContent('Toe Touch');
    expect(screen.queryByText('swipe up')).not.toBeInTheDocument();

    await scrollToSection(1);
    expect(screen.getByText('swipe up')).toBeInTheDocument();
    expect(screen.getByText('Exercise 2 of 9')).toBeInTheDocument();
    // Section 2 teases the following exercise
    expect(sectionEl(1)).toHaveTextContent('Lunge (Left)');
  });

  it('backing out navigates home and resets the workout', async () => {
    const mockNavigate = vi.fn();
    vi.mocked((await import('react-router-dom')).useNavigate).mockReturnValue(mockNavigate);
    render(<SessionContainer />);

    await userEvent.setup().click(screen.getByText('← Back'));
    expect(workoutState.resetFn[0]).toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/');
  });

  it('tapping the timer runs the 3-2-1 countdown, then the exercise', async () => {
    render(<SessionContainer />);
    await userEvent.setup().click(activeSection().getByRole('button', { name: 'Start' }));

    expect(screen.getByText('Get ready…')).toBeInTheDocument();
    // The lead-in is shown explicitly: 30s stretch + 3s countdown
    expect(activeSection().getByText('30')).toBeInTheDocument();
    expect(activeSection().getByText('+ 3')).toBeInTheDocument();

    await waitMs(3200);

    expect(mockStart).toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.queryByText('Get ready…')).not.toBeInTheDocument()
    );
    expect(activeSection().queryByText('+ 3')).not.toBeInTheDocument();
  }, 20000);

  it('pauses and resumes without a countdown', async () => {
    render(<SessionContainer />);
    const user = userEvent.setup();

    await user.click(activeSection().getByRole('button', { name: 'Start' }));
    await waitMs(3200);

    await user.click(activeSection().getByRole('button', { name: 'Pause' }));
    expect(mockPause).toHaveBeenCalled();

    await user.click(activeSection().getByRole('button', { name: 'Resume' }));
    expect(screen.queryByText('Get ready…')).not.toBeInTheDocument();
    expect(activeSection().getByRole('button', { name: 'Pause' })).toBeInTheDocument();
  }, 20000);

  it('scrolling to the next exercise does not auto-start it', async () => {
    render(<SessionContainer />);
    await scrollToSection(1);
    expect(screen.getByText('Exercise 2 of 9')).toBeInTheDocument();

    await waitMs(3500);

    expect(mockStart).not.toHaveBeenCalled();
    expect(mockScheduleBeeps).not.toHaveBeenCalled();
  }, 20000);

  it('scrolling away pauses the running exercise; scrolling back shows it paused', async () => {
    render(<SessionContainer />);
    const user = userEvent.setup();

    await user.click(activeSection().getByRole('button', { name: 'Start' }));
    await waitMs(3200);
    expect(activeSection().getByRole('button', { name: 'Pause' })).toBeInTheDocument();

    await scrollToSection(1);
    expect(mockPause).toHaveBeenCalled();

    await scrollToSection(0);
    expect(activeSection().getByRole('button', { name: 'Resume' })).toBeInTheDocument();
  }, 20000);

  it('completing an exercise scrolls to the next one with a 5s transition countdown', async () => {
    render(<SessionContainer />);
    const el = getScrollContainer();
    Object.defineProperty(el, 'clientHeight', { value: SCROLL_HEIGHT, configurable: true });
    const scrollToSpy = vi.fn();
    Object.defineProperty(el, 'scrollTo', { value: scrollToSpy, configurable: true });

    act(() => {
      timerInstances[0].onComplete?.();
    });

    // The completed state shows briefly, then the session scrolls on
    await waitMs(1600);
    expect(scrollToSpy).toHaveBeenCalledWith({
      top: SCROLL_HEIGHT,
      behavior: 'smooth',
    });

    // Simulate the scroll settling on exercise 2
    el.scrollTop = SCROLL_HEIGHT;
    act(() => {
      el.dispatchEvent(new Event('scroll'));
    });
    expect(screen.getByText('Exercise 2 of 9')).toBeInTheDocument();
    expect(mockScheduleBeeps).toHaveBeenCalledWith([
      { frequency: 800, at: 0, duration: 0.1 },
      { frequency: 800, at: 1, duration: 0.1 },
      { frequency: 800, at: 2, duration: 0.1 },
      { frequency: 800, at: 3, duration: 0.1 },
      { frequency: 800, at: 4, duration: 0.1 },
      { frequency: 1200, at: 5, duration: 0.3 },
    ]);

    await waitMs(5200);
    expect(mockStart).toHaveBeenCalled();
  }, 20000);

  it('completing the final exercise finishes the workout with a happy beep', async () => {
    render(<SessionContainer />);

    act(() => {
      timerInstances[EXERCISES - 1].onComplete?.();
    });

    await waitMs(1600);
    expect(workoutState.finishCount).toBe(1);
    expect(mockPlayHappyBeep).toHaveBeenCalledTimes(1);
  }, 20000);

  it('completing the workout navigates to finished', async () => {
    const finishNavigate = vi.fn();
    vi.mocked((await import('react-router-dom')).useNavigate).mockReturnValue(finishNavigate);
    render(<SessionContainer />);

    const sessionData = { routine: 'wake-up-workout', exercises: [] };
    act(() => {
      workoutState.onCompleteCb[0]?.(sessionData);
    });

    expect(finishNavigate).toHaveBeenCalledWith('/finished', { state: { session: sessionData } });
  });

  it('plays the happy beep when the workout completes', async () => {
    render(<SessionContainer />);
    expect(mockPlayHappyBeep).not.toHaveBeenCalled();

    act(() => {
      workoutState.setCompleted[0]?.(true);
    });

    expect(mockPlayHappyBeep).toHaveBeenCalledTimes(1);
  });

  it('opens and closes the instructions overlay for the active exercise', async () => {
    render(<SessionContainer />);
    const user = userEvent.setup();

    await user.click(screen.getByText('Instructions'));
    expect(await screen.findByText('Got it')).toBeInTheDocument();
    expect(screen.getByText('Stand tall with feet hip-width apart')).toBeInTheDocument();

    await user.click(screen.getByText('Got it'));
    await waitFor(() => expect(screen.queryByText('Got it')).not.toBeInTheDocument());
  });

  it('shows exercise details in the instructions overlay', async () => {
    render(<SessionContainer />);
    await userEvent.setup().click(screen.getByText('Instructions'));

    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText('Stand tall with feet hip-width apart')).toBeInTheDocument();
    expect(within(dialog).getByText('Easy')).toBeInTheDocument();
    expect(within(dialog).getByText('30s')).toBeInTheDocument();
    expect(within(dialog).getByText('spine')).toBeInTheDocument();
  });
});

function SessionContainer() {
  return (
    <MemoryRouter>
      <Session />
    </MemoryRouter>
  );
}
