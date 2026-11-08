import type { DraftState } from './draft';
import type { Entry, Team, Turn } from './model';
import { choiceOf, visibleHistory } from './rules';

export interface Choice {
  id: string;
  name: string;
}
export interface Group {
  target: string;
  picks: Choice[];
  bans: Choice[];
}
export interface TeamResult {
  team: Team;
  name: string;
  /** The value this team chose on a "choose" step, if any (for example a side). */
  chosen: string | null;
  groups: Group[];
}
export interface DraftResults {
  preset: string;
  /** Targets picked by only one team (for example a map); both teams play them, so they are shown once. */
  shared: { target: string; picks: Choice[] }[];
  teams: [TeamResult, TeamResult];
  durationMs: number | null;
  finishedAt: number | null;
  steps: { index: number; team: Team; action: Turn['action']; label: string }[];
}

const TEAMS: Team[] = ['A', 'B'];
const choiceFor = (state: DraftState, e: Entry): Choice => ({ id: e.itemId, name: choiceOf(state.preset, e.action, e.itemId).item?.name ?? e.itemId });

/** Plain data for a finished draft; the text, card and image outputs all render from this one shape. */
export function draftResults(state: DraftState, viewer: Team | null = null): DraftResults {
  const entries = visibleHistory(state, null, viewer).filter((e) => e.itemId);
  const targetsOf = (team: Team) => new Set(entries.filter((e) => e.team === team && e.action === 'pick').map((e) => e.target));
  const [a, b] = [targetsOf('A'), targetsOf('B')];
  const sharedTargets = new Set([...a, ...b].filter((t) => !(a.has(t) && b.has(t))));
  const shared = [...sharedTargets].map((target) => ({
    target,
    picks: entries.filter((e) => e.action === 'pick' && e.target === target).map((e) => choiceFor(state, e)),
  }));
  const result = (team: Team): TeamResult => {
    const mine = entries.filter((e) => e.team === team);
    const targets = [...new Set(mine.filter((e) => e.action !== 'choose').map((e) => e.target))];
    const groups = targets
      .map((target) => ({
        target,
        picks: sharedTargets.has(target) ? [] : mine.filter((e) => e.target === target && e.action === 'pick').map((e) => choiceFor(state, e)),
        bans: mine.filter((e) => e.target === target && e.action === 'ban').map((e) => choiceFor(state, e)),
      }))
      .filter((g) => g.picks.length || g.bans.length);
    const chose = mine.find((e) => e.action === 'choose');
    return { team, name: state.teams[team].name, chosen: chose ? choiceFor(state, chose).name : null, groups };
  };
  const [ra, rb] = TEAMS.map(result);
  return {
    preset: state.preset.name,
    shared,
    teams: [ra, rb],
    durationMs: state.startedAt != null && state.finishedAt != null ? Math.max(0, state.finishedAt - state.startedAt) : null,
    finishedAt: state.finishedAt,
    steps: entries.map((e) => ({ index: e.index, team: e.team, action: e.action, label: choiceFor(state, e).name })),
  };
}

export function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  const [m, s] = [Math.floor(total / 60), total % 60];
  return m ? `${m} min ${s}s` : `${s}s`;
}

export const teamTitle = (t: TeamResult) => `${t.name}${t.chosen ? ` (${t.chosen.toUpperCase()})` : ''}`;
