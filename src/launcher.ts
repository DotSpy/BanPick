import { aiPanel } from './ai-panel';
import { btn, h } from './dom';
import { linksPanel } from './links';
import type { Preset } from './model';
import { roomLink } from './route';

export interface PresetGroup {
  label: string;
  presets: { id: string; preset: Preset }[];
}

export interface LauncherDeps {
  groups: PresetGroup[];
  base: string;
  newId: () => string;
  onEditCopy: (p: Preset) => void;
}

/** Lets a user start a room from a built-in preset, or load a copy of it into the builder. */
export function mountLauncher(root: HTMLElement, d: LauncherDeps) {
  const pick = h('select', { ariaLabel: 'Built-in preset' }, ...d.groups.map((g) => h('optgroup', { label: g.label }, ...g.presets.map((p) => h('option', { value: p.id, textContent: p.preset.name }))))) as HTMLSelectElement;
  const result = h('div');
  const chosen = () => d.groups.flatMap((g) => g.presets).find((p) => p.id === pick.value)!;
  const load = () => d.onEditCopy(structuredClone(chosen().preset));
  pick.addEventListener('change', load);
  const presets = h(
    'div', { role: 'tabpanel' },
    h('label', {}, 'Preset ', pick),
    btn('Create room', () => result.replaceChildren(h('p', { className: 'hint', role: 'status', textContent: 'Room created. Send everyone this one link; each person chooses Team A, Team B or Watch after opening it.' }), linksPanel([roomLink(d.base, d.newId(), `builtin-${chosen().id}`)]))),
    btn('Edit copy', load, { className: 'secondary' }),
    result,
  );
  const ai = h('div', { role: 'tabpanel' }, aiPanel(d.onEditCopy));
  root.replaceChildren(h('h2', { textContent: 'Start a draft' }), tabs([['Built-in presets', presets], ['Build with AI', ai]]));
}

/** Tab buttons that show one panel at a time; the first tab is selected. */
function tabs(items: [string, HTMLElement][]): HTMLElement {
  const buttons = items.map(([label]) => h('button', { type: 'button', role: 'tab', className: 'tab', textContent: label }));
  const select = (at: number) =>
    items.forEach(([, panel], i) => {
      panel.hidden = i !== at;
      buttons[i].setAttribute('aria-selected', String(i === at));
    });
  buttons.forEach((b, i) => b.addEventListener('click', () => select(i)));
  select(0);
  return h('div', { className: 'tabs' }, h('div', { role: 'tablist', className: 'tablist' }, ...buttons), ...items.map(([, panel]) => panel));
}
