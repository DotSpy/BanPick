import type { DraftDoc } from '../src/persist/docs';
import type { DraftStore } from '../src/room/room';

/** In-memory DraftStore: transactions are serial, and every write notifies subscribers like a snapshot listener. */
export function memoryDraftStore() {
  const docs = new Map<string, DraftDoc>();
  const listeners = new Map<string, Set<(d: DraftDoc | null) => void>>();
  const notify = (id: string) => listeners.get(id)?.forEach((fn) => fn(docs.get(id) ?? null));
  const store: DraftStore = {
    async create(id, doc) {
      if (!docs.has(id)) docs.set(id, doc);
    },
    subscribe(id, onDoc) {
      const set = listeners.get(id) ?? new Set();
      listeners.set(id, set);
      set.add(onDoc);
      onDoc(docs.get(id) ?? null);
      return () => set.delete(onDoc);
    },
    async transact(id, change) {
      const next = change(docs.get(id) ?? null);
      if (next) {
        docs.set(id, next);
        notify(id);
      }
    },
  };
  return { store, docs };
}
