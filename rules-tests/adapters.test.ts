import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { setLogLevel } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createState } from '../src/draft';
import { draftToDoc, type DraftDoc, type PresetDoc } from '../src/persist/docs';
import { firestorePresetStore } from '../src/persist/firestore';
import { Room } from '../src/room/room';
import { firestoreDraftStore } from '../src/room/firestore';
import { makePreset, step } from '../tests/fixtures';

let env: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel('silent');
  env = await initializeTestEnvironment({
    projectId: 'demo-banpick-drafts',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const dbFor = (uid: string) => env.authenticatedContext(uid).firestore();
const preset = makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps')]);
const newDraft = (): DraftDoc => draftToDoc(createState('r', preset, { A: 'A', B: 'B' }, 0), 0);
const waitFor = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 50));
  expect(cond()).toBe(true);
};

describe('firestorePresetStore against the emulator', () => {
  const doc: PresetDoc = { preset: '{"x":1}', ownerUid: 'owner', createdAt: 1, updatedAt: 1 };

  it('returns null for a missing preset', async () => {
    const store = firestorePresetStore(dbFor('owner'));

    expect(await store.get('none')).toBeNull();
  });

  it('round-trips a preset document', async () => {
    const store = firestorePresetStore(dbFor('owner'));

    await store.set('p1', doc);

    expect(await store.get('p1')).toEqual(doc);
  });

  it('rejects an update by a non-owner', async () => {
    await firestorePresetStore(dbFor('owner')).set('p1', doc);

    const attempt = firestorePresetStore(dbFor('intruder')).set('p1', { ...doc, preset: '{}' });

    await expect(attempt).rejects.toThrow();
  });
});

describe('firestoreDraftStore against the emulator', () => {
  it('create does not overwrite an existing draft', async () => {
    const store = firestoreDraftStore(dbFor('u1'));
    await store.create('r', { ...newDraft(), ownerA: 'u1' });

    await store.create('r', newDraft());

    let seen: DraftDoc | null = null;
    store.subscribe('r', (d) => (seen = d), () => {});
    await waitFor(() => seen !== null);
    expect(seen!.ownerA).toBe('u1');
  });

  it('subscribe reports null for a missing draft', async () => {
    const store = firestoreDraftStore(dbFor('u1'));
    let called = false;
    let seen: DraftDoc | null = newDraft();

    store.subscribe('missing', (d) => { seen = d; called = true; }, () => {});

    await waitFor(() => called);
    expect(seen).toBeNull();
  });

  it('transact applies the change atomically and notifies subscribers', async () => {
    const store = firestoreDraftStore(dbFor('u1'));
    await store.create('r', newDraft());
    let seen: DraftDoc | null = null;
    store.subscribe('r', (d) => (seen = d), () => {});

    await store.transact('r', (cur) => ({ ...cur!, ownerA: 'u1' }));

    await waitFor(() => (seen as DraftDoc | null)?.ownerA === 'u1');
  });
});

describe('Room over Firestore', () => {
  it('lets two captains claim seats and rejects a third claimant', async () => {
    const open = async (uid: string, seat: 'A' | 'B') => {
      const room = new Room({ store: firestoreDraftStore(dbFor(uid)), roomId: 'r', preset, uid, now: () => 1 });
      await room.open(seat);
      return room;
    };

    const a = await open('ua', 'A');
    const b = await open('ub', 'B');
    const c = await open('uc', 'A');

    expect(a.role).toBe('A');
    expect(b.role).toBe('B');
    expect(c.role).toBe('spec');
    expect(c.notice).not.toBeNull();
    [a, b, c].forEach((r) => r.dispose());
  });
});
