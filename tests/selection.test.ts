import { describe, expect, it } from 'vitest';
import { applyPick, autoChoice, randomAvailable, setSelection } from '../src/draft';
import { makePreset, started, step } from './fixtures';

const timedBan = () => started(makePreset([step('A', 'ban', 'maps', { timer: 30 })]));

describe('setSelection', () => {
  it('stores the selection of the team on turn', () => {
    const s = timedBan();

    setSelection(s, 'A', 'map-2');

    expect(s.selection).toEqual({ team: 'A', itemId: 'map-2' });
  });

  it('refuses a selection from the team that is not on turn', () => {
    const s = timedBan();

    expect(setSelection(s, 'B', 'map-2')).toBe('Not your turn');
  });

  it('refuses an item that is not available', () => {
    const s = timedBan();

    expect(setSelection(s, 'A', 'nope')).toBe('Item not available');
  });

  it('does not store a refused selection', () => {
    const s = timedBan();

    setSelection(s, 'A', 'nope');

    expect(s.selection).toBeFalsy();
  });

  it('clears the selection with null', () => {
    const s = timedBan();
    setSelection(s, 'A', 'map-2');

    setSelection(s, 'A', null);

    expect(s.selection).toBeNull();
  });

  it('is cleared when the pick is applied', () => {
    const s = timedBan();
    setSelection(s, 'A', 'map-2');

    applyPick(s, 'A', 'map-2', 0, true);

    expect(s.selection).toBeNull();
  });
});

describe('autoChoice (what the timer commits)', () => {
  it('is the selected item', () => {
    const s = timedBan();
    setSelection(s, 'A', 'map-2');

    expect(Array.from({ length: 20 }, () => autoChoice(s))).toEqual(Array(20).fill('map-2'));
  });

  it('is an available item when nothing is selected', () => {
    const s = timedBan();

    expect(['map-1', 'map-2', 'map-3']).toContain(autoChoice(s));
  });

  it('ignores a selection that was taken in the meantime', () => {
    const s = started(makePreset([step('A', 'ban', 'maps', { timer: 30 })]));
    setSelection(s, 'A', 'map-2');
    s.history.push({ index: 99, team: 'B', action: 'ban', target: 'maps', itemId: 'map-2', auto: false });

    expect(autoChoice(s)).not.toBe('map-2');
  });

  it('is null when the draft is not running', () => {
    const s = timedBan();
    applyPick(s, 'A', 'map-1', 0, true);

    expect(autoChoice(s)).toBeNull();
  });
});

describe('randomAvailable', () => {
  it('only returns items the current turn may take', () => {
    const s = started(makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps')]));
    applyPick(s, 'A', 'map-1', 0, false);

    const picks = new Set(Array.from({ length: 50 }, () => randomAvailable(s)));

    expect([...picks].sort()).toEqual(['map-2', 'map-3']);
  });
});
