import { btn, h } from '../dom';
import { currentTurn, type DraftState } from '../draft';
import type { Team } from '../model';
import { availableList, visibleHistory } from '../rules';

/** What the view needs from a room; `Room` satisfies it. */
export interface RoomPort {
  state: DraftState | null;
  role: Team | 'spec';
  notice: string | null;
  integrity: string | null;
  subscribe(fn: () => void): () => void;
  act(itemId: string): Promise<void>;
  select(itemId: string | null): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  confirmNext(): Promise<void>;
  tick(): Promise<void>;
}

const nameOf = (s: DraftState, id: string) => {
  for (const pool of Object.values(s.preset.pools)) {
    const item = pool.items.find((i) => i.id === id);
    if (item) return item.name;
  }
  return id;
};

const secondsLeft = (s: DraftState, now: number) => (s.deadline ? Math.max(0, Math.ceil((s.deadline - now) / 1000)) : null);

/** Renders the draft room and keeps it live. Returns a dispose function. */
export function mountRoom(root: HTMLElement, room: RoomPort, now: () => number = Date.now): () => void {
  function render() {
    const s = room.state;
    if (!s) {
      root.replaceChildren(h('p', { textContent: room.integrity ?? 'Connecting…' }));
      return;
    }
    const viewer = room.role === 'spec' ? null : room.role;
    const turn = currentTurn(s);
    const myTurn = !!turn && turn.team === viewer && !s.pausing && !s.confirm;

    const body: Node[] = [h('h2', { textContent: s.preset.name })];
    if (room.integrity) body.push(h('p', { className: 'integrity', textContent: room.integrity }));
    if (room.notice) body.push(h('p', { className: 'notice', textContent: room.notice }));

    if (s.phase === 'lobby') {
      for (const t of ['A', 'B'] as Team[]) {
        body.push(h('p', { className: 'seat', textContent: `Team ${t}: ${s.teams[t].owner ? s.teams[t].name : 'open'}${s.teams[t].ready ? ' (ready)' : ''}` }));
      }
      if (viewer) body.push(btn(s.teams[viewer].ready ? 'Not ready' : 'Ready', () => void room.setReady(!s.teams[viewer].ready)));
    } else if (s.phase === 'drafting' && turn) {
      const left = secondsLeft(s, now());
      const status = s.pausing ? 'Paused' : s.confirm ? 'Waiting for both captains to confirm' : `${s.teams[turn.team].name}: ${turn.action} ${turn.target}`;
      body.push(h('p', { className: 'turn', textContent: left === null ? status : `${status} · ${left}s` }));
      if (s.confirm && viewer && !s.confirm[viewer]) body.push(btn('Confirm', () => void room.confirmNext()));
      body.push(h('div', { className: 'items' }, ...availableList(s, turn).map((id) => btn(nameOf(s, id), () => void room.select(id), { disabled: !myTurn, className: s.selection?.team === viewer && s.selection?.itemId === id ? 'selected' : '' }))));
      if (myTurn && s.selection) body.push(btn(`Confirm ${nameOf(s, s.selection.itemId)}`, () => void room.act(s.selection!.itemId), { className: 'commit' }));
    } else {
      body.push(h('p', { className: 'turn', textContent: 'Draft finished' }));
    }

    body.push(
      h('ol', { className: 'history' }, ...visibleHistory(s, turn, viewer).map((e) =>
        h('li', { textContent: `${s.teams[e.team].name}: ${e.action} ${e.itemId ? nameOf(s, e.itemId) : '(hidden)'}${e.auto ? ' (auto)' : ''}` }),
      )),
    );
    root.replaceChildren(...body);
  }

  const unsubscribe = room.subscribe(render);
  const clock = setInterval(() => {
    void room.tick();
    render();
  }, 1000);
  render();
  return () => {
    clearInterval(clock);
    unsubscribe();
  };
}
