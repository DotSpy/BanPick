import { describe, expect, it } from 'vitest';
import { applyPick, currentTurn, verifyState } from '../src/draft';
import type { Step } from '../src/model';
import { visibleHistory } from '../src/rules';
import { makePreset, started, step } from './fixtures';

/** A blind-picks map; B bans a map; B bans a division. `reveal` applies to step 0. */
const blindDraft = (reveal: Step['reveal']) =>
  started(makePreset([step('A', 'pick', 'maps', { blind: true, reveal }), step('B', 'ban', 'maps'), step('B', 'ban', 'divisions')]));

const seenBy = (s: ReturnType<typeof blindDraft>, viewer: 'A' | 'B' | null) => visibleHistory(s, currentTurn(s), viewer)[0].itemId;

describe('blind pick visibility', () => {
  it('shows the pick to the team that made it', () => {
    const s = blindDraft(1);
    applyPick(s, 'A', 'map-1', 0, false);

    expect(seenBy(s, 'A')).toBe('map-1');
  });

  it('hides the pick from the opponent', () => {
    const s = blindDraft(1);
    applyPick(s, 'A', 'map-1', 0, false);

    expect(seenBy(s, 'B')).toBe('');
  });

  it('hides the pick from spectators', () => {
    const s = blindDraft(1);
    applyPick(s, 'A', 'map-1', 0, false);

    expect(seenBy(s, null)).toBe('');
  });

  it('reveals it once the reveal step has completed', () => {
    const s = blindDraft(1);
    applyPick(s, 'A', 'map-1', 0, false);

    applyPick(s, 'B', 'map-2', 0, false);

    expect(seenBy(s, 'B')).toBe('map-1');
  });

  it('keeps it hidden while the reveal step is still running', () => {
    const s = blindDraft(2);
    applyPick(s, 'A', 'map-1', 0, false);
    applyPick(s, 'B', 'map-2', 0, false);

    expect(seenBy(s, 'B')).toBe('');
  });

  it("with reveal 'end' stays hidden until the draft is done", () => {
    const s = blindDraft('end');
    applyPick(s, 'A', 'map-1', 0, false);
    applyPick(s, 'B', 'map-2', 0, false);

    expect(seenBy(s, 'B')).toBe('');
  });

  it("with reveal 'end' is shown when the draft is done", () => {
    const s = blindDraft('end');
    applyPick(s, 'A', 'map-1', 0, false);
    applyPick(s, 'B', 'map-2', 0, false);
    applyPick(s, 'B', 'cav', 0, false);

    expect(seenBy(s, 'B')).toBe('map-1');
  });

  it('does not hide entries of steps that are not blind', () => {
    const s = blindDraft('end');
    applyPick(s, 'A', 'map-1', 0, false);
    applyPick(s, 'B', 'map-2', 0, false);

    expect(visibleHistory(s, currentTurn(s), 'A')[1].itemId).toBe('map-2');
  });
});

describe('blind pick storage', () => {
  it('keeps the real item in the history', () => {
    const s = blindDraft('end');

    applyPick(s, 'A', 'map-1', 0, false);

    expect(s.history[0].itemId).toBe('map-1');
  });

  it('does not change the history when computing a view', () => {
    const s = blindDraft('end');
    applyPick(s, 'A', 'map-1', 0, false);

    visibleHistory(s, currentTurn(s), 'B');

    expect(s.history[0].itemId).toBe('map-1');
  });

  it('still passes history verification', () => {
    const s = blindDraft('end');

    applyPick(s, 'A', 'map-1', 0, false);

    expect(verifyState(s)).toBeNull();
  });
});
