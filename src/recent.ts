export const RECENT_KEY = 'banpick-recent';
const MAX_RECENT = 3;

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** Ids of the presets used last, newest first. */
export function loadRecent(storage: Store = localStorage): string[] {
  try {
    const v: unknown = JSON.parse(storage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_RECENT) : [];
  } catch {
    return [];
  }
}

/** Moves `id` to the front of the recent list and returns the new list. */
export function rememberRecent(id: string, storage: Store = localStorage): string[] {
  const next = [id, ...loadRecent(storage).filter((x) => x !== id)].slice(0, MAX_RECENT);
  try {
    storage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Private mode: the list just lasts for this page.
  }
  return next;
}