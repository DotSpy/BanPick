import type { Preset, Step } from '../model';
import divisionsJson from './data/divisions.json';
import mapsJson from './data/maps.json';
import presetsJson from './data/presets.json';

/** Icons live in the public warno-icons repo; hotlinked, nothing is stored here. */
export const ICONS_BASE = 'https://raw.githubusercontent.com/DotSpy/warno-icons/master/';
const iconUrl = (path: string) => ICONS_BASE + encodeURI(path);

interface MapDef {
  id: string;
  name: string;
  icon?: string;
}

/** Source format of the built-in WARNO presets: steps as "TEAM ACTION TARGET TIMER [PAUSE|ready]". */
interface WarnoPresetDef {
  id: string;
  name: string;
  pool?: string;
  divisionPick?: 'shared' | 'exclusive';
  pauseBetweenSteps?: boolean;
  steps: string[];
}

const maps = mapsJson.maps as MapDef[];

// A map's game mode is the first folder of its icon path (1v1, 2v2, ...); a pool name is a mode.
const mapMode = (m: MapDef) => m.icon?.split('/')[0] ?? '';
const mapIdsOfPool = (pool: string): string[] => {
  const named = (mapsJson.pools as Record<string, string[]>)[pool];
  return named ?? maps.filter((m) => mapMode(m) === pool).map((m) => m.id);
};

const SIDES = ['nato', 'pact'];

function parseStep(text: string): Step {
  const [team, action, target, timer = '0', pause] = text.trim().split(/\s+/);
  const step: Step = { team: team as Step['team'], action: action as Step['action'], count: 1 };
  if (target === 'side') {
    step.action = 'choose';
    step.tag = 'side';
  } else {
    step.pool = target === 'map' ? 'maps' : 'divisions';
    if (target === 'division') step.restrict = 'tag';
  }
  if (Number(timer) > 0) step.timer = Number(timer);
  if (pause === 'ready') step.pause = 'ready';
  else if (pause !== undefined && Number(pause) > 0) step.pause = Number(pause);
  return step;
}

/** Merges neighbouring identical steps into one step with a count. */
function mergeRepeats(steps: Step[]): Step[] {
  return steps.reduce<Step[]>((out, s) => {
    const last = out[out.length - 1];
    if (last && JSON.stringify({ ...last, count: 0 }) === JSON.stringify({ ...s, count: 0 })) last.count += s.count;
    else out.push({ ...s });
    return out;
  }, []);
}

export function warnoPreset(def: WarnoPresetDef): Preset {
  const steps = mergeRepeats(def.steps.map(parseStep));
  const usesSides = steps.some((s) => s.action === 'choose');
  const mapIds = new Set((def.pool ?? '').split(',').flatMap((p) => mapIdsOfPool(p.trim())));
  // Without a side step there is nothing to restrict by.
  const finalSteps = usesSides ? steps : steps.map(({ restrict, ...s }) => s);
  return {
    version: 1,
    name: def.name,
    tagging: usesSides ? { assignment: 'chosen', tag: 'side', values: SIDES, sameTag: 'forbid' } : { assignment: 'none' },
    pools: {
      maps: {
        iconSize: 'large',
        items: maps
          .filter((m) => mapIds.has(m.id))
          .map((m) => ({ id: m.id, name: m.name, ...(m.icon ? { image: iconUrl(m.icon) } : {}) })),
      },
      divisions: {
        scope: def.divisionPick === 'exclusive' ? 'exclusive' : 'shared',
        items: divisionsJson.divisions.map((d) => ({ id: d.id, name: d.name, image: iconUrl(d.icon), tags: { side: d.side, nation: d.nation } })),
      },
    },
    steps: finalSteps,
    pauses: { between: def.pauseBetweenSteps === true },
  };
}

export const builtinPresets: { id: string; preset: Preset }[] = (presetsJson.presets as WarnoPresetDef[]).map((def) => ({ id: def.id, preset: warnoPreset(def) }));
