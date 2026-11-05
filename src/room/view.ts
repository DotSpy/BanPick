import { btn, h } from '../dom';
import { currentTurn, type DraftState } from '../draft';
import type { Team, Turn } from '../model';
import { itemIcon } from '../icon';
import { timeline } from '../timeline';
import { choiceOf, findItem, isAvailable, shownList, visibleHistory } from '../rules';

/** What the view needs from a room; `Room` satisfies it. */
export interface RoomPort {
  state: DraftState | null;
  role: Team | 'spec';
  notice: string | null;
  integrity: string | null;
  subscribe(fn: () => void): () => void;
  act(itemId: string): Promise<void>;
  random(): Promise<void>;
  select(itemId: string | null): Promise<void>;
  claim(team: Team): Promise<void>;
  release(): Promise<void>;
  setReady(ready: boolean): Promise<void>;
  confirmNext(): Promise<void>;
  setName(name: string): Promise<void>;
  tick(): Promise<void>;
}

/** With this many options or fewer, the buttons render as large tiles. */
export const FEW_OPTIONS = 4;

const itemOf = (s: DraftState, id: string) => findItem(s.preset, id);
const nameOf = (s: DraftState, id: string) => itemOf(s, id)?.name ?? id;

const describeTurn = (t: Turn) => {
  const what = t.action === 'choose' ? `to choose ${t.target}` : `to ${t.action} ${t.target}`;
  return t.blind ? `${what} (blind)` : what;
};

const secondsLeft = (s: DraftState, now: number) => (s.deadline ? Math.max(0, Math.ceil((s.deadline - now) / 1000)) : null);

const icon = (s: DraftState, action: Turn['action'], id: string) => {
  const { item, size } = choiceOf(s.preset, action, id);
  return itemIcon(item, '', size);
};

function itemButton(s: DraftState, turn: Turn, id: string, disabled: boolean, selected: boolean, onClick: () => void) {
  const { item, size } = choiceOf(s.preset, turn.action, id);
  const banned = !isAvailable(s, turn, id);
  return h('button', { type: 'button', disabled: disabled || banned, className: `${selected ? 'selected ' : ''}${banned ? 'banned ' : ''}tile-${size}`.trim(), ariaPressed: String(selected), onclick: onClick }, itemIcon(item, '', size), item?.name ?? id);
}

/** Seat choice for a browser without a seat: free seats can be claimed, taken ones are disabled, Watch is always available. */
function seatChoice(s: DraftState, room: RoomPort, onWatch: () => void) {
  const seat = (t: Team) => {
    const taken = !!s.teams[t].owner;
    return btn(taken ? `Team ${t} (taken)` : `Team ${t}`, () => void room.claim(t), { disabled: taken || s.phase !== 'lobby' });
  };
  return h('div', { className: 'seat-choice' }, h('p', { className: 'hint', textContent: 'Choose your seat:' }), seat('A'), seat('B'), btn('Watch', onWatch, { className: 'secondary' }));
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

  let watching = false;
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
    body.push(timeline(s.preset, s, viewer));
    if (room.integrity) body.push(h('p', { className: 'integrity', textContent: room.integrity }));
    if (room.notice) body.push(h('p', { className: 'notice', textContent: room.notice }));
    if (!viewer && !watching) body.push(seatChoice(s, room, () => { watching = true; render(); }));
    if (!viewer && watching && s.phase === 'lobby') body.push(btn('Choose a seat', () => { watching = false; render(); }, { className: 'secondary' }));

    if (s.phase === 'lobby') {
      for (const t of ['A', 'B'] as Team[]) {
        body.push(h('p', { className: `seat ${s.teams[t].ready ? 'ready' : s.teams[t].owner ? 'joined' : 'open'}`, textContent: `Team ${t}: ${s.teams[t].owner ? s.teams[t].name : 'open'}${s.teams[t].ready ? ' (ready)' : ''}` }));
      }
      body.push(h('p', { className: 'hint', textContent: 'The draft starts when both captains are ready.' }));
      if (viewer) body.push(btn(s.teams[viewer].ready ? 'Not ready' : 'Ready', () => void room.setReady(!s.teams[viewer].ready)), btn('Leave seat', () => void room.release(), { className: 'secondary' }));
    } else if (s.phase === 'drafting' && turn) {
      const status = s.pausing ? 'Paused' : s.confirm ? 'Waiting for both captains to confirm' : `${s.teams[turn.team].name} ${describeTurn(turn)}`;
      timerEl = h('span', { className: 'timer' });
      showTimer();
      const mode = s.pausing ? 'paused' : s.confirm ? 'confirming' : myTurn ? 'mine' : 'waiting';
      body.push(h('p', { className: `turn ${mode} ${turn.action}` }, h('span', { role: 'status', textContent: status }), timerEl));
      if (viewer && !myTurn && !s.confirm && !s.pausing) body.push(h('p', { className: 'hint', textContent: `Waiting for ${s.teams[turn.team].name}…` }));
      if (s.confirm && viewer && !s.confirm[viewer]) body.push(btn('Confirm', () => void room.confirmNext()));
      if (s.confirm && viewer && s.confirm[viewer]) body.push(h('p', { className: 'hint', textContent: 'You confirmed. Waiting for the other captain\u2026' }));
      const options = shownList(s, turn, visibleHistory(s, turn, viewer));
      body.push(h('div', { className: options.length <= FEW_OPTIONS ? 'items few' : 'items' }, ...options.map((id) => itemButton(s, turn, id, !myTurn, s.selection?.team === viewer && s.selection?.itemId === id, () => void room.select(id)))));
      if (myTurn && turn.random) body.push(btn('Random', () => void room.random(), { className: 'secondary' }));
      if (myTurn && s.selection) body.push(btn(`Confirm ${nameOf(s, s.selection.itemId)}`, () => void room.act(s.selection!.itemId), { className: `commit ${turn.action}` }));
    } else {
      body.push(h('p', { className: 'turn finished', textContent: 'Draft finished' }));
    }

    body.push(
      h('ol', { className: 'history' }, ...visibleHistory(s, turn, viewer).map((e) =>
        h('li', { className: `${e.action} team-${e.team}` },
          `${s.teams[e.team].name}: ${e.action} `,
          e.itemId ? icon(s, e.action, e.itemId) : '',
          `${e.itemId ? nameOf(s, e.itemId) : '(hidden)'}${e.auto ? ' (auto)' : ''}${e.random ? ' (random)' : ''}`),
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

