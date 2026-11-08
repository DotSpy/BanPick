import type { DraftState } from '../draft';
import { verifyState } from '../draft';
import type { Entry, Preset, Team } from '../model';
import { validatePreset, type ValidationError } from '../schema';
import { turnsOf } from '../turns';

/** Document shapes and their conversions. Pure: no Firestore import, so the rules here are unit-testable. */

export interface PresetDoc {
  preset: string;
  ownerUid: string;
  createdAt: number;
  updatedAt: number;
}

export interface DraftDoc {
  ownerA: string | null;
  ownerB: string | null;
  phase: DraftState['phase'];
  deadline: number | null;
  turnIndex: number;
  /** The preset as JSON; set at creation and never changed, so rules can pin it. */
  preset: string;
  /** Acting team of every turn, derived from the preset; lets rules check who may write each history entry. */
  turnTeams: Team[];
  /** Recorded picks and bans; rules allow it to grow by one entry per write and never to change. */
  history: Entry[];
  /** Pending ready confirmations; each captain may only set their own flag. */
  confirm: Record<Team, boolean> | null;
  /** Everything else in the draft state, as JSON. Rules cannot read inside it. */
  state: string;
  updatedAt: number;
}

export type Loaded<T> = { ok: true; value: T } | { ok: false; error: string };

export const describeErrors = (errors: ValidationError[]) => errors.map((e) => `${e.path || 'preset'}: ${e.message}`).join('; ');

// The preset is stored as a JSON string: Firestore rejects undefined values and reorders nothing it should not.
export function presetToDoc(preset: Preset, ownerUid: string, now: number, createdAt = now): PresetDoc {
  return { preset: JSON.stringify(preset), ownerUid, createdAt, updatedAt: now };
}

/** Stored presets are validated again on load, so a hand-edited document cannot reach the engine. */
export function presetFromDoc(doc: PresetDoc): Loaded<Preset> {
  let data: unknown;
  try {
    data = JSON.parse(doc.preset);
  } catch {
    return { ok: false, error: 'Stored preset is not valid JSON' };
  }
  const r = validatePreset(data);
  return r.ok ? { ok: true, value: r.preset } : { ok: false, error: describeErrors(r.errors) };
}

export const canEditPreset = (doc: Pick<PresetDoc, 'ownerUid'>, uid: string | null) => uid !== null && doc.ownerUid === uid;

/** Presets are kept for 6 months after their last save; firestore.rules uses the same number. */
export const PRESET_TTL_MS = 183 * 24 * 60 * 60 * 1000;

export const isPresetExpired = (doc: Pick<PresetDoc, 'updatedAt'>, now: number) => now - doc.updatedAt >= PRESET_TTL_MS;

// Top-level fields exist only so security rules can inspect seats, position, history and confirmations.
// presetJson keeps the stored preset byte-for-byte on later writes; rules require it to stay unchanged.
export function draftToDoc(s: DraftState, now: number, presetJson = JSON.stringify(s.preset)): DraftDoc {
  const { preset, history, confirm, ...rest } = s;
  return {
    ownerA: s.teams.A.owner,
    ownerB: s.teams.B.owner,
    phase: s.phase,
    deadline: s.deadline,
    turnIndex: s.turnIndex,
    preset: presetJson,
    turnTeams: turnsOf(preset).map((t) => t.team),
    history: JSON.parse(JSON.stringify(history)),
    confirm: confirm ?? null,
    state: JSON.stringify(rest),
    updatedAt: now,
  };
}

/** The top-level fields are what the security rules see; they must agree with the state the engine acts on. */
function mismatch(doc: DraftDoc, s: DraftState): string | null {
  const same = doc.turnTeams.join() === turnsOf(s.preset).map((t) => t.team).join() && doc.ownerA === s.teams.A.owner && doc.ownerB === s.teams.B.owner && doc.phase === s.phase && doc.turnIndex === s.turnIndex && doc.deadline === s.deadline;
  return same ? null : 'Stored seats or position do not match the draft state';
}

/** A stored draft is only accepted if its preset is valid and its history is a legal outcome of the rules. */
export function draftFromDoc(doc: DraftDoc): Loaded<DraftState> {
  let state: DraftState;
  let presetData: unknown;
  try {
    presetData = JSON.parse(doc.preset);
    state = { ...JSON.parse(doc.state), history: doc.history, ...(doc.confirm ? { confirm: doc.confirm } : {}) };
  } catch {
    return { ok: false, error: 'Stored draft is not valid JSON' };
  }
  const preset = validatePreset(presetData);
  if (!preset.ok) return { ok: false, error: describeErrors(preset.errors) };
  state.preset = preset.preset;
  const problem = verifyState(state) ?? mismatch(doc, state);
  return problem ? { ok: false, error: problem } : { ok: true, value: state };
}
