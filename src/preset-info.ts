import type { Preset, Step, Team } from './model';
import { turnsOf } from './turns';

/** Preset names carry their details after a separator ("2v2 Open pool - exclusive (one by one)"); show the title bold and the details muted. */
export function splitName(name: string): { title: string; meta: string } {
  const m = /^(.*?)(?: - | \(|, )(.*)$/.exec(name);
  if (!m) return { title: name, meta: '' };
  const meta = m[2].replace(/\)\s*$/, '').replace(/ - /g, ' \u00b7 ').replace(/ \(/g, ' \u00b7 ').replace(/\)/g, '');
  return { title: m[1], meta };
}

type Totals = Record<Team, { ban: number; pick: number }>;

/** Bans and picks each team makes over the whole draft. */
export function totals(preset: Preset): Totals {
  const t: Totals = { A: { ban: 0, pick: 0 }, B: { ban: 0, pick: 0 } };
  for (const s of preset.steps) if (s.action !== 'choose') t[s.team][s.action] += s.count;
  return t;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** One-line card summary: total bans and picks. */
export function summary(preset: Preset): string {
  const t = totals(preset);
  return `${plural(t.A.ban + t.B.ban, 'ban')} \u00b7 ${plural(t.A.pick + t.B.pick, 'pick')}`;
}

/** Timer line for the preview: one value for all turns, a range, or none. */
export function timerSummary(preset: Preset): string {
  const times = preset.steps.filter((s) => s.action !== 'choose').map((s) => s.timer ?? 0);
  const set = [...new Set(times)];
  if (set.every((t) => t === 0)) return 'No timers';
  if (set.length === 1) return `${set[0]}s per turn`;
  const known = set.filter((t) => t > 0);
  return `${Math.min(...known)}\u2013${Math.max(...known)}s per turn`;
}

const VERB: Record<Step['action'], string> = { ban: 'bans', pick: 'picks', choose: 'chooses' };

/** One readable line per step, in draft order. */
export function stepLines(preset: Preset): { team: Team; text: string }[] {
  return preset.steps.map((s) => {
    const parts = [`Team ${s.team} ${VERB[s.action]} ${s.count > 1 ? `${s.count} ` : ''}${s.action === 'choose' ? s.tag : s.pool}`];
    if (s.blind) parts.push('blind');
    if (s.random) parts.push('random allowed');
    if (s.timer) parts.push(`${s.timer}s`);
    if (s.pause === 'ready') parts.push('ready check first');
    else if (s.pause) parts.push(`${s.pause}s pause first`);
    return { team: s.team, text: parts.join(' \u00b7 ') };
  });
}
/** Room title line: turns, bans, picks, the pools drafted from and the longest the timers can take. */
export function lobbySummary(preset: Preset): string {
  const turns = turnsOf(preset);
  const pools = [...new Set(preset.steps.filter((s) => s.action !== 'choose' && s.pool).map((s) => s.pool as string))];
  const seconds = turns.reduce((sum, t) => sum + t.timer, 0);
  const parts = [plural(turns.length, 'step'), summary(preset), pools.join(' + '), seconds > 0 ? '~' + Math.ceil(seconds / 60) + ' min' : ''];
  return parts.filter(Boolean).join(' \u00b7 ');
}
