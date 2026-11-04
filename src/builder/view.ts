import type { Preset, Step } from '../model';
import { validatePreset } from '../schema';
import * as E from './edit';
import { draftOrder } from './preview';
import { decodePreset, encodePreset } from './share';

type Child = Node | string;

function h(tag: string, props: Record<string, unknown> = {}, ...kids: Child[]): HTMLElement {
  const el = Object.assign(document.createElement(tag), props);
  el.append(...kids);
  return el;
}

const input = (value: string, onChange: (v: string) => void, type = 'text') =>
  h('input', { value, type, onchange: (e: Event) => onChange((e.target as HTMLInputElement).value) });

const select = (value: string, options: string[], onChange: (v: string) => void) => {
  const el = h('select', { onchange: (e: Event) => onChange((e.target as HTMLSelectElement).value) }, ...options.map((o) => h('option', { value: o, textContent: o })));
  (el as HTMLSelectElement).value = value;
  return el;
};

const btn = (label: string, onClick: () => void) => h('button', { type: 'button', textContent: label, onclick: onClick });

/** Mounts the builder into `root`. `onSave` receives only validated presets. */
export function mountBuilder(root: HTMLElement, initial: Preset, onSave?: (p: Preset) => void) {
  let preset = initial;
  const update = (next: Preset) => {
    preset = next;
    render();
  };

  const stepRow = (s: Step, i: number) => {
    const poolNames = Object.keys(preset.pools);
    const patch = (p: Partial<Step>) => update(E.updateStep(preset, i, p));
    const num = (key: 'count' | 'timer') => input(String(s[key] ?? 0), (v) => patch({ [key]: Number(v) }), 'number');
    return h(
      'li', {},
      select(s.team, ['A', 'B'], (v) => patch({ team: v as Step['team'] })),
      select(s.action, ['ban', 'pick', 'choose'], (v) => patch({ action: v as Step['action'] })),
      s.action === 'choose' ? '' : select(s.pool ?? poolNames[0], poolNames, (v) => patch({ pool: v })),
      num('count'),
      num('timer'),
      s.action === 'pick' ? h('label', {}, 'blind', h('input', { type: 'checkbox', checked: !!s.blind, onchange: (e: Event) => patch({ blind: (e.target as HTMLInputElement).checked }) })) : '',
      btn('↑', () => update(E.moveStep(preset, i, i - 1))),
      btn('↓', () => update(E.moveStep(preset, i, i + 1))),
      btn('✕', () => update(E.removeStep(preset, i))),
    );
  };

  const poolBlock = (name: string) => {
    const pool = preset.pools[name];
    return h(
      'section', {},
      h('h3', {}, name),
      select(pool.scope ?? 'global', ['global', 'shared', 'exclusive'], (v) => update(E.setPoolScope(preset, name, v as 'global'))),
      btn('Remove pool', () => update(E.removePool(preset, name))),
      h(
        'ul', {},
        ...pool.items.map((item, i) =>
          h(
            'li', {},
            input(item.id, (v) => update(E.updateItem(preset, name, i, { id: v }))),
            input(item.name, (v) => update(E.updateItem(preset, name, i, { name: v }))),
            input(E.formatTags(item.tags), (v) => update(E.updateItem(preset, name, i, { tags: E.parseTags(v) }))),
            input(item.image ?? '', (v) => update(E.updateItem(preset, name, i, { image: v }))),
            item.image ? h('img', { src: item.image, alt: item.name, width: 24, onerror: (e: Event) => ((e.target as HTMLElement).replaceWith(item.name)) }) : '',
            btn('✕', () => update(E.removeItem(preset, name, i))),
          ),
        ),
      ),
      btn('Add item', () => update(E.addItem(preset, name, { id: `item-${pool.items.length + 1}`, name: `Item ${pool.items.length + 1}` }))),
    );
  };

  function render() {
    const result = validatePreset(preset);
    const errors = result.ok ? [] : result.errors;
    root.replaceChildren(
      h('h2', {}, 'Preset builder'),
      input(preset.name, (v) => update(E.rename(preset, v))),
      h('label', {}, 'pause between steps', h('input', { type: 'checkbox', checked: !!preset.pauses?.between, onchange: (e: Event) => update(E.setPausesBetween(preset, (e.target as HTMLInputElement).checked)) })),
      h('h3', {}, 'Pools'),
      ...Object.keys(preset.pools).map(poolBlock),
      btn('Add pool', () => update(E.addPool(preset, `pool-${Object.keys(preset.pools).length + 1}`))),
      h('h3', {}, 'Steps'),
      h('ol', {}, ...preset.steps.map(stepRow)),
      btn('Add step', () => update(E.addStep(preset))),
      h('h3', {}, 'Draft order'),
      h('ol', { className: 'order' }, ...draftOrder(preset).map((r) => h('li', { textContent: `${r.team}: ${r.text}${r.timer ? ` · ${r.timer}s` : ''}` }))),
      h('ul', { className: 'errors' }, ...errors.map((e) => h('li', { textContent: `${e.path || 'preset'}: ${e.message}` }))),
      h('textarea', { className: 'json', value: JSON.stringify(preset, null, 2), onchange: (e: Event) => {
        const r = validatePreset(safeParse((e.target as HTMLTextAreaElement).value));
        if (r.ok) update(r.preset);
      } }),
      btn('Copy share link', async () => {
        const link = `${location.origin}${location.pathname}#${await encodePreset(preset)}`;
        await navigator.clipboard?.writeText(link);
      }),
      onSave ? btn('Save', () => result.ok && onSave(result.preset)) : '',
    );
  }

  render();
  return { get: () => preset, set: update };
}

const safeParse = (text: string): unknown => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

/** Loads a preset from a "#<code>" URL hash, or undefined when the hash is empty or invalid. */
export async function presetFromHash(hash: string): Promise<Preset | undefined> {
  const code = hash.replace(/^#/, '');
  if (!code) return undefined;
  const r = await decodePreset(code);
  return r.ok ? r.preset : undefined;
}
