export type Child = Node | string;

export function h(tag: string, props: Record<string, unknown> = {}, ...kids: Child[]): HTMLElement {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...kids);
  return el;
}

export const btn = (label: string, onClick: () => void, extra: Record<string, unknown> = {}) =>
  h('button', { type: 'button', textContent: label, onclick: onClick, ...extra });
