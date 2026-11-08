export type Width = 'compact' | 'wide' | 'full';
export const WIDTH_KEY = 'banpick-width';
export const WIDTHS: Width[] = ['compact', 'wide', 'full'];

/** Wide unless the user saved another known width (compact is the original narrow layout). index.html applies the same rule before first paint. */
export function savedWidth(storage: Pick<Storage, 'getItem'> = localStorage): Width {
  try {
    const v = storage.getItem(WIDTH_KEY) as Width | null;
    return v && WIDTHS.includes(v) ? v : 'wide';
  } catch {
    return 'wide';
  }
}

export function applyWidth(width: Width, root: HTMLElement = document.documentElement, storage: Pick<Storage, 'setItem'> = localStorage) {
  root.dataset.width = width;
  try {
    storage.setItem(WIDTH_KEY, width);
  } catch {
    // Private mode: the choice just lasts for this page.
  }
}

/** A labelled header select (Compact / Wide / Full) that sets the page width and remembers it. */
export function widthControl(root: HTMLElement = document.documentElement): HTMLElement {
  const current = (root.dataset.width as Width | undefined) ?? savedWidth();
  root.dataset.width = current;
  const select = document.createElement('select');
  select.setAttribute('aria-label', 'Page width');
  for (const w of WIDTHS) {
    const o = document.createElement('option');
    o.value = w;
    o.textContent = w[0].toUpperCase() + w.slice(1);
    select.append(o);
  }
  select.value = current;
  select.addEventListener('change', () => applyWidth(select.value as Width, root));
  const label = document.createElement('label');
  label.className = 'width-control';
  label.append('Width', select);
  return label;
}
