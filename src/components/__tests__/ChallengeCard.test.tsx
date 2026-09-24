import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ChallengeCard } from '../ChallengeCard';
import type { Challenge, ChallengeStatus } from '../../types/challenge';

const challenge: Challenge = {
  id: 'plank-30-day',
  title: '30-Day Plank Challenge',
  description: 'Hold a 2-minute plank every day for 30 days.',
  exerciseId: 'plank-hold',
  totalDays: 30,
  baseSeconds: 120,
  bonusSeconds: 30,
  bonusPoints: 0.5,
  missedDayPenalty: 0.5,
  illustration: '💪',
};

function mkStatus(overrides: Partial<ChallengeStatus> = {}): ChallengeStatus {
  return {
    status: 'active',
    dayNumber: 5,
    daysLeft: 26,
    todayDone: false,
    todaySeconds: 0,
    todayPoints: 0,
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
    expect(screen.getByText('Missed days: 1 (−0.5 pts)')).toBeInTheDocument();

    await userEvent.setup().click(screen.getByText('Start Day 5'));
    expect(onBegin).toHaveBeenCalledTimes(1);
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
});
