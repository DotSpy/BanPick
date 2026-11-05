// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room/room';
import { mountRoom } from '../src/room/view';
import { memoryDraftStore } from './memory-store';
import { makePreset, step } from './fixtures';

const setup = async (random: boolean) => {
  const { store } = memoryDraftStore();
  const preset = makePreset([step('A', 'pick', 'maps', { random }), step('B', 'ban', 'maps', { random })]);
  const room = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
  const a = room('ua');
  const b = room('ub');
  await a.open('A');
  await b.open('B');
  await a.setReady(true);
  await b.setReady(true);
  return { a, b };
};
const mount = (r: Room) => {
  const root = document.createElement('div');
  const dispose = mountRoom(root, r);
  return { root, dispose };
};
const randomButton = (root: HTMLElement) => [...root.querySelectorAll('button')].find((x) => x.textContent === 'Random');
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('room view: random button', () => {
  it('shows Random to the acting captain when the step allows it', async () => {
    const { a } = await setup(true);
    const { root, dispose } = mount(a);

    expect(randomButton(root)).toBeDefined();
    dispose();
  });

  it('hides Random from the waiting captain', async () => {
    const { b } = await setup(true);
    const { root, dispose } = mount(b);

    expect(randomButton(root)).toBeUndefined();
    dispose();
  });

  it('hides Random when the step does not allow it', async () => {
    const { a } = await setup(false);
    const { root, dispose } = mount(a);

    expect(randomButton(root)).toBeUndefined();
    dispose();
  });

  it('resolves the turn and shows it as random in the history', async () => {
    const { a } = await setup(true);
    const { root, dispose } = mount(a);

    randomButton(root)!.click();
    await flush();

    expect(root.querySelector('.history li')!.textContent).toContain('(random)');
    dispose();
  });

  it('records the seat owner so the draft still verifies', async () => {
    const { a } = await setup(true);

    await a.random();

    expect(a.state?.history[0].by).toBe('ua');
  });
});
