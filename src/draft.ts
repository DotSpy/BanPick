import type { Entry, Preset, Team, Turn } from './model';
import { availableList, isAvailable } from './rules';
import { turnsOf } from './turns';

export interface TeamInfo {
  name: string;
  captain: string | null;
  connected: boolean;
  ready: boolean;
  /** Anonymous Firebase uid of the browser that claimed this seat; null while the seat is free. */
  owner: string | null;
}

export interface DraftState {
  id: string;
  preset: Preset;
  phase: 'lobby' | 'drafting' | 'done';
  /** Index of the current turn (see expandSteps). */
  turnIndex: number;
  deadline: number | null;
  /** While set, the draft is paused until both captains confirm. */
  confirm?: Record<Team, boolean> | null;
  /** While set, the current turn is in its timed pause; `deadline` is when it ends. */
  pausing?: boolean;
  /** The item the acting team has clicked but not confirmed; used as the pick if the timer runs out. */
  selection?: { team: Team; itemId: string } | null;
  history: Entry[];
  teams: Record<Team, TeamInfo>;
  spectators: number;
  serverNow: number;
  createdAt: number;
  finishedAt: number | null;
}

export const currentTurn = (state: DraftState): Turn | null =>
  state.phase === 'drafting' ? turnsOf(state.preset)[state.turnIndex] ?? null : null;

const timerDeadline = (turn: Turn | undefined, now: number) => (turn && turn.timer > 0 ? now + turn.timer * 1000 : null);

function goto(state: DraftState, index: number, now: number, afterPick = false) {
  const turns = turnsOf(state.preset);
  while (index < turns.length && availableList(state, turns[index]).length === 0) index++;
  state.confirm = null;
  state.pausing = false;
  if (index >= turns.length) {
    state.phase = 'done';
    state.turnIndex = turns.length;
    state.deadline = null;
    state.finishedAt = state.finishedAt ?? now;
    return;
  }
  const turn = turns[index];
  state.phase = 'drafting';
  state.turnIndex = index;
  state.finishedAt = null;
  if (turn.pause === 'ready' || (turn.pause === undefined && afterPick && state.preset.pauses.between)) {
    state.confirm = { A: false, B: false };
    state.deadline = null;
  } else if (typeof turn.pause === 'number') {
    state.pausing = true;
    state.deadline = now + turn.pause * 1000;
  } else {
    state.deadline = timerDeadline(turn, now);
  }
}

/** Ends the timed pause of the current turn and starts its timer. */
export function resumeFromPause(state: DraftState, now: number): string | null {
  if (state.phase !== 'drafting' || !state.pausing) return 'Not paused';
  state.pausing = false;
  state.deadline = timerDeadline(currentTurn(state) ?? undefined, now);
  return null;
}

/** Each captain confirms for their own team only; the turn starts once both did. */
export function confirmNext(state: DraftState, team: Team, now: number): string | null {
  if (state.phase !== 'drafting' || !state.confirm) return 'Nothing to confirm';
  state.confirm[team] = true;
  if (state.confirm.A && state.confirm.B) {
    state.confirm = null;
    state.deadline = timerDeadline(currentTurn(state) ?? undefined, now);
  }
  return null;
}

export function createState(id: string, preset: Preset, teamNames: { A: string; B: string }, now: number): DraftState {
  const team = (name: string): TeamInfo => ({ name, captain: null, connected: false, ready: false, owner: null });
  return {
    id,
    preset,
    phase: 'lobby',
    turnIndex: 0,
    deadline: null,
    history: [],
    teams: { A: team(teamNames.A), B: team(teamNames.B) },
    spectators: 0,
    serverNow: now,
    createdAt: now,
    finishedAt: null,
  };
}

/** The draft starts automatically once both captains are connected and ready. */
export function setReady(state: DraftState, team: Team, ready: boolean, now: number): string | null {
  if (state.phase !== 'lobby') return 'Draft already started';
  if (!state.teams[team].connected) return 'Captain not connected';
  state.teams[team].ready = ready;
  const { A, B } = state.teams;
  if (A.connected && A.ready && B.connected && B.ready) goto(state, 0, now);
  return null;
}

/** Rejects a pick that is not legal right now; shared by applyPick and setSelection. */
function checkTurn(state: DraftState, team: Team, itemId: string): string | null {
  const turn = currentTurn(state);
  if (!turn) return 'Draft is not running';
  if (state.pausing) return 'Paused before this step';
  if (state.confirm) return 'Paused: both captains must confirm first';
  if (turn.team !== team) return 'Not your turn';
  if (!isAvailable(state, turn, itemId)) return 'Item not available';
  return null;
}

export function applyPick(state: DraftState, team: Team, itemId: string, now: number, auto: boolean, random = false): string | null {
  const err = checkTurn(state, team, itemId);
  if (err) return err;
  const turn = currentTurn(state)!;
  state.history.push({ index: state.turnIndex, team, action: turn.action, target: turn.target, itemId, auto, ...(random ? { random } : {}) });
  state.selection = null;
  goto(state, state.turnIndex + 1, now, true);
  return null;
}

/** Replays the whole history against the preset from scratch and reports the first illegal entry. */
export function verifyState(state: DraftState): string | null {
  const fresh = createState(state.id, state.preset, { A: state.teams.A.name, B: state.teams.B.name }, 0);
  for (const t of ['A', 'B'] as Team[]) {
    fresh.teams[t].connected = true;
    fresh.teams[t].ready = true;
  }
  goto(fresh, 0, 0);
  for (const e of state.history) {
    if (fresh.pausing) resumeFromPause(fresh, 0);
    if (fresh.confirm) {
      confirmNext(fresh, 'A', 0);
      confirmNext(fresh, 'B', 0);
    }
    const turn = currentTurn(fresh);
    if (!turn) return `Entry ${e.index + 1} comes after the draft ended`;
    if (e.index !== fresh.turnIndex || e.team !== turn.team || e.action !== turn.action || e.target !== turn.target) {
      return `Entry ${e.index + 1} does not match the preset's step order`;
    }
    if (e.auto && turn.timer <= 0) return `Entry ${e.index + 1} is marked as an automatic pick but the step has no timer`;
    const owner = state.teams[e.team].owner;
    if (!e.auto && owner !== null && e.by !== owner) {
      return `${state.teams[e.team].name} "${e.action} ${e.target}" at step ${e.index + 1} was not requested by its seat owner`;
    }
    if (e.random && !turn.random) return `Entry ${e.index + 1} is marked random but the step does not allow it`;
    const err = applyPick(fresh, e.team, e.itemId, 0, e.auto, e.random);
    if (err) return `Entry ${e.index + 1} is illegal: ${err}`;
  }
  if (state.phase === 'lobby' && (state.history.length > 0 || state.turnIndex !== 0)) return 'A draft in the lobby cannot have history';
  if (state.phase !== 'lobby' && (fresh.turnIndex !== state.turnIndex || fresh.phase !== state.phase)) {
    return 'Draft position does not match its history';
  }
  return null;
}

/** Short fingerprint of the picks and bans; both captains should see the same value for a finished draft. */
export async function fingerprint(state: DraftState): Promise<string> {
  const data = new TextEncoder().encode(state.history.map((e) => `${e.index}:${e.team}:${e.action}:${e.target}:${e.itemId}`).join('|'));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
  return Array.from(hash.slice(0, 4), (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function randomAvailable(state: DraftState): string | null {
  const turn = currentTurn(state);
  const l = turn ? availableList(state, turn) : [];
  return l.length ? l[Math.floor(Math.random() * l.length)] : null;
}

/** Resolves the current turn with a random available item; only for steps that allow it. */
export function applyRandom(state: DraftState, team: Team, now: number): string | null {
  if (!currentTurn(state)?.random) return 'Random is not enabled for this step';
  const id = randomAvailable(state);
  return id ? applyPick(state, team, id, now, false, true) : 'Nothing available';
}

/** Stores the acting team's clicked item (or clears it with null). */
export function setSelection(state: DraftState, team: Team, itemId: string | null): string | null {
  if (itemId === null) {
    state.selection = null;
    return null;
  }
  const err = checkTurn(state, team, itemId);
  if (err) return err;
  state.selection = { team, itemId };
  return null;
}

/** The item the timer commits: the team's selection if still legal, otherwise random. */
export function autoChoice(state: DraftState): string | null {
  const turn = currentTurn(state);
  const sel = state.selection;
  if (turn && sel && sel.team === turn.team && isAvailable(state, turn, sel.itemId)) return sel.itemId;
  return randomAvailable(state);
}

export function picksOf(state: { history: Entry[] }, team: Team, target: string): string[] {
  return state.history.filter((e) => e.action === 'pick' && e.team === team && e.target === target).map((e) => e.itemId);
}
