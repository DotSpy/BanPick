// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room/room';
import { mountRoom } from '../src/room/view';
import { parseRoute, roomHash } from '../src/route';
import { memoryDraftStore } from './memory-store';
import { makePreset, step } from './fixtures';

describe('route parsing', () => {
  it('parses a room link with a seat', () => {
    expect(parseRoute('#room/r1/builtin-x/B')).toEqual({ kind: 'room', roomId: 'r1', presetRef: 'builtin-x', seat: 'B' });
  });

  it('treats spec as no seat', () => {
    expect(parseRoute('#room/r1/p/spec')).toMatchObject({ seat: null });
  });

  it('treats anything else as a builder share code', () => {
    expect(parseRoute('#abc123')).toEqual({ kind: 'builder', code: 'abc123' });
  });

  it('round-trips a room hash', () => {
    expect(parseRoute(roomHash('r', 'p', 'A'))).toMatchObject({ kind: 'room', roomId: 'r', seat: 'A' });
  });
});

describe('room view', () => {
  const setup = async () => {
    const { store } = memoryDraftStore();
    const preset = makePreset([step('A', 'pick', 'maps', { blind: true, reveal: 'end' }), step('B', 'pick', 'maps')]);
    const room = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
    const a = room('ua');
    const b = room('ub');
    await a.open('A');
    await b.open('B');
    return { a, b };
  };
  const mount = (r: Room) => {
    const root = document.createElement('div');
    const dispose = mountRoom(root, r);
    return { root, dispose };
  };
  const click = (root: HTMLElement, label: string) =>
    [...root.querySelectorAll('button')].find((x) => x.textContent === label)!.click();
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('lets a captain mark ready from the lobby', async () => {
    const { a } = await setup();
    const { root, dispose } = mount(a);

    click(root, 'Ready');
    await flush();

    expect(a.state?.teams.A.ready).toBe(true);
    dispose();
  });

  it('disables the item buttons when it is not your turn', async () => {
    const { a, b } = await setup();
    await a.setReady(true);
    await b.setReady(true);
    const { root, dispose } = mount(b);

    const disabled = [...root.querySelectorAll('.items button')].every((x) => (x as HTMLButtonElement).disabled);

    expect(disabled).toBe(true);
    dispose();
  });

  it('picks in two clicks: select, then confirm', async () => {
    const { a, b } = await setup();
    await a.setReady(true);
    await b.setReady(true);
    const { root, dispose } = mount(a);

    click(root, 'map-1');
    await flush();
    click(root, 'Confirm map-1');
    await flush();

    expect(a.state?.history).toHaveLength(1);
    dispose();
  });

  it("hides the opponent's blind pick in the history", async () => {
    const { a, b } = await setup();
    await a.setReady(true);
    await b.setReady(true);
    await a.act('map-1');
    const { root, dispose } = mount(b);

    expect(root.querySelector('.history')!.textContent).toContain('(hidden)');
    dispose();
  });

  it('shows the picker their own blind pick', async () => {
    const { a, b } = await setup();
    await a.setReady(true);
    await b.setReady(true);
    await a.act('map-1');
    const { root, dispose } = mount(a);

    expect(root.querySelector('.history')!.textContent).toContain('map-1');
    dispose();
  });

  it('shows an integrity warning for a broken draft', async () => {
    const { a } = await setup();
    a.integrity = 'Entry 1 is illegal';
    const { root, dispose } = mount(a);

    expect(root.querySelector('.integrity')?.textContent).toBe('Entry 1 is illegal');
    dispose();
  });
});
