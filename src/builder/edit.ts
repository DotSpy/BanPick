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
      for (const k of ['pool', 'restrict', 'blind', 'reveal'] as const) delete s[k];
    } else {
      delete s.tag;
      s.pool ??= Object.keys(c.pools)[0];
      if (s.action !== 'pick') delete s.blind;
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
