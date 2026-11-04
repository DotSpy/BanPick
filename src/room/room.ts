import {
  applyPick, autoChoice, confirmNext, createState, currentTurn, resumeFromPause, setReady, setSelection,
  type DraftState,
} from '../draft';
import type { Preset, Team } from '../model';
import { draftFromDoc, draftToDoc, type DraftDoc } from '../persist/docs';
import { sleep as realSleep, backoffDelay, withRetry } from './backoff';
import { decideClaim, freeSeat, renameSeat } from './claim';

const WRITE_ATTEMPTS = 3;

/** Transport port. The Firestore adapter implements it; tests use an in-memory one. */
export interface DraftStore {
  /** Writes `doc` only if the draft does not exist yet. */
  create(id: string, doc: DraftDoc): Promise<void>;
  subscribe(id: string, onDoc: (doc: DraftDoc | null) => void, onError: (e: unknown) => void): () => void;
  /** Reads, applies `change` and writes atomically. Returning null from `change` skips the write. */
  transact(id: string, change: (current: DraftDoc | null) => DraftDoc | null): Promise<void>;
}

export type Role = Team | 'spec';

export interface RoomDeps {
  store: DraftStore;
  roomId: string;
  preset: Preset;
  uid: string;
  now(): number;
  /** Waits between retries; defaults to a real timer. */
  sleep?(ms: number): Promise<void>;
}

/** One browser's view of one draft: claims a seat, applies this user's actions and advances overdue timers. */
export class Room {
  state: DraftState | null = null;
  role: Role = 'spec';
  notice: string | null = null;
  /** Set when the stored draft is not a legal outcome of its preset. */
  integrity: string | null = null;
  private listeners = new Set<() => void>();
  private unsubscribe: (() => void) | null = null;
  private ticking = false;
  private disposed = false;
  private retries = 0;

  constructor(private d: RoomDeps) {}

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Creates the draft if needed, optionally claims a seat, then follows the stored state. */
  async open(want: Team | null, name = '') {
    const { store, roomId, preset, now } = this.d;
    await store.create(roomId, draftToDoc(createState(roomId, preset, { A: 'Team A', B: 'Team B' }, now()), now()));
    if (want) this.notice = await this.mutate((s) => decideClaim(s, this.d.uid, want, name).refusal);
    this.follow();
    this.emit();
  }

  dispose() {
    this.disposed = true;
    this.unsubscribe?.();
    this.listeners.clear();
  }

  claim(team: Team, name = '') {
    return this.mutateAndEmit((s) => decideClaim(s, this.d.uid, team, name).refusal);
  }
  act(itemId: string) {
    return this.seated((s, team, now) => {
      const err = applyPick(s, team, itemId, now, false);
      if (!err) s.history[s.history.length - 1].by = this.d.uid;
      return err;
    });
  }
  select(itemId: string | null) {
    return this.seated((s, team) => setSelection(s, team, itemId));
  }
  setReady(ready: boolean) {
    return this.seated((s, team, now) => setReady(s, team, ready, now));
  }
  confirmNext() {
    return this.seated((s, team, now) => confirmNext(s, team, now));
  }
  setName(name: string) {
    return this.seated((s, team) => renameSeat(s, team, name));
  }
  release() {
    return this.seated((s, team) => {
      if (s.phase !== 'lobby') return 'The draft has started, so the seat cannot be released.';
      freeSeat(s, team);
      return null;
    });
  }

  /**
   * Call periodically. Once the deadline has passed, any browser may end the pause or commit the auto-pick;
   * the transaction re-checks against the latest state, so concurrent callers cannot double-advance.
   */
  async tick() {
    const s = this.state;
    if (!s || this.ticking || s.phase !== 'drafting' || !s.deadline || s.confirm || this.d.now() < s.deadline) return;
    this.ticking = true;
    try {
      await this.mutate((st, now) => {
        const turn = currentTurn(st);
        if (!turn || !st.deadline || st.confirm || now < st.deadline) return 'not due';
        if (st.pausing) return resumeFromPause(st, now);
        const id = autoChoice(st);
        return id ? applyPick(st, turn.team, id, now, true) : 'nothing to pick';
      });
    } finally {
      this.ticking = false;
    }
  }

  private seated(change: (s: DraftState, team: Team, now: number) => string | null) {
    return this.mutateAndEmit((s, now) => {
      const team = (['A', 'B'] as Team[]).find((t) => s.teams[t].owner === this.d.uid);
      return team ? change(s, team, now) : 'You do not hold a seat';
    });
  }

  private async mutateAndEmit(change: (s: DraftState, now: number) => string | null) {
    this.notice = await this.mutate(change);
    this.emit();
  }

  /** Runs `change` on the stored state in a transaction. Returns the refusal, or null when applied. */
  private async mutate(change: (s: DraftState, now: number) => string | null): Promise<string | null> {
    let refusal: string | null = null;
    try {
      await withRetry(
        () =>
          this.d.store.transact(this.d.roomId, (current) => {
            refusal = null;
            if (!current) {
              refusal = 'Draft not found';
              return null;
            }
            const loaded = draftFromDoc(current);
            if (!loaded.ok) {
              refusal = loaded.error;
              return null;
            }
            const now = this.d.now();
            refusal = change(loaded.value, now);
            return refusal ? null : draftToDoc(loaded.value, now);
          }),
        WRITE_ATTEMPTS,
        this.wait,
      );
    } catch {
      return 'Could not save your change. Check your connection and try again.';
    }
    return refusal;
  }

  private wait = (ms: number) => (this.d.sleep ?? realSleep)(ms);

  private follow() {
    const { store, roomId } = this.d;
    this.unsubscribe = store.subscribe(roomId, (doc) => this.receive(doc), (e) => this.fail(e));
  }

  private receive(doc: DraftDoc | null) {
    this.retries = 0;
    const loaded = doc ? draftFromDoc(doc) : null;
    if (loaded?.ok) {
      this.state = loaded.value;
      this.integrity = null;
      this.role = (['A', 'B'] as Team[]).find((t) => loaded.value.teams[t].owner === this.d.uid) ?? 'spec';
    } else {
      this.integrity = loaded ? loaded.error : 'Draft not found';
    }
    this.emit();
  }

  private fail(e: unknown) {
    this.unsubscribe?.();
    this.integrity = `Connection lost: ${e instanceof Error ? e.message : String(e)}. Reconnecting…`;
    this.emit();
    void this.wait(backoffDelay(this.retries++)).then(() => {
      if (!this.disposed) this.follow();
    });
  }

  private emit() {
    this.listeners.forEach((fn) => fn());
  }
}
