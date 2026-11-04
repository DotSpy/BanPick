// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { linksPanel } from '../src/links';
import { mountLauncher } from '../src/launcher';
import { makePreset, step } from './fixtures';

const click = (root: HTMLElement, label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === label)!.click();

describe('links panel', () => {
  it('shows each link in a read-only labelled input', () => {
    const el = linksPanel([{ label: 'Captain A', url: 'http://x/a' }]);

    const input = el.querySelector('input')!;

    expect([input.value, input.readOnly, input.getAttribute('aria-label')]).toEqual(['http://x/a', true, 'Captain A link']);
  });

  it('copies a link to the clipboard and says so', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (s: string) => void copied.push(s) }, configurable: true });
    const el = linksPanel([{ label: 'Captain A', url: 'http://x/a' }]);

    click(el, 'Copy');
    await new Promise((r) => setTimeout(r, 0));

    expect([copied, el.querySelector('[role=status]')!.textContent]).toEqual([['http://x/a'], 'Copied']);
  });

  it('asks the user to copy by hand when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => Promise.reject(new Error('denied')) }, configurable: true });
    const el = linksPanel([{ label: 'Captain A', url: 'http://x/a' }]);

    click(el, 'Copy');
    await new Promise((r) => setTimeout(r, 0));

    expect(el.querySelector('[role=status]')!.textContent).toBe('Press Ctrl+C to copy');
  });
});

describe('launcher', () => {
  const presets = [
    { id: 'one', preset: makePreset([step('A', 'ban', 'maps')]) },
    { id: 'two', preset: { ...makePreset([step('B', 'ban', 'maps')]), name: 'Second' } },
  ];
  const mount = (onEditCopy = (_p: unknown) => {}) => {
    const root = document.createElement('div');
    mountLauncher(root, { presets, base: 'http://h/', newId: () => 'room1', onEditCopy });
    return root;
  };

  it('lists the built-in presets by name', () => {
    expect([...mount().querySelectorAll('option')].map((o) => o.textContent)).toContain('Second');
  });

  it('creates a room with one shared link', () => {
    const root = mount();
    (root.querySelector('select') as HTMLSelectElement).value = 'two';

    click(root, 'Create room');

    expect([...root.querySelectorAll('.links input')].map((i) => (i as HTMLInputElement).value)).toEqual(['http://h/#room/room1/builtin-two']);
  });

  it('confirms the room was created and that one link is shared', () => {
    const root = mount();

    click(root, 'Create room');

    expect(root.querySelector('p.hint[role=status]')!.textContent).toContain('Room created');
  });

  it('styles Edit copy as a secondary action', () => {
    const root = mount();

    const btn = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Edit copy')!;

    expect(btn.classList.contains('secondary')).toBe(true);
  });

  it('hands a copy of the chosen preset to the builder', () => {
    const edited: unknown[] = [];
    const root = mount((p) => edited.push(p));

    click(root, 'Edit copy');

    expect(edited[0]).toEqual(presets[0].preset);
    expect(edited[0]).not.toBe(presets[0].preset);
  });
});