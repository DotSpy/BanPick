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
  const now = Date.now();
  const sixMonths = 183 * 24 * 60 * 60 * 1000;
  const presetDoc = (over: object = {}) => ({ preset: '{}', ownerUid: 'owner', createdAt: now, updatedAt: now, ...over });
  const ref = (db: Db) => doc(db, 'presets/p1');

  it('lets a signed-in user read a preset by id', async () => {
    await seed('presets/p1', presetDoc());

    await assertSucceeds(getDoc(ref(as('anyone'))));
  });

  it('still serves a preset saved just under 6 months ago', async () => {
    await seed('presets/p1', presetDoc({ updatedAt: now - sixMonths + 60_000 }));

    await assertSucceeds(getDoc(ref(as('anyone'))));
  });

  it('refuses reading a preset not saved for 6 months, even for the owner', async () => {
    await seed('presets/p1', presetDoc({ updatedAt: now - sixMonths }));

    await assertFails(getDoc(ref(as('owner'))));
  });

  it('refuses a preset whose updatedAt is missing or not a number', async () => {
    await seed('presets/p1', { preset: '{}', ownerUid: 'owner', createdAt: now, updatedAt: 'later' });

    await assertFails(getDoc(ref(as('owner'))));
  });

  it('refuses creating a preset with updatedAt in the future', async () => {
    await assertFails(setDoc(ref(as('owner')), presetDoc({ updatedAt: now + 60 * 60 * 1000 })));
  });

  it('refuses an update that moves updatedAt into the future', async () => {
    await seed('presets/p1', presetDoc());

    await assertFails(updateDoc(ref(as('owner')), { preset: '{"v":2}', updatedAt: now + 60 * 60 * 1000 }));
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

const fourTurns = makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps'), step('A', 'ban', 'maps'), step('B', 'ban', 'maps')]);
const turnDraft = (over: object = {}) => ({ ...draftToDoc(createState('r', fourTurns, { A: 'A', B: 'B' }, 0), 0), ownerA: 'ua', ownerB: 'ub', phase: 'drafting', deadline: null, ...over });
const entry = (over: object = {}) => ({ index: 0, team: 'A', action: 'ban', target: 'maps', itemId: 'map-1', auto: false, ...over });
const overdue = { deadline: 1 };
const live = { deadline: Date.now() + 3_600_000 };
const later = { deadline: Date.now() + 60_000 };
const record = (e: object, over: object = {}) => ({ history: [e], turnIndex: 1, state: 's2', updatedAt: 2, ...over });
const afterFirst = (over: object = {}) => turnDraft({ history: [entry()], turnIndex: 1, ...over });

describe('rules: drafts, recording a turn', () => {
  it('lets the acting seat record its own entry and advance one turn', async () => {
    await seed('drafts/r', turnDraft());

    await assertSucceeds(updateDoc(draftRef(as('ua')), record(entry())));
  });

  it("refuses the other seat recording the acting team's entry", async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ub')), record(entry())));
  });

  it('refuses an entry for a team that is not acting', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), record(entry({ team: 'B' }))));
  });

  it('refuses an entry for a different turn index', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), record(entry({ index: 1 }))));
  });

  it('refuses an entry with extra fields', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), record({ ...entry(), admin: true })));
  });

  it('refuses a write from someone without a seat', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('spectator')), record(entry())));
  });

  it('refuses recording two entries in one write', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), { history: [entry(), entry({ index: 1, team: 'B' })], turnIndex: 2, state: 's2', updatedAt: 2 }));
  });

  it('refuses moving the turn without recording an entry', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), { turnIndex: 1, state: 's2', updatedAt: 2 }));
  });

  it('refuses recording an entry without moving the turn', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), record(entry(), { turnIndex: 0 })));
  });

  it('refuses moving the turn backwards', async () => {
    await seed('drafts/r', afterFirst());

    await assertFails(updateDoc(draftRef(as('ua')), { turnIndex: 0, state: 's2', updatedAt: 2 }));
  });

  it('refuses moving the turn past the end of the draft', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), record(entry(), { turnIndex: 5 })));
  });

  it('refuses a seat rewriting an entry already recorded', async () => {
    await seed('drafts/r', afterFirst());

    await assertFails(updateDoc(draftRef(as('ub')), { history: [entry({ itemId: 'other' }), entry({ index: 1, team: 'B' })], turnIndex: 2, state: 's2', updatedAt: 2 }));
  });

  it('refuses a seat deleting a recorded entry', async () => {
    await seed('drafts/r', afterFirst());

    await assertFails(updateDoc(draftRef(as('ub')), { history: [], state: 's2', updatedAt: 2 }));
  });

  it('refuses a seat changing the preset', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), { preset: '{}', state: 's2', updatedAt: 2 }));
  });

  it('refuses a seat changing the turn order', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), { turnTeams: ['A', 'A', 'A', 'A'], state: 's2', updatedAt: 2 }));
  });

  it('refuses a seat changing seats while writing', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), { ...record(entry()), ownerB: 'ua' }));
  });

  it('refuses a write with fields outside the allowed set', async () => {
    await seed('drafts/r', turnDraft());

    await assertFails(updateDoc(draftRef(as('ua')), { ...record(entry()), extra: 1 }));
  });

  it('lets either seat write state that changes nothing else', async () => {
    await seed('drafts/r', turnDraft());

    await assertSucceeds(updateDoc(draftRef(as('ub')), { state: 's2', updatedAt: 2 }));
  });
});

describe('rules: drafts, phase', () => {
  it('lets the draft start from the lobby', async () => {
    await seed('drafts/r', turnDraft({ phase: 'lobby' }));

    await assertSucceeds(updateDoc(draftRef(as('ua')), { phase: 'drafting', state: 's2', updatedAt: 2 }));
  });

  it('refuses skipping from the lobby to done', async () => {
    await seed('drafts/r', turnDraft({ phase: 'lobby' }));

    await assertFails(updateDoc(draftRef(as('ua')), { phase: 'done', state: 's2', updatedAt: 2 }));
  });

  it('refuses reopening a finished draft', async () => {
    await seed('drafts/r', turnDraft({ phase: 'done', turnIndex: 4 }));

    await assertFails(updateDoc(draftRef(as('ua')), { phase: 'drafting', state: 's2', updatedAt: 2 }));
  });
});

describe('rules: drafts, overdue timers', () => {
  const auto = (over: object = {}) => entry({ auto: true, ...over });

  it('lets the waiting seat commit an auto entry once the deadline has passed', async () => {
    await seed('drafts/r', turnDraft(overdue));

    await assertSucceeds(updateDoc(draftRef(as('ub')), record(auto())));
  });

  it('lets the acting seat commit its own auto entry once the deadline has passed', async () => {
    await seed('drafts/r', turnDraft(overdue));

    await assertSucceeds(updateDoc(draftRef(as('ua')), record(auto())));
  });

  it('refuses an auto entry before the deadline', async () => {
    await seed('drafts/r', turnDraft(live));

    await assertFails(updateDoc(draftRef(as('ub')), record(auto())));
  });

  it('refuses an auto entry when there is no deadline', async () => {
    await seed('drafts/r', turnDraft({ deadline: null }));

    await assertFails(updateDoc(draftRef(as('ub')), record(auto())));
  });

  it('refuses a manual entry from the waiting seat even when overdue', async () => {
    await seed('drafts/r', turnDraft(overdue));

    await assertFails(updateDoc(draftRef(as('ub')), record(entry())));
  });

  it('refuses a spectator advancing an overdue turn', async () => {
    await seed('drafts/r', turnDraft(overdue));

    await assertFails(updateDoc(draftRef(as('spectator')), record(auto())));
  });

  it('lets a seat end an overdue pause, which moves the deadline but not the turn', async () => {
    await seed('drafts/r', turnDraft(overdue));

    await assertSucceeds(updateDoc(draftRef(as('ub')), { ...later, state: 's2', updatedAt: 2 }));
  });

  it('refuses an overdue advance of more than one entry', async () => {
    await seed('drafts/r', turnDraft(overdue));

    await assertFails(updateDoc(draftRef(as('ub')), { history: [auto(), auto({ index: 1, team: 'B' })], turnIndex: 2, state: 's2', updatedAt: 2 }));
  });
});

describe('rules: drafts, confirmations', () => {
  const waiting = (over: object = {}) => turnDraft({ confirm: { A: false, B: false }, ...over });

  it('lets a seat set its own flag', async () => {
    await seed('drafts/r', waiting());

    await assertSucceeds(updateDoc(draftRef(as('ua')), { confirm: { A: true, B: false }, state: 's2', updatedAt: 2 }));
  });

  it("refuses a seat setting the other team's flag", async () => {
    await seed('drafts/r', waiting());

    await assertFails(updateDoc(draftRef(as('ua')), { confirm: { A: false, B: true }, state: 's2', updatedAt: 2 }));
  });

  it('lets the last confirmation clear the flags and start the timer', async () => {
    await seed('drafts/r', waiting({ confirm: { A: true, B: false } }));

    await assertSucceeds(updateDoc(draftRef(as('ub')), { confirm: null, ...later, state: 's2', updatedAt: 2 }));
  });

  it('refuses clearing the flags before the other team confirmed', async () => {
    await seed('drafts/r', waiting());

    await assertFails(updateDoc(draftRef(as('ua')), { confirm: null, state: 's2', updatedAt: 2 }));
  });

  it("refuses resetting the other team's flag without a new entry", async () => {
    await seed('drafts/r', waiting({ confirm: { A: true, B: false } }));

    await assertFails(updateDoc(draftRef(as('ub')), { confirm: { A: false, B: false }, state: 's2', updatedAt: 2 }));
  });

  it('lets the flags start unset when a new entry opens a confirmation', async () => {
    await seed('drafts/r', turnDraft());

    await assertSucceeds(updateDoc(draftRef(as('ua')), record(entry(), { confirm: { A: false, B: false } })));
  });
});

describe('rules: drafts, creation', () => {
  it('refuses creating a draft that already has history', async () => {
    await assertFails(setDoc(draftRef(as('u1')), { ...turnDraft(), phase: 'lobby', history: [entry()] }));
  });

  it('refuses creating a draft that is already drafting', async () => {
    await assertFails(setDoc(draftRef(as('u1')), turnDraft()));
  });

  it('refuses creating a draft with an oversized preset', async () => {
    await assertFails(setDoc(draftRef(as('u1')), { ...turnDraft(), phase: 'lobby', preset: 'x'.repeat(100_000) }));
  });
});

describe('rules: presets, image links', () => {
  const stored = (image: string) => ({ preset: JSON.stringify({ pools: { a: { items: [{ id: 'x', name: 'X', image }] } } }), ownerUid: 'owner', createdAt: 1, updatedAt: 1 });
  const ref = (db: Db) => doc(db, 'presets/p2');

  it('accepts an https image link', async () => {
    await assertSucceeds(setDoc(ref(as('owner')), stored('https://example.com/a.png')));
  });

  it.each(['http://example.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AA', '', '//example.com/a.png'])('refuses the image link %j', async (image) => {
    await assertFails(setDoc(ref(as('owner')), stored(image)));
  });

  it('refuses an update that introduces a non-https image link', async () => {
    await seed('presets/p2', stored('https://example.com/a.png'));

    await assertFails(updateDoc(ref(as('owner')), { preset: stored('http://example.com/a.png').preset, updatedAt: 2 }));
  });
});
