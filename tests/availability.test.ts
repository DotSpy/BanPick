import { describe, expect, it } from 'vitest';
import { applyPick, currentTurn, type DraftState } from '../src/draft';
import { availableList } from '../src/rules';
import { items, makePreset, sideTagging, started, step } from './fixtures';

const options = (s: DraftState) => availableList(s, currentTurn(s)!);

describe('global pool', () => {
  const twoSteps = () => makePreset([step('A', 'ban', 'maps'), step('B', 'pick', 'maps')]);

  it('a ban removes the item for the opponent', () => {
    const s = started(twoSteps());

    applyPick(s, 'A', 'map-1', 0, false);

    expect(options(s)).toEqual(['map-2', 'map-3']);
  });

  it('a pick removes the item for everyone', () => {
    const s = started(makePreset([step('A', 'pick', 'maps'), step('A', 'ban', 'maps')]));

    applyPick(s, 'A', 'map-2', 0, false);

    expect(options(s)).toEqual(['map-1', 'map-3']);
  });

  it('refuses an item that was already taken', () => {
    const s = started(twoSteps());
    applyPick(s, 'A', 'map-1', 0, false);

    expect(applyPick(s, 'B', 'map-1', 0, false)).toBe('Item not available');
  });

  it('refuses an id that is not in the pool', () => {
    const s = started(twoSteps());

    expect(applyPick(s, 'A', 'nope', 0, false)).toBe('Item not available');
  });
});

describe('shared pool', () => {
  const steps = () => [step('A', 'ban', 'divisions'), step('B', 'pick', 'divisions'), step('A', 'pick', 'divisions'), step('B', 'pick', 'divisions')];

  it('a ban removes the item from the opponent only', () => {
    const s = started(makePreset(steps()));

    applyPick(s, 'A', 'cav', 0, false);

    expect(options(s)).not.toContain('cav');
  });

  it('the banning team can still pick the item it banned', () => {
    const s = started(makePreset(steps()));
    applyPick(s, 'A', 'cav', 0, false);
    applyPick(s, 'B', 'gd', 0, false);

    expect(options(s)).toContain('cav');
  });

  it('a pick leaves the item available to the opponent (shared pool)', () => {
    const s = started(makePreset([step('A', 'pick', 'divisions'), step('B', 'pick', 'divisions')]));

    applyPick(s, 'A', 'cav', 0, false);

    expect(options(s)).toContain('cav');
  });

  it('the picker cannot take the same item twice', () => {
    const s = started(makePreset([step('A', 'pick', 'divisions'), step('A', 'pick', 'divisions')]));
    applyPick(s, 'A', 'cav', 0, false);

    expect(options(s)).not.toContain('cav');
  });
});

describe('restrict', () => {
  const sided = (steps: ReturnType<typeof step>[]) => makePreset([step('A', 'choose', 'side'), ...steps], { tagging: sideTagging() });

  it('a pick is limited to items with the team tag value', () => {
    const s = started(sided([step('A', 'pick', 'divisions', { restrict: 'tag' })]));

    applyPick(s, 'A', 'nato', 0, false);

    expect(options(s)).toEqual(['cav', 'ranger']);
  });

  it('a pick of the other tag value is refused', () => {
    const s = started(sided([step('A', 'pick', 'divisions', { restrict: 'tag' })]));
    applyPick(s, 'A', 'nato', 0, false);

    expect(applyPick(s, 'A', 'gd', 0, false)).toBe('Item not available');
  });

  it('a ban on a shared pool is limited to the opponent tag value', () => {
    const s = started(sided([step('A', 'ban', 'divisions', { restrict: 'tag' })]));

    applyPick(s, 'A', 'nato', 0, false);

    expect(options(s)).toEqual(['gd', 'tank']);
  });

  it('an unrestricted step ignores tags', () => {
    const s = started(sided([step('A', 'pick', 'divisions')]));

    applyPick(s, 'A', 'nato', 0, false);

    expect(options(s)).toHaveLength(4);
  });

  it('with fixed tags the restriction applies from the first turn', () => {
    const tagging = { ...sideTagging(), assignment: 'fixed' as const, seats: { A: 'nato', B: 'pact' } };
    const s = started(makePreset([step('B', 'pick', 'divisions', { restrict: 'tag' })], { tagging }));

    expect(options(s)).toEqual(['gd', 'tank']);
  });
});

describe('skipping turns without options', () => {
  it('moves past a turn when nothing is available', () => {
    const preset = makePreset([{ ...step('A', 'ban', 'maps'), count: 2 }, step('B', 'ban', 'maps')]);
    preset.pools.maps.items = items('only');
    const s = started(preset);

    applyPick(s, 'A', 'only', 0, false);

    expect(s.phase).toBe('done');
  });
});
