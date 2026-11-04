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

    expect(root.querySelectorAll('.order li')).toHaveLength(1);
  });

  it('adding a step grows the preview', () => {
    const { root } = mount();

    clickButton(root, 'Add step');

    expect(root.querySelectorAll('.order li')).toHaveLength(2);
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

  it('renaming through the name input updates the preset', () => {
    const { root, builder } = mount();
    const nameInput = root.querySelector('input')!;

    nameInput.value = 'Renamed';
    nameInput.dispatchEvent(new Event('change'));

    expect(builder.get().name).toBe('Renamed');
  });

  it('importing valid JSON replaces the preset', () => {
    const { root, builder } = mount();
    const imported = { ...newPreset(), name: 'Imported' };
    const area = root.querySelector('textarea')!;

    area.value = JSON.stringify(imported);
    area.dispatchEvent(new Event('change'));

    expect(builder.get().name).toBe('Imported');
  });

  it('ignores imported JSON that is not a valid preset', () => {
    const { root, builder } = mount();
    const area = root.querySelector('textarea')!;

    area.value = '{"nope":1}';
    area.dispatchEvent(new Event('change'));

    expect(builder.get().name).toBe('New preset');
  });

  it('saves a valid preset', () => {
    const root = document.createElement('div');
    const saved: unknown[] = [];
    mountBuilder(root, newPreset(), (p) => saved.push(p));

    clickButton(root, 'Save');

    expect(saved).toHaveLength(1);
  });

  it('saves only a valid preset', () => {
    const root = document.createElement('div');
    const saved: unknown[] = [];
    mountBuilder(root, { ...newPreset(), steps: [] }, (p) => saved.push(p));

    clickButton(root, 'Save');

    expect(saved).toEqual([]);
  });
});
