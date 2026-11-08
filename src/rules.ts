import type { Entry, IconSize, Item, Preset, Team, Turn } from './model';
import { turnsOf } from './turns';

const locate = (preset: Preset, id: string) => {
  for (const pool of Object.values(preset.pools)) {
    const item = pool.items.find((i) => i.id === id);
    if (item) return { item, pool };
  }
  return undefined;
};

export const findItem = (preset: Preset, id: string) => locate(preset, id)?.item;

/** What to show for a chosen id: a tag value on a "choose" turn, otherwise a pool item. */
export const choiceOf = (preset: Preset, action: Turn['action'], id: string): { item: Pick<Item, 'name' | 'image'> | undefined; size: IconSize } =>
  action === 'choose' ? { item: { name: id, image: preset.tagging.images?.[id] }, size: 'medium' } : { item: findItem(preset, id), size: iconSizeOf(preset, id) };

export const iconSizeOf = (preset: Preset, id: string): IconSize => locate(preset, id)?.pool.iconSize ?? 'medium';

export const otherTeam = (t: Team): Team => (t === 'A' ? 'B' : 'A');

export type TagAssignment = Record<Team, string | null>;

/** What the rules need from a draft: the preset and what has happened so far. */
export interface Ctx {
  preset: Preset;
  history: Entry[];
}

/** Tag value held by each team: fixed seats, or replayed from `choose` entries. Two values + forbid: the opponent gets the other value. */
export function tagsOf({ preset, history }: Ctx): TagAssignment {
  const t = preset.tagging;
  if (t.assignment === 'none') return { A: null, B: null };
  if (t.assignment === 'fixed') return { A: t.seats!.A, B: t.seats!.B };
  const tags: TagAssignment = { A: null, B: null };
  const values = t.values!;
  for (const e of history) {
    if (e.action !== 'choose') continue;
    tags[e.team] = e.itemId;
    if (t.sameTag === 'forbid' && values.length === 2) tags[otherTeam(e.team)] = values.find((v) => v !== e.itemId)!;
  }
  return tags;
}

/** The team whose tag and options a turn concerns: the opponent for a ban on a non-global pool, else the acting team. */
export function ownerOf(preset: Preset, turn: Turn): Team {
  return turn.action === 'ban' && (preset.pools[turn.target]?.scope ?? 'global') !== 'global' ? otherTeam(turn.team) : turn.team;
}

/** Candidate item ids of a turn, before any availability rule. */
export function itemsFor(preset: Preset, turn: Turn): string[] {
  return turn.action === 'choose' ? preset.tagging.values! : preset.pools[turn.target].items.map((i) => i.id);
}

/** The turn's tag restriction, if any: the item must carry the owner's tag. */
function passesRestriction(ctx: Ctx, turn: Turn, itemId: string): boolean {
  if (!turn.restrict) return true;
  const { preset } = ctx;
  const owner = ownerOf(preset, turn);
  const item = preset.pools[turn.target].items.find((i) => i.id === itemId)!;
  const tag = tagsOf(ctx)[owner];
  return tag !== null && item.tags?.[preset.tagging.tag!] === tag;
}

/** Whether a ban in `history` (default: the draft's own) removes the item from this turn's options. */
export function isBanned(ctx: Ctx, turn: Turn, itemId: string, history: Entry[] = ctx.history): boolean {
  if (turn.action === 'choose') return false;
  const scope = ctx.preset.pools[turn.target].scope ?? 'global';
  const owner = ownerOf(ctx.preset, turn);
  return history.some((e) => e.action === 'ban' && e.target === turn.target && e.itemId === itemId && (scope === 'global' || e.team !== owner));
}

export function isAvailable(ctx: Ctx, turn: Turn, itemId: string): boolean {
  const { preset, history } = ctx;
  if (!itemsFor(preset, turn).includes(itemId)) return false;
  const tags = tagsOf(ctx);

  if (turn.action === 'choose') {
    return tags[turn.team] === null && !(preset.tagging.sameTag === 'forbid' && tags[otherTeam(turn.team)] === itemId);
  }

  const owner = ownerOf(preset, turn);
  if (!passesRestriction(ctx, turn, itemId)) return false;
  const scope = preset.pools[turn.target].scope ?? 'global';
  return !history.some((e) => {
    if (e.action === 'choose' || e.target !== turn.target || e.itemId !== itemId) return false;
    if (scope === 'global') return true;
    if (e.action === 'ban') return e.team !== owner;
    return scope === 'exclusive' || e.team === owner;
  });
}

/** Options to show: the available ones plus banned ones that would otherwise be available, in pool order. `history` is the viewer's view of it, so hidden blind bans stay hidden. */
export function shownList(ctx: Ctx, turn: Turn, history: Entry[] = ctx.history): string[] {
  return itemsFor(ctx.preset, turn).filter((id) => isAvailable(ctx, turn, id) || (isBanned(ctx, turn, id, history) && passesRestriction(ctx, turn, id)));
}

export function availableList(ctx: Ctx, turn: Turn): string[] {
  return itemsFor(ctx.preset, turn).filter((id) => isAvailable(ctx, turn, id));
}

/** A blind entry is hidden from the opponent until the draft passes its reveal step (or ends). */
export function isRevealed(ctx: Ctx, entry: Entry, current: Turn | null): boolean {
  const turn = turnsOf(ctx.preset)[entry.index];
  if (!turn?.blind) return true;
  if (current === null) return true;
  return typeof turn.reveal === 'number' && current.step > turn.reveal;
}

/** History as seen by `viewer` (null = spectator): hidden blind picks lose their itemId. */
export function visibleHistory(ctx: Ctx, current: Turn | null, viewer: Team | null): Entry[] {
  return ctx.history.map((e) => ((e.team === viewer || isRevealed(ctx, e, current)) ? e : { ...e, itemId: '' }));
}
