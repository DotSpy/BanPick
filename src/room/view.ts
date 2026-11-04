import { btn, h } from '../dom';
import { currentTurn, type DraftState } from '../draft';
import type { Team, Turn } from '../model';
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
  setName(name: string): Promise<void>;
  tick(): Promise<void>;
}

const itemOf = (s: DraftState, id: string) => {
  for (const pool of Object.values(s.preset.pools)) {
    const item = pool.items.find((i) => i.id === id);
    if (item) return item;
  }
  return undefined;
};
const nameOf = (s: DraftState, id: string) => itemOf(s, id)?.name ?? id;

const describeTurn = (t: Turn) => {
  const what = t.action === 'choose' ? `to choose ${t.target}` : `to ${t.action} ${t.target}`;
  return t.blind ? `${what} (blind)` : what;
};

const secondsLeft = (s: DraftState, now: number) => (s.deadline ? Math.max(0, Math.ceil((s.deadline - now) / 1000)) : null);

function itemButton(s: DraftState, id: string, disabled: boolean, selected: boolean, onClick: () => void) {
  const item = itemOf(s, id);
  const image = item?.image ? h('img', { src: item.image, alt: '', width: 32 }) : '';
  return h('button', { type: 'button', disabled, className: selected ? 'selected' : '', onclick: onClick }, image, item?.name ?? id);
}

/** Captain-name form. It lives outside the re-rendered content so typing is not lost on live updates. */
function nameForm(room: RoomPort) {
  const input = h('input', { type: 'text', maxLength: 30, placeholder: 'Captain name' }) as HTMLInputElement;
  const el = h('form', { className: 'name', hidden: true }, h('label', {}, 'Captain name ', input), btn('Set name', () => void room.setName(input.value), { type: 'submit' }));
  el.onsubmit = (e) => e.preventDefault();
  let filled = false;
  return {
    el,
    sync() {
      const seated = room.role !== 'spec' && !!room.state;
      el.hidden = !seated;
      if (seated && !filled) {
        input.value = room.state!.teams[room.role as Team].name;
        filled = true;
      }
    },
  };
}

/** Renders the draft room and keeps it live. Returns a dispose function. */
export function mountRoom(root: HTMLElement, room: RoomPort, now: () => number = Date.now): () => void {
  const content = h('div');
  const nameBox = nameForm(room);
  root.replaceChildren(nameBox.el, content);

  let timerEl: HTMLElement | null = null;
  const showTimer = () => {
    const left = room.state ? secondsLeft(room.state, now()) : null;
    if (timerEl) timerEl.textContent = left === null ? '' : ` · ${left}s`;
  };

  function render() {
    nameBox.sync();
    const s = room.state;
    if (!s) {
      content.replaceChildren(h('p', { textContent: room.integrity ?? 'Connecting…' }));
      return;
    }
    const viewer = room.role === 'spec' ? null : room.role;
    const turn = currentTurn(s);
    const myTurn = !!turn && turn.team === viewer && !s.pausing && !s.confirm;

    const body: Node[] = [
      h('h2', { textContent: s.preset.name }),
      h('p', { className: 'role', textContent: viewer ? `You are Captain ${viewer}` : 'You are watching' }),
    ];
    if (room.integrity) body.push(h('p', { className: 'integrity', textContent: room.integrity }));
    if (room.notice) body.push(h('p', { className: 'notice', textContent: room.notice }));

    if (s.phase === 'lobby') {
      for (const t of ['A', 'B'] as Team[]) {
        body.push(h('p', { className: 'seat', textContent: `Team ${t}: ${s.teams[t].owner ? s.teams[t].name : 'open'}${s.teams[t].ready ? ' (ready)' : ''}` }));
      }
      body.push(h('p', { className: 'hint', textContent: 'The draft starts when both captains are ready.' }));
      if (viewer) body.push(btn(s.teams[viewer].ready ? 'Not ready' : 'Ready', () => void room.setReady(!s.teams[viewer].ready)));
    } else if (s.phase === 'drafting' && turn) {
      const status = s.pausing ? 'Paused' : s.confirm ? 'Waiting for both captains to confirm' : `${s.teams[turn.team].name} ${describeTurn(turn)}`;
      timerEl = h('span', { className: 'timer' });
      showTimer();
      body.push(h('p', { className: 'turn' }, h('span', { role: 'status', textContent: status }), timerEl));
      if (viewer && !myTurn && !s.confirm && !s.pausing) body.push(h('p', { className: 'hint', textContent: `Waiting for ${s.teams[turn.team].name}…` }));
      if (s.confirm && viewer && !s.confirm[viewer]) body.push(btn('Confirm', () => void room.confirmNext()));
      body.push(h('div', { className: 'items' }, ...availableList(s, turn).map((id) => itemButton(s, id, !myTurn, s.selection?.team === viewer && s.selection?.itemId === id, () => void room.select(id)))));
      if (myTurn && s.selection) body.push(btn(`Confirm ${nameOf(s, s.selection.itemId)}`, () => void room.act(s.selection!.itemId), { className: 'commit' }));
    } else {
      body.push(h('p', { className: 'turn', textContent: 'Draft finished' }));
    }

    body.push(
      h('ol', { className: 'history' }, ...visibleHistory(s, turn, viewer).map((e) =>
        h('li', { textContent: `${s.teams[e.team].name}: ${e.action} ${e.itemId ? nameOf(s, e.itemId) : '(hidden)'}${e.auto ? ' (auto)' : ''}` }),
      )),
    );
    content.replaceChildren(...body);
  }

  const unsubscribe = room.subscribe(render);
  const clock = setInterval(() => {
    void room.tick();
    showTimer();
  }, 1000);
  render();
  return () => {
    clearInterval(clock);
    unsubscribe();
  };
}

