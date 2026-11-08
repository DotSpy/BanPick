import { describe, expect, it } from 'vitest';
import { applyPick, confirmNext, resumeFromPause } from '../src/draft';
import type { Step } from '../src/model';
import { makePreset, started, step } from './fixtures';

/** A ban by A, then a ban by B (timer 20) carrying the pause under test. */
const draft = (pause: Step['pause'], between = false) =>
  started(makePreset([step('A', 'ban', 'maps', { timer: 30 }), step('B', 'ban', 'maps', { timer: 20, pause })], { pauses: { between } }));

describe('timed pause', () => {
  it('starts after the previous pick and ends at now + pause', () => {
    const s = draft(10);

    applyPick(s, 'A', 'map-1', 1000, false);

    expect([s.pausing, s.deadline]).toEqual([true, 11_000]);
  });

  it('blocks picks while it runs', () => {
    const s = draft(10);
    applyPick(s, 'A', 'map-1', 1000, false);

    expect(applyPick(s, 'B', 'map-2', 2000, false)).toMatch(/Paused/);
  });

  it('starts the step timer when it ends', () => {
    const s = draft(10);
    applyPick(s, 'A', 'map-1', 1000, false);

    resumeFromPause(s, 11_000);

    expect([s.pausing, s.deadline]).toEqual([false, 31_000]);
  });

  it('allows the pick once it ended', () => {
    const s = draft(10);
    applyPick(s, 'A', 'map-1', 1000, false);
    resumeFromPause(s, 11_000);

    expect(applyPick(s, 'B', 'map-2', 12_000, false)).toBeNull();
  });

  it('cannot be resumed when no pause is running', () => {
    const s = draft(undefined);

    expect(resumeFromPause(s, 0)).toBe('Not paused');
  });
});

describe('ready pause', () => {
  it('holds the step with no timer until both captains confirm', () => {
    const s = draft('ready');

    applyPick(s, 'A', 'map-1', 0, false);

    expect([s.confirm, s.deadline]).toEqual([{ A: false, B: false }, null]);
  });

  it('keeps waiting after only one captain confirmed', () => {
    const s = draft('ready');
    applyPick(s, 'A', 'map-1', 0, false);

    confirmNext(s, 'A', 5000);

    expect(s.confirm).toEqual({ A: true, B: false });
  });

  it('starts the step timer once both confirmed', () => {
    const s = draft('ready');
    applyPick(s, 'A', 'map-1', 0, false);
    confirmNext(s, 'A', 5000);

    confirmNext(s, 'B', 6000);

    expect([s.confirm, s.deadline]).toEqual([null, 26_000]);
  });

  it('blocks picks until both confirmed', () => {
    const s = draft('ready');
    applyPick(s, 'A', 'map-1', 0, false);

    expect(applyPick(s, 'B', 'map-2', 0, false)).toMatch(/must confirm/);
  });

  it('has nothing to confirm without a pause', () => {
    const s = draft(undefined);

    expect(confirmNext(s, 'A', 0)).toBe('Nothing to confirm');
  });
});

describe('pauses.between', () => {
  it('gates a step that has no pause of its own', () => {
    const s = draft(undefined, true);

    applyPick(s, 'A', 'map-1', 0, false);

    expect(s.confirm).toEqual({ A: false, B: false });
  });

  it('does not gate the first step', () => {
    const s = draft(undefined, true);

    expect(s.confirm).toBeNull();
  });

  it('yields to the pause of the step itself', () => {
    const s = draft(10, true);

    applyPick(s, 'A', 'map-1', 0, false);

    expect([s.pausing, s.confirm]).toEqual([true, null]);
  });

  it('is off by default', () => {
    const s = draft(undefined);

    applyPick(s, 'A', 'map-1', 0, false);

    expect([s.pausing, s.confirm, s.deadline]).toEqual([false, null, 20_000]);
  });
});
