import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc, setLogLevel, updateDoc } from 'firebase/firestore';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { createState } from '../src/draft';
import { draftToDoc } from '../src/persist/docs';
import { makePreset, step } from '../tests/fixtures';

let env: RulesTestEnvironment;

beforeAll(async () => {
  setLogLevel('silent'); // expected denials would otherwise flood the output
  env = await initializeTestEnvironment({
    projectId: 'demo-banpick-drafts',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

type Db = ReturnType<typeof as>;
const as = (uid: string) => env.authenticatedContext(uid).firestore();
const anon = () => env.unauthenticatedContext().firestore();
const seed = (path: string, data: object) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

const baseDraft = () => draftToDoc(createState('r', makePreset([step('A', 'ban', 'maps')]), { A: 'A', B: 'B' }, 0), 0);
const lobbyDraft = (seats: { ownerA?: string | null; ownerB?: string | null } = {}) => ({ ...baseDraft(), ...seats });
const draftingDraft = (over: object = {}) => ({
  ...baseDraft(),
  ownerA: 'ua',
  ownerB: 'ub',
  phase: 'drafting',
  turnIndex: 0,
  deadline: null,
  ...over,
});
const draftRef = (db: Db) => doc(db, 'drafts/r');

describe('rules: presets', () => {
  const presetDoc = (over: object = {}) => ({ preset: '{}', ownerUid: 'owner', createdAt: 1, updatedAt: 1, ...over });
  const ref = (db: Db) => doc(db, 'presets/p1');

  it('lets a signed-in user read a preset by id', async () => {
    await seed('presets/p1', presetDoc());

    await assertSucceeds(getDoc(ref(as('anyone'))));
  });

  it('refuses reads when signed out', async () => {
    await seed('presets/p1', presetDoc());

    await assertFails(getDoc(ref(anon())));
  });

  it('refuses listing presets', async () => {
    await seed('presets/p1', presetDoc());

    await assertFails(getDocs(collection(as('owner'), 'presets')));
  });

  it('lets a user create a preset owned by themselves', async () => {
    await assertSucceeds(setDoc(ref(as('owner')), presetDoc()));
  });

  it('refuses creating a preset on behalf of another uid', async () => {
    await assertFails(setDoc(ref(as('mallory')), presetDoc()));
  });

  it('refuses creating a preset with extra fields', async () => {
    await assertFails(setDoc(ref(as('owner')), presetDoc({ admin: true })));
  });

  it('refuses creating an oversized preset', async () => {
    await assertFails(setDoc(ref(as('owner')), presetDoc({ preset: 'x'.repeat(100_000) })));
  });

  it('refuses a preset that is not a string', async () => {
    await assertFails(setDoc(ref(as('owner')), presetDoc({ preset: { a: 1 } })));
  });

  it('lets the owner update the preset', async () => {
    await seed('presets/p1', presetDoc());

    await assertSucceeds(updateDoc(ref(as('owner')), { preset: '{"v":2}', updatedAt: 2 }));
  });

  it('refuses an update from another user', async () => {
    await seed('presets/p1', presetDoc());

    await assertFails(updateDoc(ref(as('mallory')), { preset: '{"v":2}', updatedAt: 2 }));
  });

  it('refuses the owner handing the preset to someone else', async () => {
    await seed('presets/p1', presetDoc());

    await assertFails(updateDoc(ref(as('owner')), { ownerUid: 'mallory' }));
  });

  it('refuses changing createdAt', async () => {
    await seed('presets/p1', presetDoc());

    await assertFails(updateDoc(ref(as('owner')), { createdAt: 99 }));
  });

  it('refuses deleting a preset, even for the owner', async () => {
    await seed('presets/p1', presetDoc());

    await assertFails(deleteDoc(ref(as('owner'))));
  });
});

describe('rules: drafts, access', () => {
  it('refuses reads when signed out', async () => {
    await seed('drafts/r', lobbyDraft());

    await assertFails(getDoc(draftRef(anon())));
  });

  it('lets a signed-in user create a draft and another read it', async () => {
    await assertSucceeds(setDoc(draftRef(as('u1')), lobbyDraft()));

    await assertSucceeds(getDoc(draftRef(as('u2'))));
  });

  it('refuses creating a draft when signed out', async () => {
    await assertFails(setDoc(draftRef(anon()), lobbyDraft()));
  });

  it('refuses deleting a draft, even for a seat owner', async () => {
    await seed('drafts/r', draftingDraft());

    await assertFails(deleteDoc(draftRef(as('ua'))));
  });
});

describe('rules: drafts, seats in the lobby', () => {
  it('lets a user claim an empty seat', async () => {
    await seed('drafts/r', lobbyDraft());

    await assertSucceeds(updateDoc(draftRef(as('u1')), { ownerA: 'u1', state: 's', updatedAt: 1 }));
  });

  it('refuses claiming a seat in the name of another uid', async () => {
    await seed('drafts/r', lobbyDraft());

    await assertFails(updateDoc(draftRef(as('u1')), { ownerA: 'u2', state: 's', updatedAt: 1 }));
  });

  it('refuses taking a seat that is already held', async () => {
    await seed('drafts/r', lobbyDraft({ ownerA: 'ua' }));

    await assertFails(updateDoc(draftRef(as('u2')), { ownerA: 'u2', state: 's', updatedAt: 1 }));
  });

  it('refuses a claim that also changes the phase', async () => {
    await seed('drafts/r', lobbyDraft());

    await assertFails(updateDoc(draftRef(as('u1')), { ownerA: 'u1', phase: 'drafting', state: 's', updatedAt: 1 }));
  });

  it('refuses claiming both seats in one write', async () => {
    await seed('drafts/r', lobbyDraft());

    await assertFails(updateDoc(draftRef(as('u1')), { ownerA: 'u1', ownerB: 'u1', state: 's', updatedAt: 1 }));
  });

  it('refuses claiming a seat once the draft has started', async () => {
    await seed('drafts/r', draftingDraft({ ownerB: null }));

    await assertFails(updateDoc(draftRef(as('u2')), { ownerB: 'u2', state: 's', updatedAt: 1 }));
  });

  it('lets a seat owner release their own seat in the lobby', async () => {
    await seed('drafts/r', lobbyDraft({ ownerA: 'ua' }));

    await assertSucceeds(updateDoc(draftRef(as('ua')), { ownerA: null, state: 's', updatedAt: 1 }));
  });

  it("refuses releasing someone else's seat", async () => {
    await seed('drafts/r', lobbyDraft({ ownerA: 'ua' }));

    await assertFails(updateDoc(draftRef(as('u2')), { ownerA: null, state: 's', updatedAt: 1 }));
  });
});

describe('rules: drafts, state writes', () => {
  const move = { state: 's2', turnIndex: 1, updatedAt: 2 };

  it('lets seat A write draft state', async () => {
    await seed('drafts/r', draftingDraft());

    await assertSucceeds(updateDoc(draftRef(as('ua')), move));
  });

  it('lets seat B write draft state', async () => {
    await seed('drafts/r', draftingDraft());

    await assertSucceeds(updateDoc(draftRef(as('ub')), move));
  });

  it('refuses a state write from someone without a seat', async () => {
    await seed('drafts/r', draftingDraft());

    await assertFails(updateDoc(draftRef(as('spectator')), move));
  });

  it('refuses a seat owner changing seats while writing state', async () => {
    await seed('drafts/r', draftingDraft());

    await assertFails(updateDoc(draftRef(as('ua')), { ...move, ownerB: 'ua' }));
  });

  it('refuses a seat owner writing fields outside the state set', async () => {
    await seed('drafts/r', draftingDraft());

    await assertFails(updateDoc(draftRef(as('ua')), { ...move, extra: 1 }));
  });
});

describe('rules: drafts, overdue timers', () => {
  const advance = { state: 's2', turnIndex: 1, deadline: null, updatedAt: 2 };

  it('lets anyone advance a turn whose deadline has passed', async () => {
    await seed('drafts/r', draftingDraft({ deadline: 1 }));

    await assertSucceeds(updateDoc(draftRef(as('spectator')), advance));
  });

  it('refuses advancing before the deadline', async () => {
    await seed('drafts/r', draftingDraft({ deadline: Date.now() + 3_600_000 }));

    await assertFails(updateDoc(draftRef(as('spectator')), advance));
  });

  it('refuses an overdue write that does not move the turn forward', async () => {
    await seed('drafts/r', draftingDraft({ deadline: 1, turnIndex: 3 }));

    await assertFails(updateDoc(draftRef(as('spectator')), { ...advance, turnIndex: 3 }));
  });

  it('refuses an overdue write that changes seats', async () => {
    await seed('drafts/r', draftingDraft({ deadline: 1 }));

    await assertFails(updateDoc(draftRef(as('spectator')), { ...advance, ownerA: 'spectator' }));
  });

  it('refuses advancing when there is no deadline', async () => {
    await seed('drafts/r', draftingDraft({ deadline: null }));

    await assertFails(updateDoc(draftRef(as('spectator')), advance));
  });
});
