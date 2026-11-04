import { describe, expect, it } from 'vitest';
import { currentTurn, type DraftState } from '../src/draft';
import type { Team } from '../src/model';
import { visibleHistory } from '../src/rules';
import { decideClaim, freeSeat } from '../src/room/claim';
import { Room } from '../src/room/room';
import { memoryDraftStore } from './memory-store';
import { lobby, makePreset, step } from './fixtures';

describe('seat claiming', () => {
  const fresh = () => lobby(makePreset([step('A', 'ban', 'maps')]));
  const empty = () => {
    const s = fresh();
    s.teams.A.connected = s.teams.B.connected = false;
    return s;
  };

  it('gives a free seat to the first claimant', () => {
    const s = empty();

    const d = decideClaim(s, 'u1', 'A', '');

    expect(d).toEqual({ changed: true, refusal: null });
    expect(s.teams.A.owner).toBe('u1');
  });

  it('refuses a seat that is already taken', () => {
    const s = empty();
    decideClaim(s, 'u1', 'A', '');

    expect(decideClaim(s, 'u2', 'A', '').refusal).toMatch(/already taken/);
  });

  it('treats re-claiming your own seat as a reconnect', () => {
    const s = empty();
    decideClaim(s, 'u1', 'A', '');

    expect(decideClaim(s, 'u1', 'A', '')).toEqual({ changed: false, refusal: null });
  });

  it('refuses a second seat to the same browser', () => {
    const s = empty();
    decideClaim(s, 'u1', 'A', '');

    expect(decideClaim(s, 'u1', 'B', '').refusal).toMatch(/already holds Team A/);
  });

  it('refuses claims once the draft has started', () => {
    const s = empty();
    s.phase = 'drafting';

    expect(decideClaim(s, 'u1', 'A', '').changed).toBe(false);
  });

  it('records the captain name, capped at 30 characters', () => {
    const s = empty();

    decideClaim(s, 'u1', 'A', 'x'.repeat(40));

    expect(s.teams.A.name).toHaveLength(30);
  });

  it('frees a seat for the next claimant', () => {
    const s = empty();
    decideClaim(s, 'u1', 'A', 'Ann');

    freeSeat(s, 'A');

    expect(s.teams.A).toMatchObject({ owner: null, connected: false, ready: false, captain: null });
  });
});

describe('room', () => {
  const setup = (steps = [step('A', 'ban', 'maps', { timer: 30 }), step('B', 'pick', 'maps')], over = {}) => {
    const { store, docs } = memoryDraftStore();
    const clock = { t: 1000 };
    const preset = makePreset(steps, over);
    const room = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => clock.t });
    return { docs, clock, room };
  };
  const seated = async (r: Room, team: Team | null) => {
    await r.open(team);
    return r;
  };
  const startDraft = async (s: ReturnType<typeof setup>) => {
    const a = await seated(s.room('ua'), 'A');
    const b = await seated(s.room('ub'), 'B');
    await a.setReady(true);
    await b.setReady(true);
    return { a, b };
  };

  it('seats two captains and a spectator', async () => {
    const s = setup();

    const a = await seated(s.room('ua'), 'A');
    const b = await seated(s.room('ub'), 'B');
    const spec = await seated(s.room('us'), null);

    expect([a.role, b.role, spec.role]).toEqual(['A', 'B', 'spec']);
  });

  it('tells a late claimant the seat is taken', async () => {
    const s = setup();
    await seated(s.room('ua'), 'A');

    const late = await seated(s.room('ux'), 'A');

    expect(late.notice).toMatch(/already taken/);
    expect(late.role).toBe('spec');
  });

  it('starts the draft when both captains are ready', async () => {
    const s = setup();

    const { a } = await startDraft(s);

    expect(a.state?.phase).toBe('drafting');
  });

  it('does not start with only one captain ready', async () => {
    const s = setup();
    const a = await seated(s.room('ua'), 'A');
    await seated(s.room('ub'), 'B');

    await a.setReady(true);

    expect(a.state?.phase).toBe('lobby');
  });

  it('refuses a pick out of turn and leaves the history untouched', async () => {
    const s = setup();
    const { b } = await startDraft(s);

    await b.act('map-1');

    expect(b.notice).toBe('Not your turn');
    expect(b.state?.history).toEqual([]);
  });

  it('applies the acting captain\'s pick and shows it to the other captain', async () => {
    const s = setup();
    const { a, b } = await startDraft(s);

    await a.act('map-1');

    expect(b.state?.history.map((e) => e.itemId)).toEqual(['map-1']);
  });

  it('records which seat owner made a pick', async () => {
    const s = setup();
    const { a } = await startDraft(s);

    await a.act('map-1');

    expect(a.state?.history[0].by).toBe('ua');
  });

  it('refuses actions from a spectator', async () => {
    const s = setup();
    await startDraft(s);
    const spec = await seated(s.room('us'), null);

    await spec.act('map-1');

    expect(spec.notice).toBe('You do not hold a seat');
  });

  it('releases a lobby seat but not after the start', async () => {
    const s = setup();
    const a = await seated(s.room('ua'), 'A');
    await a.release();
    const freed = a.state?.teams.A.owner;
    const { a: a2 } = await startDraft(s);

    await a2.release();

    expect(freed).toBeNull();
    expect(a2.notice).toMatch(/cannot be released/);
  });

  it('does nothing on tick before the deadline', async () => {
    const s = setup();
    const { a } = await startDraft(s);
    s.clock.t += 29_000;

    await a.tick();

    expect(a.state?.history).toEqual([]);
  });

  it('auto-picks the selected item once the timer has run out', async () => {
    const s = setup();
    const { a, b } = await startDraft(s);
    await a.select('map-2');
    s.clock.t += 31_000;

    await b.tick();

    expect(b.state?.history).toMatchObject([{ itemId: 'map-2', auto: true }]);
  });

  it('advances only once when two browsers tick the same overdue timer', async () => {
    const s = setup();
    const { a, b } = await startDraft(s);
    s.clock.t += 31_000;

    await Promise.all([a.tick(), b.tick()]);

    expect(a.state?.history).toHaveLength(1);
  });

  it('ends a timed pause on tick, then allows the pick', async () => {
    const s = setup([step('A', 'ban', 'maps', { timer: 30, pause: 10 })]);
    const { a } = await startDraft(s);
    const pausedPick = (await a.act('map-1'), a.notice);
    s.clock.t += 11_000;

    await a.tick();
    await a.act('map-1');

    expect(pausedPick).toBe('Paused before this step');
    expect(a.state?.history).toHaveLength(1);
  });

  it('holds the turn until both captains confirm a ready gate', async () => {
    const s = setup([step('A', 'ban', 'maps', { pause: 'ready' })]);
    const { a, b } = await startDraft(s);
    await a.confirmNext();
    const afterOne = (await a.act('map-1'), a.notice);

    await b.confirmNext();
    await a.act('map-1');

    expect(afterOne).toMatch(/must confirm/);
    expect(a.state?.history).toHaveLength(1);
  });

  it('keeps a blind pick hidden from the opponent until the draft ends', async () => {
    const s = setup([step('A', 'pick', 'maps', { blind: true, reveal: 'end' }), step('B', 'pick', 'maps')]);
    const { a, b } = await startDraft(s);
    await a.act('map-1');

    const forB = visibleHistory(b.state!, currentTurn(b.state!), 'B');
    const forA = visibleHistory(a.state!, currentTurn(a.state!), 'A');

    expect(forB[0].itemId).toBe('');
    expect(forA[0].itemId).toBe('map-1');
  });

  it('reveals a blind pick to everyone once the draft is done', async () => {
    const s = setup([step('A', 'pick', 'maps', { blind: true, reveal: 'end' }), step('B', 'pick', 'maps')]);
    const { a, b } = await startDraft(s);
    await a.act('map-1');
    await b.act('map-2');

    const forB = visibleHistory(b.state!, currentTurn(b.state!), 'B');

    expect(forB.map((e) => e.itemId)).toEqual(['map-1', 'map-2']);
  });

  it('flags a stored draft whose history is illegal', async () => {
    const s = setup();
    const { a } = await startDraft(s);
    const bad: DraftState = JSON.parse(s.docs.get('r')!.state);
    bad.history.push({ index: 0, team: 'B', action: 'ban', target: 'maps', itemId: 'map-1', auto: false });
    s.docs.set('r', { ...s.docs.get('r')!, state: JSON.stringify(bad) });

    await a.act('map-2');

    expect(a.notice).toBeTruthy();
    expect(JSON.parse(s.docs.get('r')!.state).history).toHaveLength(1);
  });
});
