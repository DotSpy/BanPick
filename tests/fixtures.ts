import { createState, setReady, type DraftState } from '../src/draft';
import type { Preset } from '../src/model';

export const items = (...ids: string[]) => ids.map((id) => ({ id, name: id }));

/** Chosen-tag preset: A chooses a side, A bans a map, B picks a division restricted to its side. */
export function fixturePreset(): Preset {
  return {
    version: 1,
    name: 'Test',
    tagging: { assignment: 'chosen', tag: 'side', values: ['nato', 'pact'], sameTag: 'forbid' },
    pools: {
      maps: { items: items('map-1', 'map-2') },
      divisions: {
        scope: 'perTeam',
        items: [
          { id: 'cav', name: 'cav', tags: { side: 'nato' } },
          { id: 'gd', name: 'gd', tags: { side: 'pact' } },
        ],
      },
    },
    steps: [
      { team: 'A', action: 'choose', tag: 'side', count: 1, timer: 30 },
      { team: 'A', action: 'ban', pool: 'maps', count: 1, timer: 30 },
      { team: 'B', action: 'pick', pool: 'divisions', count: 1, timer: 30, restrict: 'tag' },
    ],
    pauses: { between: false },
  };
}

export const fixtureState = (preset: Preset = fixturePreset()): DraftState => createState('t', preset, { A: 'Team A', B: 'Team B' }, 0);

export function started(preset?: Preset): DraftState {
  const s = fixtureState(preset);
  s.teams.A.connected = s.teams.B.connected = true;
  setReady(s, 'A', true, 0);
  setReady(s, 'B', true, 0);
  return s;
}
