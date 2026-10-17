import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Standings } from './Standings';
import { fetchStandings } from '../sync/syncClient';
import { useSquads } from '../sync/useSquads';

vi.mock('../sync/syncClient', () => ({
  fetchStandings: vi.fn()
}));

vi.mock('../sync/useSquads', () => ({
  useSquads: vi.fn()
}));

const feed = {
  asOf: '2026-11-05',
  roster: [
    {
      accountId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      name: 'Ana',
      avatar: '🐢',
      startedAt: '2026-11-01',
      days: [{ date: '2026-11-04', seconds: 300 }]
    },
    {
      accountId: '11111111-2222-4333-8444-555555555555',
      name: 'Bob',
      avatar: '',
      startedAt: '2026-11-01',
      days: [{ date: '2026-11-04', seconds: 240 }]
    }
  ]
};

const SQUAD = { id: 'squad-a', name: 'Alphas' };
const SQUAD_2 = { id: 'squad-b', name: 'Betas' };

describe('Standings page', () => {
  beforeEach(() => {
    // Nov 5: inside the plank-max window (opens Oct 28); the earlier plank
    // cohort is finished, so the active challenge is plank-max.
    vi.setSystemTime(new Date(2026, 10, 5, 12));
    vi.mocked(fetchStandings).mockResolvedValue(feed);
    vi.mocked(useSquads).mockReturnValue({ squads: [SQUAD], loading: false, refresh: vi.fn() });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks the earlier cohort while it is the running challenge', async () => {
    vi.setSystemTime(new Date(2026, 9, 20, 12)); // Oct 20: inside the plank window
    render(<Standings />);

    await vi.waitFor(() => expect(fetchStandings).toHaveBeenCalledWith('plank', 'squad-a'));
    expect(screen.getByText('Alphas · 30-Day Plank Challenge')).toBeInTheDocument();
  });

  it('renders yesterday\'s podium with points, taunt, and titles', async () => {
    render(<Standings />);

    expect(await screen.findByText('Squad')).toBeInTheDocument();
    // The feed is requested for the squad the account belongs to.
    await vi.waitFor(() =>
      expect(fetchStandings).toHaveBeenCalledWith('plank-max', 'squad-a')
    );
    expect(
      screen.getByText(
        (c, el) => !!el && el.children.length === 0 && (el.textContent ?? '').startsWith('Yesterday · ')
      )
    ).toBeInTheDocument();

    // Podium: Ana first (300 s = 4 pts), Bob second (240 s = 3 pts).
    expect(screen.getByText('5:00')).toBeInTheDocument();
    expect(screen.getByText('4:00')).toBeInTheDocument();
    expect(screen.getByText('+4 pts')).toBeInTheDocument();
    expect(screen.getByText('+3 pts')).toBeInTheDocument();
    // The 60 s margin earns the "out-planked" line.
    expect(screen.getByText('Ana out-planked Bob by 60s. The floor is theirs.')).toBeInTheDocument();
    // Derived titles show next to the names (podium + leaderboard).
    expect(screen.getAllByText((c, el) => el?.textContent === '🛡️ Endurance')).toHaveLength(2);
    expect(screen.getAllByText((c, el) => el?.textContent === '⏱️ Steady')).toHaveLength(2);
    // The quiet-day note.
    expect(screen.getByText(/Standings are revealed once a day ends/)).toBeInTheDocument();
  });

  it('shows the overall leaderboard with totals', async () => {
    render(<Standings />);

    await screen.findByText('Overall');
    expect(screen.getByText('4 pts')).toBeInTheDocument();
    expect(screen.getByText('3 pts')).toBeInTheDocument();
  });

  it('shows an empty state when nobody is in the squad', async () => {
    vi.mocked(fetchStandings).mockResolvedValue({ asOf: '2026-11-05', roster: [] });
    render(<Standings />);

    expect(await screen.findByText(/Nobody in the squad yet/)).toBeInTheDocument();
  });

  it('surfaces a fetch error', async () => {
    vi.mocked(fetchStandings).mockRejectedValue(new Error('network down'));
    render(<Standings />);

    expect(await screen.findByText('network down')).toBeInTheDocument();
  });

  it('shows a join hint and skips the feed when the account is in no squad', async () => {
    vi.mocked(useSquads).mockReturnValue({ squads: [], loading: false, refresh: vi.fn() });
    render(<Standings />);

    expect(await screen.findByText('No squad yet')).toBeInTheDocument();
    expect(screen.getByText(/ask your organizer to add your account/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Check again' })).toBeInTheDocument();
    expect(fetchStandings).not.toHaveBeenCalled();
  });

  it('shows a selector and switches squads when the account is in several', async () => {
    vi.mocked(useSquads).mockReturnValue({
      squads: [SQUAD, SQUAD_2],
      loading: false,
      refresh: vi.fn()
    });
    render(<Standings />);

    // The first squad is shown by default.
    await screen.findByText('5:00');
    expect(screen.getByText('Alphas · 30-Day Plank Max Challenge')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alphas' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(screen.getByRole('button', { name: 'Betas' }));
    await vi.waitFor(() => expect(fetchStandings).toHaveBeenLastCalledWith('plank-max', 'squad-b'));
    expect(screen.getByRole('button', { name: 'Betas' })).toHaveAttribute('aria-pressed', 'true');
  });
});
