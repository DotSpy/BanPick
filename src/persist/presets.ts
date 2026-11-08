import type { Preset } from '../model';
import { validatePreset } from '../schema';
import { canEditPreset, describeErrors, isPresetExpired, presetFromDoc, presetToDoc, type Loaded, type PresetDoc } from './docs';

/** Storage port. The Firestore adapter implements it; tests use an in-memory one. */
export interface PresetStore {
  get(id: string): Promise<PresetDoc | null>;
  set(id: string, doc: PresetDoc): Promise<void>;
}

export interface Session {
  uid: string | null;
  now(): number;
  newId(): string;
}

/** Loads a preset by id. A preset not saved for 6 months is treated as expired, as if it were gone. */
export async function loadPreset(store: PresetStore, id: string, now: () => number = Date.now): Promise<Loaded<Preset>> {
  const doc = await store.get(id);
  if (!doc) return { ok: false, error: 'Preset not found' };
  if (isPresetExpired(doc, now())) return { ok: false, error: 'Preset expired: presets are kept for 6 months after their last save' };
  return presetFromDoc(doc);
}

/** Creates a preset (no id) or updates one. Only the creator can update; invalid presets are never written. */
export async function savePreset(store: PresetStore, session: Session, preset: Preset, id?: string): Promise<Loaded<string>> {
  if (!session.uid) return { ok: false, error: 'Not signed in' };
  const checked = validatePreset(preset);
  if (!checked.ok) return { ok: false, error: describeErrors(checked.errors) };

  const existing = id ? await store.get(id) : null;
  if (existing && !canEditPreset(existing, session.uid)) return { ok: false, error: 'Only the creator can edit this preset' };

  const target = id ?? session.newId();
  await store.set(target, presetToDoc(checked.preset, session.uid, session.now(), existing?.createdAt));
  return { ok: true, value: target };
}
