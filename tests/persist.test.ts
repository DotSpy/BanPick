import { describe, expect, it } from 'vitest';
import { newPreset } from '../src/builder/edit';
import { applyPick, createState } from '../src/draft';
import { canEditPreset, draftFromDoc, draftToDoc, presetFromDoc, presetToDoc, type PresetDoc } from '../src/persist/docs';
import { loadPreset, savePreset, type PresetStore, type Session } from '../src/persist/presets';
import { makePreset, started, step } from './fixtures';

const memoryStore = (): PresetStore & { docs: Map<string, PresetDoc> } => {
  const docs = new Map<string, PresetDoc>();
  return { docs, get: async (id) => docs.get(id) ?? null, set: async (id, d) => void docs.set(id, d) };
};

const session = (uid: string | null, now = 1000): Session => ({ uid, now: () => now, newId: () => 'new-id' });

describe('preset documents', () => {
  it('round-trips a preset', () => {
    const p = newPreset();

    expect(presetFromDoc(presetToDoc(p, 'u1', 1))).toEqual({ ok: true, value: p });
  });

  it('records the owner and timestamps', () => {
    const doc = presetToDoc(newPreset(), 'u1', 50);

    expect(doc).toMatchObject({ ownerUid: 'u1', createdAt: 50, updatedAt: 50 });
  });

  it('rejects stored text that is not JSON', () => {
    const doc = { ...presetToDoc(newPreset(), 'u1', 1), preset: '{oops' };

    expect(presetFromDoc(doc).ok).toBe(false);
  });

  it('rejects a stored preset that fails validation', () => {
    const doc = { ...presetToDoc(newPreset(), 'u1', 1), preset: JSON.stringify({ ...newPreset(), steps: [] }) };

    expect(presetFromDoc(doc).ok).toBe(false);
  });

  it('allows only the owner to edit', () => {
    const doc = presetToDoc(newPreset(), 'owner', 1);

    expect([canEditPreset(doc, 'owner'), canEditPreset(doc, 'other'), canEditPreset(doc, null)]).toEqual([true, false, false]);
  });
});

describe('preset store use cases', () => {
  it('creates a preset under a new id', async () => {
    const store = memoryStore();

    const r = await savePreset(store, session('u1'), newPreset());

    expect(r).toEqual({ ok: true, value: 'new-id' });
    expect(store.docs.get('new-id')?.ownerUid).toBe('u1');
  });

  it('refuses to save when signed out', async () => {
    const store = memoryStore();

    const r = await savePreset(store, session(null), newPreset());

    expect(r.ok).toBe(false);
    expect(store.docs.size).toBe(0);
  });

  it('never writes an invalid preset', async () => {
    const store = memoryStore();

    const r = await savePreset(store, session('u1'), { ...newPreset(), steps: [] });

    expect(r.ok).toBe(false);
    expect(store.docs.size).toBe(0);
  });

  it('lets the owner update and keeps createdAt', async () => {
    const store = memoryStore();
    await savePreset(store, session('u1', 100), newPreset());

    await savePreset(store, session('u1', 200), { ...newPreset(), name: 'Renamed' }, 'new-id');

    expect(store.docs.get('new-id')).toMatchObject({ createdAt: 100, updatedAt: 200 });
  });

  it('refuses an update from another user and leaves the stored preset unchanged', async () => {
    const store = memoryStore();
    await savePreset(store, session('u1'), newPreset());
    const before = store.docs.get('new-id');

    const r = await savePreset(store, session('u2'), { ...newPreset(), name: 'Hijack' }, 'new-id');

    expect(r.ok).toBe(false);
    expect(store.docs.get('new-id')).toBe(before);
  });

  it('loads a saved preset by id', async () => {
    const store = memoryStore();
    const p = newPreset();
    await savePreset(store, session('u1'), p);

    expect(await loadPreset(store, 'new-id')).toEqual({ ok: true, value: p });
  });

  it('reports a missing preset', async () => {
    expect((await loadPreset(memoryStore(), 'nope')).ok).toBe(false);
  });
});

describe('draft documents', () => {
  const draft = () => started(makePreset([step('A', 'ban', 'maps')]));

  it('exposes the fields the security rules inspect', () => {
    const s = draft();
    s.teams.A.owner = 'uA';

    expect(draftToDoc(s, 5)).toMatchObject({ ownerA: 'uA', ownerB: null, phase: 'drafting', turnIndex: 0 });
  });

  it('round-trips a legal draft', () => {
    const s = draft();

    const r = draftFromDoc(draftToDoc(s, 1));

    expect(r.ok && r.value.history).toEqual(s.history);
  });

  it('rejects a draft whose history is not a legal outcome', () => {
    const s = draft();
    s.history.push({ index: 0, team: 'B', action: 'ban', target: 'maps', itemId: 'm1', at: 0 } as never);
    s.turnIndex = 1;

    expect(draftFromDoc(draftToDoc(s, 1)).ok).toBe(false);
  });

  it('accepts a draft after a real pick', () => {
    const s = draft();
    applyPick(s, 'A', 'm1', 0, false);

    expect(draftFromDoc(draftToDoc(s, 1)).ok).toBe(true);
  });

  it('rejects a draft that embeds an invalid preset', () => {
    const s = draft();
    s.preset = { ...s.preset, steps: [] };

    expect(draftFromDoc(draftToDoc(s, 1)).ok).toBe(false);
  });

  it('rejects a document whose seat fields disagree with the state', () => {
    const s = draft();
    s.teams.A.owner = 'uA';

    const r = draftFromDoc({ ...draftToDoc(s, 1), ownerA: 'mallory' });

    expect(r.ok).toBe(false);
  });

  it('rejects a lobby draft that already has history', () => {
    const s = createState('t', makePreset([step('A', 'ban', 'maps')]), { A: 'A', B: 'B' }, 0);
    s.history.push({ index: 0, team: 'A', action: 'ban', target: 'maps', itemId: 'm1', auto: false });

    expect(draftFromDoc(draftToDoc(s, 1)).ok).toBe(false);
  });
});
