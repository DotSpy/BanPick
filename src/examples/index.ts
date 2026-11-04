import type { Preset } from '../model';
import { validatePreset } from '../schema';
import data from './presets.json';

/** Generic example presets stored in the engine's own preset format (no game-specific code). */
export const examplePresets: { id: string; preset: Preset }[] = (data.presets as { id: string; preset: unknown }[]).map(({ id, preset }) => {
  const r = validatePreset(preset);
  if (!r.ok) throw new Error(`example preset "${id}" is invalid: ${r.errors.map((e) => `${e.path} ${e.message}`).join('; ')}`);
  return { id, preset: r.preset };
});
