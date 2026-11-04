import { mountBuilder, presetFromHash } from './builder/view';
import { newPreset } from './builder/edit';

presetFromHash(location.hash).then((p) => mountBuilder(document.getElementById('app')!, p ?? newPreset()));
