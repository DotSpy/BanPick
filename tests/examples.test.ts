import { describe, expect, it } from 'vitest';
import { builtinPresets, presetGroups } from '../src/builtins';
import { applyPick, autoChoice, currentTurn, setReady, createState, type DraftState } from '../src/draft';
import { examplePresets } from '../src/examples';
import { availableList } from '../src/rules';

const example = (id: string) => examplePresets.find((p) => p.id === id)!.preset;
const sideOf = (s: DraftState, itemId: string) => s.preset.pools.units.items.find((i) => i.id === itemId)!.tags!.side;

/** Both captains ready at t=0, then every pending confirmation answered, so the first turn is open. */
function started(id: string): DraftState {
  const s = createState('t', example(id), { A: 'A', B: 'B' }, 0);
  s.teams.A.connected = s.teams.B.connected = true;
  setReady(s, 'A', true, 0);
  setReady(s, 'B', true, 0);
  return s;
}

describe('example presets', () => {
  it('are registered as built-ins next to the WARNO presets', () => {
    const ids = builtinPresets.map((b) => b.id);

    expect(ids).toEqual(expect.arrayContaining(['captains-mode', 'fixed-sides-blind', '1v1']));
  });
});

describe('Captains Mode', () => {
  it('alternates pick, pick, ban, ban, pick, pick between A and B', () => {
    const turns = example('captains-mode').steps.map((s) => `${s.team} ${s.action}`);

    expect(turns).toEqual(['A pick', 'B pick', 'A ban', 'B ban', 'A pick', 'B pick']);
  });

  it('waits for both captains to confirm before the first turn', () => {
    const s = started('captains-mode');

    expect(s.confirm).toEqual({ A: false, B: false });
  });

  it("offers captain A only items from A's own side", () => {
    const s = started('captains-mode');
    const turn = currentTurn(s)!;

    const sides = new Set(availableList(s, turn).map((id) => sideOf(s, id)));

    expect([...sides]).toEqual(['red']);
  });

  it("offers B's pick only B's own side", () => {
    const s = started('captains-mode');
    s.confirm = null;
    applyPick(s, 'A', 'red-1', 0, false);

    const sides = new Set(availableList(s, currentTurn(s)!).map((id) => sideOf(s, id)));

    expect([...sides]).toEqual(['blue']);
  });

  it("makes a ban remove only an item from the opponent's side", () => {
    const s = started('captains-mode');
    s.confirm = null;
    applyPick(s, 'A', 'red-1', 0, false);
    applyPick(s, 'B', 'blue-1', 0, false);

    const sides = new Set(availableList(s, currentTurn(s)!).map((id) => sideOf(s, id)));

    expect([...sides]).toEqual(['blue']);
  });

  it('rejects a pick from the other side', () => {
    const s = started('captains-mode');
    s.confirm = null;

    const error = applyPick(s, 'A', 'blue-1', 0, false);

    expect(error).not.toBeNull();
  });

  it('finishes after six turns when every turn auto-picks', () => {
    const s = started('captains-mode');
    s.confirm = null;

    for (let i = 0; i < 6; i++) applyPick(s, currentTurn(s)!.team, autoChoice(s)!, 0, true);

    expect(s.phase).toBe('done');
  });
});

describe('Fixed sides, blind picks', () => {
  it('holds each seat to its side without any choose step', () => {
    const p = example('fixed-sides-blind');

    expect([p.tagging.seats, p.steps.some((s) => s.action === 'choose')]).toEqual([{ A: 'nato', B: 'pact' }, false]);
  });

  it("offers A's blind pick only items of the nato side", () => {
    const s = started('fixed-sides-blind');

    const sides = new Set(availableList(s, currentTurn(s)!).map((id) => sideOf(s, id)));

    expect([...sides]).toEqual(['nato']);
  });

  it('marks the picks blind until the end of the draft', () => {
    const picks = example('fixed-sides-blind').steps.filter((s) => s.action === 'pick');

    expect(picks.map((s) => [s.blind, s.reveal])).toEqual([[true, 'end'], [true, 'end']]);
  });
});

describe('preset groups', () => {
  it('keeps every built-in preset in exactly one launcher group', () => {
    const grouped = presetGroups.flatMap((g) => g.presets.map((p) => p.id));

    expect(grouped.sort()).toEqual(builtinPresets.map((b) => b.id).sort());
  });
});