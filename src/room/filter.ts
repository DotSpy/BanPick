import type { Preset, Turn } from '../model';

/** The viewer's narrowing of a long option list: free text and one tag value (null = all). */
export interface OptionFilter {
  query: string;
  tab: string | null;
}

/** With more options than this the grid gets a search box. */
export const SEARCH_FROM = 12;

const itemsOf = (preset: Preset, turn: Turn) => (turn.action === 'choose' ? [] : preset.pools[turn.target].items);

/** Distinct tag values (for example the sides) carried by the listed items; tabs need at least two. */
export function tabValues(preset: Preset, turn: Turn, ids: string[]): string[] {
  const tag = preset.tagging.tag;
  if (!tag) return [];
  const shown = new Set(ids);
  const values = itemsOf(preset, turn).flatMap((i) => (shown.has(i.id) && i.tags?.[tag] ? [i.tags[tag]] : []));
  const distinct = [...new Set(values)];
  return distinct.length > 1 ? distinct : [];
}

/** The ids matching the filter, in their order. A tab that no longer applies counts as "all". */
export function filterIds(preset: Preset, turn: Turn, ids: string[], { query, tab }: OptionFilter): string[] {
  const tag = preset.tagging.tag;
  const active = tab !== null && tabValues(preset, turn, ids).includes(tab) ? tab : null;
  const needle = query.trim().toLowerCase();
  const byId = new Map(itemsOf(preset, turn).map((i) => [i.id, i]));
  return ids.filter((id) => {
    const item = byId.get(id);
    if (!item) return true;
    if (active !== null && tag && item.tags?.[tag] !== active) return false;
    return !needle || item.name.toLowerCase().includes(needle);
  });
}
