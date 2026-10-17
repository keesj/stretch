import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Chamber } from '../Chamber';

function seedChallenge(days: { date: string; seconds: number }[], startedAt: string) {
  // The chamber aggregates every configured challenge (today: the cohort).
  localStorage.setItem(
    'challenge:plank-max',
    JSON.stringify({ startedAt, days })
  );
}

function seedSessions(n: number) {
  localStorage.setItem(
    'completedSessions',
    JSON.stringify(
      Array.from({ length: n }, (_, i) => ({
        id: `s${i}`,
        routineId: 'r',
        routineTitle: 'T',
        duration: 60,
        completedAt: '2026-10-01T08:00:00.000Z'
      }))
    )
  );
}

// jsdom rects are all zeros; give the shelf a real 400x300 box so
// tap-to-place and drag positions are meaningful (0,0 = top-left).
function mockShelfRect(el: Element) {
  el.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 400,
      height: 300,
      x: 0,
      y: 0,
      right: 400,
      bottom: 300,
      toJSON: () => ({})
    }) as DOMRect;
}

function storedCase() {
  return JSON.parse(localStorage.getItem('stretch.trophyCase') ?? '{}');
}

const earned = (c: unknown, el: unknown) => el?.textContent === '✓ Earned';

describe('Chamber page', () => {
  it('shows an empty chamber with every trophy locked and an empty shelf', () => {
    render(<Chamber />);

    expect(screen.getByText('Trophy Chamber')).toBeInTheDocument();
    expect(screen.getByText((c, el) => el?.textContent === '· 0/9 earned')).toBeInTheDocument();
    expect(screen.queryAllByText(earned)).toHaveLength(0);
    expect(screen.getAllByText('Locked')).toHaveLength(9);
    // No title yet.
    expect(screen.getByText('no title yet')).toBeInTheDocument();
    // The empty free-form shelf.
    expect(
      screen.getByText('Your shelf is empty — pick an item below, then tap here to place it.')
    ).toBeInTheDocument();
    // Nothing to clear yet.
    expect(screen.queryByText('Clear shelf')).not.toBeInTheDocument();
    expect(screen.getByText((c, el) => el?.textContent === '0/24 · 0/0 pts')).toBeInTheDocument();
    // No points yet: the picker explains how to earn them.
    expect(
      screen.getByText('Complete a stretch session to earn your first 20 shelf points.')
    ).toBeInTheDocument();
    // Lifetime stats read empty.
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(4);
  });

  it('derives earned trophies from stored progress and shows lifetime stats', () => {
    // 7 consecutive days at the base hold + 2 sessions:
    // first-plank, two-minute-club, on-fire, session-one are earned.
    const days = [
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07'
    ].map((date) => ({ date, seconds: 120 }));
    seedChallenge(days, '2026-11-01');
    seedSessions(2);

    render(<Chamber />);

    expect(screen.getByText((c, el) => el?.textContent === '· 4/9 earned')).toBeInTheDocument();
    expect(screen.getAllByText(earned)).toHaveLength(4);
    expect(screen.getAllByText('Locked')).toHaveLength(5);
    // Lifetime stats.
    expect(screen.getByText('2:00')).toBeInTheDocument(); // best hold
    expect(screen.getByText('7 days')).toBeInTheDocument(); // longest streak
    // The 7-day streak earns the On Fire title (above Steady).
    expect(screen.getByText((c, el) => el?.textContent === '🔥 On Fire')).toBeInTheDocument();
    // Unearned trophies show their progress.
    expect(screen.getByText('7 / 15 days')).toBeInTheDocument(); // half-marathon
  });

  it('progress labels use the real values', () => {
    const days = [
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
      '2026-11-04',
      '2026-11-05',
      '2026-11-06',
      '2026-11-07'
    ].map((date) => ({ date, seconds: 120 }));
    seedChallenge(days, '2026-11-01');

    render(<Chamber />);

    expect(screen.getByText('7 / 15 days')).toBeInTheDocument(); // half-marathon
    expect(screen.getByText('2:00 / 5:00')).toBeInTheDocument(); // five-minute wall (120s/300s)
  });

  it('picks up an earned trophy, places it on the shelf, and removes it', () => {
    seedChallenge([{ date: '2026-11-01', seconds: 120 }], '2026-11-01');
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    // Pick it up from the case (the hint bar with a Drop button appears).
    fireEvent.click(screen.getByText('First Plank').closest('button')!);
    expect(screen.getByRole('button', { name: 'Drop' })).toBeInTheDocument();

    // Tap the shelf: placed at the tap position (100,150 of 400x300 → 25%,50%).
    fireEvent.click(shelf, { clientX: 100, clientY: 150 });
    expect(screen.getByRole('button', { name: 'First Plank on the shelf' })).toBeInTheDocument();
    expect(screen.getByText('on shelf')).toBeInTheDocument();
    // The holding hint is gone.
    expect(screen.queryByRole('button', { name: 'Drop' })).not.toBeInTheDocument();
    expect(storedCase().items).toEqual([{ item: 'first-plank', x: 25, y: 50, size: 1 }]);

    // Tap the item to select it, then remove it with ✕.
    fireEvent.click(screen.getByRole('button', { name: 'First Plank on the shelf' }));
    expect(screen.getByRole('button', { name: 'Remove First Plank' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Remove First Plank' }));
    expect(screen.queryByText('on shelf')).not.toBeInTheDocument();
    expect(storedCase().items).toEqual([]);
  });

  it('showing the placing hint does not move the shelf', () => {
    seedChallenge([{ date: '2026-11-01', seconds: 120 }], '2026-11-01');
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    expect(screen.queryByRole('button', { name: 'Drop' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('First Plank').closest('button')!);

    // The hint is an overlay *inside* the canvas (absolutely positioned),
    // so the canvas stays the panel's first child and never shifts down.
    const hint = screen.getByRole('button', { name: 'Drop' }).closest('div')!;
    expect(hint).toHaveClass('absolute');
    expect(shelf.parentElement!.firstChild).toBe(shelf);
  });

  it('twinkles ambient sparkles that stay out of the way', () => {
    const { container } = render(<Chamber />);

    const sparkles = container.querySelectorAll('[data-sparkle]');
    expect(sparkles).toHaveLength(6);
    for (const s of sparkles) {
      // Decorative: hidden from screen readers and the pointer.
      expect(s).toHaveAttribute('aria-hidden', 'true');
      expect(s).toHaveClass('pointer-events-none');
    }
  });

  it('bursts a sparkle at the placement spot, then lets it fade', async () => {
    seedChallenge([{ date: '2026-11-01', seconds: 120 }], '2026-11-01');
    const { container } = render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    expect(container.querySelectorAll('[data-burst]')).toHaveLength(0);

    fireEvent.click(screen.getByText('First Plank').closest('button')!);
    fireEvent.click(shelf, { clientX: 100, clientY: 150 });

    // The burst appears exactly where the item landed (25%,50%)...
    const burst = container.querySelector('[data-burst]');
    expect(burst).not.toBeNull();
    expect(burst).toHaveStyle({ left: '25%', top: '50%' });
    expect(burst).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelectorAll('[data-burst] span')).toHaveLength(5);

    // ...and clears itself once the twinkle fades.
    await waitFor(
      () => expect(container.querySelectorAll('[data-burst]')).toHaveLength(0),
      { timeout: 2000 }
    );
  });

  it('lets items overlap — the shelf is a diorama, not a grid', () => {
    seedChallenge([{ date: '2026-11-01', seconds: 120 }], '2026-11-01');
    seedSessions(25); // 500 pts: enough for the gem
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    fireEvent.click(screen.getByText('First Plank').closest('button')!);
    fireEvent.click(shelf, { clientX: 100, clientY: 150 });
    fireEvent.click(screen.getByRole('button', { name: 'Pick up Gem, 500 points' }));
    // Same spot on purpose.
    fireEvent.click(shelf, { clientX: 100, clientY: 150 });

    expect(screen.getByRole('button', { name: 'First Plank on the shelf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gem on the shelf' })).toBeInTheDocument();
    const stored = storedCase();
    expect(stored.items).toHaveLength(2);
    expect(stored.items[1]).toEqual({ item: 'gem', x: 25, y: 50, size: 1 });
  });

  it('drags a placed item to a new spot', () => {
    seedChallenge([{ date: '2026-11-01', seconds: 120 }], '2026-11-01');
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    fireEvent.click(screen.getByText('First Plank').closest('button')!);
    fireEvent.click(shelf, { clientX: 100, clientY: 150 });
    const item = screen.getByRole('button', { name: 'First Plank on the shelf' });

    // Press, drag well past the 8px threshold, release.
    fireEvent.pointerDown(item, { clientX: 100, clientY: 150 });
    fireEvent.pointerMove(shelf, { clientX: 300, clientY: 150 });
    fireEvent.pointerUp(item);

    expect(storedCase().items).toEqual([{ item: 'first-plank', x: 75, y: 50, size: 1 }]);
  });

  it('treats a tiny pointer wiggle as a tap, not a drag', () => {
    seedChallenge([{ date: '2026-11-01', seconds: 120 }], '2026-11-01');
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    fireEvent.click(screen.getByText('First Plank').closest('button')!);
    fireEvent.click(shelf, { clientX: 100, clientY: 150 });
    const item = screen.getByRole('button', { name: 'First Plank on the shelf' });

    // Under 8px: no move committed.
    fireEvent.pointerDown(item, { clientX: 100, clientY: 150 });
    fireEvent.pointerMove(shelf, { clientX: 103, clientY: 152 });
    fireEvent.pointerUp(item);
    expect(storedCase().items).toEqual([{ item: 'first-plank', x: 25, y: 50, size: 1 }]);

    // The synthesized click after the tap selects the item.
    fireEvent.click(item);
    expect(screen.getByRole('button', { name: 'Remove First Plank' })).toBeInTheDocument();
  });

  it('double-taps to grow an item (2× points) and back', () => {
    seedSessions(3); // 60 pts
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    fireEvent.click(screen.getByRole('button', { name: 'Pick up Plant, 20 points' }));
    fireEvent.click(shelf, { clientX: 100, clientY: 150 });

    // Grow: its cost doubles from 20 to 40.
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Plant on the shelf' }));
    expect(storedCase().items).toEqual([{ item: 'plant', x: 25, y: 50, size: 2 }]);
    expect(screen.getByText((c, el) => el?.textContent === '1/24 · 40/60 pts')).toBeInTheDocument();

    // Grow back to normal: the capacity comes back.
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Plant on the shelf (grown)' }));
    expect(storedCase().items).toEqual([{ item: 'plant', x: 25, y: 50, size: 1 }]);
    expect(screen.getByText((c, el) => el?.textContent === '1/24 · 20/60 pts')).toBeInTheDocument();
  });

  it('does not grow an item that would exceed the point cap', () => {
    seedSessions(3); // 60 pts
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    // Spend everything: candle 40 + star 20 = 60.
    fireEvent.click(screen.getByRole('button', { name: 'Pick up Candle, 40 points' }));
    fireEvent.click(shelf, { clientX: 50, clientY: 150 });
    fireEvent.click(screen.getByRole('button', { name: 'Pick up Star, 20 points' }));
    fireEvent.click(shelf, { clientX: 300, clientY: 150 });

    // Growing the star would need 20 more pts — it stays normal.
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Star on the shelf' }));
    expect(storedCase().items).toEqual([
      { item: 'candle', x: 12.5, y: 50, size: 1 },
      { item: 'star', x: 75, y: 50, size: 1 }
    ]);
    expect(screen.getByText((c, el) => el?.textContent === '2/24 · 60/60 pts')).toBeInTheDocument();
  });

  it('with no points, free items are unaffordable but trophies are still free', () => {
    seedChallenge([{ date: '2026-11-01', seconds: 120 }], '2026-11-01');
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    expect(screen.getByRole('button', { name: 'Pick up Music note, 10 points' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Pick up Ruby, 1000 points' })).toBeDisabled();

    // Trophies are earned, not bought — placeable with 0 pts.
    fireEvent.click(screen.getByText('First Plank').closest('button')!);
    fireEvent.click(shelf, { clientX: 100, clientY: 150 });
    expect(screen.getByRole('button', { name: 'First Plank on the shelf' })).toBeInTheDocument();
    expect(screen.getByText((c, el) => el?.textContent === '1/24 · 0/0 pts')).toBeInTheDocument();
  });

  it('spends points up to the value cap, then locks the picker', () => {
    seedSessions(3); // 60 pts
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    fireEvent.click(screen.getByRole('button', { name: 'Pick up Plant, 20 points' }));
    fireEvent.click(shelf, { clientX: 50, clientY: 50 });
    fireEvent.click(screen.getByRole('button', { name: 'Pick up Candle, 40 points' }));
    fireEvent.click(shelf, { clientX: 300, clientY: 50 });

    expect(screen.getByText((c, el) => el?.textContent === '2/24 · 60/60 pts')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick up Star, 20 points' })).toBeDisabled();
  });

  it('removing an item frees capacity again', () => {
    seedSessions(3); // 60 pts
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    fireEvent.click(screen.getByRole('button', { name: 'Pick up Candle, 40 points' }));
    fireEvent.click(shelf, { clientX: 50, clientY: 50 });
    fireEvent.click(screen.getByRole('button', { name: 'Pick up Star, 20 points' }));
    fireEvent.click(shelf, { clientX: 300, clientY: 50 });
    expect(screen.getByRole('button', { name: 'Pick up Plant, 20 points' })).toBeDisabled();

    // Remove the candle: 40 pts of capacity come back.
    fireEvent.click(screen.getByRole('button', { name: 'Candle on the shelf' }));
    fireEvent.click(screen.getByRole('button', { name: 'Remove Candle' }));

    expect(screen.getByRole('button', { name: 'Pick up Plant, 20 points' })).toBeEnabled();
    expect(screen.getByText((c, el) => el?.textContent === '1/24 · 20/60 pts')).toBeInTheDocument();
  });

  it('caps the shelf at 24 items and disables the picker when full', () => {
    localStorage.setItem(
      'stretch.trophyCase',
      JSON.stringify({
        background: 'classic',
        items: Array.from({ length: 24 }, () => ({ item: 'gem', x: 50, y: 50 }))
      })
    );
    render(<Chamber />);

    expect(
      screen.getByText((c, el) => el?.textContent === '24/24 · 12000/0 pts')
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pick up Gem, 500 points' })).toBeDisabled();
  });

  it('clears the whole shelf in one go', () => {
    seedChallenge([{ date: '2026-11-01', seconds: 120 }], '2026-11-01');
    render(<Chamber />);
    const shelf = screen.getByRole('group', { name: 'Shelf' });
    mockShelfRect(shelf);

    seedSessions(25); // 500 pts: enough for the gem
    fireEvent.click(screen.getByText('First Plank').closest('button')!);
    fireEvent.click(shelf, { clientX: 100, clientY: 150 });
    fireEvent.click(screen.getByRole('button', { name: 'Pick up Gem, 500 points' }));
    fireEvent.click(shelf, { clientX: 200, clientY: 150 });

    expect(screen.getByText('Clear shelf')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Clear shelf'));
    expect(storedCase().items).toEqual([]);
    expect(screen.queryByText('Clear shelf')).not.toBeInTheDocument();
    expect(
      screen.getByText('Your shelf is empty — pick an item below, then tap here to place it.')
    ).toBeInTheDocument();
  });

  it('loads a legacy grid shelf from an older build without crashing', () => {
    // The shelf used to be a 4x4 grid: a browser that ran that build has
    // a legacy-shaped blob AND the legacy op in the journal. The cells map
    // to cell-center positions.
    const grid = Array(16).fill(null);
    grid[0] = 'first-plank';
    grid[5] = 'gem';
    localStorage.setItem('stretch.trophyCase', JSON.stringify({ background: 'garden', slots: grid }));
    localStorage.setItem(
      'stretch.journal',
      JSON.stringify([
        {
          id: 'case-legacy-1',
          hlc: '0000000000000000001',
          device: 'device-1',
          entity: 'trophyCase',
          entityId: 'me',
          kind: 'patch',
          data: { background: 'garden', slots: grid }
        }
      ])
    );

    render(<Chamber />);

    // The legacy blob is converted in memory...
    expect(screen.getByRole('group', { name: 'Shelf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'First Plank on the shelf' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gem on the shelf' })).toBeInTheDocument();

    // ...and the first change re-projects from the journal, keeping the
    // decoration and persisting the current shape (no more slots).
    fireEvent.click(screen.getByRole('button', { name: 'Midnight background' }));
    const stored = storedCase();
    expect(stored.background).toBe('midnight');
    expect(stored.slots).toBeUndefined();
    expect(stored.items).toEqual([
      { item: 'first-plank', x: 12.5, y: 12.5, size: 1 },
      { item: 'gem', x: 37.5, y: 37.5, size: 1 }
    ]);
  });

  it('changes the background and remembers the choice in the projection', () => {
    render(<Chamber />);

    const midnight = screen.getByRole('button', { name: 'Midnight background' });
    fireEvent.click(midnight);
    expect(midnight).toHaveAttribute('aria-pressed', 'true');
    // The decoration was journaled and reprojected into the blob.
    const stored = storedCase();
    expect(stored.background).toBe('midnight');
  });
});
