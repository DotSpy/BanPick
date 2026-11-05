// @vitest-environment happy-dom
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room/room';
import { FEW_OPTIONS, mountRoom } from '../src/room/view';
import type { Item } from '../src/model';
import { memoryDraftStore } from './memory-store';
import { makePreset, step } from './fixtures';

const mountWith = async (count: number, viewerTeam: 'A' | 'B' = 'A') => {
  const { store } = memoryDraftStore();
  const items: Item[] = Array.from({ length: count }, (_, i) => ({ id: `m${i}`, name: `m${i}` }));
  const preset = makePreset([step('A', 'pick', 'maps')], { pools: { maps: { items } } });
  const room = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
  const a = room('ua');
  const b = room('ub');
  await a.open('A');
  await b.open('B');
  await a.setReady(true);
  await b.setReady(true);
  const root = document.createElement('div');
  mountRoom(root, viewerTeam === 'A' ? a : b);
  return root.querySelector('.items')!;
};

describe('few-option tiles', () => {
  it('marks a pool with few options as large tiles', async () => {
    expect((await mountWith(2)).classList.contains('few')).toBe(true);
  });

  it('marks a pool at the threshold as large tiles', async () => {
    expect((await mountWith(FEW_OPTIONS)).classList.contains('few')).toBe(true);
  });

  it('keeps a long pool compact', async () => {
    expect((await mountWith(FEW_OPTIONS + 1)).classList.contains('few')).toBe(false);
  });

  it('applies to the waiting captain and spectators too', async () => {
    expect((await mountWith(2, 'B')).classList.contains('few')).toBe(true);
  });
});

describe('few-option tile styles', () => {
  const css = readFileSync('src/styles.css', 'utf8');

  it('fills the row with tiles at least 120px high', () => {
    expect(css).toContain('.items.few { grid-template-columns: repeat(auto-fit, minmax(9rem, 1fr)); }');
    expect(css).toMatch(/\.items\.few button \{[^}]*min-height: 120px/);
  });
});

describe('confirm button', () => {
  it('sticks to the bottom of the viewport so a long pool needs no scrolling', () => {
    expect(readFileSync('src/styles.css', 'utf8')).toMatch(/button\.commit \{[^}]*position: sticky; bottom: var\(--s-2\)/);
  });
});
