import { btn, h } from '../dom';
import { currentTurn, type DraftState } from '../draft';
import type { Team, Turn } from '../model';
import { itemIcon } from '../icon';
import { finishedView } from '../results-view';
import { timeline } from '../timeline';
import { lobbySummary, stepLines } from '../preset-info';
import { availableList, choiceOf, findItem, isAvailable, otherTeam, shownList, visibleHistory } from '../rules';
import { filterIds, SEARCH_FROM, tabValues, type OptionFilter } from './filter';

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
  claim(team: Team, name?: string): Promise<void>;
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
  return h('button', { type: 'button', disabled: disabled || banned, className: `${selected ? 'selected ' : ''}${banned ? 'banned ' : ''}tile-${size}`.trim(), ariaPressed: String(selected), title: item?.name ?? id, onclick: onClick }, itemIcon(item, '', size), h('span', { className: 'tile-name', textContent: item?.name ?? id }));
}

/** Last tile of a random-enabled step: resolves the turn with a random available item. */
const randomTile = (selected: boolean, disabled: boolean, onClick: () => void) =>
  h('button', { type: 'button', disabled, ariaPressed: String(selected), className: `random-tile tile-medium${selected ? ' selected' : ''}`, onclick: onClick }, h('span', { className: 'random-icon', ariaHidden: 'true', textContent: '\u{1F3B2}' }), 'Random');

/** Per-captain confirmation state: a filled check once confirmed, a pulsing dot while waiting. */
function confirmStatus(s: DraftState, viewer: Team) {
  const one = (t: Team) => {
    const done = !!s.confirm?.[t];
    return h('li', { className: `confirm-row team-${t} ${done ? 'done' : 'waiting'}` },
      h('span', { className: 'confirm-name', textContent: `${s.teams[t].name}${t === viewer ? ' (you)' : ''}` }),
      h('span', { className: 'confirm-badge', ariaHidden: 'true', textContent: done ? '\u2713' : '' }),
      h('span', { className: 'confirm-label', textContent: done ? 'Confirmed' : 'Waiting' }));
  };
  return h('ul', { className: 'confirm-status', ariaLabel: 'Confirmations' }, one('A'), one('B'));
}

/** One seat in the lobby: its status, plus Take seat (visitor), Ready and Leave (owner). */
function seatCard(s: DraftState, t: Team, room: RoomPort, choosing: boolean, name: () => string) {
  const seat = s.teams[t];
  const mine = room.role === t;
  const kind = seat.ready ? 'ready' : seat.owner ? 'joined' : 'open';
  const actions: Node[] = [];
  if (choosing && !seat.owner) actions.push(btn('Take seat', () => void room.claim(t, name()), { className: `take team-${t}` }));
  if (mine) actions.push(btn(seat.ready ? 'Not ready' : 'Ready', () => void room.setReady(!seat.ready), { className: `team-${t}` }), btn('Leave seat', () => void room.release(), { className: 'secondary' }));
  return h('div', { className: `seat seat-card team-${t} ${kind}` },
    h('h3', { textContent: `Team ${t}` }),
    h('p', { className: 'seat-status', title: seat.owner ? seat.name : 'open', textContent: `${seat.owner ? seat.name : 'open'}${seat.ready ? ' \u00b7 ready' : ''}` }),
    h('div', { className: 'actions' }, ...actions));
}

/** Link to share, with a copy button. It lives outside the re-rendered content so the "Copied" feedback survives live updates. */
function shareRow(link: string) {
  const input = h('input', { type: 'text', readOnly: true, value: link, ariaLabel: 'Room link', onfocus: () => input.select() }) as HTMLInputElement;
  const copy = btn('Copy link', async () => {
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = 'Copied \u2713';
      setTimeout(() => (copy.textContent = 'Copy link'), 2000);
    } catch {
      input.select();
    }
  });
  return h('div', { className: 'share', hidden: true }, h('label', {}, 'Share this link with the other team', input), copy);
}

/** Captain-name form. It lives outside the re-rendered content so typing is not lost on live updates; the name is saved on change. */
function nameForm(room: RoomPort) {
  const input = h('input', { type: 'text', maxLength: 30, placeholder: 'Captain name', ariaLabel: 'Your name' }) as HTMLInputElement;
  const hint = h('span', { className: 'hint-inline', textContent: 'then take a seat, or' });
  const el = h('form', { className: 'name', hidden: true }, h('label', {}, 'Your name', input), hint);
  el.onsubmit = (e) => e.preventDefault();
  const save = () => {
    if (room.role !== 'spec' && input.value.trim()) void room.setName(input.value);
  };
  input.addEventListener('change', save);
  let filled = false;
  return {
    el,
    input,
    sync(visible: boolean, choosing = false) {
      el.hidden = !visible;
      hint.hidden = !choosing;
      const seated = room.role !== 'spec' && !!room.state;
      if (seated && !filled) {
        if (!input.value.trim()) input.value = room.state!.teams[room.role as Team].name;
        filled = true;
      }
    },
  };
}

/** Renders the draft room and keeps it live. Returns a dispose function. */
export function mountRoom(root: HTMLElement, room: RoomPort, now: () => number = Date.now, link: string = location.href): () => void {
  const content = h('div');
  const nameBox = nameForm(room);
  const share = shareRow(link);
  const head = h('div', { className: 'room-head' });
  const seats = h('div', { className: 'seats' });
  const lobby = h('div', { className: 'lobby' }, head, share, nameBox.el, seats);
  root.replaceChildren(lobby, content);

  let watching = false;
  const watchButton = btn('Watch', () => { watching = true; render(); }, { className: 'secondary' });
  nameBox.el.append(watchButton);
  let timerEl: HTMLElement | null = null;
  let filter: OptionFilter = { query: '', tab: null };
  let lastStep = -1;
  let afterRender = () => {};
  // The search box, tab row and log are created once so typing, focus and the log's open state survive live updates.
  const search = h('input', { type: 'search', placeholder: 'Filter items\u2026', ariaLabel: 'Filter items', oninput: () => { filter = { ...filter, query: search.value }; render(); } }) as HTMLInputElement;
  const tabRow = h('div', { className: 'faction-tabs', role: 'group', ariaLabel: 'Filter by group' });
  const filterEl = h('div', { className: 'filter' }, search, tabRow);
  const filterBar = (tabs: string[]) => {
    const pick = (tab: string | null) => { filter = { ...filter, tab }; render(); };
    const active = tabs.includes(filter.tab ?? '') ? filter.tab : null;
    tabRow.replaceChildren(...(tabs.length ? [null, ...tabs] : []).map((t) => h('button', { type: 'button', className: 'tab', textContent: t ?? 'All', ariaPressed: String(t === active), onclick: () => pick(t) })));
    return filterEl;
  };
  const logList = h('ol', { className: 'history' });
  const logSummary = h('summary');
  const log = h('details', { className: 'log' }, logSummary, logList);
  const showTimer = () => {
    const left = room.state ? secondsLeft(room.state, now()) : null;
    if (timerEl) timerEl.textContent = left === null ? '' : ` · ${left}s`;
  };

  function render() {
    afterRender = () => {};
    const s = room.state;
    if (!s) {
      nameBox.sync(false);
      share.hidden = true;
      head.replaceChildren();
      seats.replaceChildren();
      content.replaceChildren(h('p', { textContent: room.integrity ?? 'Connecting…' }));
      return;
    }
    const viewer = room.role === 'spec' ? null : room.role;
    const inLobby = s.phase === 'lobby';
    const choosing = !viewer && !watching && inLobby;
    const turn = currentTurn(s);
    const myTurn = !!turn && turn.team === viewer && !s.pausing && !s.confirm;

    nameBox.sync(inLobby && (choosing || !!viewer), choosing);
    watchButton.hidden = !choosing;
    share.hidden = !inLobby;
    const ready = (['A', 'B'] as Team[]).filter((t) => s.teams[t].ready).length;
    const steps = stepLines(s.preset).map((l, i) => `${i + 1}. ${l.text}`).join('\n');
    if (inLobby) {
      head.replaceChildren(
        h('h2', { textContent: s.preset.name, title: steps }),
        h('p', { className: 'preset-summary', textContent: lobbySummary(s.preset) }),
        h('p', { className: 'role', textContent: viewer ? `You are Captain ${viewer}` : 'You are watching' }),
        h('p', { className: 'room-state', textContent: `Waiting for captains \u00b7 ${ready}/2 ready` }),
        h('p', { className: 'hint', textContent: 'The draft starts when both captains are ready.' }),
        ...(!viewer && watching ? [btn('Choose a seat', () => { watching = false; render(); }, { className: 'secondary' })] : []),
      );
    } else {
      const seatName = (t: Team) => `${t === viewer ? 'You' : `Captain ${t}`} (${s.teams[t].name})`;
      const who = viewer ? `You are Captain ${viewer} (${s.teams[viewer].name})` : 'You are watching';
      const versus = viewer ? ` \u00b7 vs Captain ${otherTeam(viewer)} (${s.teams[otherTeam(viewer)].name})` : ` \u00b7 ${seatName('A')} vs ${seatName('B')}`;
      head.replaceChildren(h('h2', { className: 'room-line', title: steps }, `${s.preset.name} \u00b7 `, h('span', { className: 'role', textContent: who }), versus));
    }
    seats.replaceChildren(...(inLobby ? (['A', 'B'] as Team[]).map((t) => seatCard(s, t, room, choosing, () => nameBox.input.value)) : []));

    const body: Node[] = [timeline(s.preset, s, viewer)];
    if (room.integrity) body.push(h('p', { className: 'integrity', textContent: room.integrity }));
    if (room.notice) body.push(h('p', { className: 'notice', textContent: room.notice }));

    if (s.phase === 'drafting' && turn) {
      const status = s.pausing ? 'Paused' : s.confirm ? 'Waiting for both captains to confirm' : `${s.teams[turn.team].name} ${describeTurn(turn)}`;
      timerEl = h('span', { className: 'timer' });
      showTimer();
      const mode = s.pausing ? 'paused' : s.confirm ? 'confirming' : myTurn ? 'mine' : 'waiting';
      const turnEl = h('p', { className: `turn ${mode} ${turn.action}` }, h('span', { role: 'status', textContent: status }), timerEl);
      turnEl.dataset.step = String(s.turnIndex + 1);
      body.push(turnEl);
      if (viewer && !myTurn && !s.confirm && !s.pausing) body.push(h('p', { className: 'hint', textContent: `Waiting for ${s.teams[turn.team].name}…` }));
      if (s.confirm && viewer) {
        body.push(confirmStatus(s, viewer));
        if (!s.confirm[viewer]) body.push(btn('Confirm', () => void room.confirmNext()));
      }
      const shown = shownList(s, turn, visibleHistory(s, turn, viewer));
      if (turn.step !== lastStep) {
        filter = { query: '', tab: null };
        search.value = '';
        lastStep = turn.step;
      }
      const tabs = tabValues(s.preset, turn, shown);
      const options = filterIds(s.preset, turn, shown, filter);
      const refocus = document.activeElement === search;
      if (tabs.length || shown.length > SEARCH_FROM) body.push(filterBar(tabs));
      const tiles = options.map((id) => itemButton(s, turn, id, !myTurn, s.selection?.team === viewer && s.selection?.itemId === id && !s.selection.random, () => void room.select(id)));
      if (turn.random) tiles.push(randomTile(!!(s.selection?.team === viewer && s.selection?.random), !myTurn || availableList(s, turn).length === 0, () => void room.random()));
      body.push(h('div', { className: shown.length <= FEW_OPTIONS ? 'items few' : 'items' }, ...tiles));
      if (!options.length) body.push(h('p', { className: 'hint', textContent: 'No items match the filter.' }));
      if (myTurn && s.selection) body.push(btn(s.selection.random ? 'Confirm random pick' : `Confirm ${nameOf(s, s.selection.itemId)}`, () => void room.act(s.selection!.itemId), { className: `commit ${turn.action}` }));
      afterRender = () => refocus && search.focus();
    } else if (!inLobby) {
      body.push(...finishedView(s, viewer));
    }

    logList.replaceChildren(...visibleHistory(s, turn, viewer).map((e) => {
      const li = h('li', { className: `${e.action} team-${e.team}` },
        `${s.teams[e.team].name}: ${e.action} `,
        e.itemId ? icon(s, e.action, e.itemId) : e.random ? '\u{1F3B2} ' : '',
        `${e.itemId ? nameOf(s, e.itemId) : e.random ? 'Random pick confirmed' : '(hidden)'}${e.random && e.itemId ? ' \u{1F3B2}' : ''}${e.auto ? ' (auto)' : ''}`);
      li.dataset.step = String(e.index + 1);
      return li;
    }));
    logSummary.textContent = `Log (${s.history.length})`;
    if (s.history.length) body.push(log);
    content.replaceChildren(...body);
    afterRender();
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