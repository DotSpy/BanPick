import { describe, expect, it } from 'vitest';
import { applyPick, autoChoice, confirmNext, currentTurn, fingerprint, picksOf, resumeFromPause, setSelection, verifyState } from '../src/draft';
import { availableList, tagsOf, visibleHistory } from '../src/rules';
import { expandSteps } from '../src/turns';
import type { Preset } from '../src/model';
import { fixturePreset, items, started } from './fixtures';

const withSteps = (steps: Preset['steps'], extra: Partial<Preset> = {}): Preset => ({
  ...fixturePreset(),
  tagging: { assignment: 'none' },
  steps,
  ...extra,
});

describe('turn expansion', () => {
  it('expands count into single turns and keeps step numbers', () => {
    const turns = expandSteps([
      { team: 'A', action: 'ban', pool: 'maps', count: 2, timer: 10 },
      { team: 'B', action: 'pick', pool: 'maps', count: 1 },
    ]);
    expect(turns.map((t) => `${t.team}${t.action}${t.step}:${t.timer}`)).toEqual(['Aban0:10', 'Aban0:10', 'Bpick1:0']);
  });
});

describe('tags', () => {
  it('chosen + forbid: opponent gets the other value; a second choose is skipped', () => {
    const s = started();
    expect(applyPick(s, 'A', 'nato', 0, false)).toBeNull();
    expect(tagsOf(s)).toEqual({ A: 'nato', B: 'pact' });
    expect(currentTurn(s)?.action).toBe('ban');
  });

  it('refuses the forbidden value for the other team (3 values)', () => {
    const p = fixturePreset();
    p.tagging.values = ['a', 'b', 'c'];
    p.steps = [
      { team: 'A', action: 'choose', tag: 'side', count: 1 },
      { team: 'B', action: 'choose', tag: 'side', count: 1 },
    ];
    const s = started(p);
    applyPick(s, 'A', 'a', 0, false);
    expect(availableList(s, currentTurn(s)!)).toEqual(['b', 'c']);
    expect(applyPick(s, 'B', 'a', 0, false)).toBe('Item not available');
  });

  it('allow: both teams may hold the same value', () => {
    const p = fixturePreset();
    p.tagging.sameTag = 'allow';
    p.steps = [
      { team: 'A', action: 'choose', tag: 'side', count: 1 },
      { team: 'B', action: 'choose', tag: 'side', count: 1 },
    ];
    const s = started(p);
    applyPick(s, 'A', 'nato', 0, false);
    expect(applyPick(s, 'B', 'nato', 0, false)).toBeNull();
    expect(tagsOf(s)).toEqual({ A: 'nato', B: 'nato' });
  });

  it('fixed: seats hold their value from the start and no choose is needed', () => {
    const p = fixturePreset();
    p.tagging = { assignment: 'fixed', tag: 'side', values: ['nato', 'pact'], sameTag: 'forbid', seats: { A: 'nato', B: 'pact' } };
    p.steps = [{ team: 'B', action: 'pick', pool: 'divisions', count: 1, restrict: 'tag' }];
    const s = started(p);
    expect(availableList(s, currentTurn(s)!)).toEqual(['gd']);
  });

  it('none: no tags', () => {
    expect(tagsOf(started(withSteps([{ team: 'A', action: 'ban', pool: 'maps', count: 1 }])))).toEqual({ A: null, B: null });
  });
});

describe('restrict and scope', () => {
  it('restricts a pick to the team tag, a perTeam ban to the opponent tag', () => {
    const p = fixturePreset();
    p.steps = [
      { team: 'A', action: 'choose', tag: 'side', count: 1 },
      { team: 'A', action: 'ban', pool: 'divisions', count: 1, restrict: 'tag' },
      { team: 'A', action: 'pick', pool: 'divisions', count: 1, restrict: 'tag' },
    ];
    const s = started(p);
    applyPick(s, 'A', 'nato', 0, false);
    expect(availableList(s, currentTurn(s)!)).toEqual(['gd']); // bans against B (pact)
    applyPick(s, 'A', 'gd', 0, false);
    expect(availableList(s, currentTurn(s)!)).toEqual(['cav']); // picks for A (nato)
  });

  it('perTeam: a ban hurts only the opponent, a pick only the picker (shared across teams)', () => {
    const p = fixturePreset();
    p.tagging = { assignment: 'none' };
    p.pools.divisions.items = items('x', 'y');
    p.steps = [
      { team: 'A', action: 'ban', pool: 'divisions', count: 1 },
      { team: 'B', action: 'pick', pool: 'divisions', count: 1 },
      { team: 'A', action: 'pick', pool: 'divisions', count: 1 },
    ];
    const s = started(p);
    applyPick(s, 'A', 'x', 0, false);
    // x is banned against B, so B cannot pick it; A can still pick it later.
    expect(availableList(s, currentTurn(s)!)).toEqual(['y']);
    applyPick(s, 'B', 'y', 0, false);
    expect(availableList(s, currentTurn(s)!)).toEqual(['x', 'y']);
  });

  it('global: any pick or ban removes the item for everyone', () => {
    const s = started(withSteps([{ team: 'A', action: 'ban', pool: 'maps', count: 1 }, { team: 'B', action: 'pick', pool: 'maps', count: 1 }]));
    applyPick(s, 'A', 'map-1', 0, false);
    expect(availableList(s, currentTurn(s)!)).toEqual(['map-2']);
  });

  it('skips a turn with nothing available', () => {
    const p = withSteps([{ team: 'A', action: 'ban', pool: 'maps', count: 2 }, { team: 'B', action: 'ban', pool: 'maps', count: 1 }]);
    p.pools.maps.items = items('only');
    const s = started(p);
    applyPick(s, 'A', 'only', 0, false);
    expect(s.phase).toBe('done');
  });
});

describe('selection and timeout', () => {
  const twoMaps = () => started(withSteps([{ team: 'A', action: 'ban', pool: 'maps', count: 1, timer: 30 }]));

  it('stores and clears the selection; refuses wrong team or item', () => {
    const s = twoMaps();
    expect(setSelection(s, 'B', 'map-2')).toBe('Not your turn');
    expect(setSelection(s, 'A', 'nope')).toBe('Item not available');
    expect(setSelection(s, 'A', 'map-2')).toBeNull();
    expect(s.selection).toEqual({ team: 'A', itemId: 'map-2' });
    expect(setSelection(s, 'A', null)).toBeNull();
    expect(s.selection).toBeNull();
  });

  it('timer commits the selection, ignoring a stale one', () => {
    const s = twoMaps();
    setSelection(s, 'A', 'map-2');
    expect(autoChoice(s)).toBe('map-2');
    s.history.push({ index: 99, team: 'B', action: 'ban', target: 'maps', itemId: 'map-2', auto: false });
    expect(autoChoice(s)).toBe('map-1');
  });

  it('clears the selection once the pick is applied', () => {
    const s = twoMaps();
    setSelection(s, 'A', 'map-2');
    applyPick(s, 'A', 'map-2', 0, true);
    expect(s.selection).toBeNull();
  });
});

describe('pauses', () => {
  const paused = (pause: 'ready' | number | undefined, between = false) =>
    started(
      withSteps(
        [
          { team: 'A', action: 'ban', pool: 'maps', count: 1, timer: 30 },
          { team: 'B', action: 'ban', pool: 'maps', count: 1, timer: 20, pause },
        ],
        { pauses: { between } },
      ),
    );

  it('timed pause blocks picks, then starts the timer', () => {
    const s = paused(10);
    applyPick(s, 'A', 'map-1', 1000, false);
    expect(s.pausing).toBe(true);
    expect(s.deadline).toBe(11_000);
    expect(applyPick(s, 'B', 'map-2', 2000, false)).toMatch(/Paused/);
    resumeFromPause(s, 11_000);
    expect(s.deadline).toBe(31_000);
    expect(applyPick(s, 'B', 'map-2', 12_000, false)).toBeNull();
  });

  it('ready pause waits for both captains', () => {
    const s = paused('ready');
    applyPick(s, 'A', 'map-1', 0, false);
    expect(s.deadline).toBeNull();
    confirmNext(s, 'A', 5000);
    expect(s.confirm).toBeTruthy();
    confirmNext(s, 'B', 5000);
    expect(s.confirm).toBeNull();
    expect(s.deadline).toBe(25_000);
  });

  it('pauses.between gates steps without their own pause; a step pause wins', () => {
    const s = paused(undefined, true);
    applyPick(s, 'A', 'map-1', 0, false);
    expect(s.confirm).toBeTruthy();
    const t = paused(10, true);
    applyPick(t, 'A', 'map-1', 0, false);
    expect(t.pausing).toBe(true);
    expect(t.confirm).toBeNull();
  });

  it('does not pause by default', () => {
    const s = paused(undefined);
    applyPick(s, 'A', 'map-1', 0, false);
    expect(s.pausing).toBeFalsy();
    expect(s.confirm).toBeNull();
    expect(s.deadline).toBe(20_000);
  });
});

describe('blind picks', () => {
  const blind = (reveal: 'end' | number) =>
    started(
      withSteps([
        { team: 'A', action: 'pick', pool: 'maps', count: 1, blind: true, reveal },
        { team: 'B', action: 'ban', pool: 'maps', count: 1 },
        { team: 'B', action: 'ban', pool: 'divisions', count: 1 },
      ]),
    );

  it('hides the opponent view until the reveal step completes', () => {
    const s = blind(1);
    applyPick(s, 'A', 'map-1', 0, false);
    const view = (v: 'A' | 'B' | null) => visibleHistory(s, currentTurn(s), v)[0].itemId;
    expect(view('A')).toBe('map-1');
    expect(view('B')).toBe('');
    expect(view(null)).toBe('');
    applyPick(s, 'B', 'map-2', 0, false); // step 1 done, now on step 2
    expect(view('B')).toBe('map-1');
  });

  it("'end' reveals only when the draft is done", () => {
    const s = blind('end');
    applyPick(s, 'A', 'map-1', 0, false);
    applyPick(s, 'B', 'map-2', 0, false);
    expect(visibleHistory(s, currentTurn(s), 'B')[0].itemId).toBe('');
    applyPick(s, 'B', 'cav', 0, false);
    expect(s.phase).toBe('done');
    expect(visibleHistory(s, currentTurn(s), 'B')[0].itemId).toBe('map-1');
  });

  it('keeps hidden choices in the real history, so verification still works', () => {
    const s = blind('end');
    applyPick(s, 'A', 'map-1', 0, false);
    expect(s.history[0].itemId).toBe('map-1');
    expect(verifyState(s)).toBeNull();
  });
});

describe('verifyState', () => {
  const draft = (by: string | undefined) => {
    const s = started();
    s.teams.A.owner = 'uid-a';
    s.teams.B.owner = 'uid-b';
    applyPick(s, 'A', 'nato', 0, false);
    s.history[0].by = by;
    return s;
  };

  it('passes a legal history, a legacy entry and an auto-pick', () => {
    expect(verifyState(draft('uid-a'))).toBeNull();
    expect(verifyState(draft(undefined))).toBeNull();
    const s = draft(undefined);
    s.history[0].auto = true;
    expect(verifyState(s)).toBeNull();
  });

  it('flags an entry from someone other than the seat owner', () => {
    expect(verifyState(draft('uid-b'))).toMatch(/not requested by its seat owner/);
  });

  it('flags a wrong step, an illegal item and an entry past the end', () => {
    const wrong = draft(undefined);
    wrong.history[0].action = 'pick';
    expect(verifyState(wrong)).toMatch(/step order/);
    const illegal = draft(undefined);
    illegal.history[0].itemId = 'bogus';
    expect(verifyState(illegal)).toMatch(/illegal/);
    const over = draft(undefined);
    over.history.push({ index: 9, team: 'A', action: 'ban', target: 'maps', itemId: 'map-1', auto: false });
    over.history.push({ index: 10, team: 'A', action: 'ban', target: 'maps', itemId: 'map-2', auto: false });
    expect(verifyState(over)).toBeTruthy();
  });

  it('flags a draft position that does not match its history', () => {
    const s = draft(undefined);
    s.turnIndex = 0;
    expect(verifyState(s)).toMatch(/position/);
  });
});

describe('full draft and helpers', () => {
  it('runs choose, ban, restricted pick to done', () => {
    const s = started();
    expect(applyPick(s, 'A', 'nato', 0, false)).toBeNull();
    expect(applyPick(s, 'A', 'map-1', 0, false)).toBeNull();
    expect(applyPick(s, 'B', 'cav', 0, false)).toBe('Item not available'); // B is pact
    expect(applyPick(s, 'B', 'gd', 0, false)).toBeNull();
    expect(s.phase).toBe('done');
    expect(picksOf(s, 'B', 'divisions')).toEqual(['gd']);
    expect(verifyState(s)).toBeNull();
  });

  it('fingerprint is stable for equal histories', async () => {
    const a = started();
    const b = started();
    for (const s of [a, b]) applyPick(s, 'A', 'nato', 0, false);
    expect(await fingerprint(a)).toBe(await fingerprint(b));
  });
});
