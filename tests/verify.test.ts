import { describe, expect, it } from 'vitest';
import { applyPick, confirmNext, fingerprint, picksOf, resumeFromPause, verifyState } from '../src/draft';
import { makePreset, sideTagging, started, step } from './fixtures';

const sided = () =>
  makePreset([step('A', 'choose', 'side'), step('A', 'ban', 'maps'), step('B', 'pick', 'divisions', { restrict: 'tag' })], { tagging: sideTagging() });

/** Both seats owned, A has chosen a side (committed by `by`). */
function afterChoice(by: string | undefined) {
  const s = started(sided());
  s.teams.A.owner = 'uid-a';
  s.teams.B.owner = 'uid-b';
  applyPick(s, 'A', 'nato', 0, false);
  s.history[0].by = by;
  return s;
}

describe('verifyState', () => {
  it('accepts an empty draft', () => {
    expect(verifyState(started(sided()))).toBeNull();
  });

  it('accepts a complete legal draft', () => {
    const s = started(sided());
    applyPick(s, 'A', 'nato', 0, false);
    applyPick(s, 'A', 'map-1', 0, false);
    applyPick(s, 'B', 'gd', 0, false);

    expect(verifyState(s)).toBeNull();
  });

  it('accepts an entry committed by the seat owner', () => {
    expect(verifyState(afterChoice('uid-a'))).toBeNull();
  });

  it('accepts a legacy entry without attribution', () => {
    expect(verifyState(afterChoice(undefined))).toBeNull();
  });

  it('flags an entry committed by someone who does not own the seat', () => {
    expect(verifyState(afterChoice('uid-b'))).toMatch(/not requested by its seat owner/);
  });

  it('accepts an automatic pick on a timed step', () => {
    const s = started(makePreset([step('A', 'ban', 'maps', { timer: 30 })]));
    applyPick(s, 'A', 'map-1', 0, true);

    expect(verifyState(s)).toBeNull();
  });

  it('flags an automatic pick on a step without a timer', () => {
    const s = started(makePreset([step('A', 'ban', 'maps')]));
    applyPick(s, 'A', 'map-1', 0, true);

    expect(verifyState(s)).toMatch(/no timer/);
  });

  it('flags an entry whose action differs from the preset', () => {
    const s = afterChoice(undefined);
    s.history[0].action = 'pick';

    expect(verifyState(s)).toMatch(/step order/);
  });

  it('flags an entry by the wrong team', () => {
    const s = afterChoice(undefined);
    s.history[0].team = 'B';

    expect(verifyState(s)).toMatch(/step order/);
  });

  it('flags an item that was not legal at that point', () => {
    const s = afterChoice(undefined);
    s.history[0].itemId = 'bogus';

    expect(verifyState(s)).toMatch(/illegal/);
  });

  it('flags a restricted pick of the wrong tag value', () => {
    const s = started(sided());
    applyPick(s, 'A', 'nato', 0, false);
    applyPick(s, 'A', 'map-1', 0, false);
    s.history.push({ index: 2, team: 'B', action: 'pick', target: 'divisions', itemId: 'cav', auto: false });

    expect(verifyState(s)).toMatch(/illegal/);
  });

  it('flags entries after the draft ended', () => {
    const s = started(makePreset([step('A', 'ban', 'maps')]));
    applyPick(s, 'A', 'map-1', 0, false);
    s.history.push({ index: 1, team: 'B', action: 'ban', target: 'maps', itemId: 'map-2', auto: false });

    expect(verifyState(s)).toMatch(/after the draft ended/);
  });

  it('flags a draft position that does not match its history', () => {
    const s = afterChoice(undefined);
    s.turnIndex = 0;

    expect(verifyState(s)).toMatch(/position/);
  });

  it('replays pauses and ready gates so later entries still verify', () => {
    const s = started(makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps', { pause: 5 }), step('A', 'ban', 'maps', { pause: 'ready' })]));
    applyPick(s, 'A', 'map-1', 0, false);
    resumeFromPause(s, 5000);
    applyPick(s, 'B', 'map-2', 5000, false);
    confirmNext(s, 'A', 6000);
    confirmNext(s, 'B', 6000);
    applyPick(s, 'A', 'map-3', 6000, false);

    expect(verifyState(s)).toBeNull();
  });
});

describe('fingerprint', () => {
  const finished = (item: string) => {
    const s = started(makePreset([step('A', 'ban', 'maps')]));
    applyPick(s, 'A', item, 0, false);
    return s;
  };

  it('is equal for equal histories', async () => {
    expect(await fingerprint(finished('map-1'))).toBe(await fingerprint(finished('map-1')));
  });

  it('differs when a pick differs', async () => {
    expect(await fingerprint(finished('map-1'))).not.toBe(await fingerprint(finished('map-2')));
  });
});

describe('picksOf', () => {
  it('lists the picks of one team in one pool, ignoring bans', () => {
    const s = started(makePreset([step('A', 'ban', 'maps'), step('A', 'pick', 'maps'), step('B', 'pick', 'maps')]));
    applyPick(s, 'A', 'map-1', 0, false);
    applyPick(s, 'A', 'map-2', 0, false);
    applyPick(s, 'B', 'map-3', 0, false);

    expect(picksOf(s, 'A', 'maps')).toEqual(['map-2']);
  });
});
