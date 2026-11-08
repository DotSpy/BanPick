// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room/room';
import { mountRoom } from '../src/room/view';
import { memoryDraftStore } from './memory-store';
import { items, makePreset, sideTagging, step } from './fixtures';
import type { Preset } from '../src/model';

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Both captains seated and ready, so the draft is running; the view is mounted for captain A. */
const drafting = async (preset: Preset) => {
  const { store } = memoryDraftStore();
  const mk = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
  const [a, b] = [mk('ua'), mk('ub')];
  await a.open('A');
  await b.open('B');
  await a.setReady(true);
  await b.setReady(true);
  const root = document.createElement('div');
  mountRoom(root, a);
  return { a, b, root };
};

const tiles = (root: HTMLElement) => [...root.querySelectorAll('.items button')].map((b) => b.textContent);

describe('room header while drafting', () => {
  it('collapses to one line naming both captains', async () => {
    const { root } = await drafting(makePreset([step('A', 'ban', 'maps')]));

    expect(root.querySelector('.room-line')!.textContent).toBe('Test \u00b7 You are Captain A (Team A) \u00b7 vs Captain B (Team B)');
  });

  it('drops the lobby summary, state line and seat cards', async () => {
    const { root } = await drafting(makePreset([step('A', 'ban', 'maps')]));

    expect(root.querySelectorAll('.preset-summary, .room-state, .seat-card').length).toBe(0);
  });

  it('hides the name form once the draft has started', async () => {
    const { root } = await drafting(makePreset([step('A', 'ban', 'maps')]));

    expect(root.querySelector<HTMLElement>('form.name')!.hidden).toBe(true);
  });
});

describe('step numbers', () => {
  it('give the action bar, the timeline chip and the log entry the same step', async () => {
    const { a, root } = await drafting(makePreset([step('A', 'ban', 'maps'), step('B', 'pick', 'maps')]));

    await a.act('map-1');
    await flush();

    expect([
      root.querySelector<HTMLElement>('.turn')!.dataset.step,
      root.querySelector<HTMLElement>('.timeline li.current .tl-head')!.dataset.step,
      root.querySelector<HTMLElement>('.history li')!.dataset.step,
    ]).toEqual(['2', '2', '1']);
  });

  it('keep matching after a step was skipped for lack of options', async () => {
    const preset = makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps'), step('A', 'pick', 'divisions')]);
    preset.pools.maps.items = items('only');
    const { a, root } = await drafting(preset);

    await a.act('only');
    await flush();

    expect([
      root.querySelector<HTMLElement>('.turn')!.dataset.step,
      root.querySelector<HTMLElement>('.timeline li.skipped .tl-head')!.dataset.step,
      root.querySelector<HTMLElement>('.history li')!.dataset.step,
    ]).toEqual(['3', '2', '1']);
  });
});

describe('log', () => {
  it('is a collapsed section', async () => {
    const { a, root } = await drafting(makePreset([step('A', 'ban', 'maps'), step('B', 'pick', 'maps')]));

    await a.act('map-1');
    await flush();

    expect(root.querySelector<HTMLDetailsElement>('details.log')!.open).toBe(false);
  });
});

describe('item filter', () => {
  it('shows side tabs when the options carry two tag values', async () => {
    const { root } = await drafting(makePreset([step('A', 'pick', 'divisions')], { tagging: sideTagging() }));

    expect([...root.querySelectorAll('.faction-tabs button')].map((b) => b.textContent)).toEqual(['All', 'nato', 'pact']);
  });

  it('hides the other side after choosing a tab', async () => {
    const { root } = await drafting(makePreset([step('A', 'pick', 'divisions')], { tagging: sideTagging() }));

    [...root.querySelectorAll('.faction-tabs button')].find((b) => b.textContent === 'pact')!.dispatchEvent(new MouseEvent('click'));

    expect(tiles(root)).toEqual(['gd', 'tank']);
  });

  it('has no filter for a short list without tags', async () => {
    const { root } = await drafting(makePreset([step('A', 'ban', 'maps')]));

    expect(root.querySelector('.filter')).toBeNull();
  });

  it('searches a long list by name', async () => {
    const many = makePreset([step('A', 'ban', 'maps')]);
    many.pools.maps.items = items(...Array.from({ length: 14 }, (_, i) => `m${i + 1}`));
    const { root } = await drafting(many);
    const search = root.querySelector<HTMLInputElement>('.filter input')!;

    search.value = 'm13';
    search.dispatchEvent(new Event('input'));

    expect(tiles(root)).toEqual(['m13']);
  });
});
