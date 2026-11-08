import { examplePresets } from './examples';
import { builtinPresets as warnoPresets } from './warno/preset';

/** Every preset shipped with the app, addressed in room links as `builtin-<id>`. */
export const builtinPresets = [...warnoPresets, ...examplePresets];

/** The launcher lists generic presets first and the WARNO presets in their own labelled group; each card carries a short tag. */
export const presetGroups = [
  { label: 'Built-in presets', presets: examplePresets.map((p) => ({ ...p, tag: p.id === 'moba-draft' ? 'MOBA' : 'Generic' })) },
  { label: 'WARNO presets', presets: warnoPresets.map((p) => ({ ...p, tag: 'WARNO' })) },
];