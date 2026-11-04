import { describe, expect, it } from 'vitest';
import { expandSteps, turnsOf } from '../src/turns';
import { makePreset, step } from './fixtures';

describe('expandSteps', () => {
  it('turns a step with count n into n consecutive turns', () => {
    const turns = expandSteps([{ ...step('A', 'ban', 'maps'), count: 3 }]);

    expect(turns).toHaveLength(3);
  });

  it('keeps the step order of the preset', () => {
    const turns = expandSteps([step('A', 'ban', 'maps'), step('B', 'pick', 'maps')]);

    expect(turns.map((t) => `${t.team}:${t.action}`)).toEqual(['A:ban', 'B:pick']);
  });

  it('records which preset step each turn came from', () => {
    const turns = expandSteps([{ ...step('A', 'ban', 'maps'), count: 2 }, step('B', 'pick', 'maps')]);

    expect(turns.map((t) => t.step)).toEqual([0, 0, 1]);
  });

  it('defaults a missing timer to 0 (no timer)', () => {
    const [turn] = expandSteps([step('A', 'ban', 'maps')]);

    expect(turn.timer).toBe(0);
  });

  it('uses the tag name as target of a choose step', () => {
    const [turn] = expandSteps([step('A', 'choose', 'side')]);

    expect(turn.target).toBe('side');
  });

  it('copies timer, pause, restrict, blind and reveal onto every turn', () => {
    const turns = expandSteps([{ ...step('A', 'pick', 'maps', { timer: 20, pause: 'ready', restrict: 'tag', blind: true, reveal: 3 }), count: 2 }]);

    expect(turns).toEqual(Array(2).fill(expect.objectContaining({ timer: 20, pause: 'ready', restrict: 'tag', blind: true, reveal: 3 })));
  });
});

describe('turnsOf', () => {
  it('returns the same array for the same preset object', () => {
    const preset = makePreset([step('A', 'ban', 'maps')]);

    expect(turnsOf(preset)).toBe(turnsOf(preset));
  });
});
