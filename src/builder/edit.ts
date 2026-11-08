import type { IconSize, Item, Preset, Step, Team } from '../model';

/**
 * Pure editing operations for the builder. Each returns a new preset and never mutates its input.
 * They keep cross-field coupling consistent (e.g. reveal indices); validity is judged by the schema.
 */

const edit = (p: Preset, change: (copy: Preset) => void): Preset => {
  const copy = structuredClone(p);
  change(copy);
  return copy;
};

export const newPreset = (): Preset => ({
  version: 1,
  name: 'New preset',
  tagging: { assignment: 'none' },
  pools: { items: { items: [{ id: 'item-1', name: 'Item 1' }, { id: 'item-2', name: 'Item 2' }] } },
  steps: [{ team: 'A', action: 'ban', pool: 'items', count: 1 }],
  pauses: { between: false },
});

export const rename = (p: Preset, name: string) => edit(p, (c) => void (c.name = name));
export const setPausesBetween = (p: Preset, between: boolean) => edit(p, (c) => void (c.pauses = { between }));

export function setTagging(p: Preset, tagging: Preset['tagging']): Preset {
  return edit(p, (c) => {
    c.tagging = tagging;
    for (const s of c.steps) if (s.action === 'choose') s.tag = tagging.tag;
  });
}

/** Sets or clears (empty link) the image of one tag value. */
export function setTagImage(p: Preset, value: string, url: string): Preset {
  return edit(p, (c) => {
    const images = { ...c.tagging.images };
    if (url.trim()) images[value] = url;
    else delete images[value];
    if (Object.keys(images).length) c.tagging.images = images;
    else delete c.tagging.images;
  });
}

// Pools

export function addPool(p: Preset, name: string): Preset {
  return edit(p, (c) => void (c.pools[name] ??= { items: [] }));
}

export function removePool(p: Preset, name: string): Preset {
  return edit(p, (c) => {
    delete c.pools[name];
    c.steps = c.steps.filter((s) => s.pool !== name);
  });
}

/** Renames a pool and the steps that use it; keeps pool order. Ignores empty or taken names. */
export function renamePool(p: Preset, from: string, to: string): Preset {
  if (!to || to === from || p.pools[to] || !p.pools[from]) return p;
  return edit(p, (c) => {
    c.pools = Object.fromEntries(Object.entries(c.pools).map(([k, v]) => [k === from ? to : k, v]));
    for (const s of c.steps) if (s.pool === from) s.pool = to;
  });
}

const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'item';

/** Adds one item per non-empty line; ids come from the names and stay unique within the pool. */
export function addItems(p: Preset, pool: string, text: string): Preset {
  return edit(p, (c) => {
    const items = c.pools[pool].items;
    const taken = new Set(items.map((i) => i.id));
    for (const name of text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)) {
      const base = slug(name);
      let id = base;
      for (let n = 2; taken.has(id); n++) id = `${base}-${n}`;
      taken.add(id);
      items.push({ id, name });
    }
  });
}

/** Splits one CSV line; a field wrapped in double quotes may contain commas. */
const csvFields = (line: string) => {
  const out: string[] = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quoted && ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
    else if (ch === '"') quoted = !quoted;
    else if (ch === ',' && !quoted) { out.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  return [...out, cur.trim()];
};

/** Items from a JSON array of items, or CSV lines `id,name,"tag=value, tag=value",image` (the first three columns are enough). */
export function parseItemList(text: string): Item[] {
  const body = text.trim();
  if (body.startsWith('[')) {
    return (JSON.parse(body) as Item[]).map(({ id, name, tags, image }) => ({ id: String(id), name: String(name), ...(tags ? { tags } : {}), ...(image ? { image } : {}) }));
  }
  return body.split(/\r?\n/).filter((l) => l.trim()).map((line) => {
    const [id, name, tags, image] = csvFields(line);
    return { id, name: name || id, ...(tags ? { tags: parseTags(tags) } : {}), ...(image ? { image } : {}) };
  });
}

/** Appends imported items; ids already in the pool are skipped so the pool stays valid. */
export function importItems(p: Preset, pool: string, text: string): Preset {
  const incoming = parseItemList(text);
  return edit(p, (c) => {
    const items = c.pools[pool].items;
    const taken = new Set(items.map((i) => i.id));
    for (const item of incoming) if (item.id && !taken.has(item.id)) { taken.add(item.id); items.push(item); }
  });
}
export function setPoolScope(p: Preset, name: string, scope: NonNullable<Preset['pools'][string]['scope']>): Preset {
  return edit(p, (c) => void (c.pools[name].scope = scope));
}

export function setPoolIconSize(p: Preset, name: string, size: IconSize): Preset {
  return edit(p, (c) => void (c.pools[name].iconSize = size));
}

export function addItem(p: Preset, pool: string, item: Item): Preset {
  return edit(p, (c) => void c.pools[pool].items.push(item));
}

export function updateItem(p: Preset, pool: string, index: number, patch: Partial<Item>): Preset {
  return edit(p, (c) => {
    const item = Object.assign(c.pools[pool].items[index], patch);
    if (!item.image) delete item.image;
    if (!item.tags || !Object.keys(item.tags).length) delete item.tags;
  });
}

export function removeItem(p: Preset, pool: string, index: number): Preset {
  return edit(p, (c) => void c.pools[pool].items.splice(index, 1));
}

/** "side=nato, nation=US" <-> { side: 'nato', nation: 'US' } */
export const parseTags = (text: string): Record<string, string> =>
  Object.fromEntries(
    text
      .split(',')
      .map((pair) => pair.split('=').map((s) => s.trim()))
      .filter(([k, v]) => k && v),
  );
export const formatTags = (tags: Record<string, string> = {}) =>
  Object.entries(tags)
    .map(([k, v]) => `${k}=${v}`)
    .join(', ');

// Steps

export function addStep(p: Preset, team: Team = 'A'): Preset {
  const pool = Object.keys(p.pools)[0];
  return edit(p, (c) => void c.steps.push({ team, action: 'ban', pool, count: 1 }));
}

export function updateStep(p: Preset, index: number, patch: Partial<Step>): Preset {
  return edit(p, (c) => {
    const s = Object.assign(c.steps[index], patch);
    if (s.action === 'choose') {
      s.tag = c.tagging.tag;
      s.count = 1;
      for (const k of ['pool', 'restrict', 'blind', 'reveal', 'random'] as const) delete s[k];
    } else {
      delete s.tag;
      s.pool ??= Object.keys(c.pools)[0];
      if (s.action !== 'pick') delete s.blind;
      if (!s.random) delete s.random;
    }
    if (!s.blind) delete s.reveal;
    else s.reveal ??= 'end';
    for (const k of ['timer', 'pause', 'restrict'] as const) if (!s[k]) delete s[k];
  });
}

/** Rewrites numeric reveal indices after reordering; `map` returns undefined when the target step is gone. */
function remapReveals(steps: Step[], map: (old: number) => number | undefined) {
  for (const s of steps) {
    if (typeof s.reveal === 'number') s.reveal = map(s.reveal) ?? 'end';
  }
}

export function removeStep(p: Preset, index: number): Preset {
  return edit(p, (c) => {
    c.steps.splice(index, 1);
    remapReveals(c.steps, (old) => (old === index ? undefined : old > index ? old - 1 : old));
  });
}

export function duplicateStep(p: Preset, index: number): Preset {
  return edit(p, (c) => {
    c.steps.splice(index + 1, 0, structuredClone(c.steps[index]));
    remapReveals(c.steps, (old) => (old > index ? old + 1 : old));
  });
}

/** Appends `n` single-turn steps that alternate between the teams, starting with A. */
export function alternateSteps(p: Preset, action: 'ban' | 'pick', pool: string, n: number): Preset {
  return edit(p, (c) => {
    for (let i = 0; i < n; i++) c.steps.push({ team: i % 2 ? 'B' : 'A', action, pool, count: 1 });
  });
}

/** Final index of a dragged step dropped before or after row `row`. */
export const dropIndex = (from: number, row: number, after: boolean) => {
  const position = row + (after ? 1 : 0);
  return from < position ? position - 1 : position;
};

export function moveStep(p: Preset, from: number, to: number): Preset {
  if (to < 0 || to >= p.steps.length || from === to) return p;
  return edit(p, (c) => {
    const [moved] = c.steps.splice(from, 1);
    c.steps.splice(to, 0, moved);
    remapReveals(c.steps, (old) => {
      if (old === from) return to;
      if (from < to && old > from && old <= to) return old - 1;
      if (from > to && old >= to && old < from) return old + 1;
      return old;
    });
  });
}

/** Appends 
 copies of the last step. */
export function repeatLastStep(p: Preset, n: number): Preset {
  if (!p.steps.length) return p;
  return edit(p, (c) => {
    for (let i = 0; i < n; i++) c.steps.push(structuredClone(c.steps[c.steps.length - 1]));
  });
}

/** Appends a copy of the last step with the other team. */
export function mirrorLastStep(p: Preset): Preset {
  if (!p.steps.length) return p;
  return edit(p, (c) => {
    const last = structuredClone(c.steps[c.steps.length - 1]);
    last.team = last.team === 'A' ? 'B' : 'A';
    c.steps.push(last);
  });
}
