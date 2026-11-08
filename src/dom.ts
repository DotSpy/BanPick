export type Child = Node | string;

export function h(tag: string, props: Record<string, unknown> = {}, ...kids: Child[]): HTMLElement {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    // ARIA properties are set as attributes: property reflection is not available in every browser.
    if (key === 'role' || /^aria[A-Z]/.test(key)) el.setAttribute(key === 'role' ? key : key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), String(value));
    else Object.assign(el, { [key]: value });
  }
  el.append(...kids);
  return el;
}

export const btn = (label: string, onClick: () => void, extra: Record<string, unknown> = {}) =>
  h('button', { type: 'button', textContent: label, onclick: onClick, ...extra });
