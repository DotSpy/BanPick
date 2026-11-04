import type { Preset, Step } from '../model';
import { validatePreset } from '../schema';
import * as E from './edit';
import { draftOrder } from './preview';
import { btn, h } from '../dom';
import { itemIcon } from '../icon';
import { linksPanel } from '../links';
import type { Link } from '../route';
import { decodePreset, encodePreset } from './share';

export type SaveResult = { ok: true; links: Link[] } | { ok: false; error: string };

/** Runs after the browser has moved focus, so a re-render does not steal it from the field the user tabbed to. */
const later = (fn: () => void) => void setTimeout(fn, 0);

const input = (label: string, value: string, onChange: (v: string) => void, extra: Record<string, unknown> = {}) =>
  h('input', { value, type: 'text', ariaLabel: label, onchange: (e: Event) => { const v = (e.target as HTMLInputElement).value; later(() => onChange(v)); }, ...extra });

const numberInput = (label: string, value: number, min: number, onChange: (v: number) => void) =>
  input(label, String(value), (v) => onChange(Number(v)), { type: 'number', min: String(min), step: '1', title: label });

const select = (label: string, value: string, options: string[], onChange: (v: string) => void) => {
  const el = h('select', { ariaLabel: label, onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; later(() => onChange(v)); } }, ...options.map((o) => h('option', { value: o, textContent: o })));
  (el as HTMLSelectElement).value = value;
  return el;
};

const FOCUSABLE = 'input, select, textarea, button';

/** Mounts the builder into `root`. `onSave` receives only validated presets. */
export function mountBuilder(root: HTMLElement, initial: Preset, onSave?: (p: Preset) => Promise<SaveResult>) {
  let preset = initial;
  let jsonDraft: string | null = null;
  let jsonError: string | null = null;
  const content = h('div');
  const status = h('p', { className: 'status', role: 'status' });
  const linksSlot = h('div');
  root.replaceChildren(content, status, linksSlot);

  const say = (text: string) => (status.textContent = text);
  const update = (next: Preset) => {
    preset = next;
    jsonDraft = jsonError = null;
    render();
  };

  const stepRow = (s: Step, i: number) => {
    const poolNames = Object.keys(preset.pools);
    const patch = (p: Partial<Step>) => update(E.updateStep(preset, i, p));
    return h(
      'li', { className: 'row' },
      select(`Step ${i + 1} team`, s.team, ['A', 'B'], (v) => patch({ team: v as Step['team'] })),
      select(`Step ${i + 1} action`, s.action, ['ban', 'pick', 'choose'], (v) => patch({ action: v as Step['action'] })),
      s.action === 'choose' ? '' : select(`Step ${i + 1} pool`, s.pool ?? poolNames[0], poolNames, (v) => patch({ pool: v })),
      h('label', { className: 'mini' }, 'Count', numberInput(`Step ${i + 1} count`, s.count ?? 1, 1, (v) => patch({ count: v }))),
      h('label', { className: 'mini' }, 'Timer (s)', numberInput(`Step ${i + 1} timer in seconds (0 = no timer)`, s.timer ?? 0, 0, (v) => patch({ timer: v }))),
      s.action === 'pick' ? h('label', {}, 'blind', h('input', { type: 'checkbox', checked: !!s.blind, onchange: (e: Event) => { const c = (e.target as HTMLInputElement).checked; later(() => patch({ blind: c })); } })) : '',
      btn('↑', () => update(E.moveStep(preset, i, i - 1)), { className: 'icon', ariaLabel: `Move step ${i + 1} up` }),
      btn('↓', () => update(E.moveStep(preset, i, i + 1)), { className: 'icon', ariaLabel: `Move step ${i + 1} down` }),
      btn('✕', () => update(E.removeStep(preset, i)), { className: 'icon', ariaLabel: `Remove step ${i + 1}` }),
    );
  };

  const poolBlock = (name: string) => {
    const pool = preset.pools[name];
    return h(
      'section', {},
      h('h3', {}, name),
      select(`${name} scope`, pool.scope ?? 'global', ['global', 'shared', 'exclusive'], (v) => update(E.setPoolScope(preset, name, v as 'global'))),
      btn('Remove pool', () => update(E.removePool(preset, name)), { className: 'secondary' }),
      h(
        'ul', {},
        ...pool.items.map((item, i) =>
          h(
            'li', { className: 'row' },
            input(`${name} item ${i + 1} id`, item.id, (v) => update(E.updateItem(preset, name, i, { id: v }))),
            input(`${name} item ${i + 1} name`, item.name, (v) => update(E.updateItem(preset, name, i, { name: v }))),
            input(`${name} item ${i + 1} tags`, E.formatTags(item.tags), (v) => update(E.updateItem(preset, name, i, { tags: E.parseTags(v) })), { placeholder: 'tag:value, …' }),
            input(`${name} item ${i + 1} image link`, item.image ?? '', (v) => update(E.updateItem(preset, name, i, { image: v })), { placeholder: 'https://…' }),
            itemIcon(item, item.name),
            btn('✕', () => update(E.removeItem(preset, name, i)), { className: 'icon', ariaLabel: `Remove ${name} item ${i + 1}` }),
          ),
        ),
      ),
      btn('Add item', () => update(E.addItem(preset, name, { id: `item-${pool.items.length + 1}`, name: `Item ${pool.items.length + 1}` })), { className: 'secondary' }),
    );
  };

  const importJson = (text: string) => {
    jsonDraft = text;
    try {
      const r = validatePreset(JSON.parse(text));
      if (r.ok) return update(r.preset);
      jsonError = r.errors.map((e) => `${e.path || 'preset'}: ${e.message}`).join('; ');
    } catch (e) {
      jsonError = `Not valid JSON: ${(e as Error).message}`;
    }
    render();
  };

  const save = async (valid: Preset) => {
    say('Saving…');
    linksSlot.replaceChildren();
    const r = await onSave!(valid);
    if (r.ok) {
      say('Saved. Share these links:');
      linksSlot.replaceChildren(linksPanel(r.links));
    } else {
      say(`Could not save: ${r.error}`);
    }
  };

  const copyShareLink = async () => {
    const link = `${location.origin}${location.pathname}#${await encodePreset(preset)}`;
    try {
      await navigator.clipboard.writeText(link);
      say('Share link copied.');
    } catch {
      say(`Copy this link: ${link}`);
    }
  };

  function render() {
    const focused = [...root.querySelectorAll(FOCUSABLE)].indexOf(document.activeElement as Element);
    const result = validatePreset(preset);
    const errors = result.ok ? [] : result.errors;
    content.replaceChildren(
      h('h2', {}, 'Preset builder'),
      h('label', { className: 'field' }, 'Preset name', input('Preset name', preset.name, (v) => update(E.rename(preset, v)))),
      h('label', {}, 'pause between steps', h('input', { type: 'checkbox', checked: !!preset.pauses?.between, onchange: (e: Event) => { const c = (e.target as HTMLInputElement).checked; later(() => update(E.setPausesBetween(preset, c))); } })),
      h('h3', {}, 'Pools'),
      ...Object.keys(preset.pools).map(poolBlock),
      btn('Add pool', () => update(E.addPool(preset, `pool-${Object.keys(preset.pools).length + 1}`)), { className: 'secondary' }),
      h('h3', {}, 'Steps'),
      h('p', { className: 'hint', textContent: 'Each step: team, action, pool, count, timer in seconds (0 = no timer), blind.' }),
      h('ol', {}, ...preset.steps.map(stepRow)),
      btn('Add step', () => update(E.addStep(preset)), { className: 'secondary' }),
      h('h3', {}, 'Draft order'),
      h('ol', { className: 'order' }, ...draftOrder(preset).map((r) => h('li', { textContent: `${r.team}: ${r.text}${r.timer ? ` · ${r.timer}s` : ''}` }))),
      h('ul', { className: 'errors' }, ...errors.map((e) => h('li', { textContent: `${e.path || 'preset'}: ${e.message}` }))),
      h('label', { className: 'field', textContent: 'Preset JSON (advanced)' }),
      h('textarea', { className: 'json', ariaLabel: 'Preset JSON', ariaInvalid: String(!!jsonError), value: jsonDraft ?? JSON.stringify(preset, null, 2), onchange: (e: Event) => { const v = (e.target as HTMLTextAreaElement).value; later(() => importJson(v)); } }),
      h('p', { className: 'json-error', role: 'alert', textContent: jsonError ?? '' }),
      btn('Copy share link', () => void copyShareLink(), { className: 'secondary' }),
      onSave ? btn('Save', () => result.ok && void save(result.preset), { disabled: !result.ok, title: result.ok ? '' : 'Fix the errors above first' }) : '',
    );
    if (focused >= 0) (root.querySelectorAll(FOCUSABLE)[focused] as HTMLElement | undefined)?.focus();
  }

  render();
  return { get: () => preset, set: update };
}

/** Loads a preset from a "#<code>" URL hash, or undefined when the hash is empty or invalid. */
export async function presetFromHash(hash: string): Promise<Preset | undefined> {
  const code = hash.replace(/^#/, '');
  if (!code) return undefined;
  const r = await decodePreset(code);
  return r.ok ? r.preset : undefined;
}
