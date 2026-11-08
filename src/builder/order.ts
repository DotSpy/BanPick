import { h } from '../dom';
import type { Preset, Team } from '../model';
import { turnsOf } from '../turns';

const TEAMS: Team[] = ['A', 'B'];

/**
 * The draft order as a horizontal timeline with one lane per team. Every turn is a chip in its team's lane;
 * the other lane gets a gap, so turns line up in time. Clicking a chip reports the step it came from.
 */
export function orderLane(preset: Preset, onSelect: (step: number) => void): HTMLElement {
  const turns = turnsOf(preset);
  if (!turns.length) return h('p', { className: 'hint', textContent: 'Add steps to see the order.' });
  const lane = (team: Team) =>
    h('div', { className: 'lane' },
      h('span', { className: 'lane-label', textContent: `Team ${team}` }),
      ...turns.map((t, i) =>
        t.team !== team
          ? h('span', { className: 'chip-gap' })
          : h('button', { type: 'button', className: `chip ${t.action}`, title: `${i + 1}. Team ${t.team} ${t.action} ${t.target}`, ariaLabel: `Turn ${i + 1}: Team ${t.team} ${t.action} ${t.target}, step ${t.step + 1}`, onclick: () => onSelect(t.step) },
              h('b', { textContent: String(i + 1) }),
              h('i', { textContent: t.action.toUpperCase() }))),
    );
  return h('div', { className: 'order', role: 'group', ariaLabel: 'Pick and ban order' }, ...TEAMS.map(lane));
}
