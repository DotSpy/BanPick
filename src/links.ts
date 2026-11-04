import { btn, h } from './dom';
import type { Link } from './route';

/** Read-only inputs with a copy button each, so the room link can be handed out. */
export function linksPanel(links: Link[]): HTMLElement {
  return h(
    'div', { className: 'links' },
    ...links.map((l) => {
      const input = h('input', { type: 'text', readOnly: true, value: l.url, ariaLabel: `${l.label} link` }) as HTMLInputElement;
      const status = h('span', { role: 'status' });
      const copy = btn('Copy', async () => {
        try {
          await navigator.clipboard.writeText(l.url);
          status.textContent = 'Copied';
        } catch {
          input.select();
          status.textContent = 'Press Ctrl+C to copy';
        }
      }, { ariaLabel: `Copy ${l.label} link` });
      return h('p', {}, h('label', {}, `${l.label} `, input), copy, status);
    }),
  );
}
