import { doc, onSnapshot, runTransaction, type Firestore } from 'firebase/firestore';
import type { DraftDoc } from '../persist/docs';
import type { DraftStore } from './room';

/** Firestore adapter for DraftStore: one document per draft at drafts/{id}. */
export function firestoreDraftStore(db: Firestore): DraftStore {
  const ref = (id: string) => doc(db, 'drafts', id);
  return {
    create: (id, data) =>
      runTransaction(db, async (tx) => {
        if (!(await tx.get(ref(id))).exists()) tx.set(ref(id), data);
      }),
    subscribe: (id, onDoc, onError) =>
      onSnapshot(ref(id), (snap) => onDoc(snap.exists() ? (snap.data() as DraftDoc) : null), onError),
    transact: (id, change) =>
      runTransaction(db, async (tx) => {
        const snap = await tx.get(ref(id));
        const next = change(snap.exists() ? (snap.data() as DraftDoc) : null);
        if (next) tx.update(ref(id), { ...next });
      }),
  };
}
