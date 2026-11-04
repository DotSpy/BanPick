// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { applyPick } from '../src/draft';
import { timeline } from '../src/timeline';
import { makePreset, started, step } from './fixtures';

const chips = (el: HTMLElement) => [...el.querySelectorAll('li')];
const classes = (el: HTMLElement) => chips(el).map((c) => c.className);

describe('timeline preview (no draft state)', () => {
  it('shows one chip per turn, expanding step counts', () => {
    const preset = makePreset([step('A', 'ban', 'maps', { count: 2 }), step('B', 'pick', 'maps')]);

    expect(chips(timeline(preset))).toHaveLength(3);
  });

  it('labels each chip with team, action and target', () => {
    const el = timeline(makePreset([step('B', 'pick', 'maps')]));

    expect(el.querySelector('li')!.textContent).toContain('B');
    expect(el.querySelector('li')!.textContent).toContain('PICK');
    expect(el.querySelector('li')!.textContent).toContain('maps');
  });

  it('marks every turn as upcoming', () => {
    const el = timeline(makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps')]));

    expect(classes(el).every((c) => c.includes('upcoming'))).toBe(true);
  });

  it('shows timer and blind flags', () => {
    const el = timeline(makePreset([step('A', 'pick', 'maps', { timer: 30, blind: true })]));

    expect(el.querySelector('.tl-meta')!.textContent).toBe('30s \u00b7 blind');
  });

  it('puts a pause chip before the turn it precedes', () => {
    const el = timeline(makePreset([step('A', 'ban', 'maps', { pause: 20 })]));

    expect(chips(el).map((c) => c.textContent)).toEqual([expect.stringContaining('Pause 20s'), expect.stringContaining('BAN')]);
  });

  it('describes a ready pause as waiting for captains', () => {
    const el = timeline(makePreset([step('A', 'ban', 'maps', { pause: 'ready' })]));

    expect(el.querySelector('.pause')!.textContent).toContain('Pause until ready');
  });
});

describe('timeline during a draft', () => {
  const preset = () => makePreset([step('A', 'ban', 'maps'), step('B', 'ban', 'maps'), step('A', 'pick', 'maps')]);

  it('marks done, current and upcoming turns', () => {
    const s = started(preset());
    applyPick(s, 'A', 'map-1', 0, false);

    expect(classes(timeline(s.preset, s)).map((c) => c.split(' ').pop())).toEqual(['done', 'current', 'upcoming']);
  });

  it('shows who acted and what was banned', () => {
    const s = started(preset());
    s.teams.A.name = 'Ada';
    applyPick(s, 'A', 'map-1', 0, false);

    expect(chips(timeline(s.preset, s))[0].title).toBe('1. Ada ban maps: map-1');
  });

  it('flags the current turn with aria-current', () => {
    const s = started(preset());

    expect(chips(timeline(s.preset, s))[0].getAttribute('aria-current')).toBe('step');
  });

  it('marks everything done when the draft is finished', () => {
    const s = started(preset());
    applyPick(s, 'A', 'map-1', 0, false);
    applyPick(s, 'B', 'map-2', 0, false);
    applyPick(s, 'A', 'map-3', 0, false);

    expect(classes(timeline(s.preset, s)).every((c) => c.endsWith('done'))).toBe(true);
  });

  it('shows an icon for a chosen item that has an image', () => {
    const p = preset();
    p.pools.maps.items[0].image = 'https://x.test/m.png';
    const s = started(p);
    applyPick(s, 'A', 'map-1', 0, false);

    expect(timeline(s.preset, s).querySelector('img')!.getAttribute('src')).toBe('https://x.test/m.png');
  });
});

describe('timeline blind picks', () => {
  const blind = () => makePreset([step('A', 'pick', 'maps', { blind: true, reveal: 'end' }), step('B', 'pick', 'maps')]);

  it("hides the opponent's blind pick", () => {
    const s = started(blind());
    applyPick(s, 'A', 'map-1', 0, false);

    expect(chips(timeline(s.preset, s, 'B'))[0].textContent).toContain('hidden');
  });

  it('does not leak the hidden item name in the title', () => {
    const s = started(blind());
    applyPick(s, 'A', 'map-1', 0, false);

    expect(chips(timeline(s.preset, s, null))[0].title).not.toContain('map-1');
  });

  it('shows the picker their own blind pick', () => {
    const s = started(blind());
    applyPick(s, 'A', 'map-1', 0, false);

    expect(chips(timeline(s.preset, s, 'A'))[0].textContent).toContain('map-1');
  });

  it('reveals the blind pick once the draft is finished', () => {
    const s = started(blind());
    applyPick(s, 'A', 'map-1', 0, false);
    applyPick(s, 'B', 'map-2', 0, false);

    expect(chips(timeline(s.preset, s, null))[0].textContent).toContain('map-1');
  });
});

describe('timeline pause state', () => {
  it('marks a timed pause as current while the draft is paused', () => {
    const s = started(makePreset([step('A', 'ban', 'maps', { pause: 20 })]));

    expect(timeline(s.preset, s).querySelector('.pause')!.className).toContain('current');
  });
});
