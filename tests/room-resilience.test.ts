import { describe, expect, it } from 'vitest';
import { backoffDelay, isTransient, withRetry } from '../src/room/backoff';
import { renameSeat } from '../src/room/claim';
import { Room, type DraftStore } from '../src/room/room';
import { memoryDraftStore } from './memory-store';
import { lobby, makePreset, step } from './fixtures';

const preset = () => makePreset([step('A', 'ban', 'maps')]);
const transientError = () => Object.assign(new Error('offline'), { code: 'unavailable' });
const noWait = async () => {};

describe('backoff policy', () => {
  it('doubles the delay on each retry', () => {
    expect([0, 1, 2].map(backoffDelay)).toEqual([1000, 2000, 4000]);
  });

  it('caps the delay at 30 seconds', () => {
    expect(backoffDelay(20)).toBe(30_000);
  });

  it('treats network errors as transient and permission errors as final', () => {
    expect([isTransient(transientError()), isTransient({ code: 'permission-denied' }), isTransient(null)]).toEqual([true, false, false]);
  });

  it('retries a transient failure and returns the eventual result', async () => {
    let calls = 0;
    const fn = async () => {
      if (++calls < 3) throw transientError();
      return 'ok';
    };

    expect(await withRetry(fn, 3, noWait)).toBe('ok');
  });

  it('waits with growing delays between attempts', async () => {
    const waits: number[] = [];
    const fn = async () => {
      throw transientError();
    };

    await withRetry(fn, 3, async (ms) => void waits.push(ms)).catch(() => {});

    expect(waits).toEqual([1000, 2000]);
  });

  it('does not retry a permission error', async () => {
    let calls = 0;
    const fn = async () => {
      calls++;
      throw { code: 'permission-denied' };
    };

    await withRetry(fn, 3, noWait).catch(() => {});

    expect(calls).toBe(1);
  });
});

describe('renaming a seat', () => {
  it('sets the trimmed captain name', () => {
    const s = lobby(preset());

    const refusal = renameSeat(s, 'A', '  Ada  ');

    expect([refusal, s.teams.A.name, s.teams.A.captain]).toEqual([null, 'Ada', 'Ada']);
  });

  it('refuses a blank name', () => {
    expect(renameSeat(lobby(preset()), 'A', '   ')).toBe('Enter a name.');
  });

  it('truncates a long name to 30 characters', () => {
    const s = lobby(preset());

    renameSeat(s, 'A', 'x'.repeat(50));

    expect(s.teams.A.name).toHaveLength(30);
  });
});

describe('room resilience', () => {
  /** A store whose writes fail a set number of times and whose subscription errors can be triggered. */
  const flaky = (writeFailures = 0) => {
    const mem = memoryDraftStore();
    let failures = writeFailures;
    let subscriptions = 0;
    const errorHandlers: Array<(e: unknown) => void> = [];
    const store: DraftStore = {
      create: mem.store.create,
      subscribe(id, onDoc, onError) {
        subscriptions++;
        errorHandlers.push(onError);
        return mem.store.subscribe(id, onDoc, onError);
      },
      transact(id, change) {
        if (failures-- > 0) return Promise.reject(transientError());
        return mem.store.transact(id, change);
      },
    };
    return { store, subscriptions: () => subscriptions, dropConnection: () => errorHandlers.at(-1)!(new Error('stream closed')) };
  };
  const roomOn = (store: DraftStore) =>
    new Room({ store, roomId: 'r', preset: preset(), uid: 'ua', now: () => 1, sleep: noWait });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('resubscribes after the subscription fails', async () => {
    const f = flaky();
    const room = roomOn(f.store);
    await room.open(null);

    f.dropConnection();
    await flush();

    expect(f.subscriptions()).toBe(2);
  });

  it('reports the lost connection while reconnecting', async () => {
    const f = flaky();
    const room = roomOn(f.store);
    await room.open(null);

    f.dropConnection();

    expect(room.integrity).toMatch(/Connection lost.*Reconnecting/);
  });

  it('clears the connection warning once the stream delivers again', async () => {
    const f = flaky();
    const room = roomOn(f.store);
    await room.open(null);

    f.dropConnection();
    await flush();

    expect(room.integrity).toBeNull();
  });

  it('does not resubscribe after dispose', async () => {
    const f = flaky();
    const room = roomOn(f.store);
    await room.open(null);

    f.dropConnection();
    room.dispose();
    await flush();

    expect(f.subscriptions()).toBe(1);
  });

  it('retries a write that fails transiently', async () => {
    const f = flaky(2);
    const room = roomOn(f.store);
    await room.open('A');

    expect(room.role).toBe('A');
  });

  it('tells the user when a write keeps failing', async () => {
    const f = flaky(10);
    const room = roomOn(f.store);
    await room.open(null);

    await room.setName('Ada');

    expect(room.notice).toMatch(/Could not save/);
  });
});
