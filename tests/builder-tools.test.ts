import { describe, expect, it } from 'vitest';
import * as E from '../src/builder/edit';
import { stepWarnings } from '../src/builder/check';

describe('renamePool', () => {
  it('renames the pool and the steps that use it', () => {
    const p = E.renamePool(E.newPreset(), 'items', 'maps');

    expect([Object.keys(p.pools), p.steps[0].pool]).toEqual([['maps'], 'maps']);
  });

  it('ignores a name that is already taken', () => {
    const p = E.addPool(E.newPreset(), 'maps');

    expect(E.renamePool(p, 'items', 'maps')).toBe(p);
  });
});

describe('addItems', () => {
  it('adds one item per non-empty line with ids from the names', () => {
    const p = E.addItems(E.newPreset(), 'items', 'Red Fox\n\n  Blue Owl \r\n');

    expect(p.pools.items.items.slice(2)).toEqual([{ id: 'red-fox', name: 'Red Fox' }, { id: 'blue-owl', name: 'Blue Owl' }]);
  });

  it('keeps ids unique when names repeat', () => {
    const p = E.addItems(E.newPreset(), 'items', 'Item 1\nItem 1');

    expect(p.pools.items.items.map((i) => i.id).slice(2)).toEqual(['item-1-2', 'item-1-3']);
  });
});

describe('duplicateStep', () => {
  it('inserts a copy right after the step', () => {
    const p = E.duplicateStep({ ...E.newPreset(), steps: [{ team: 'A', action: 'ban', pool: 'items', count: 1 }, { team: 'B', action: 'pick', pool: 'items', count: 2 }] }, 0);

    expect(p.steps.map((s) => [s.team, s.action])).toEqual([['A', 'ban'], ['A', 'ban'], ['B', 'pick']]);
  });

  it('shifts blind reveal indices that point past the copy', () => {
    const base = E.newPreset();
    const steps = [{ team: 'A' as const, action: 'pick' as const, pool: 'items', count: 1, blind: true, reveal: 2 }, { team: 'B' as const, action: 'ban' as const, pool: 'items', count: 1 }, { team: 'A' as const, action: 'ban' as const, pool: 'items', count: 1 }];

    expect(E.duplicateStep({ ...base, steps }, 1).steps[0].reveal).toBe(3);
  });
});

describe('alternateSteps', () => {
  it('appends single-turn steps alternating A and B', () => {
    const p = E.alternateSteps({ ...E.newPreset(), steps: [] }, 'pick', 'items', 3);

    expect(p.steps.map((s) => `${s.team}${s.action}${s.count}`)).toEqual(['Apick1', 'Bpick1', 'Apick1']);
  });
});

describe('stepWarnings', () => {
  const two = (steps: { count: number }[], scope?: 'shared') => ({
    ...E.newPreset(),
    pools: { items: { items: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }], ...(scope ? { scope } : {}) } },
    steps: steps.map(({ count }) => ({ team: 'A' as const, action: 'ban' as const, pool: 'items', count })),
  });

  it('is silent when the pool holds enough items', () => {
    expect(stepWarnings(two([{ count: 2 }]))).toEqual(['']);
  });

  it('warns on the step where a global pool runs short', () => {
    expect(stepWarnings(two([{ count: 1 }, { count: 2 }]))).toEqual(['', expect.stringContaining('need 3')]);
  });

  it('checks each step alone for a shared pool', () => {
    expect(stepWarnings(two([{ count: 2 }, { count: 2 }], 'shared'))).toEqual(['', '']);
  });
});
