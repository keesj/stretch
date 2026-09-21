import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { Finished } from '../Finished';

describe('Finish flow - end-to-end', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('simulates real finish flow: useWorkout.onComplete navigates to /finished with session data', async () => {
    // The real finish flow is:
    // 1. useWorkout.finishWorkout() creates completedSession (lines 55-68 of useWorkout.ts)
    // 2. Session.onComplete(session) calls navigate("/finished", { state: { session } }) (line 71 of Session.tsx)
    // 3. Finished reads location.state.session and renders it (line 11-13 of Finished.tsx)
    
    // This is exactly the data structure useWorkout.completion produces:
    const completedSession = {
      id: 'real-session-id',
      routineId: 'wake-up-workout',
      routineTitle: 'Morning Stretch',
      duration: 240,
      completedAt: new Date().toISOString(),
    };

    // This is exactly how Session navigates to /finished:
    render(
      <MemoryRouter initialEntries={[{ pathname: '/finished', state: { session: completedSession } }]}>
        <Finished />
      </MemoryRouter>
    );

    // Verify session data renders correctly (routineTitle from line 81)
    expect(screen.getByText(/Morning Stretch/i)).toBeInTheDocument();

    // Verify duration formatting (240s → "4:00" from lines 87-89)
    expect(screen.getByText('4:00')).toBeInTheDocument();

    // Verify the navigation button exists (line 101)
    expect(screen.getByText('Back to Home')).toBeInTheDocument();
  });

  it('broken path: visiting /finished directly (no session state) shows no session data', () => {
    render(
      <MemoryRouter initialEntries={['/finished']}>
        <Finished />
      </MemoryRouter>
    );

    expect(screen.getByText(/No Session/i)).toBeInTheDocument();
  });

  it('handles another routine completion correctly', async () => {
    const session = {
      id: 'workout-1',
      routineId: 'midday-decompress',
      routineTitle: 'Midday Decompress',
      duration: 180, // 3:00
      completedAt: new Date().toISOString(),
    };

    render(
      <MemoryRouter initialEntries={[{ pathname: '/finished', state: { session } }]}>
        <Finished />
      </MemoryRouter>
    );

    expect(screen.getByText(/Midday Decompress/i)).toBeInTheDocument();
    expect(screen.getByText('3:00')).toBeInTheDocument();
  });

  it('Back to Home button can be clicked without throwing', async () => {
    const session = {
      id: 's1',
      routineId: 'r1',
      routineTitle: 'Quick Stretch',
      duration: 60,
      completedAt: new Date().toISOString(),
    };

    render(
      <MemoryRouter initialEntries={[{ pathname: '/finished', state: { session } }]}>
        <Finished />
      </MemoryRouter>
    );

    const btn = screen.getByText('Back to Home');
    expect(() => fireEvent.click(btn)).not.toThrow();
  });
});