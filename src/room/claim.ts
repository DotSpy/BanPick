import type { DraftState } from '../draft';
import type { Team } from '../model';

export interface ClaimDecision {
  /** True when the state was changed and must be written back. */
  changed: boolean;
  /** Why the seat was not claimed, or null on success or when already seated. */
  refusal: string | null;
}

const TEAMS: Team[] = ['A', 'B'];

/** Decides a seat claim. Mutates `s` only when the claim succeeds. */
export function decideClaim(s: DraftState, uid: string, want: Team, name: string): ClaimDecision {
  const mine = TEAMS.find((t) => s.teams[t].owner === uid);
  if (mine) {
    return mine === want
      ? { changed: false, refusal: null }
      : { changed: false, refusal: `This browser already holds Team ${mine}.` };
  }
  if (s.phase !== 'lobby') return { changed: false, refusal: 'The draft has already started; you are a spectator.' };
  if (s.teams[want].owner) return { changed: false, refusal: `Team ${want} is already taken; you are a spectator.` };
  const seat = s.teams[want];
  seat.owner = uid;
  seat.connected = true;
  if (cleanName(name)) seat.name = seat.captain = cleanName(name);
  return { changed: true, refusal: null };
}

const cleanName = (name: string) => name.trim().slice(0, 30);

/** Sets the captain name of a seat the caller already holds. Returns a refusal, or null when applied. */
export function renameSeat(s: DraftState, team: Team, name: string): string | null {
  const clean = cleanName(name);
  if (!clean) return 'Enter a name.';
  s.teams[team].name = s.teams[team].captain = clean;
  return null;
}

/** Frees a lobby seat so the link can claim it again. */
export function freeSeat(s: DraftState, team: Team): void {
  Object.assign(s.teams[team], { owner: null, connected: false, ready: false, captain: null });
}
