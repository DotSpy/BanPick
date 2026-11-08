// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { Room } from '../src/room/room';
import { mountRoom } from '../src/room/view';
import { parseRoute, roomHash, roomLink } from '../src/route';
import { memoryDraftStore } from './memory-store';
import { makePreset, sideTagging, step } from './fixtures';

describe('route parsing', () => {
  it('parses a room link without a seat', () => {
    expect(parseRoute('#room/r1/builtin-x')).toEqual({ kind: 'room', roomId: 'r1', presetRef: 'builtin-x' });
  });

  it('treats anything else as a builder share code', () => {
    expect(parseRoute('#abc123')).toEqual({ kind: 'builder', code: 'abc123' });
  });

  it('rejects an incomplete room link', () => {
    expect(parseRoute('#room/r1').kind).toBe('invalid');
  });

  it('builds one shared link for the room', () => {
    expect(roomLink('http://h/', 'r', 'p')).toEqual({ label: 'Room link', url: 'http://h/#room/r/p' });
  });

  it('round-trips a room hash', () => {
    expect(parseRoute(roomHash('r', 'p'))).toMatchObject({ kind: 'room', roomId: 'r', presetRef: 'p' });
  });
});

describe('room view', () => {
  const setup = async () => {
    const { store } = memoryDraftStore();
    const preset = makePreset([step('A', 'pick', 'maps', { blind: true, reveal: 'end' }), step('B', 'pick', 'maps')]);
    const room = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
    const a = room('ua');
    const b = room('ub');
    await a.open('A');
    await b.open('B');
    return { a, b };
  };
  const mount = (r: Room) => {
    const root = document.createElement('div');
    const dispose = mountRoom(root, r);
    return { root, dispose };
  };
  const click = (root: HTMLElement, label: string) =>
    [...root.querySelectorAll('button')].find((x) => x.textContent === label)!.click();
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('lets a captain mark ready from the lobby', async () => {
    const { a } = await setup();
    const { root, dispose } = mount(a);

    click(root, 'Ready');
    await flush();

    expect(a.state?.teams.A.ready).toBe(true);
    dispose();
  });

  it('disables the item buttons when it is not your turn', async () => {
    const { a, b } = await setup();
    await a.setReady(true);
    await b.setReady(true);
    const { root, dispose } = mount(b);

    const disabled = [...root.querySelectorAll('.items button')].every((x) => (x as HTMLButtonElement).disabled);

    expect(disabled).toBe(true);
    dispose();
  });

  it('picks in two clicks: select, then confirm', async () => {
    const { a, b } = await setup();
    await a.setReady(true);
    await b.setReady(true);
    const { root, dispose } = mount(a);

    click(root, 'map-1');
    await flush();
    click(root, 'Confirm map-1');
    await flush();

    expect(a.state?.history).toHaveLength(1);
    dispose();
  });

  it("hides the opponent's blind pick in the history", async () => {
    const { a, b } = await setup();
    await a.setReady(true);
    await b.setReady(true);
    await a.act('map-1');
    const { root, dispose } = mount(b);

    expect(root.querySelector('.history')!.textContent).toContain('(hidden)');
    dispose();
  });

  it('shows the picker their own blind pick', async () => {
    const { a, b } = await setup();
    await a.setReady(true);
    await b.setReady(true);
    await a.act('map-1');
    const { root, dispose } = mount(a);

    expect(root.querySelector('.history')!.textContent).toContain('map-1');
    dispose();
  });

  it('shows an integrity warning for a broken draft', async () => {
    const { a } = await setup();
    a.integrity = 'Entry 1 is illegal';
    const { root, dispose } = mount(a);

    expect(root.querySelector('.integrity')?.textContent).toBe('Entry 1 is illegal');
    dispose();
  });
});

describe('room view guidance', () => {
  const room = async (uid: string, want: 'A' | 'B' | null, preset = makePreset([step('A', 'pick', 'maps', { blind: true }), step('B', 'ban', 'maps')])) => {
    const { store } = memoryDraftStore();
    const r = new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
    await r.open(want);
    return r;
  };
  const view = (r: Room, now?: () => number) => {
    const root = document.createElement('div');
    const dispose = mountRoom(root, r, now);
    return { root, dispose };
  };
  const started = async (preset = makePreset([step('A', 'pick', 'maps', { blind: true }), step('B', 'ban', 'maps', { timer: 30 })])) => {
    const { store } = memoryDraftStore();
    const mk = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
    const [a, b, spec] = [mk('ua'), mk('ub'), mk('us')];
    await a.open('A');
    await b.open('B');
    await spec.open(null);
    await a.setReady(true);
    await b.setReady(true);
    return { a, b, spec };
  };

  it('tells a captain which team they are', async () => {
    const { root } = view(await room('ua', 'A'));

    expect(root.querySelector('.role')!.textContent).toBe('You are Captain A');
  });

  it('tells a spectator they are watching', async () => {
    const { root } = view(await room('us', null));

    expect(root.querySelector('.role')!.textContent).toBe('You are watching');
  });

  it('explains how the lobby ends', async () => {
    const { root } = view(await room('ua', 'A'));

    expect(root.querySelector('.hint')!.textContent).toMatch(/both captains are ready/);
  });

  it('describes the turn in words, including blind', async () => {
    const { a } = await started();
    const { root } = view(a);

    expect(root.querySelector('.turn')!.textContent).toBe('Team A to pick maps (blind)');
  });

  it('tells the waiting captain whose turn it is', async () => {
    const { b } = await started();
    const { root } = view(b);

    expect(root.querySelector('.hint')!.textContent).toBe('Waiting for Team A\u2026');
  });

  it('shows no waiting hint on your own turn', async () => {
    const { a } = await started();
    const { root } = view(a);

    expect(root.querySelector('.hint')).toBeNull();
  });

  it('shows the timeline of all turns with the current one marked', async () => {
    const { a } = await started();
    const { root } = view(a);

    expect([root.querySelectorAll('.timeline li').length, root.querySelectorAll('.timeline li.current').length]).toEqual([2, 1]);
  });

  it('marks the turn as mine for the captain on the clock', async () => {
    const { a } = await started();
    const { root } = view(a);

    expect(root.querySelector('.turn')!.classList.contains('mine')).toBe(true);
  });

  it('marks the turn as waiting for the other captain', async () => {
    const { b } = await started();
    const { root } = view(b);

    expect(root.querySelector('.turn')!.classList.contains('waiting')).toBe(true);
  });

  it('marks an open seat in the lobby', async () => {
    const { root } = view(await room('ua', 'A'));

    expect(root.querySelector('.seat.open')).not.toBeNull();
  });

  it('marks a ready seat in the lobby', async () => {
    const r = await room('ua', 'A');
    await r.setReady(true);
    const { root } = view(r);

    expect(root.querySelectorAll('.seat.ready')).toHaveLength(1);
  });

  it('flags the selected item as pressed', async () => {
    const { a } = await started();
    const { root, dispose } = view(a);

    (root.querySelector('.items button') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 0));

    expect(root.querySelector('.items button.selected')!.getAttribute('aria-pressed')).toBe('true');
    dispose();
  });

  it('classifies history entries by action and team', async () => {
    const { a, b } = await started(makePreset([step('A', 'pick', 'maps'), step('B', 'ban', 'maps')]));
    await a.act('map-1');
    const { root } = view(b);

    expect(root.querySelector('.history li')!.className).toBe('pick team-A');
  });

  it('announces turn changes politely and keeps the countdown outside the live region', async () => {
    const { a, b } = await started();
    await a.act('map-1');
    const { root } = view(b);

    const live = root.querySelector('.turn [role=status]')!;

    expect([live.textContent, live.textContent!.includes('30')]).toEqual(['Team B to ban maps', false]);
  });

  it('updates the countdown every second without rebuilding the turn element', async () => {
    const { a, b } = await started();
    await a.act('map-1');
    let t = 1000;
    const { root, dispose } = view(b, () => t);
    const turnEl = root.querySelector('.turn')!;
    const before = root.querySelector('.timer')!.textContent;

    t += 5000;
    await new Promise((r) => setTimeout(r, 1100));

    expect([root.querySelector('.turn') === turnEl, root.querySelector('.timer')!.textContent === before]).toEqual([true, false]);
    dispose();
  });

  it('shows an image on items that have one', async () => {
    const preset = makePreset([step('A', 'ban', 'maps')]);
    preset.pools.maps.items[0].image = 'https://x.test/m.png';
    const { a } = await started(preset);
    const { root } = view(a);

    expect(root.querySelector('.items img')?.getAttribute('src')).toBe('https://x.test/m.png');
  });

  it('shows a placeholder when an item image fails to load', async () => {
    const preset = makePreset([step('A', 'ban', 'maps')]);
    preset.pools.maps.items[0].image = 'https://x.test/m.png';
    const { a } = await started(preset);
    const { root } = view(a);

    root.querySelector('.items img')!.dispatchEvent(new Event('error'));

    expect(root.querySelector('.items .icon-fallback')).not.toBeNull();
  });

  it('shows the icon of a banned item in the history', async () => {
    const preset = makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps')]);
    preset.pools.maps.items[0].image = 'https://x.test/m.png';
    const { a, b } = await started(preset);
    await a.act(preset.pools.maps.items[0].id);
    const { root } = view(b);

    expect(root.querySelector('.history img')?.getAttribute('src')).toBe('https://x.test/m.png');
  });

  const withSize = async (size?: 'small' | 'large') => {
    const preset = makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps')]);
    preset.pools.maps.items[0].image = 'https://x.test/m.png';
    if (size) preset.pools.maps.iconSize = size;
    const { a } = await started(preset);
    return { a, preset };
  };

  it('renders pool buttons with the large tile and icon classes', async () => {
    const { a } = await withSize('large');
    const { root } = view(a);

    expect([root.querySelector('.items button')!.classList.contains('tile-large'), root.querySelector('.items img')!.classList.contains('icon-large')]).toEqual([true, true]);
  });

  it('renders medium when the pool sets no size', async () => {
    const { a } = await withSize();
    const { root } = view(a);

    expect(root.querySelector('.items img')!.classList.contains('icon-medium')).toBe(true);
  });

  it('renders the large icon in the history too', async () => {
    const { a, preset } = await withSize('large');
    await a.act(preset.pools.maps.items[0].id);
    const { root } = view(a);

    expect(root.querySelector('.history img')!.classList.contains('icon-large')).toBe(true);
  });

  it('shows the side images on the choose buttons', async () => {
    const preset = makePreset([step('A', 'choose', 'side'), step('B', 'ban', 'maps')], { tagging: { ...sideTagging(), images: { nato: 'https://x.test/n.png', pact: 'https://x.test/p.png' } } });
    const { a } = await started(preset);
    const { root } = view(a);

    expect([...root.querySelectorAll('.items img')].map((i) => i.getAttribute('src'))).toEqual(['https://x.test/n.png', 'https://x.test/p.png']);
  });

  it('lets a long label stay in the button text', async () => {
    const preset = makePreset([step('A', 'ban', 'maps')]);
    preset.pools.maps.items[0].name = 'Territorialkommando S\u00fcd';
    const { a } = await started(preset);
    const { root } = view(a);

    expect(root.querySelector('.items button')!.textContent).toBe('Territorialkommando S\u00fcd');
  });
});

describe('seat choice', () => {
  const setup = async (taken: ('A' | 'B')[] = []) => {
    const { store } = memoryDraftStore();
    const preset = makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps')]);
    const mk = (uid: string) => new Room({ store, roomId: 'r', preset, uid, now: () => 1000 });
    for (const t of taken) await mk('u' + t).open(t);
    const visitor = mk('visitor');
    await visitor.open(null);
    const root = document.createElement('div');
    mountRoom(root, visitor);
    return { root, visitor };
  };
  const takeButtons = (root: HTMLElement) => [...root.querySelectorAll('.seat-card button.take')].map((b) => b.closest('.seat-card')!.querySelector('h3')!.textContent);
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const press = (root: HTMLElement, label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === label)!.click();

  it('offers a Take seat button on each open seat card', async () => {
    const { root } = await setup();

    expect(takeButtons(root)).toEqual(['Team A', 'Team B']);
  });

  it('offers no Take seat button on a taken seat and shows its owner', async () => {
    const { root } = await setup(['A']);

    expect([takeButtons(root), root.querySelector('.seat-card.team-A .seat-status')!.textContent]).toEqual([['Team B'], 'Team A']);
  });

  it('claims the chosen seat', async () => {
    const { root, visitor } = await setup();

    root.querySelector<HTMLButtonElement>('.seat-card.team-B button.take')!.click();
    await flush();

    expect(visitor.role).toBe('B');
  });

  it('joins with the typed name', async () => {
    const { root, visitor } = await setup();
    root.querySelector<HTMLInputElement>('form.name input')!.value = 'Ada';

    root.querySelector<HTMLButtonElement>('.seat-card.team-A button.take')!.click();
    await flush();

    expect(visitor.state!.teams.A.name).toBe('Ada');
  });

  it('hides the seat buttons and the name field after Watch and keeps the viewer a spectator', async () => {
    const { root, visitor } = await setup();

    press(root, 'Watch');

    expect([takeButtons(root), root.querySelector<HTMLElement>('form.name')!.hidden, visitor.role]).toEqual([[], true, 'spec']);
  });

  it('lets a watcher go back to choosing a seat in the lobby', async () => {
    const { root } = await setup();
    press(root, 'Watch');

    press(root, 'Choose a seat');

    expect(takeButtons(root)).toEqual(['Team A', 'Team B']);
  });

  it('shows no Take seat buttons to a seated captain', async () => {
    const { root, visitor } = await setup();
    await visitor.claim('A');

    expect(takeButtons(root)).toEqual([]);
  });

  it('shows the choice again after a captain leaves the seat', async () => {
    const { root, visitor } = await setup();
    await visitor.claim('A');

    press(root, 'Leave seat');
    await flush();

    expect(takeButtons(root)).toEqual(['Team A', 'Team B']);
  });
});

describe('captain name form', () => {
  const seated = async (want: 'A' | null) => {
    const { store } = memoryDraftStore();
    const room = new Room({ store, roomId: 'r', preset: makePreset([step('A', 'ban', 'maps')]), uid: 'ua', now: () => 1000 });
    await room.open(want);
    const root = document.createElement('div');
    mountRoom(root, room);
    return { room, root, form: root.querySelector('form')!, input: root.querySelector('form.name input')! as HTMLInputElement };
  };

  it('is shown empty to a visitor choosing a seat', async () => {
    const { form, input } = await seated(null);

    expect([form.hidden, input.value]).toEqual([false, '']);
  });

  it('is shown to a seated captain with the current name', async () => {
    const { form, input } = await seated('A');

    expect([form.hidden, input.value]).toEqual([false, 'Team A']);
  });

  it('has no Set name button', async () => {
    const { root } = await seated('A');

    expect([...root.querySelectorAll('button')].some((b) => b.textContent === 'Set name')).toBe(false);
  });

  it('renames the seat when the field changes', async () => {
    const { room, input } = await seated('A');
    input.value = 'Ada';

    input.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));

    expect(room.state!.teams.A.name).toBe('Ada');
  });

  it('keeps what the captain is typing across live updates', async () => {
    const { room, input } = await seated('A');
    input.value = 'Ad';

    await room.setReady(true);

    expect(input.value).toBe('Ad');
  });
});

describe('lobby card', () => {
  const lobby = async (link = 'http://h/#room/r/p') => {
    const { store } = memoryDraftStore();
    const preset = makePreset([step('A', 'ban', 'maps', { timer: 60 }), step('B', 'pick', 'maps', { timer: 60 })]);
    const room = new Room({ store, roomId: 'r', preset, uid: 'ua', now: () => 1000 });
    await room.open('A');
    const root = document.createElement('div');
    mountRoom(root, room, () => 1000, link);
    return { room, root };
  };

  it('shows the room state with the ready count', async () => {
    const { room, root } = await lobby();
    await room.setReady(true);

    expect(root.querySelector('.room-state')!.textContent).toBe('Waiting for captains \u00b7 1/2 ready');
  });

  it('keeps the start rule in the status area', async () => {
    const { root } = await lobby();

    expect(root.querySelector('.room-head .hint')!.textContent).toMatch(/both captains are ready/);
  });

  it('shows the share link', async () => {
    const { root } = await lobby('http://h/#room/r/p');

    expect(root.querySelector<HTMLInputElement>('.share input')!.value).toBe('http://h/#room/r/p');
  });

  it('describes the preset under its title', async () => {
    const { root } = await lobby();

    expect(root.querySelector('.preset-summary')!.textContent).toBe('2 steps \u00b7 1 ban \u00b7 1 pick \u00b7 maps \u00b7 ~2 min');
  });

  it('hides the share link once the draft has started', async () => {
    const { room, root } = await lobby();
    const other = new Room({ store: (room as unknown as { d: { store: never } }).d.store, roomId: 'r', preset: room.state!.preset, uid: 'ub', now: () => 1000 });
    await other.open('B');
    await room.setReady(true);
    await other.setReady(true);

    expect(root.querySelector<HTMLElement>('.share')!.hidden).toBe(true);
  });
});