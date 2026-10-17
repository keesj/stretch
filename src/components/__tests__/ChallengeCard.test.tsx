import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChallengeCard } from '../ChallengeCard';
import type { Challenge, ChallengeStatus } from '../../types/challenge';

const challenge: Challenge = {
  id: 'plank-30-day',
  syncId: 'plank',
  scoring: 'threshold',
  title: '30-Day Plank Challenge',
  description: 'Hold a 2-minute plank every day for 30 days.',
  exerciseId: 'plank-hold',
  totalDays: 30,
  baseSeconds: 120,
  bonusSeconds: 30,
  bonusPoints: 0.5,
  milestoneEvery: 10,
  milestoneSeconds: 180,
  milestonePoints: 2,
  illustration: '💪',
};

const maxChallenge: Challenge = {
  id: 'plank-max-30-day',
  syncId: 'plank-max',
  scoring: 'duration',
  title: '30-Day Max Plank Challenge',
  description: 'Plank once a day and hold as long as you can.',
  exerciseId: 'plank-hold',
  totalDays: 30,
  startDate: '2026-11-01',
  baseSeconds: 120,
  basePoints: 1,
  incrementSeconds: 30,
  incrementPoints: 0.5,
  maxSeconds: 600,
  illustration: '⏱️',
};

function mkStatus(overrides: Partial<ChallengeStatus> = {}): ChallengeStatus {
  return {
    status: 'active',
    dayNumber: 5,
    daysLeft: 26,
    todayDone: false,
    todaySeconds: 0,
    todayPoints: 0,
    todayIsMilestone: false,
    score: 4.5,
    baseline: 4,
    deficit: 1,
    bonusAvailable: true,
    completedDays: 4,
    missedDays: 1,
    ...overrides,
  };
}

describe('ChallengeCard', () => {
  it('shows the start button when not started', async () => {
    const onStart = vi.fn();
    render(
      <ChallengeCard
        challenge={challenge}
        status={mkStatus({ status: 'not-started', dayNumber: 1, daysLeft: 30, score: 0, missedDays: 0 })}
        onStart={onStart}
        onBegin={vi.fn()}
        onRestart={vi.fn()}
      />
    );

    expect(screen.getByText('30-Day Plank Challenge')).toBeInTheDocument();
    expect(screen.getByText('30 days • 2 min plank per day')).toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByText('Start Day 1'));
    expect(onStart).toHaveBeenCalledTimes(1);
  });

  it('shows day progress, score and missed days while active', async () => {
    const onBegin = vi.fn();
    render(
      <ChallengeCard challenge={challenge} status={mkStatus()} onStart={vi.fn()} onBegin={onBegin} onRestart={vi.fn()} />
    );

    expect(screen.getByText('Day 5 of 30 • 26 left')).toBeInTheDocument();
    expect(screen.getByText('4.5 pts')).toBeInTheDocument();
    expect(screen.getByText('Missed days: 1')).toBeInTheDocument();
    expect(screen.queryByText(/Milestone day/)).not.toBeInTheDocument();

    await userEvent.setup().click(screen.getByText('Start Day 5'));
    expect(onBegin).toHaveBeenCalledTimes(1);
  });

  it('shows the milestone hint on a milestone day that is not done yet', () => {
    render(
      <ChallengeCard
        challenge={challenge}
        status={mkStatus({ dayNumber: 10, daysLeft: 21, todayIsMilestone: true })}
        onStart={vi.fn()}
        onBegin={vi.fn()}
        onRestart={vi.fn()}
      />
    );

    expect(screen.getByText('Milestone day: 3:00 plank for 2 pts')).toBeInTheDocument();
  });

  it('disables the button when today is already completed', () => {
    render(
      <ChallengeCard
        challenge={challenge}
        status={mkStatus({ todayDone: true, todayPoints: 1.5 })}
        onStart={vi.fn()}
        onBegin={vi.fn()}
        onRestart={vi.fn()}
      />
    );

    expect(screen.getByText('Completed today • +1.5 pts')).toBeDisabled();
  });

  it('shows the final score and a restart button when complete', async () => {
    const onRestart = vi.fn();
    render(
      <ChallengeCard
        challenge={challenge}
        status={mkStatus({ status: 'complete', dayNumber: 30, daysLeft: 0, score: 27.5 })}
        onStart={vi.fn()}
        onBegin={vi.fn()}
        onRestart={onRestart}
      />
    );

    expect(screen.getByText('Challenge complete 🏆')).toBeInTheDocument();
    expect(screen.getByText('27.5 pts')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByText('Start New Challenge'));
    expect(onRestart).toHaveBeenCalledTimes(1);
  });

  it('shows a progress button when the challenge has started', async () => {
    const onProgress = vi.fn();
    render(
      <ChallengeCard
        challenge={challenge}
        status={mkStatus()}
        onStart={vi.fn()}
        onBegin={vi.fn()}
        onRestart={vi.fn()}
        onProgress={onProgress}
      />
    );

    await userEvent.setup().click(screen.getByText('View progress'));
    expect(onProgress).toHaveBeenCalledTimes(1);
  });

  it('hides the progress button when the challenge has not started', () => {
    render(
      <ChallengeCard
        challenge={challenge}
        status={mkStatus({ status: 'not-started', dayNumber: 1, daysLeft: 30, score: 0, missedDays: 0 })}
        onStart={vi.fn()}
        onBegin={vi.fn()}
        onRestart={vi.fn()}
        onProgress={vi.fn()}
      />
    );

    expect(screen.queryByText('View progress')).not.toBeInTheDocument();
  });

  it('renders the day progress bar', () => {
    render(
      <ChallengeCard
        challenge={challenge}
        status={mkStatus({ dayNumber: 15, daysLeft: 16 })}
        onStart={vi.fn()}
        onBegin={vi.fn()}
        onRestart={vi.fn()}
      />
    );

    const bar = document.querySelector('[style*="width: 50%"]');
    expect(bar).toBeInTheDocument();
  });

  describe('cohort (duration) challenge', () => {
    // The cohort opens on 2026-11-01; pin the clock to October so the
    // "opens" state is deterministic.
    beforeEach(() => {
      vi.setSystemTime(new Date(2026, 9, 10, 12));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('shows the open date and stays locked before the cohort starts', () => {
      render(
        <ChallengeCard
          challenge={maxChallenge}
          status={mkStatus({ status: 'not-started', dayNumber: 1, daysLeft: 30, score: 0, missedDays: 0 })}
          onStart={vi.fn()}
          onBegin={vi.fn()}
          onRestart={vi.fn()}
        />
      );

      expect(screen.getByText('30 days • hold as long as you can')).toBeInTheDocument();
      const button = screen.getByText('Opens November 1');
      expect(button).toBeDisabled();
    });

    it('prefers the account start op over the configured date', () => {
      localStorage.setItem(
        'challenge:plank-max',
        JSON.stringify({ startedAt: '2026-12-01', days: [] })
      );
      try {
        render(
          <ChallengeCard
            challenge={maxChallenge}
            status={mkStatus({ status: 'not-started', dayNumber: 1, daysLeft: 30, score: 0, missedDays: 0 })}
            onStart={vi.fn()}
            onBegin={vi.fn()}
            onRestart={vi.fn()}
          />
        );

        // The account's Dec 1 op (pushed by the admin CLI) wins over the
        // configured Nov 1.
        expect(screen.getByText('Opens December 1')).toBeInTheDocument();
      } finally {
        localStorage.removeItem('challenge:plank-max');
      }
    });

    it('offers no restart when a cohort challenge is complete', () => {
      render(
        <ChallengeCard
          challenge={maxChallenge}
          status={mkStatus({ status: 'complete', dayNumber: 30, daysLeft: 0, score: 120 })}
          onStart={vi.fn()}
          onBegin={vi.fn()}
          onRestart={vi.fn()}
        />
      );

      expect(screen.getByText('Finished')).toBeDisabled();
      expect(screen.queryByText('Start New Challenge')).not.toBeInTheDocument();
    });
  });
});
