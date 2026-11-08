import { describe, expect, it } from 'vitest';
import { applyPick, currentTurn, setReady } from '../src/draft';
import { lobby, makePreset, started, step } from './fixtures';

const oneBan = () => makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps')]);

describe('lobby', () => {
  it('does not start while only one captain is ready', () => {
    const s = lobby(oneBan());

    setReady(s, 'A', true, 0);

    expect(s.phase).toBe('lobby');
  });

  it('starts when both connected captains are ready', () => {
    const s = lobby(oneBan());
    setReady(s, 'A', true, 0);

    setReady(s, 'B', true, 5000);

    expect(s.phase).toBe('drafting');
  });

  it('refuses ready from a captain who is not connected', () => {
    const s = lobby(oneBan());
    s.teams.A.connected = false;

    expect(setReady(s, 'A', true, 0)).toBe('Captain not connected');
  });

  it('refuses ready once the draft has started', () => {
    const s = started(oneBan());

    expect(setReady(s, 'A', false, 0)).toBe('Draft already started');
  });

  it('starts the first timer at the moment the draft starts', () => {
    const s = lobby(makePreset([step('A', 'ban', 'maps', { timer: 30 })]));
    setReady(s, 'A', true, 0);

    setReady(s, 'B', true, 4000);

    expect(s.deadline).toBe(34_000);
  });
});

describe('applyPick', () => {
  it('refuses a pick before the draft runs', () => {
    const s = lobby(oneBan());

    expect(applyPick(s, 'A', 'map-1', 0, false)).toBe('Draft is not running');
  });

  it('refuses a pick from the team that is not on turn', () => {
    const s = started(oneBan());

    expect(applyPick(s, 'B', 'map-1', 0, false)).toBe('Not your turn');
  });

  it('records the entry with the turn index, team, action and target', () => {
    const s = started(oneBan());

    applyPick(s, 'A', 'map-2', 0, false);

    expect(s.history).toEqual([{ index: 0, team: 'A', action: 'ban', target: 'maps', itemId: 'map-2', auto: false }]);
  });

  it('advances to the next turn', () => {
    const s = started(oneBan());

    applyPick(s, 'A', 'map-2', 0, false);

    expect(currentTurn(s)).toMatchObject({ team: 'B' });
  });

  it('finishes the draft after the last turn and stops the timer', () => {
    const s = started(makePreset([step('A', 'ban', 'maps', { timer: 30 })]));

    applyPick(s, 'A', 'map-1', 9000, false);

    expect([s.phase, s.deadline, s.finishedAt]).toEqual(['done', null, 9000]);
  });

  it('restarts the timer for the next turn', () => {
    const s = started(makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps', { timer: 20 })]));

    applyPick(s, 'A', 'map-1', 5000, false);

    expect(s.deadline).toBe(25_000);
  });

  it('keeps no timer for a turn without one', () => {
    const s = started(oneBan());

    expect(s.deadline).toBeNull();
  });

  it('expands a step count into that many turns for the same team', () => {
    const s = started(makePreset([{ ...step('A', 'ban', 'maps'), count: 2 }, step('B', 'ban', 'maps')]));

    applyPick(s, 'A', 'map-1', 0, false);

    expect(currentTurn(s)).toMatchObject({ team: 'A' });
  });
});
