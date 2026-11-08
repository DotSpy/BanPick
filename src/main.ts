import './styles.css';
import { newPreset } from './builder/edit';
import { mountBuilder, presetFromHash, type SaveResult } from './builder/view';
import { mountLauncher } from './launcher';
import { h } from './dom';
import { themeToggle } from './theme';
import { widthControl } from './width';
import { settingsMenu } from './settings';
import { installIconPreview } from './preview';
import { currentUid, db } from './firebase';
import { firestorePresetStore } from './persist/firestore';
import { loadPreset, savePreset } from './persist/presets';
import { Room } from './room/room';
import { firestoreDraftStore } from './room/firestore';
import { mountRoom } from './room/view';
import { parseRoute, roomLink } from './route';
import { builtinPresets, presetGroups } from './builtins';
import type { Preset } from './model';

document.querySelector('.app-header')?.append(settingsMenu(widthControl(), themeToggle()));
installIconPreview();
const root = document.getElementById('app')!;
const show = (text: string) => root.replaceChildren(h('div', { className: 'error-box' }, h('p', { role: 'alert', textContent: text }), h('a', { className: 'button', href: location.pathname, textContent: 'Back to the builder' })));
const shortId = () => crypto.randomUUID().slice(0, 8);

async function resolvePreset(ref: string): Promise<Preset | string> {
  const builtin = builtinPresets.find((b) => `builtin-${b.id}` === ref);
  if (builtin) return builtin.preset;
  if (!db) return 'Firebase is not configured';
  const r = await loadPreset(firestorePresetStore(db), ref);
  return r.ok ? r.value : `Could not load preset "${ref}". Check the link, or ask the host for a new one. (${r.error})`;
}

async function openRoom(roomId: string, presetRef: string) {
  if (!db) return show('Firebase is not configured (see README).');
  const preset = await resolvePreset(presetRef);
  if (typeof preset === 'string') return show(preset);
  const room = new Room({ store: firestoreDraftStore(db), roomId, preset, uid: await currentUid(), now: Date.now });
  await room.open(null);
  document.title = `${preset.name} \u00b7 BanPick`;
  mountRoom(root, room);
}

async function openBuilder(code: string) {
  const initial = (await presetFromHash(code)) ?? newPreset();
  const launcherEl = h('div');
  const builderEl = h('div');
  root.replaceChildren(launcherEl);
  const firestore = db;
  const onSave = firestore
    ? async (p: Preset): Promise<SaveResult> => {
        const session = { uid: await currentUid(), now: Date.now, newId: shortId };
        const r = await savePreset(firestorePresetStore(firestore), session, p);
        return r.ok ? { ok: true, links: [roomLink(base(), shortId(), r.value)] } : { ok: false, error: r.error };
      }
    : undefined;
  const builder = mountBuilder(builderEl, initial, onSave);
  mountLauncher(launcherEl, { groups: presetGroups, base: base(), newId: shortId, onEditCopy: builder.set, builder: builderEl });
}

const base = () => location.origin + location.pathname;

const route = parseRoute(location.hash);
window.addEventListener('hashchange', () => location.reload());
const start =
  route.kind === 'room' ? openRoom(route.roomId, route.presetRef) : route.kind === 'builder' ? openBuilder(route.code) : Promise.resolve(show(route.reason));
start.catch((e) => show(String(e)));
