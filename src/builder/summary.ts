import type { Pool, Step } from '../model';

/** One line describing a step, e.g. "#4 · Team B · ban 1 from maps · 30s · blind". */
export function stepSummary(s: Step, index: number): string {
  const what = s.action === 'choose' ? `choose ${s.tag ?? 'tag'}` : `${s.action} ${s.count ?? 1} from ${s.pool}`;
  return [`#${index + 1}`, `Team ${s.team}`, what, s.timer ? `${s.timer}s` : '', s.blind ? 'blind' : '', s.random ? 'random' : ''].filter(Boolean).join(' · ');
}

/** The pool header text, e.g. "maps · 42 items". */
export function poolSummary(name: string, pool: Pool): string {
  const n = pool.items.length;
  return `${name} · ${n} item${n === 1 ? '' : 's'}`;
}
