import { describe, expect, it } from 'vitest';
import { applyPick, autoChoice, confirmNext, currentTurn, picksOf, resumeFromPause, verifyState, type DraftState } from '../src/draft';
import type { Preset, Team } from '../src/model';
import { availableList, tagsOf } from '../src/rules';
import { validatePreset } from '../src/schema';
import { expandSteps } from '../src/turns';
import presetsJson from '../src/warno/data/presets.json';
import { builtinPresets } from '../src/warno/preset';
import { started } from './fixtures';

const preset = (id: string): Preset => builtinPresets.find((p) => p.id === id)!.preset;
const sideOf = (p: Preset, id: string) => p.pools.divisions.items.find((i) => i.id === id)!.tags!.side;
const options = (s: DraftState) => availableList(s, currentTurn(s)!);

/** Advances through pauses and ready gates. */
function startTurn(s: DraftState, now = 0) {
  if (s.pausing) resumeFromPause(s, now);
  if (s.confirm) {
    confirmNext(s, 'A', now);
    confirmNext(s, 'B', now);
  }
}

/** Plays the next `n` turns by taking the first available item each time. */
function play(s: DraftState, n: number, choose?: (opts: string[]) => string) {
  for (let i = 0; i < n; i++) {
    startTurn(s);
    const turn = currentTurn(s)!;
    const opts = availableList(s, turn);
    const err = applyPick(s, turn.team, choose ? choose(opts) : opts[0], 0, false);
    if (err) throw new Error(err);
  }
}

/** Plays to the end the way the timer would: auto picks. */
function playOut(s: DraftState) {
  while (s.phase === 'drafting') {
    startTurn(s);
    const turn = currentTurn(s)!;
    applyPick(s, turn.team, autoChoice(s)!, 0, turn.timer > 0);
  }
}

// 1v1 Duel: 6 map bans, A picks a map, A chooses a side, 2 division bans, 2 division picks.
const MAP_TURNS = 7;
const afterMaps = (id = '1v1', side = 'nato') => {
  const s = started(preset(id));
  play(s, MAP_TURNS);
  play(s, 1, () => side);
  return s;
};

describe('built-in presets', () => {
  it.each(builtinPresets.map((p) => p.id))('%s passes preset validation', (id) => {
    expect(validatePreset(preset(id)).ok).toBe(true);
  });

  it.each(builtinPresets.map((p) => p.id))('%s keeps the same step order, timers and pauses as the WARNO source', (id) => {
    const source = presetsJson.presets.find((p) => p.id === id)!.steps;

    const turns = expandSteps(preset(id).steps).map((t) => {
      const target = t.action === 'choose' ? 'side' : t.target === 'maps' ? 'map' : 'division';
      const verb = t.action === 'choose' ? 'pick' : t.action;
      const pause = t.pause === undefined ? '' : ` ${t.pause}`;
      return `${t.team} ${verb} ${target} ${t.timer}${pause}`;
    });

    expect(turns).toEqual(source);
  });

  it('1v1 map pool holds only 1v1 maps', () => {
    expect(preset('1v1').pools.maps.items.every((m) => m.id.startsWith('1v1-'))).toBe(true);
  });

  it('all divisions are in the division pool with their side and an https icon', () => {
    const items = preset('1v1').pools.divisions.items;

    expect(items.every((d) => ['nato', 'pact'].includes(d.tags!.side) && d.image!.startsWith('https://'))).toBe(true);
  });
});

describe('WARNO: maps are global', () => {
  it('a map banned by A is not available to B', () => {
    const s = started(preset('1v1'));
    const banned = options(s)[0];

    play(s, 1, () => banned);

    expect(options(s)).not.toContain(banned);
  });

  it('the map picked by A is gone for the rest of the draft', () => {
    const s = started(preset('1v1'));
    play(s, 6);

    play(s, 1);

    expect(picksOf(s, 'A', 'maps')).toHaveLength(1);
  });
});

describe('WARNO: side choice', () => {
  it('the chosen side belongs to the chooser and the other side to the opponent', () => {
    const s = afterMaps('1v1', 'pact');

    expect(tagsOf(s)).toEqual({ A: 'pact', B: 'nato' });
  });

  it('offers both sides to the chooser', () => {
    const s = started(preset('1v1'));
    play(s, MAP_TURNS);

    expect(options(s)).toEqual(['nato', 'pact']);
  });

  it('the opponent is never asked to choose a side', () => {
    const s = afterMaps();

    expect(currentTurn(s)!.action).not.toBe('choose');
  });
});

describe('WARNO: divisions are tied to sides', () => {
  it('a division ban offers only divisions of the opponent side', () => {
    const p = preset('1v1');
    const s = afterMaps('1v1', 'nato'); // A nato, B pact; first division ban is A's

    expect(options(s).every((id) => sideOf(p, id) === 'pact')).toBe(true);
  });

  it("the opponent's ban offers only divisions of the first team's side", () => {
    const p = preset('1v1');
    const s = afterMaps('1v1', 'nato');
    play(s, 1);

    expect(options(s).every((id) => sideOf(p, id) === 'nato')).toBe(true);
  });

  it('a division pick offers only divisions of the own side', () => {
    const p = preset('1v1');
    const s = afterMaps('1v1', 'nato');
    play(s, 2);

    expect(options(s).every((id) => sideOf(p, id) === 'nato')).toBe(true);
  });

  it('refuses a division of the other side', () => {
    const p = preset('1v1');
    const s = afterMaps('1v1', 'nato');
    play(s, 2);
    const foreign = p.pools.divisions.items.find((d) => d.tags!.side === 'pact')!.id;
    startTurn(s);

    expect(applyPick(s, 'A', foreign, 0, false)).toBe('Item not available');
  });

  it('a banned division cannot be picked by the team it was banned against', () => {
    const s = afterMaps('1v1', 'nato');
    let banned = '';
    play(s, 1, (opts) => (banned = opts[0])); // A bans a pact division against B
    play(s, 1); // B bans a nato division against A
    play(s, 1); // A picks

    expect(options(s)).not.toContain(banned);
  });
});

describe('WARNO: shared division pool', () => {
  const open = () => started(preset('open-shared'));

  it('a division picked by A stays available to B', () => {
    const s = open();
    play(s, 5); // maps
    let first = '';
    play(s, 1, (opts) => (first = opts[0]));
    play(s, 1);

    expect(options(s)).toContain(first);
  });

  it('the same team cannot pick a division twice', () => {
    const s = open();
    play(s, 5);
    let first = '';
    play(s, 1, (opts) => (first = opts[0]));

    expect(options(s)).not.toContain(first);
  });
});

describe('WARNO: exclusive division pool', () => {
  it('a division picked by one team is taken for the other', () => {
    const s = started(preset('open-exclusive'));
    play(s, 5);
    let first = '';
    play(s, 1, (opts) => (first = opts[0]));

    expect(options(s)).not.toContain(first);
  });
});

describe('WARNO: timers and pauses', () => {
  it('a map step runs a 30 second timer and no pause', () => {
    const s = started(preset('1v1'));

    expect([s.deadline, s.pausing]).toEqual([30_000, false]);
  });

  it('a division step waits 10 seconds before its timer starts', () => {
    const s = afterMaps();

    expect([s.pausing, s.deadline]).toEqual([true, 10_000]);
  });

  it('picks are refused during the division pause', () => {
    const s = afterMaps();

    expect(applyPick(s, 'A', options(s)[0], 0, false)).toMatch(/Paused/);
  });

  it("the division pick timer is 45 seconds, counted from the end of the pause", () => {
    const s = afterMaps();
    play(s, 2);
    resumeFromPause(s, 20_000);

    expect(s.deadline).toBe(65_000);
  });

  it('the preset can gate every step on both captains when pauseBetweenSteps is set', () => {
    const p = preset('1v1');
    p.pauses.between = true;
    const s = started(p);

    applyPick(s, 'A', options(s)[0], 0, false);

    expect(s.confirm).toEqual({ A: false, B: false });
  });
});

describe('WARNO: automatic picks on timeout', () => {
  it('commit a legal item at every step, so the whole draft replays cleanly', () => {
    const s = started(preset('2v2'));

    playOut(s);

    expect(verifyState(s)).toBeNull();
  });

  it('finish the draft with every step used', () => {
    const s = started(preset('2v2'));

    playOut(s);

    expect(s.history).toHaveLength(expandSteps(preset('2v2').steps).length);
  });

  it('give each team its own side divisions only', () => {
    const p = preset('3v3');
    const s = started(p);
    playOut(s);
    const tags = tagsOf(s);

    const teams: Team[] = ['A', 'B'];
    expect(teams.every((t) => picksOf(s, t, 'divisions').every((id) => sideOf(p, id) === tags[t]))).toBe(true);
  });
});

describe('WARNO: history replay', () => {
  it('accepts a finished draft', () => {
    const s = started(preset('1v1'));
    playOut(s);

    expect(verifyState(s)).toBeNull();
  });

  it('flags a division of the wrong side slipped into the history', () => {
    const p = preset('1v1');
    const s = started(p);
    playOut(s);
    const last = s.history[s.history.length - 1];
    last.itemId = p.pools.divisions.items.find((d) => d.tags!.side !== sideOf(p, last.itemId))!.id;

    expect(verifyState(s)).toMatch(/illegal/);
  });

  it('flags a map taken twice', () => {
    const s = started(preset('1v1'));
    playOut(s);
    s.history[1].itemId = s.history[0].itemId;

    expect(verifyState(s)).toMatch(/illegal/);
  });
});
