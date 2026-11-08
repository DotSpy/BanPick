import { btn } from './dom';

export type Theme = 'dark' | 'light';
export const THEME_KEY = 'banpick-theme';

/** Dark unless the user explicitly saved light. index.html applies the same rule before first paint. */
export function savedTheme(storage: Pick<Storage, 'getItem'> = localStorage): Theme {
  try {
    return storage.getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

export function applyTheme(theme: Theme, root: HTMLElement = document.documentElement, storage: Pick<Storage, 'setItem'> = localStorage) {
  root.dataset.theme = theme;
  try {
    storage.setItem(THEME_KEY, theme);
  } catch {
    // Private mode: the choice just lasts for this page.
  }
}

/** A header button that switches between dark and light and remembers the choice. */
export function themeToggle(root: HTMLElement = document.documentElement): HTMLElement {
  let theme = (root.dataset.theme as Theme | undefined) ?? savedTheme();
  const b = btn('Dark mode', () => {
    theme = theme === 'dark' ? 'light' : 'dark';
    applyTheme(theme, root);
    render();
  }, { className: 'theme-toggle' });
  const render = () => {
    root.dataset.theme = theme;
    b.setAttribute('aria-pressed', String(theme === 'dark'));
    b.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
  };
  render();
  return b;
}
