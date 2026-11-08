// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { settingsMenu } from '../src/settings';

const mount = () => {
  const control = document.createElement('button');
  const menu = settingsMenu(control) as HTMLDetailsElement;
  document.body.replaceChildren(menu);
  return { menu, control };
};

describe('settings menu', () => {
  it('holds its controls behind one labelled icon', () => {
    const { menu, control } = mount();

    expect([menu.querySelector('summary')!.getAttribute('aria-label'), menu.querySelector('summary svg') !== null, menu.contains(control)]).toEqual(['Settings', true, true]);
  });

  it('starts closed', () => {
    expect(mount().menu.open).toBe(false);
  });

  it('closes on Escape', () => {
    const { menu } = mount();
    menu.open = true;

    menu.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));

    expect(menu.open).toBe(false);
  });

  it('closes on a click outside', () => {
    const { menu } = mount();
    menu.open = true;

    document.body.click();

    expect(menu.open).toBe(false);
  });

  it('stays open on a click inside', () => {
    const { menu, control } = mount();
    menu.open = true;

    control.click();

    expect(menu.open).toBe(true);
  });
});