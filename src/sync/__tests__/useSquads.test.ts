import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSquads } from '../useSquads';
import { fetchSquads } from '../syncClient';

vi.mock('../syncClient', () => ({
  fetchSquads: vi.fn()
}));

const SQUAD = { id: 'squad-a', name: 'Alphas' };

beforeEach(() => {
  localStorage.clear();
  vi.mocked(fetchSquads).mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function linked() {
  localStorage.setItem('stretch.token', 'test-token');
}

describe('useSquads', () => {
  it('returns no squads and never fetches when the device is not linked', async () => {
    vi.mocked(fetchSquads).mockResolvedValue([SQUAD]);
    const { result } = renderHook(() => useSquads());

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.squads).toEqual([]);
    expect(fetchSquads).not.toHaveBeenCalled();
  });

  it('fetches the account\'s squads when linked', async () => {
    linked();
    vi.mocked(fetchSquads).mockResolvedValue([SQUAD]);

    const { result } = renderHook(() => useSquads());
    await waitFor(() => expect(result.current.squads).toEqual([SQUAD]));
    expect(fetchSquads).toHaveBeenCalledTimes(1);
  });

  it('keeps the last known squads when a refresh fails', async () => {
    linked();
    vi.mocked(fetchSquads)
      .mockResolvedValueOnce([SQUAD])
      .mockRejectedValueOnce(new Error('offline'));

    const { result } = renderHook(() => useSquads());
    await waitFor(() => expect(result.current.squads).toEqual([SQUAD]));

    act(() => {
      void result.current.refresh();
    });
    await waitFor(() => expect(fetchSquads).toHaveBeenCalledTimes(2));
    expect(result.current.squads).toEqual([SQUAD]);
  });

  it('seeds a fresh mount from the module cache without waiting on the network', async () => {
    linked();
    vi.mocked(fetchSquads).mockResolvedValue([SQUAD]);

    const first = renderHook(() => useSquads());
    await waitFor(() => expect(first.result.current.squads).toEqual([SQUAD]));
    first.unmount();

    // The remount starts from the cached list, so the nav tabs do not
    // flicker hidden between route changes.
    const second = renderHook(() => useSquads());
    expect(second.result.current.squads).toEqual([SQUAD]);
    second.unmount();
  });

  it('exposes a manual refresh', async () => {
    linked();
    vi.mocked(fetchSquads).mockResolvedValueOnce([SQUAD]).mockResolvedValueOnce([SQUAD]);

    const { result } = renderHook(() => useSquads());
    await waitFor(() => expect(result.current.squads).toEqual([SQUAD]));

    act(() => {
      void result.current.refresh();
    });
    await waitFor(() => expect(fetchSquads).toHaveBeenCalledTimes(2));
  });
});
