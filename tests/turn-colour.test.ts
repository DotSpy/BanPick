// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room/room';
import { mountRoom } from '../src/room/view';
import { memoryDraftStore } from './memory-store';
import { makePreset, step } from './fixtures';

const items = ['x', 'y', 'z'].map((id) => ({ id, name: id }));
const flush = () => new Promise((r) => setTimeout(r, 0));

const mountAs = async (action: 'ban' | 'pick', team: 'A' | 'B') => {
  const { store } = memoryDraftStore();
  const preset = makePreset([step('A', action, 'maps')], { pools: { maps: { items } } });
  const room = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
  const [a, b] = [room('ua'), room('ub')];
  await a.open('A');
  await b.open('B');
  await a.setReady(true);
  await b.setReady(true);
  const root = document.createElement('div');
  mountRoom(root, team === 'A' ? a : b);
  await flush();
  return root;
};

describe('turn colour follows the step action', () => {
  it('marks the banner of a ban step as ban', async () => {
    expect((await mountAs('ban', 'A')).querySelector('.turn')!.classList.contains('ban')).toBe(true);
  });

  it('marks the banner of a pick step as pick', async () => {
    expect((await mountAs('pick', 'A')).querySelector('.turn')!.classList.contains('pick')).toBe(true);
  });

  it('marks the banner for the waiting captain too', async () => {
    expect((await mountAs('ban', 'B')).querySelector('.turn')!.classList.contains('ban')).toBe(true);
  });

  it('marks the confirm button of a ban step as ban', async () => {
    const root = await mountAs('ban', 'A');
    (root.querySelector('.items button') as HTMLButtonElement).click();
    await flush();

    expect(root.querySelector('button.commit')!.classList.contains('ban')).toBe(true);
  });

  it('marks the confirm button of a pick step as pick', async () => {
    const root = await mountAs('pick', 'A');
    (root.querySelector('.items button') as HTMLButtonElement).click();
    await flush();

    expect(root.querySelector('button.commit')!.classList.contains('pick')).toBe(true);
  });
});

describe('turn colour styles', () => {
  const css = readFileSync('src/styles.css', 'utf8');

  it('colours ban banners and buttons from danger tokens', () => {
    expect(css).toMatch(/\.turn\.mine\.ban[^{]*\{[^}]*var\(--danger\)/);
  });

  it('colours the ban confirm button with its own tokens', () => {
    expect(css).toMatch(/button\.commit\.ban \{[^}]*var\(--ban-commit\)/);
  });

  it('defines the ban button tokens for dark and light', () => {
    expect(css.match(/--ban-commit:/g)).toHaveLength(2);
  });

  it('makes large icons 96px', () => {
    expect(css).toMatch(/\.icon-large \{ --icon: 96px; \}/);
  });
});
