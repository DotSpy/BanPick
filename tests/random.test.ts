import { describe, expect, it } from 'vitest';
import { applyPick, currentTurn, selectRandom, setSelection, verifyState, type DraftState } from '../src/draft';
import { updateStep } from '../src/builder/edit';
import { validatePreset } from '../src/schema';
import { visibleHistory } from '../src/rules';
import { makePreset, sideTagging, started, step } from './fixtures';

const randomDraft = (extra = {}) => started(makePreset([step('A', 'pick', 'maps', { random: true, ...extra }), step('B', 'ban', 'maps', { random: true }), step('B', 'pick', 'maps')]));

/** Same two steps the room takes: draw a pending random item, then confirm it. */
const drawAndConfirm = (s: DraftState, team: 'A' | 'B', now: number) => {
  const err = selectRandom(s, team);
  return err ?? applyPick(s, team, s.selection!.itemId, now, false, !!s.selection!.random);
};

describe('random action', () => {
  it('only selects an item and leaves the turn open until confirmed', () => {
    const s = randomDraft();

    const err = selectRandom(s, 'A');

    expect([err, s.history.length, s.selection?.random]).toEqual([null, 0, true]);
  });

  it('replaces the random selection when the captain clicks a tile instead', () => {
    const s = randomDraft();
    selectRandom(s, 'A');

    setSelection(s, 'A', 'map-1');

    expect(s.selection).toEqual({ team: 'A', itemId: 'map-1' });
  });

  it('resolves a pick turn with an available item', () => {
    const s = randomDraft();

    const err = drawAndConfirm(s, 'A', 0);

    expect([err, s.history[0].random, ['map-1', 'map-2', 'map-3'].includes(s.history[0].itemId)]).toEqual([null, true, true]);
  });

  it('resolves a ban turn and advances', () => {
    const s = randomDraft();
    applyPick(s, 'A', 'map-1', 0, false);

    const err = drawAndConfirm(s, 'B', 0);

    expect([err, s.history[1].action, s.history[1].itemId]).toEqual([null, 'ban', expect.not.stringMatching(/^map-1$/)]);
  });

  it('never draws an item that is already used', () => {
    const s = started(makePreset([step('A', 'pick', 'maps', { random: true, count: 3 })]));

    for (let n = 0; n < 3; n++) drawAndConfirm(s, 'A', 0);

    expect(new Set(s.history.map((e) => e.itemId)).size).toBe(3);
  });

  it('is refused when the step does not allow random', () => {
    const s = started(makePreset([step('A', 'pick', 'maps')]));

    expect(drawAndConfirm(s, 'A', 0)).toBe('Random is not enabled for this step');
  });

  it('is refused for the team that is not acting', () => {
    const s = randomDraft();

    expect(drawAndConfirm(s, 'B', 0)).toBe('Not your turn');
  });

  it('keeps a random blind pick hidden from the opponent', () => {
    const s = randomDraft({ blind: true });
    drawAndConfirm(s, 'A', 0);

    expect(visibleHistory(s, currentTurn(s), 'B')[0]).toMatchObject({ itemId: '', random: true });
  });

  it('respects a tag restriction', () => {
    const s = started(makePreset([step('A', 'choose', 'side'), step('A', 'pick', 'divisions', { random: true, restrict: 'tag' })], { tagging: sideTagging() }));
    applyPick(s, 'A', 'nato', 0, false);

    drawAndConfirm(s, 'A', 0);

    expect(['cav', 'ranger']).toContain(s.history[1].itemId);
  });

  it('passes verification', () => {
    const s = randomDraft();
    s.teams.A.owner = s.teams.B.owner = null;
    drawAndConfirm(s, 'A', 0);

    expect(verifyState(s)).toBeNull();
  });

  it('fails verification when an entry claims random on a step that disallows it', () => {
    const s = started(makePreset([step('A', 'pick', 'maps')]));
    applyPick(s, 'A', 'map-1', 0, false, true);

    expect(verifyState(s)).toMatch(/random/);
  });
});

describe('random in the schema and builder', () => {
  const base = () => makePreset([step('A', 'pick', 'maps', { random: true })]);

  it('accepts random on pick and ban steps', () => {
    expect(validatePreset(base()).ok).toBe(true);
  });

  it('rejects random on a choose step', () => {
    const p = makePreset([step('A', 'choose', 'side', { random: true })], { tagging: sideTagging() });

    expect(validatePreset(p).ok).toBe(false);
  });

  it('keeps older presets without the field valid', () => {
    expect(validatePreset(makePreset([step('A', 'pick', 'maps')])).ok).toBe(true);
  });

  it('removes random when the step becomes a choose step', () => {
    const p = makePreset([step('A', 'pick', 'maps', { random: true })], { tagging: sideTagging() });

    expect(updateStep(p, 0, { action: 'choose' }).steps[0].random).toBeUndefined();
  });

  it('drops random when it is turned off', () => {
    expect('random' in updateStep(base(), 0, { random: false }).steps[0]).toBe(false);
  });
});
