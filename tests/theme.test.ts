// @vitest-environment happy-dom
import { beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { THEME_KEY, applyTheme, savedTheme, themeToggle } from '../src/theme';

const store = (initial?: string) => ({ getItem: () => initial ?? null, setItem: () => {} });

describe('theme', () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
  });

  it('defaults to dark when nothing is saved', () => {
    expect(savedTheme(store())).toBe('dark');
  });

  it('restores a saved light choice', () => {
    expect(savedTheme(store('light'))).toBe('light');
  });

  it('falls back to dark for an unknown saved value', () => {
    expect(savedTheme(store('purple'))).toBe('dark');
  });

  it('falls back to dark when storage throws', () => {
    expect(savedTheme({ getItem: () => { throw new Error('denied'); } })).toBe('dark');
  });

  it('starts the toggle pressed with the dark theme applied', () => {
    const b = themeToggle();

    expect([document.documentElement.dataset.theme, b.getAttribute('aria-pressed')]).toEqual(['dark', 'true']);
  });

  it('switches to light on click and unpresses the toggle', () => {
    const b = themeToggle();

    b.click();

    expect([document.documentElement.dataset.theme, b.getAttribute('aria-pressed')]).toEqual(['light', 'false']);
  });

  it('switches back to dark on a second click', () => {
    const b = themeToggle();

    b.click();
    b.click();

    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('remembers the choice in localStorage', () => {
    themeToggle().click();

    expect(localStorage.getItem(THEME_KEY)).toBe('light');
  });

  it('starts a new toggle from the theme already on the page', () => {
    applyTheme('light');

    const b = themeToggle();

    expect(b.getAttribute('aria-pressed')).toBe('false');
  });

  it('is labelled for assistive technology', () => {
    expect(themeToggle().textContent).toBe('Dark mode');
  });
});

describe('first paint', () => {
  const html = readFileSync('index.html', 'utf8');

  it('sets the theme from storage in an inline script before the stylesheet-bearing body', () => {
    expect(html.indexOf(THEME_KEY)).toBeGreaterThan(-1);
    expect(html.indexOf(THEME_KEY)).toBeLessThan(html.indexOf('<body'));
  });
});
