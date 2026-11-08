// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room/room';
import { mountRoom } from '../src/room/view';
import { memoryDraftStore } from './memory-store';
import { makePreset, step } from './fixtures';
import type { Preset } from '../src/model';

const flush = () => new Promise((r) => setTimeout(r, 0));

const seated = async (preset: Preset) => {
  const { store } = memoryDraftStore();
  const mk = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
  const [a, b] = [mk('ua'), mk('ub')];
  await a.open('A');
  await b.open('B');
  await a.setReady(true);
  await b.setReady(true);
  const view = (r: Room) => {
    const root = document.createElement('div');
    mountRoom(root, r);
    return root;
  };
  return { a, b, view };
};
const status = (root: HTMLElement) => [...root.querySelectorAll('.confirm-row')].map((e) => `${e.classList.contains('done') ? 'done' : 'waiting'}:${e.querySelector('.confirm-label')!.textContent}`);
const pausePreset = () => makePreset([step('A', 'ban', 'maps', { pause: 'ready' })]);

describe('confirmation status', () => {
  it('marks the other captain as confirmed while this one is waiting', async () => {
    const { a, b, view } = await seated(pausePreset());
    await b.confirmNext();
    await flush();

    expect(status(view(a))).toEqual(['waiting:Waiting', 'done:Confirmed']);
  });

  it('marks this captain as confirmed while the other is pending', async () => {
    const { a, view } = await seated(pausePreset());
    await a.confirmNext();
    await flush();

    expect(status(view(a))).toEqual(['done:Confirmed', 'waiting:Waiting']);
  });
});

describe('finished draft', () => {
  it('summarises what each team banned', async () => {
    const { a, b, view } = await seated(makePreset([step('A', 'ban', 'maps'), step('B', 'pick', 'maps')]));
    await a.act('map-1');
    await b.act('map-2');
    await flush();

    const rows = [...view(a).querySelectorAll('.summary section')].map((s) => [...s.querySelectorAll('li')].map((li) => li.textContent));

    expect(rows).toEqual([['map-1'], []]);
  });

  it('shows a lone shared map in its own card with who picked it', async () => {
    const { a, b, view } = await seated(makePreset([step('A', 'ban', 'maps'), step('B', 'pick', 'maps')]));
    await a.act('map-1');
    await b.act('map-2');
    await flush();

    const root = view(a);

    expect([root.querySelector('.result-map h3')!.textContent, root.querySelector('.result-map strong')!.textContent, root.querySelector('.result-map .by')!.textContent, root.querySelector('.turn.finished')!.textContent]).toEqual(['Map', 'map-2', 'picked by Team B', expect.not.stringContaining('map-2')]);
  });

  it('uses the singular label for a row with one item', async () => {
    const { a, b, view } = await seated(makePreset([step('A', 'ban', 'maps'), step('B', 'pick', 'maps')]));
    await a.act('map-1');
    await b.act('map-2');
    await flush();

    expect(view(a).querySelector('.result-row h4')!.textContent).toBe('Banned map');
  });
});
