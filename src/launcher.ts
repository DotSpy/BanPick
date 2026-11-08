import { aiPanel } from './ai-panel';
import { btn, h } from './dom';
import { glyph } from './glyph';
import { linksPanel } from './links';
import type { Preset } from './model';
import { splitName, stepLines, summary, timerSummary, totals } from './preset-info';
import { loadRecent, rememberRecent } from './recent';
import { roomLink } from './route';

export interface PresetEntry {
  id: string;
  preset: Preset;
  /** Short label on the card, e.g. the game the preset is for. */
  tag: string;
}

export interface PresetGroup {
  label: string;
  presets: PresetEntry[];
}

export interface LauncherDeps {
  groups: PresetGroup[];
  base: string;
  newId: () => string;
  onEditCopy: (p: Preset) => void;
  /** The builder, shown in its own tab; copying a preset into it switches to that tab. */
  builder: HTMLElement;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
}

/** Lets a user start a room from a built-in preset, or load a copy of it into the builder. */
export function mountLauncher(root: HTMLElement, d: LauncherDeps) {
  const entries = d.groups.flatMap((g) => g.presets);
  let selected = entries[0];
  const inputs = new Map<string, HTMLInputElement>();
  const preview = h('aside', { className: 'preset-preview', ariaLive: 'polite' });
  const recent = h('div', { className: 'recent' });
  const result = h('div');

  const renderPreview = () => {
    const { title, meta } = splitName(selected.preset.name);
    const t = totals(selected.preset);
    preview.replaceChildren(
      h('h3', { textContent: title }),
      h('p', { className: 'hint', textContent: [meta, selected.tag].filter(Boolean).join(' \u00b7 ') }),
      h('p', { className: 'preview-totals', textContent: `Team A: ${t.A.ban} bans, ${t.A.pick} picks \u00b7 Team B: ${t.B.ban} bans, ${t.B.pick} picks \u00b7 ${timerSummary(selected.preset)}` }),
      h('ol', { className: 'preview-steps' }, ...stepLines(selected.preset).map((l) => h('li', { className: `team-${l.team}`, textContent: l.text }))),
    );
  };
  const choose = (id: string) => {
    selected = entries.find((e) => e.id === id) ?? selected;
    inputs.get(selected.id)!.checked = true;
    renderPreview();
  };
  const renderRecent = (ids: string[]) => {
    const shown = ids.map((id) => entries.find((e) => e.id === id)).filter((e): e is PresetEntry => !!e);
    recent.hidden = shown.length === 0;
    recent.replaceChildren(
      h('h3', { textContent: 'Recently used' }),
      ...shown.map((e) => btn(splitName(e.preset.name).title, () => choose(e.id), { className: 'chip', title: e.preset.name })),
    );
  };
  const used = () => renderRecent(rememberRecent(selected.id, d.storage));

  const card = (e: PresetEntry) => {
    const { title, meta } = splitName(e.preset.name);
    const input = h('input', { type: 'radio', name: 'preset', value: e.id, className: 'card-input' }) as HTMLInputElement;
    inputs.set(e.id, input);
    input.addEventListener('change', () => choose(e.id));
    return h('label', { className: 'preset-card' }, input,
      h('span', { className: 'card-body' },
        h('span', { className: 'card-head' }, h('strong', { textContent: title }), h('span', { className: 'tag', textContent: e.tag })),
        h('span', { className: 'card-meta', textContent: [meta, summary(e.preset)].filter(Boolean).join(' \u00b7 ') })));
  };
  const group = (g: PresetGroup) => h('fieldset', { className: 'preset-group' }, h('legend', { textContent: g.label }), h('div', { className: 'preset-cards' }, ...g.presets.map(card)));

  let showBuilder = () => {};
  const edit = (p: Preset) => {
    d.onEditCopy(p);
    showBuilder();
  };
  const createRoom = () => {
    used();
    result.replaceChildren(h('p', { className: 'hint', role: 'status', textContent: 'Room created. Send everyone this one link; each person chooses Team A, Team B or Watch after opening it.' }), linksPanel([roomLink(d.base, d.newId(), `builtin-${selected.id}`)]));
  };
  const editCopy = () => {
    used();
    edit(structuredClone(selected.preset));
  };

  const presets = h('div', { role: 'tabpanel', className: 'launcher-grid' },
    h('div', { className: 'launcher-list' },
      recent,
      ...d.groups.map(group),
      h('div', { className: 'launcher-actions' },
        h('button', { type: 'button', className: 'ghost', onclick: editCopy }, glyph('copy'), 'Edit copy'),
        h('button', { type: 'button', className: 'primary-action', onclick: createRoom }, glyph('play'), 'Create room')),
      result),
    preview);
  const ai = h('div', { role: 'tabpanel' }, aiPanel(edit));

  d.builder.setAttribute('role', 'tabpanel');
  const t = tabs([['Built-in presets', presets], ['Preset builder', d.builder], ['Build with AI', ai, glyph('sparkle')]]);
  showBuilder = () => t.select(1);
  root.replaceChildren(
    h('h2', { textContent: 'Start a draft' }),
    h('p', { className: 'hint onboarding', textContent: 'Pick a preset, create a room, share the link with the other team.' }),
    t.el,
  );
  renderRecent(loadRecent(d.storage));
  choose(selected.id);
}

/** Tab buttons that show one panel at a time; the first tab is selected. */
function tabs(items: [string, HTMLElement, SVGElement?][]): { el: HTMLElement; select: (at: number) => void } {
  const buttons = items.map(([label, , icon]) => h('button', { type: 'button', role: 'tab', className: 'tab' }, ...(icon ? [icon] : []), label));
  const select = (at: number) =>
    items.forEach(([, panel], i) => {
      panel.hidden = i !== at;
      buttons[i].setAttribute('aria-selected', String(i === at));
    });
  buttons.forEach((b, i) => b.addEventListener('click', () => select(i)));
  select(0);
  const el = h('div', { className: 'tabs' }, h('div', { role: 'tablist', className: 'tablist' }, ...buttons), ...items.map(([, panel]) => panel));
  return { el, select };
}