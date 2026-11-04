import { createState, setReady, type DraftState } from '../src/draft';
import type { Preset, Step } from '../src/model';

export const items = (...ids: string[]) => ids.map((id) => ({ id, name: id }));

/** A fresh preset on every call (tests never share mutable data). Divisions carry a `side` tag and are perTeam. */
export function makePreset(steps: Step[], over: Partial<Preset> = {}): Preset {
  return {
    version: 1,
    name: 'Test',
    tagging: { assignment: 'none' },
    pools: {
      maps: { items: items('map-1', 'map-2', 'map-3') },
      divisions: {
        scope: 'perTeam',
        items: [
          { id: 'cav', name: 'cav', tags: { side: 'nato' } },
          { id: 'ranger', name: 'ranger', tags: { side: 'nato' } },
          { id: 'gd', name: 'gd', tags: { side: 'pact' } },
          { id: 'tank', name: 'tank', tags: { side: 'pact' } },
        ],
      },
    },
    steps,
    pauses: { between: false },
    ...over,
  };
}

export const sideTagging = (sameTag: 'allow' | 'forbid' = 'forbid'): Preset['tagging'] => ({
  assignment: 'chosen',
  tag: 'side',
  values: ['nato', 'pact'],
  sameTag,
});

export const step = (team: 'A' | 'B', action: Step['action'], target: string, extra: Partial<Step> = {}): Step =>
  action === 'choose' ? { team, action, tag: target, count: 1, ...extra } : { team, action, pool: target, count: 1, ...extra };

/** Lobby state with both captains connected but not ready. */
export const lobby = (preset: Preset): DraftState => {
  const s = createState('t', preset, { A: 'Team A', B: 'Team B' }, 0);
  s.teams.A.connected = s.teams.B.connected = true;
  return s;
};

/** Draft started: both captains ready at t=0. */
export function started(preset: Preset): DraftState {
  const s = lobby(preset);
  setReady(s, 'A', true, 0);
  setReady(s, 'B', true, 0);
  return s;
}
