import type { Entry, Preset, Team, Turn } from './model';
import { turnsOf } from './turns';

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

export function isAvailable(ctx: Ctx, turn: Turn, itemId: string): boolean {
  const { preset, history } = ctx;
  if (!itemsFor(preset, turn).includes(itemId)) return false;
  const tags = tagsOf(ctx);

  if (turn.action === 'choose') {
    return tags[turn.team] === null && !(preset.tagging.sameTag === 'forbid' && tags[otherTeam(turn.team)] === itemId);
  }

  const owner = ownerOf(preset, turn);
  if (turn.restrict) {
    const item = preset.pools[turn.target].items.find((i) => i.id === itemId)!;
    if (tags[owner] === null || item.tags?.[preset.tagging.tag!] !== tags[owner]) return false;
  }
  const scope = preset.pools[turn.target].scope ?? 'global';
  return !history.some((e) => {
    if (e.action === 'choose' || e.target !== turn.target || e.itemId !== itemId) return false;
    if (scope === 'global') return true;
    if (e.action === 'ban') return e.team !== owner;
    return scope === 'exclusive' || e.team === owner;
  });
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
  return ctx.history.map((e) => (e.team === viewer || isRevealed(ctx, e, current) ? e : { ...e, itemId: '' }));
}
