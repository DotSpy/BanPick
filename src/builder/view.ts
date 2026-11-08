import type { IconSize, Preset, Step } from '../model';
import { validatePreset } from '../schema';
import * as E from './edit';
import { btn, h } from '../dom';
import { glyph, type GlyphName } from '../glyph';
import { itemIcon } from '../icon';
import { linksPanel } from '../links';
import type { Link } from '../route';
import { stepWarnings } from './check';
import { orderLane } from './order';
import { decodePreset, encodePreset } from './share';

export type SaveResult = { ok: true; links: Link[] } | { ok: false; error: string };

/** A preset the builder can start from ("Load from built-in"). */
export interface Template {
  label: string;
  preset: Preset;
}

/** Runs after the browser has moved focus, so a re-render does not steal it from the field the user tabbed to. */
const later = (fn: () => void) => void setTimeout(fn, 0);

const input = (label: string, value: string, onChange: (v: string) => void, extra: Record<string, unknown> = {}) =>
  h('input', { value, type: 'text', ariaLabel: label, onchange: (e: Event) => { const v = (e.target as HTMLInputElement).value; later(() => onChange(v)); }, ...extra });

const numberInput = (label: string, value: number, min: number, onChange: (v: number) => void) =>
  input(label, String(value), (v) => onChange(Number(v)), { type: 'number', min: String(min), step: '1', title: label, inputMode: 'numeric' });

type Option = string | { value: string; label: string };

const select = (label: string, value: string, options: Option[], onChange: (v: string) => void) => {
  const kids = options.map((o) => {
    const { value: v, label: l } = typeof o === 'string' ? { value: o, label: o } : o;
    return h('option', { value: v, textContent: l });
  });
  const el = h('select', { ariaLabel: label, onchange: (e: Event) => { const v = (e.target as HTMLSelectElement).value; later(() => onChange(v)); } }, ...kids);
  (el as HTMLSelectElement).value = value;
  return el;
};

const field = (label: string, control: HTMLElement) => h('label', { className: 'mini' }, label, control);

const iconButton = (name: GlyphName, label: string, onClick: () => void) =>
  h('button', { type: 'button', className: 'icon ghost', ariaLabel: label, title: label, onclick: onClick }, glyph(name));

const FOCUSABLE = 'input, select, textarea, button';
const TEAMS = [{ value: 'A', label: 'Team A' }, { value: 'B', label: 'Team B' }];

/** Mounts the builder into `root`. `onSave` receives only validated presets. */
export function mountBuilder(root: HTMLElement, initial: Preset, onSave?: (p: Preset) => Promise<SaveResult>, templates: Template[] = []) {
  let preset = initial;
  let clean = JSON.stringify(initial);
  let savedAt: number | null = null;
  let savedLinks: Link[] | null = null;
  let jsonDraft: string | null = null;
  let jsonError: string | null = null;
  let jsonOpen = false;
  let rawEditing = false;
  let bulkFor: string | null = null;
  let bulkText = '';
  const quick = { action: 'ban' as 'ban' | 'pick', pool: '', count: 4 };
  const content = h('div');
  const status = h('p', { className: 'status', role: 'status' });
  const linksSlot = h('div');
  const bar = h('div', { className: 'builder-bar' });
  root.replaceChildren(content, status, linksSlot, bar);

  const say = (text: string) => (status.textContent = text);
  const update = (next: Preset) => {
    preset = next;
    jsonDraft = jsonError = null;
    rawEditing = false;
    if (JSON.stringify(preset) !== clean) {
      linksSlot.replaceChildren();
      say('');
    }
    render();
  };

  const showStep = (index: number) => {
    const row = content.querySelector(`ol.steps > li:nth-child(${index + 1})`) as HTMLElement | null;
    row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    row?.classList.add('hl');
    setTimeout(() => row?.classList.remove('hl'), 1500);
  };

  const stepRow = (s: Step, i: number, warnings: string[]) => {
    const poolNames = Object.keys(preset.pools);
    const patch = (p: Partial<Step>) => update(E.updateStep(preset, i, p));
    const toggle = (label: string, checked: boolean, key: 'blind' | 'random', aria?: string) =>
      h('label', { className: 'mini' }, label, h('input', { type: 'checkbox', checked, ...(aria ? { ariaLabel: aria } : {}), onchange: (e: Event) => { const c = (e.target as HTMLInputElement).checked; later(() => patch({ [key]: c })); } }));
    return h(
      'li', {
        className: 'row labelled',
        ondragover: (e: Event) => e.preventDefault(),
        ondrop: (e: Event) => {
          e.preventDefault();
          const from = Number((e as DragEvent).dataTransfer?.getData('text/plain'));
          if (Number.isInteger(from)) update(E.moveStep(preset, from, i));
        },
      },
      h('span', { className: 'num', textContent: String(i + 1) }),
      h('span', { className: 'handle', textContent: '\u22ee\u22ee', title: 'Drag to reorder', draggable: true, ondragstart: (e: Event) => (e as DragEvent).dataTransfer?.setData('text/plain', String(i)) }),
      field('Team', select(`Step ${i + 1} team`, s.team, TEAMS, (v) => patch({ team: v as Step['team'] }))),
      field('Action', select(`Step ${i + 1} action`, s.action, ['ban', 'pick', 'choose'], (v) => patch({ action: v as Step['action'] }))),
      s.action === 'choose' ? '' : field('Pool', select(`Step ${i + 1} pool`, s.pool ?? poolNames[0], poolNames, (v) => patch({ pool: v }))),
      field('Count', numberInput(`Step ${i + 1} count`, s.count ?? 1, 1, (v) => patch({ count: v }))),
      field('Timer (s)', numberInput(`Step ${i + 1} timer in seconds (0 = no timer)`, s.timer ?? 0, 0, (v) => patch({ timer: v }))),
      s.action === 'pick' ? toggle('Blind', !!s.blind, 'blind') : '',
      s.action === 'choose' ? '' : toggle('Random', !!s.random, 'random', `Step ${i + 1} allows random`),
      btn('\u2191', () => update(E.moveStep(preset, i, i - 1)), { className: 'icon ghost', ariaLabel: `Move step ${i + 1} up` }),
      btn('\u2193', () => update(E.moveStep(preset, i, i + 1)), { className: 'icon ghost', ariaLabel: `Move step ${i + 1} down` }),
      iconButton('copy', `Duplicate step ${i + 1}`, () => update(E.duplicateStep(preset, i))),
      btn('\u2715', () => update(E.removeStep(preset, i)), { className: 'icon ghost', ariaLabel: `Remove step ${i + 1}` }),
      warnings[i] ? h('p', { className: 'warn', role: 'note', textContent: warnings[i] }) : '',
    );
  };

  const bulkBlock = (name: string) =>
    h('div', { className: 'bulk' },
      h('textarea', { ariaLabel: `${name} items list`, placeholder: 'One item name per line', value: bulkText, oninput: (e: Event) => (bulkText = (e.target as HTMLTextAreaElement).value) }),
      h('div', { className: 'actions' },
        btn('Add items', () => { const text = bulkText; bulkFor = null; bulkText = ''; update(E.addItems(preset, name, text)); }),
        btn('Cancel', () => { bulkFor = null; bulkText = ''; render(); }, { className: 'ghost' })));

  const poolBlock = (name: string) => {
    const pool = preset.pools[name];
    return h(
      'section', { className: 'pool' },
      h('div', { className: 'pool-head' },
        field('Pool id', input(`${name} pool id`, name, (v) => update(E.renamePool(preset, name, v.trim())))),
        field('Scope', select(`${name} scope`, pool.scope ?? 'global', ['global', 'shared', 'exclusive'], (v) => update(E.setPoolScope(preset, name, v as 'global')))),
        field('Icon size', select(`${name} icon size`, pool.iconSize ?? 'medium', ['small', 'medium', 'large'], (v) => update(E.setPoolIconSize(preset, name, v as IconSize)))),
        iconButton('trash', 'Remove pool', () => update(E.removePool(preset, name)))),
      pool.items.length ? h('div', { className: 'item-head' }, ...['ID', 'Name', 'Tags', 'Image URL'].map((t) => h('span', { textContent: t }))) : '',
      h(
        'ul', {},
        ...pool.items.map((item, i) =>
          h(
            'li', { className: 'row item' },
            input(`${name} item ${i + 1} id`, item.id, (v) => update(E.updateItem(preset, name, i, { id: v }))),
            input(`${name} item ${i + 1} name`, item.name, (v) => update(E.updateItem(preset, name, i, { name: v }))),
            input(`${name} item ${i + 1} tags`, E.formatTags(item.tags), (v) => update(E.updateItem(preset, name, i, { tags: E.parseTags(v) })), { placeholder: 'tag=value, …' }),
            input(`${name} item ${i + 1} image link`, item.image ?? '', (v) => update(E.updateItem(preset, name, i, { image: v })), { placeholder: 'https://…' }),
            itemIcon(item, item.name, pool.iconSize),
            btn('\u2715', () => update(E.removeItem(preset, name, i)), { className: 'icon ghost', ariaLabel: `Remove ${name} item ${i + 1}` }),
          ),
        ),
      ),
      h('div', { className: 'actions' },
        btn('Add item', () => update(E.addItem(preset, name, { id: `item-${pool.items.length + 1}`, name: `Item ${pool.items.length + 1}` })), { className: 'secondary' }),
        btn('Paste list', () => { bulkFor = bulkFor === name ? null : name; render(); }, { className: 'ghost', ariaExpanded: String(bulkFor === name) })),
      bulkFor === name ? bulkBlock(name) : '',
    );
  };

  const quickFill = () => {
    const pools = Object.keys(preset.pools);
    const pool = pools.includes(quick.pool) ? quick.pool : pools[0];
    return h('div', { className: 'quick' },
      field('Quick fill', select('Quick fill action', quick.action, ['ban', 'pick'], (v) => (quick.action = v as 'ban' | 'pick'))),
      field('Pool', select('Quick fill pool', pool, pools, (v) => (quick.pool = v))),
      field('Steps', numberInput('Quick fill steps', quick.count, 1, (v) => (quick.count = Math.max(1, Math.floor(v) || 1)))),
      btn('Alternate A/B', () => update(E.alternateSteps(preset, quick.action, pool, quick.count)), { className: 'secondary', title: 'Add the steps, alternating Team A and Team B' }));
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
    jsonOpen = true;
    render();
  };

  const copyText = async (text: string, done: string) => {
    try {
      await navigator.clipboard.writeText(text);
      say(done);
    } catch {
      say(`Copy this: ${text}`);
    }
  };

  const save = async (valid: Preset) => {
    say('Saving…');
    linksSlot.replaceChildren();
    const r = await onSave!(valid);
    if (r.ok) {
      clean = JSON.stringify(valid);
      savedAt = Date.now();
      savedLinks = r.links;
      say('Saved. Share these links:');
      linksSlot.replaceChildren(linksPanel(r.links));
    } else {
      say(`Could not save: ${r.error}`);
    }
    render();
  };

  const copyShareLink = async () => copyText(`${location.origin}${location.pathname}#${await encodePreset(preset)}`, 'Share link copied.');

  const tagBlock = () => {
    const { tag, values, images } = preset.tagging;
    if (!values?.length) return [];
    return [
      h('h3', {}, `${tag ?? 'Tag'} values`),
      h('ul', {}, ...values.map((value) =>
        h('li', { className: 'row' },
          h('span', { textContent: value }),
          input(`${value} image link`, images?.[value] ?? '', (v) => update(E.setTagImage(preset, value, v)), { placeholder: 'https://\u2026' }),
          itemIcon({ name: value, image: images?.[value] }, value),
        ))),
    ];
  };

  const general = () =>
    h('div', { className: 'general' },
      h('label', { className: 'field' }, 'Preset name', input('Preset name', preset.name, (v) => update(E.rename(preset, v)))),
      h('label', { className: 'switch', title: 'Host confirms before each step' },
        h('input', { type: 'checkbox', checked: !!preset.pauses?.between, onchange: (e: Event) => { const c = (e.target as HTMLInputElement).checked; later(() => update(E.setPausesBetween(preset, c))); } }),
        'Pause between steps',
        h('span', { className: 'help', textContent: '?', title: 'Host confirms before each step' })),
      preset.name.trim() ? '' : h('p', { className: 'warn', role: 'note', textContent: 'Enter a preset name.' }));

  const rawJson = () =>
    h('details', { className: 'json-adv', open: jsonOpen, ontoggle: (e: Event) => (jsonOpen = (e.target as HTMLDetailsElement).open) },
      h('summary', { textContent: 'Preset JSON (advanced)' }),
      h('div', { className: 'actions' },
        btn('Copy JSON', () => void copyText(JSON.stringify(preset, null, 2), 'JSON copied.'), { className: 'secondary' }),
        btn(rawEditing ? 'Done editing' : 'Edit raw', () => { rawEditing = !rawEditing; render(); }, { className: 'secondary', ariaPressed: String(rawEditing) })),
      rawEditing ? h('p', { className: 'warn', role: 'note', textContent: 'Editing raw JSON: when you leave the field, valid JSON replaces everything in the form.' }) : '',
      h('textarea', { className: 'json', ariaLabel: 'Preset JSON', ariaInvalid: String(!!jsonError), readOnly: !rawEditing, value: jsonDraft ?? JSON.stringify(preset, null, 2), onchange: (e: Event) => { const v = (e.target as HTMLTextAreaElement).value; later(() => importJson(v)); } }),
      h('p', { className: 'json-error', role: 'alert', textContent: jsonError ?? '' }));

  const footer = (valid: Preset | null, problems: number, dirty: boolean) => {
    const minutes = savedAt === null ? 0 : Math.floor((Date.now() - savedAt) / 60000);
    const reason = !preset.name.trim() ? 'Enter a preset name to save' : problems ? `Fix ${problems} error${problems === 1 ? '' : 's'} to save` : '';
    const note = reason || (dirty ? 'Unsaved changes' : savedAt !== null ? `Saved ${minutes < 1 ? 'just now' : `${minutes} min ago`}` : '');
    const load = templates.length
      ? h('select', { ariaLabel: 'Load from built-in', onchange: (e: Event) => { const t = templates[Number((e.target as HTMLSelectElement).value)]; if (t) later(() => update(structuredClone(t.preset))); } },
          h('option', { value: '', textContent: 'Load from built-in\u2026' }), ...templates.map((t, i) => h('option', { value: String(i), textContent: t.label })))
      : '';
    bar.replaceChildren(
      h('span', { className: 'bar-note', textContent: note }),
      h('span', { className: 'bar-actions' },
        load,
        btn('Reset', () => update(JSON.parse(clean)), { className: 'ghost', disabled: !dirty, title: 'Go back to the last saved or loaded version' }),
        btn('Copy share link', () => void copyShareLink(), { className: 'ghost' }),
        onSave ? btn('Save', () => valid && void save(valid), { disabled: !valid || !preset.name.trim(), title: reason }) : '',
        savedLinks && !dirty ? btn('Create room', () => void window.open(savedLinks![0].url, '_blank', 'noopener')) : ''),
    );
  };

  function render() {
    const focused = [...root.querySelectorAll(FOCUSABLE)].indexOf(document.activeElement as Element);
    const result = validatePreset(preset);
    const errors = result.ok ? [] : result.errors;
    const warnings = stepWarnings(preset);
    content.replaceChildren(
      h('div', { className: 'builder' },
        h('div', { className: 'builder-main' },
          h('h3', {}, 'General'),
          general(),
          h('h3', {}, 'Pools'),
          ...Object.keys(preset.pools).map(poolBlock),
          btn('Add pool', () => update(E.addPool(preset, `pool-${Object.keys(preset.pools).length + 1}`)), { className: 'secondary' }),
          ...tagBlock(),
          h('h3', {}, 'Steps'),
          h('p', { className: 'hint', textContent: 'Each step: team, action, pool, count, timer in seconds (0 = no timer) and random. Blind applies to picks only.' }),
          quickFill(),
          h('ol', { className: 'steps' }, ...preset.steps.map((s, i) => stepRow(s, i, warnings))),
          btn('Add step', () => update(E.addStep(preset)), { className: 'secondary' }),
          h('ul', { className: 'errors' }, ...errors.map((e) => h('li', { textContent: `${e.path || 'preset'}: ${e.message}` })))),
        h('aside', { className: 'builder-side' },
          h('h3', {}, 'Draft order'),
          orderLane(preset, showStep),
          rawJson())),
    );
    footer(result.ok ? result.preset : null, errors.length, JSON.stringify(preset) !== clean);
    if (focused >= 0) (root.querySelectorAll(FOCUSABLE)[focused] as HTMLElement | undefined)?.focus();
  }

  render();
  return {
    get: () => preset,
    set: (next: Preset) => {
      clean = JSON.stringify(next);
      savedAt = savedLinks = null;
      update(next);
    },
  };
}

/** Loads a preset from a "#<code>" URL hash, or undefined when the hash is empty or invalid. */
export async function presetFromHash(hash: string): Promise<Preset | undefined> {
  const code = hash.replace(/^#/, '');
  if (!code) return undefined;
  const r = await decodePreset(code);
  return r.ok ? r.preset : undefined;
}
