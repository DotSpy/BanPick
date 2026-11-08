import { doc, getDoc, setDoc, type Firestore } from 'firebase/firestore';
import type { PresetDoc } from './docs';
import type { PresetStore } from './presets';

/** Firestore adapter for PresetStore. Reads and writes one document by id; there are no list queries. */
export function firestorePresetStore(db: Firestore): PresetStore {
  return {
    async get(id) {
      const snap = await getDoc(doc(db, 'presets', id));
      return snap.exists() ? (snap.data() as PresetDoc) : null;
    },
    async set(id, data) {
      await setDoc(doc(db, 'presets', id), data);
    },
  };
}
