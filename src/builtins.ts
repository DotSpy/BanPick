import { examplePresets } from './examples';
import { builtinPresets as warnoPresets } from './warno/preset';

/** Every preset shipped with the app, addressed in room links as `builtin-<id>`. */
export const builtinPresets = [...warnoPresets, ...examplePresets];

/** The launcher lists generic presets first and the WARNO presets in their own labelled group. */
export const presetGroups = [
  { label: 'Built-in presets', presets: examplePresets },
  { label: 'WARNO presets', presets: warnoPresets },
];
