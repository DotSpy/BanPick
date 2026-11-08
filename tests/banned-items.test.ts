// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { Room } from '../src/room/room';
import { mountRoom } from '../src/room/view';
import { memoryDraftStore } from './memory-store';
import { makePreset, step } from './fixtures';

const items = ['x', 'y', 'z'].map((id) => ({ id, name: id }));
const flush = () => new Promise((r) => setTimeout(r, 0));

const afterBan = async (steps = [step('A', 'ban', 'maps'), step('B', 'pick', 'maps'), step('A', 'pick', 'maps')]) => {
  const { store } = memoryDraftStore();
  const preset = makePreset(steps, { pools: { maps: { items } } });
  const room = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
  const [a, b] = [room('ua'), room('ub')];
  await a.open('A');
  await b.open('B');
  await a.setReady(true);
  await b.setReady(true);
  await a.act('y');
  const root = document.createElement('div');
  mountRoom(root, b);
  await flush();
  return { root, b };
};
const tile = (root: HTMLElement, name: string) => [...root.querySelectorAll<HTMLButtonElement>('.items button')].find((b) => b.textContent === name);

describe('banned options stay in the pool', () => {
  it('keeps the banned item in its place, in pool order', async () => {
    const { root } = await afterBan();

    expect([...root.querySelectorAll('.items button')].map((b) => b.textContent)).toEqual(['x', 'y', 'z']);
  });

  it('marks the banned item and disables it', async () => {
    const { root } = await afterBan();

    expect([tile(root, 'y')!.classList.contains('banned'), tile(root, 'y')!.disabled]).toEqual([true, true]);
  });

  it('leaves other items selectable', async () => {
    const { root } = await afterBan();

    expect([tile(root, 'x')!.classList.contains('banned'), tile(root, 'x')!.disabled]).toEqual([false, false]);
  });

  it('does not select a banned item on click', async () => {
    const { root, b } = await afterBan();
    const select = vi.spyOn(b, 'select');

    tile(root, 'y')!.click();

    expect(select).not.toHaveBeenCalled();
  });

  it('still removes a picked item from the pool', async () => {
    const { root, b } = await afterBan();
    await b.act('x');
    await flush();

    expect([...root.querySelectorAll('.items button')].map((t) => t.textContent)).toEqual(['y', 'z']);
  });
});
