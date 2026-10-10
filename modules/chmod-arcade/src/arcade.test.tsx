import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createLocalSystem, type KeyValueStorage, type SystemClient } from '@tuxos/system';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { explain, nextQuestion, octal, parseOctal, points, symbolic } from './game';
import { chmodArcade } from './index';
import ArcadeView from './view';

describe('game rules', () => {
  it('converts between octal and rwx like ls -l', () => {
    expect(symbolic(0o750)).toBe('rwxr-x---');
    expect(symbolic(0o644)).toBe('rw-r--r--');
    expect(octal(0o7)).toBe('007');
    expect([parseOctal('755'), parseOctal('0644'), parseOctal('8'), parseOctal('7777')])
      .toEqual([0o755, 0o644, undefined, undefined]);
  });

  it('explains each digit as a sum of 4, 2 and 1', () => {
    expect(explain(0o750)).toBe('owner rwx = 4+2+1 = 7, group r-x = 4+1 = 5, others --- = 0');
  });

  it('alternates question kinds and never repeats a mode back to back', () => {
    const first = nextQuestion(() => 0);
    const second = nextQuestion(() => 0, first);
    expect([first.kind, second.kind]).toEqual(['to-octal', 'to-symbolic']);
    expect(second.mode).not.toBe(first.mode);
  });

  it('rewards streaks, up to a cap', () => {
    expect([points(0), points(1), points(5), points(50)]).toEqual([10, 12, 20, 20]);
  });
});

const memory = (): KeyValueStorage => {
  const values = new Map<string, string>();
  return {
    get: async (key) => values.get(key) ?? null,
    set: async (key, value) => { values.set(key, value); },
    remove: async (key) => { values.delete(key); },
  };
};

async function boot(): Promise<SystemClient> {
  const system = createLocalSystem({
    storage: memory(), modules: [{ manifest: chmodArcade.manifest, load: async () => chmodArcade }],
  });
  await system.boot('ada');
  return system;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('chmod Arcade window', () => {
  it('scores a right answer, explains a wrong one, and saves the best score when time runs out', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const system = await boot();
    render(<ArcadeView system={system} windowId="window-1" />);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));

    // Math.random() = 0 always picks 644 first, as a "what number is this" question.
    expect(screen.getByText('rw-r--r--')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Octal permissions'), { target: { value: '644' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status').textContent).toBe('+10  rw-r--r-- is 644');

    // Then the other kind: switch on the bits for the next mode, but get it wrong (no bits set).
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    expect(screen.getByRole('status').textContent).toContain(': owner r');

    for (let second = 0; second <= 60; second += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
    }
    expect(screen.getByText('10 points')).toBeTruthy();
    vi.useRealTimers();
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 20)); });
    const scoreFile = '/home/ada/.local/share/tuxos/chmod-arcade.json';
    const saved = await system.dispatch<string>('fs.read', { path: scoreFile });
    expect(saved).toEqual({ ok: true, value: '{"best":10}\n' });
  });

  it('toggles permission bits for the octal question', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const system = await boot();
    render(<ArcadeView system={system} windowId="window-1" />);
    fireEvent.click(screen.getByRole('button', { name: 'Start' }));
    fireEvent.change(screen.getByLabelText('Octal permissions'), { target: { value: '644' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check' }));
    const ownerRead = screen.getByRole('button', { name: 'owner r' });
    fireEvent.click(ownerRead);
    expect(ownerRead.getAttribute('aria-pressed')).toBe('true');
    expect(ownerRead.textContent).toBe('r');
  });
});
