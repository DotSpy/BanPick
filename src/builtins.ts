import { examplePresets } from './examples';
import { builtinPresets as warnoPresets } from './warno/preset';

/** Every preset shipped with the app, addressed in room links as `builtin-<id>`. */
export const builtinPresets = [...warnoPresets, ...examplePresets];
