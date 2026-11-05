// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { WIDTH_KEY, applyWidth, savedWidth, widthControl } from '../src/width';

const store = (initial?: string) => ({ getItem: () => initial ?? null, setItem: () => {} });

describe('page width', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-width');
  });

  it('defaults to compact', () => {
    expect(savedWidth(store())).toBe('compact');
  });

  it('restores a saved wide choice', () => {
    expect(savedWidth(store('wide'))).toBe('wide');
  });

  it('falls back to compact for an unknown value', () => {
    expect(savedWidth(store('huge'))).toBe('compact');
  });

  it('falls back to compact when storage throws', () => {
    expect(savedWidth({ getItem: () => { throw new Error('denied'); } })).toBe('compact');
  });

  it('applies and saves the choice', () => {
    applyWidth('full');

    expect([document.documentElement.dataset.width, localStorage.getItem(WIDTH_KEY)]).toEqual(['full', 'full']);
  });

  it('offers a labelled select with the three widths', () => {
    const select = widthControl().querySelector('select')!;

    expect([select.getAttribute('aria-label'), [...select.options].map((o) => o.value), select.value]).toEqual(['Page width', ['compact', 'wide', 'full'], 'compact']);
  });

  it('changing the select updates the page and storage', () => {
    const select = widthControl().querySelector('select')!;

    select.value = 'wide';
    select.dispatchEvent(new Event('change'));

    expect([document.documentElement.dataset.width, localStorage.getItem(WIDTH_KEY)]).toEqual(['wide', 'wide']);
  });

  it('starts the select on the saved width', () => {
    localStorage.setItem(WIDTH_KEY, 'full');

    expect(widthControl().querySelector('select')!.value).toBe('full');
  });
});

describe('width styles', () => {
  const css = readFileSync('src/styles.css', 'utf8');
  const html = readFileSync('index.html', 'utf8');

  it('sizes the app from a width token with compact as the default', () => {
    expect(css).toContain('--app-max: 52rem;');
    expect(css).toContain('max-width: var(--app-max)');
  });

  it('widens for wide and full', () => {
    expect(css).toContain("[data-width='wide'] { --app-max: 90rem; }");
    expect(css).toContain("[data-width='full'] { --app-max: none; }");
  });

  it('sets the width before first paint', () => {
    expect(html).toContain("localStorage.getItem('banpick-width')");
  });
});

