import { describe, expect, it } from 'vitest';
import { applyPick, currentTurn } from '../src/draft';
import { availableList, tagsOf } from '../src/rules';
import { makePreset, sideTagging, started, step } from './fixtures';

describe('tag assignment', () => {
  it('none: no team holds a tag', () => {
    const s = started(makePreset([step('A', 'ban', 'maps')]));

    expect(tagsOf(s)).toEqual({ A: null, B: null });
  });

  it('fixed: each seat holds its configured value from the start', () => {
    const preset = makePreset([step('A', 'ban', 'maps')], {
      tagging: { ...sideTagging(), assignment: 'fixed', seats: { A: 'nato', B: 'pact' } },
    });

    expect(tagsOf(started(preset))).toEqual({ A: 'nato', B: 'pact' });
  });

  it('chosen: nobody holds a tag before the choose step', () => {
    const s = started(makePreset([step('A', 'choose', 'side')], { tagging: sideTagging() }));

    expect(tagsOf(s)).toEqual({ A: null, B: null });
  });

  it('chosen: the choosing team holds the chosen value', () => {
    const s = started(makePreset([step('A', 'choose', 'side')], { tagging: sideTagging() }));

    applyPick(s, 'A', 'nato', 0, false);

    expect(tagsOf(s).A).toBe('nato');
  });

  it('chosen with two values and forbid: the opponent gets the other value', () => {
    const s = started(makePreset([step('A', 'choose', 'side')], { tagging: sideTagging('forbid') }));

    applyPick(s, 'A', 'nato', 0, false);

    expect(tagsOf(s).B).toBe('pact');
  });

  it('chosen with two values and forbid: the opponent has no choose turn left', () => {
    const preset = makePreset([step('A', 'choose', 'side'), step('B', 'choose', 'side'), step('A', 'ban', 'maps')], { tagging: sideTagging('forbid') });
    const s = started(preset);

    applyPick(s, 'A', 'nato', 0, false);

    expect(currentTurn(s)).toMatchObject({ team: 'A', action: 'ban' });
  });

  it('chosen with allow: the opponent may choose the same value', () => {
    const s = started(makePreset([step('A', 'choose', 'side'), step('B', 'choose', 'side')], { tagging: sideTagging('allow') }));
    applyPick(s, 'A', 'nato', 0, false);

    const error = applyPick(s, 'B', 'nato', 0, false);

    expect(error).toBeNull();
  });

  it('chosen with allow: the opponent still chooses on their own turn', () => {
    const s = started(makePreset([step('A', 'choose', 'side'), step('B', 'choose', 'side')], { tagging: sideTagging('allow') }));

    applyPick(s, 'A', 'nato', 0, false);

    expect(tagsOf(s).B).toBeNull();
  });

  it('chosen with forbid and three values: the opponent cannot take the same value', () => {
    const tagging = { ...sideTagging('forbid'), values: ['a', 'b', 'c'] };
    const s = started(makePreset([step('A', 'choose', 'side'), step('B', 'choose', 'side')], { tagging }));
    applyPick(s, 'A', 'a', 0, false);

    expect(availableList(s, currentTurn(s)!)).toEqual(['b', 'c']);
  });
});
