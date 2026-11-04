// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountBuilder } from '../src/builder/view';
import { newPreset } from '../src/builder/edit';

const mount = () => {
  const root = document.createElement('div');
  const builder = mountBuilder(root, newPreset());
  return { root, builder };
};

const clickButton = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label)!.click();

describe('builder view', () => {
  it('renders the draft order preview', () => {
    const { root } = mount();

    expect(root.querySelectorAll('.timeline li')).toHaveLength(1);
  });

  it('labels the preset name, step timer and JSON fields visibly', () => {
    const { root } = mount();

    const labels = [...root.querySelectorAll('label')].map((l) => l.textContent);

    expect(labels).toEqual(expect.arrayContaining([expect.stringContaining('Preset name'), expect.stringContaining('Timer (s)'), expect.stringContaining('Preset JSON')]));
  });

  it('adding a step grows the preview', () => {
    const { root } = mount();

    clickButton(root, 'Add step');

    expect(root.querySelectorAll('.timeline li')).toHaveLength(2);
  });

  it('shows no errors for a valid preset', () => {
    const { root } = mount();

    expect(root.querySelectorAll('.errors li')).toHaveLength(0);
  });

  it('shows validation errors when the preset becomes invalid', () => {
    const { root } = mount();

    clickButton(root, 'Remove pool');

    expect(root.querySelectorAll('.errors li').length).toBeGreaterThan(0);
  });

  it('shows an image preview for items with an image link', () => {
    const p = newPreset();
    p.pools.items.items[0].image = 'https://x.test/a.png';
    const root = document.createElement('div');

    mountBuilder(root, p);

    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://x.test/a.png');
  });

  it('replaces a broken image with the item name', () => {
    const p = newPreset();
    p.pools.items.items[0].image = 'https://x.test/a.png';
    const root = document.createElement('div');
    mountBuilder(root, p);

    root.querySelector('img')!.dispatchEvent(new Event('error'));

    expect(root.querySelector('img')).toBeNull();
  });

  it('renaming through the name input updates the preset', async () => {
    const { root, builder } = mount();
    const nameInput = root.querySelector('input')!;

    nameInput.value = 'Renamed';
    nameInput.dispatchEvent(new Event('change'));
    await flush();

    expect(builder.get().name).toBe('Renamed');
  });

  it('importing valid JSON replaces the preset', async () => {
    const { root, builder } = mount();
    const imported = { ...newPreset(), name: 'Imported' };
    const area = root.querySelector('textarea')!;

    area.value = JSON.stringify(imported);
    area.dispatchEvent(new Event('change'));
    await flush();

    expect(builder.get().name).toBe('Imported');
  });

  it('ignores imported JSON that is not a valid preset', async () => {
    const { root, builder } = mount();
    const area = root.querySelector('textarea')!;

    area.value = '{"nope":1}';
    area.dispatchEvent(new Event('change'));
    await flush();

    expect(builder.get().name).toBe('New preset');
  });

  it('saves a valid preset', () => {
    const root = document.createElement('div');
    const saved: unknown[] = [];
    mountBuilder(root, newPreset(), async (p) => (saved.push(p), { ok: true, links: [] }));

    clickButton(root, 'Save');

    expect(saved).toHaveLength(1);
  });

  it('does not offer saving an invalid preset', () => {
    const root = document.createElement('div');
    mountBuilder(root, { ...newPreset(), steps: [] }, async () => ({ ok: true, links: [] }));

    const save = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;

    expect(save.disabled).toBe(true);
  });

  it('shows the three seat links after a successful save', async () => {
    const root = document.createElement('div');
    const links = ['Captain A', 'Captain B', 'Spectator'].map((label) => ({ label, url: `http://x/#${label}` }));
    mountBuilder(root, newPreset(), async () => ({ ok: true, links }));

    clickButton(root, 'Save');
    await flush();

    expect([...root.querySelectorAll('.links input')].map((i) => (i as HTMLInputElement).value)).toEqual(links.map((l) => l.url));
  });

  it('shows the reason when saving fails', async () => {
    const root = document.createElement('div');
    mountBuilder(root, newPreset(), async () => ({ ok: false, error: 'offline' }));

    clickButton(root, 'Save');
    await flush();

    expect(root.querySelector('.status')!.textContent).toBe('Could not save: offline');
  });

  it('shows the parse error and marks the JSON box invalid when the text is not JSON', async () => {
    const { root } = mount();
    const area = root.querySelector('textarea')!;

    area.value = '{oops';
    area.dispatchEvent(new Event('change'));
    await flush();

    expect([root.querySelector('.json-error')!.textContent, root.querySelector('textarea')!.getAttribute('aria-invalid')]).toEqual([expect.stringMatching(/^Not valid JSON/), 'true']);
  });

  it('keeps the rejected text so it can be corrected', async () => {
    const { root } = mount();
    const area = root.querySelector('textarea')!;

    area.value = '{oops';
    area.dispatchEvent(new Event('change'));
    await flush();

    expect(root.querySelector('textarea')!.value).toBe('{oops');
  });

  it('lists schema problems for JSON that parses but is not a preset', async () => {
    const { root } = mount();
    const area = root.querySelector('textarea')!;

    area.value = '{"nope":1}';
    area.dispatchEvent(new Event('change'));
    await flush();

    expect(root.querySelector('.json-error')!.textContent).not.toBe('');
  });

  it('clears the JSON error once valid JSON is imported', async () => {
    const { root } = mount();
    const area = root.querySelector('textarea')!;
    area.value = '{oops';
    area.dispatchEvent(new Event('change'));
    await flush();

    root.querySelector('textarea')!.value = JSON.stringify(newPreset());
    root.querySelector('textarea')!.dispatchEvent(new Event('change'));
    await flush();

    expect(root.querySelector('.json-error')!.textContent).toBe('');
  });

  it('gives every input, select and textarea an accessible name', () => {
    const { root } = mount();

    const unnamed = [...root.querySelectorAll('input:not([type=checkbox]), select, textarea')].filter((e) => !e.getAttribute('aria-label'));

    expect(unnamed).toHaveLength(0);
  });

  it('limits count and timer to whole numbers, timer from 0 and count from 1', () => {
    const { root } = mount();

    const [count, timer] = [...root.querySelectorAll('li input[type=number]')] as HTMLInputElement[];

    expect([count.min, timer.min, count.step, timer.step]).toEqual(['1', '0', '1', '1']);
  });

  it('explains that a timer of 0 means no timer', () => {
    const { root } = mount();

    expect(root.querySelector('li input[type=number][aria-label*="0 = no timer"]')).not.toBeNull();
  });

  it('keeps keyboard focus on the same field after an edit re-renders the form', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const { builder } = { builder: mountBuilder(root, newPreset()) };
    const name = root.querySelector('input')!;
    name.focus();

    name.value = 'Renamed';
    name.dispatchEvent(new Event('change'));
    await flush();

    expect([document.activeElement?.getAttribute('aria-label'), builder.get().name]).toEqual(['Preset name', 'Renamed']);
    root.remove();
  });
});

const flush = () => new Promise((r) => setTimeout(r, 0));
