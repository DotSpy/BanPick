import { glyph } from './glyph';
import { h } from './dom';

/** A header menu behind one icon that holds the page settings. Closes on Escape or a click outside. */
export function settingsMenu(...controls: HTMLElement[]): HTMLElement {
  const summary = h('summary', { className: 'settings-toggle', title: 'Settings', ariaLabel: 'Settings' }, glyph('sliders'));
  const menu = h('details', { className: 'settings' }, summary, h('div', { className: 'settings-panel' }, ...controls)) as HTMLDetailsElement;
  menu.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && menu.open) {
      menu.open = false;
      summary.focus();
    }
  });
  document.addEventListener('click', (e) => {
    if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
  });
  return menu;
}