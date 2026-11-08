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
import { poolSummary, stepSummary } from './summary';

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

/** A compact "Label: value ▾" control. */
const chipSelect = (label: string, aria: string, value: string, options: Option[], onChange: (v: string) => void) =>
  h('label', { className: 'chip-select' }, h('span', { textContent: `${label}:` }), select(aria, value, options, onChange));

const iconButton = (name: GlyphName, label: string, onClick: () => void) =>
  h('button', { type: 'button', className: 'icon ghost', ariaLabel: label, title: label, onclick: onClick }, glyph(name));

const FOCUSABLE = 'input, select, textarea, button';
const TEAMS = [{ value: 'A', label: 'Team A' }, { value: 'B', label: 'Team B' }];
const PAGE = 50;

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
  let openPool: string | null = null;
  let editItem: { pool: string; index: number } | null = null;
  let openStep: number | null = null;
  const filters: Record<string, string> = {};
  const limits: Record<string, number> = {};
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
  /** Step operations shift indexes, so the open step is closed. */
  const stepOp = (next: Preset) => {
    openStep = null;
    update(next);
  };

  const stepRowAt = (index: number) => content.querySelector(`ol.steps > li:nth-child(${index + 1})`) as HTMLElement | null;

  const showStep = (index: number) => {
    const row = stepRowAt(index);
    row?.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    row?.classList.add('hl');
    setTimeout(() => row?.classList.remove('hl'), 1500);
  };

  let hovered: HTMLElement | null = null;
  const hoverStep = (index: number | null) => {
    hovered?.classList.remove('hover');
    hovered = index === null ? null : stepRowAt(index);
    hovered?.classList.add('hover');
  };

  const stepEdit = (s: Step, i: number) => {
    const poolNames = Object.keys(preset.pools);
    const patch = (p: Partial<Step>) => update(E.updateStep(preset, i, p));
    const toggle = (label: string, checked: boolean, key: 'blind' | 'random', aria?: string) =>
      h('label', { className: 'mini' }, label, h('input', { type: 'checkbox', checked, ...(aria ? { ariaLabel: aria } : {}), onchange: (e: Event) => { const c = (e.target as HTMLInputElement).checked; later(() => patch({ [key]: c })); } }));
    return h('div', { className: 'step-edit' },
      field('Team', select(`Step ${i + 1} team`, s.team, TEAMS, (v) => patch({ team: v as Step['team'] }))),
      field('Action', select(`Step ${i + 1} action`, s.action, ['ban', 'pick', 'choose'], (v) => patch({ action: v as Step['action'] }))),
      s.action === 'choose' ? '' : field('Pool', select(`Step ${i + 1} pool`, s.pool ?? poolNames[0], poolNames, (v) => patch({ pool: v }))),
      field('Count', numberInput(`Step ${i + 1} count`, s.count ?? 1, 1, (v) => patch({ count: v }))),
      field('Timer (s)', numberInput(`Step ${i + 1} timer in seconds (0 = no timer)`, s.timer ?? 0, 0, (v) => patch({ timer: v }))),
      s.action === 'pick' ? toggle('Blind', !!s.blind, 'blind') : '',
      s.action === 'choose' ? '' : toggle('Random', !!s.random, 'random', `Step ${i + 1} allows random`));
  };

  const stepRow = (s: Step, i: number, warnings: string[]) => {
    const open = openStep === i;
    return h(
      'li', {
        className: 'row step',
        ondragover: (e: Event) => e.preventDefault(),
        ondrop: (e: Event) => {
          e.preventDefault();
          const from = Number((e as DragEvent).dataTransfer?.getData('text/plain'));
          if (Number.isInteger(from)) stepOp(E.moveStep(preset, from, i));
        },
      },
      h('div', { className: 'step-head' },
        h('span', { className: 'num', textContent: String(i + 1) }),
        h('span', { className: 'handle', textContent: '\u22ee\u22ee', title: 'Drag to reorder', draggable: true, ondragstart: (e: Event) => (e as DragEvent).dataTransfer?.setData('text/plain', String(i)) }),
        h('button', { type: 'button', className: 'step-summary', ariaExpanded: String(open), ariaLabel: `Edit step ${i + 1}`, title: 'Click to edit', onclick: () => { openStep = open ? null : i; render(); } }, stepSummary(s, i)),
        btn('\u2191', () => stepOp(E.moveStep(preset, i, i - 1)), { className: 'icon ghost', ariaLabel: `Move step ${i + 1} up` }),
        btn('\u2193', () => stepOp(E.moveStep(preset, i, i + 1)), { className: 'icon ghost', ariaLabel: `Move step ${i + 1} down` }),
        iconButton('copy', `Duplicate step ${i + 1}`, () => stepOp(E.duplicateStep(preset, i))),
        btn('\u2715', () => stepOp(E.removeStep(preset, i)), { className: 'icon ghost', ariaLabel: `Remove step ${i + 1}` })),
      open ? stepEdit(s, i) : '',
      warnings[i] ? h('p', { className: 'warn', role: 'note', textContent: warnings[i] }) : '',
    );
  };

  const bulkBlock = (name: string) =>
    h('div', { className: 'bulk' },
      h('textarea', { ariaLabel: `${name} items list`, placeholder: 'One item name per line', value: bulkText, oninput: (e: Event) => (bulkText = (e.target as HTMLTextAreaElement).value) }),
      h('div', { className: 'actions' },
        btn('Add items', () => { const text = bulkText; bulkFor = null; bulkText = ''; update(E.addItems(preset, name, text)); }),
        btn('Cancel', () => { bulkFor = null; bulkText = ''; render(); }, { className: 'ghost' })));

  const tagChips = (tags: Record<string, string> = {}) =>
    h('span', { className: 'tags' }, ...Object.entries(tags).map(([k, v]) => h('span', { className: 'tag-chip', textContent: `${k}: ${v}` })));

  const itemRow = (name: string, i: number) => {
    const item = preset.pools[name].items[i];
    const label = (what: string) => `${name} item ${i + 1} ${what}`;
    if (editItem?.pool === name && editItem.index === i) {
      return h('li', { className: 'row item editing' },
        input(label('id'), item.id, (v) => update(E.updateItem(preset, name, i, { id: v }))),
        input(label('name'), item.name, (v) => update(E.updateItem(preset, name, i, { name: v }))),
        input(label('tags'), E.formatTags(item.tags), (v) => update(E.updateItem(preset, name, i, { tags: E.parseTags(v) })), { placeholder: 'tag=value, …' }),
        input(label('image link'), item.image ?? '', (v) => update(E.updateItem(preset, name, i, { image: v })), { placeholder: 'Image URL https://…' }),
        btn('Done', () => { editItem = null; render(); }, { className: 'ghost' }),
        btn('\u2715', () => { editItem = null; update(E.removeItem(preset, name, i)); }, { className: 'icon ghost', ariaLabel: `Remove ${name} item ${i + 1}` }));
    }
    return h('li', { className: 'row item' },
      h('button', { type: 'button', className: 'item-open', ariaLabel: `Edit ${name} item ${i + 1}`, title: 'Click to edit (id, name, tags, image link)', onclick: () => { editItem = { pool: name, index: i }; render(); } },
        h('span', { className: 'thumb' }, itemIcon(item, item.name, 'small')),
        h('span', { className: 'item-id', textContent: item.id }),
        h('span', { className: 'item-name', textContent: item.name }),
        tagChips(item.tags)),
      btn('\u2715', () => { editItem = null; update(E.removeItem(preset, name, i)); }, { className: 'icon ghost', ariaLabel: `Remove ${name} item ${i + 1}` }));
  };

  const itemList = (name: string) => {
    const q = (filters[name] ?? '').trim().toLowerCase();
    const matches = preset.pools[name].items
      .map((item, i) => ({ item, i }))
      .filter(({ item }) => !q || `${item.id} ${item.name} ${E.formatTags(item.tags)}`.toLowerCase().includes(q));
    const limit = limits[name] ?? PAGE;
    return h('ul', { className: 'items-table' },
      ...matches.slice(0, limit).map(({ i }) => itemRow(name, i)),
      matches.length > limit ? h('li', {}, btn(`Show ${Math.min(PAGE, matches.length - limit)} more (${matches.length - limit} left)`, () => { limits[name] = limit + PAGE; render(); }, { className: 'ghost' })) : '',
      !matches.length && q ? h('li', { className: 'hint', textContent: 'No items match.' }) : '');
  };

  const exportItems = (name: string) => void copyText(JSON.stringify(preset.pools[name].items, null, 2), `${name} items copied as JSON.`);

  const importFile = async (name: string, file: File | undefined) => {
    if (!file) return;
    try {
      update(E.importItems(preset, name, await file.text()));
    } catch (e) {
      say(`Could not import: ${(e as Error).message}`);
    }
  };

  const poolBlock = (name: string) => {
    const pool = preset.pools[name];
    const open = openPool === name;
    const picker = h('input', { type: 'file', accept: '.json,.csv,.txt', hidden: true, ariaLabel: `Import ${name} items file`, onchange: (e: Event) => void importFile(name, (e.target as HTMLInputElement).files?.[0]) });
    const filter = h('input', { type: 'search', className: 'filter', ariaLabel: `Filter ${name} items`, placeholder: 'Filter items…', value: filters[name] ?? '' });
    filter.addEventListener('input', () => {
      filters[name] = (filter as HTMLInputElement).value;
      limits[name] = PAGE;
      body.querySelector('ul.items-table')?.replaceWith(itemList(name));
    });
    const body = h('div', { className: 'pool-body' },
      h('div', { className: 'pool-tools' },
        field('Pool id', input(`${name} pool id`, name, (v) => { const to = v.trim(); if (openPool === name) openPool = to; editItem = null; update(E.renamePool(preset, name, to)); })),
        filter),
      itemList(name),
      h('div', { className: 'actions' },
        btn('Add item', () => { editItem = { pool: name, index: pool.items.length }; filters[name] = ''; limits[name] = pool.items.length + 1; update(E.addItem(preset, name, { id: `item-${pool.items.length + 1}`, name: `Item ${pool.items.length + 1}` })); }, { className: 'secondary' })),
      bulkFor === name ? bulkBlock(name) : '');
    return h(
      'section', { className: `pool${open ? ' open' : ''}` },
      h('div', { className: 'pool-head' },
        h('button', { type: 'button', className: 'pool-toggle', ariaExpanded: String(open), ariaLabel: `${open ? 'Collapse' : 'Expand'} pool ${name}`, onclick: () => { openPool = open ? null : name; editItem = null; render(); } },
          h('span', { className: 'chev', textContent: open ? '\u25be' : '\u25b8' }), poolSummary(name, pool)),
        chipSelect('Scope', `${name} scope`, pool.scope ?? 'global', ['global', 'shared', 'exclusive'], (v) => update(E.setPoolScope(preset, name, v as 'global'))),
        chipSelect('Size', `${name} icon size`, pool.iconSize ?? 'medium', ['small', 'medium', 'large'], (v) => update(E.setPoolIconSize(preset, name, v as IconSize))),
        h('span', { className: 'pool-actions' },
          btn('Paste list', () => { openPool = name; bulkFor = bulkFor === name ? null : name; render(); }, { className: 'secondary', ariaExpanded: String(bulkFor === name), title: 'Add many items at once, one per line' }),
          btn('Import', () => (picker as HTMLInputElement).click(), { className: 'ghost', title: 'Import items from a CSV (id,name,"tag=value, …",image) or JSON file' }),
          picker,
          btn('Export', () => exportItems(name), { className: 'ghost', title: 'Copy the items as JSON' }),
          iconButton('trash', 'Remove pool', () => { if (openPool === name) openPool = null; update(E.removePool(preset, name)); }))),
      open ? body : '');
  };

  const quickFill = () => {
    const pools = Object.keys(preset.pools);
    const pool = pools.includes(quick.pool) ? quick.pool : pools[0];
    const none = !preset.steps.length;
    return h('div', { className: 'quick' },
      field('Quick fill', select('Quick fill action', quick.action, ['ban', 'pick'], (v) => (quick.action = v as 'ban' | 'pick'))),
      field('Pool', select('Quick fill pool', pool, pools, (v) => (quick.pool = v))),
      field('Steps', numberInput('Quick fill steps', quick.count, 1, (v) => (quick.count = Math.max(1, Math.floor(v) || 1)))),
      btn('Alternate A/B', () => stepOp(E.alternateSteps(preset, quick.action, pool, quick.count)), { className: 'secondary', title: 'Add the steps, alternating Team A and Team B' }),
      btn('Mirror', () => stepOp(E.mirrorLastStep(preset)), { className: 'secondary', disabled: none, title: 'Add a copy of the last step with the teams swapped' }),
      btn('Repeat \u00d7N', () => stepOp(E.repeatLastStep(preset, quick.count)), { className: 'secondary', disabled: none, title: 'Add N copies of the last step (N is the Steps field)' }));
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
    hovered = null;
    content.replaceChildren(
      h('div', { className: 'builder' },
        h('div', { className: 'builder-main' },
          h('h3', {}, 'General'),
          general(),
          h('h3', {}, 'Steps'),
          h('p', { className: 'hint', textContent: 'Click a step to edit it: team, action, pool, count, timer in seconds (0 = no timer) and random. Blind applies to picks only.' }),
          quickFill(),
          h('ol', { className: 'steps' }, ...preset.steps.map((s, i) => stepRow(s, i, warnings))),
          btn('Add step', () => stepOp(E.addStep(preset)), { className: 'secondary' }),
          h('h3', {}, 'Pools'),
          ...Object.keys(preset.pools).map(poolBlock),
          btn('Add pool', () => update(E.addPool(preset, `pool-${Object.keys(preset.pools).length + 1}`)), { className: 'secondary' }),
          ...tagBlock(),
          h('ul', { className: 'errors' }, ...errors.map((e) => h('li', { textContent: `${e.path || 'preset'}: ${e.message}` })))),
        h('aside', { className: 'builder-side' },
          h('h3', {}, 'Draft order'),
          orderLane(preset, showStep, hoverStep),
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
      openPool = editItem = openStep = null;
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
