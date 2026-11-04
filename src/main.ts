import { newPreset } from './builder/edit';
import { mountBuilder, presetFromHash } from './builder/view';
import { h } from './dom';
import { currentUid, db } from './firebase';
import { firestorePresetStore } from './persist/firestore';
import { loadPreset, savePreset } from './persist/presets';
import { Room } from './room/room';
import { firestoreDraftStore } from './room/firestore';
import { mountRoom } from './room/view';
import { parseRoute, roomHash } from './route';
import { builtinPresets } from './builtins';
import type { Preset } from './model';

const root = document.getElementById('app')!;
const show = (text: string) => root.replaceChildren(h('p', { textContent: text }));
const shortId = () => crypto.randomUUID().slice(0, 8);

async function resolvePreset(ref: string): Promise<Preset | string> {
  const builtin = builtinPresets.find((b) => `builtin-${b.id}` === ref);
  if (builtin) return builtin.preset;
  if (!db) return 'Firebase is not configured';
  const r = await loadPreset(firestorePresetStore(db), ref);
  return r.ok ? r.value : r.error;
}

async function openRoom(roomId: string, presetRef: string, seat: 'A' | 'B' | null) {
  if (!db) return show('Firebase is not configured (see README).');
  const preset = await resolvePreset(presetRef);
  if (typeof preset === 'string') return show(preset);
  const room = new Room({ store: firestoreDraftStore(db), roomId, preset, uid: await currentUid(), now: Date.now });
  await room.open(seat);
  mountRoom(root, room);
}

async function openBuilder(code: string) {
  const initial = (await presetFromHash(code)) ?? newPreset();
  const firestore = db;
  const onSave = firestore
    ? async (p: Preset) => {
        const session = { uid: await currentUid(), now: Date.now, newId: shortId };
        const r = await savePreset(firestorePresetStore(firestore), session, p);
        alert(r.ok ? `Saved. Captain A link: ${location.origin}${location.pathname}${roomHash(shortId(), r.value, 'A')}` : r.error);
      }
    : undefined;
  mountBuilder(root, initial, onSave && ((p) => void onSave(p)));
}

const route = parseRoute(location.hash);
const start = route.kind === 'room' ? openRoom(route.roomId, route.presetRef, route.seat) : openBuilder(route.code);
start.catch((e) => show(String(e)));

