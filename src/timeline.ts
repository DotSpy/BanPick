import { h } from './dom';
import { itemIcon } from './icon';
import type { Entry, Preset, Team } from './model';
import { findItem, visibleHistory } from './rules';
import { turnsOf } from './turns';

/** What the timeline needs to know about a running draft. */
export interface TimelineState {
  phase: 'lobby' | 'drafting' | 'done';
  turnIndex: number;
  history: Entry[];
  teams: Record<Team, { name: string }>;
  pausing?: boolean;
  confirm?: Record<Team, boolean> | null;
}

const LABEL = { ban: 'BAN', pick: 'PICK', choose: 'CHOOSE' } as const;

/**
 * Every turn of the preset in order. With a state, turns are marked done, skipped, current or upcoming and show
 * who acted and what was chosen; hidden blind picks show as "hidden". Without a state it is a plain preview.
 */
export function timeline(preset: Preset, state?: TimelineState, viewer: Team | null = null): HTMLElement {
  const turns = turnsOf(preset);
  const current = !state ? -1 : state.phase === 'drafting' ? state.turnIndex : state.phase === 'done' ? turns.length : -1;
  const turn = state && state.phase === 'drafting' ? turns[state.turnIndex] ?? null : null;
  const entries = state ? visibleHistory({ preset, history: state.history }, turn, viewer) : [];
  const chips = turns.flatMap((t, i) => {
    const entry = entries.find((e) => e.index === i);
    const status = i === current ? 'current' : i < current ? (entry ? 'done' : 'skipped') : 'upcoming';
    const who = state ? state.teams[t.team].name : `Team ${t.team}`;
    const item = entry?.itemId ? findItem(preset, entry.itemId) : undefined;
    const result = !entry ? t.target : entry.itemId ? item?.name ?? entry.itemId : 'hidden';
    const label = `${i + 1}. ${who} ${t.action} ${t.target}${entry ? `: ${result}` : status === 'skipped' ? ' (skipped: nothing available)' : ''}${t.timer ? ` · ${t.timer}s` : ''}`;
    const meta = [t.timer ? `${t.timer}s` : '', t.blind ? 'blind' : '', t.restrict ? `restricted by ${preset.tagging.tag}` : ''].filter(Boolean).join(' \u00b7 ');
    const chip = h('li', { className: `tl team-${t.team} ${t.action} ${status}`, title: label, ...(status === 'current' ? { ariaCurrent: 'step' } : {}) },
      h('span', { className: 'tl-head' }, h('b', { textContent: t.team }), h('i', { textContent: LABEL[t.action] })),
      entry?.itemId ? itemIcon(item) : '',
      h('span', { className: 'tl-body', textContent: result }),
      meta ? h('span', { className: 'tl-meta', textContent: meta }) : '',
    );
    if (t.pause === undefined) return [chip];
    const ready = t.pause === 'ready';
    const active = !!state && status === 'current' && (ready ? !!state.confirm : !!state.pausing);
    const pauseStatus = active ? 'current' : i < current || (status === 'current' && !active) ? 'done' : 'upcoming';
    const text = ready ? 'Pause until ready' : `Pause ${t.pause}s`;
    const pause = h('li', { className: `tl pause ${pauseStatus}`, title: `${text} before turn ${i + 1}`, ...(active ? { ariaCurrent: 'step' } : {}) },
      h('span', { className: 'tl-head' }, h('i', { textContent: 'PAUSE' })),
      h('span', { className: 'tl-body', textContent: text }));
    return [pause, chip];
  });
  return h('ol', { className: 'timeline', ariaLabel: 'Pick and ban order' }, ...chips);
}
