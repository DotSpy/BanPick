import { btn, h } from './dom';
import { linksPanel } from './links';
import type { Preset } from './model';
import { roomLinks } from './route';

export interface LauncherDeps {
  presets: { id: string; preset: Preset }[];
  base: string;
  newId: () => string;
  onEditCopy: (p: Preset) => void;
}

/** Lets a user start a room from a built-in preset, or load a copy of it into the builder. */
export function mountLauncher(root: HTMLElement, d: LauncherDeps) {
  const pick = h('select', { ariaLabel: 'Built-in preset' }, ...d.presets.map((p) => h('option', { value: p.id, textContent: p.preset.name }))) as HTMLSelectElement;
  const result = h('div');
  const chosen = () => d.presets.find((p) => p.id === pick.value)!;
  root.replaceChildren(
    h('h2', { textContent: 'Start from a built-in preset' }),
    h('label', {}, 'Preset ', pick),
    btn('Create room', () => result.replaceChildren(h('p', { className: 'hint', role: 'status', textContent: 'Room created. Send Captain A and Captain B their own link; spectators use the Spectator link.' }), linksPanel(roomLinks(d.base, d.newId(), `builtin-${chosen().id}`)))),
    btn('Edit copy', () => d.onEditCopy(structuredClone(chosen().preset)), { className: 'secondary' }),
    result,
  );
}
