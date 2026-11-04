import { describe, expect, it } from 'vitest';
import { parsePresetJson, validatePreset } from '../src/schema';

const warno = () => ({
  version: 1,
  name: 'WARNO 1v1',
  tagging: { assignment: 'chosen', tag: 'side', values: ['nato', 'pact'], sameTag: 'forbid' },
  pools: {
    maps: { items: [{ id: 'm1', name: 'Hill', image: 'https://x.test/a.png' }, { id: 'm2', name: 'Lake' }, { id: 'm3', name: 'Town' }] },
    divisions: { items: [{ id: 'cav', name: '1 CAV', tags: { side: 'nato' } }, { id: 'gd', name: 'GD', tags: { side: 'pact' } }] },
  },
  steps: [
    { team: 'A', action: 'choose', tag: 'side' },
    { team: 'A', action: 'ban', pool: 'maps', count: 1, timer: 30 },
    { team: 'B', action: 'pick', pool: 'maps', blind: true },
    { team: 'A', action: 'pick', pool: 'divisions', restrict: 'tag' },
  ],
  pauses: { between: false },
});

const errs = (p: unknown) => {
  const r = validatePreset(p);
  return r.ok ? [] : r.errors;
};
const mutate = (f: (p: any) => void) => {
  const p: any = warno();
  f(p);
  return errs(p);
};

describe('preset schema', () => {
  it('accepts a valid preset and applies defaults', () => {
    const r = validatePreset(warno());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.preset.steps[2].count).toBe(1);
      expect(r.preset.steps[2].reveal).toBe('end');
    }
  });

  it('accepts a no-tag preset (captains mode)', () => {
    const r = validatePreset({
      version: 1,
      name: 'CM',
      tagging: { assignment: 'none' },
      pools: { heroes: { items: [{ id: 'a', name: 'Axe' }, { id: 'b', name: 'Lina' }] } },
      steps: [{ team: 'A', action: 'ban', pool: 'heroes', count: 2 }],
    });
    expect(r.ok).toBe(true);
  });

  it('accepts a fixed-tag preset', () => {
    const p: any = warno();
    p.tagging = { assignment: 'fixed', tag: 'side', values: ['nato', 'pact'], sameTag: 'forbid', seats: { A: 'nato', B: 'pact' } };
    p.steps.shift();
    expect(errs(p)).toEqual([]);
  });

  it('reports JSON syntax errors', () => {
    const r = parsePresetJson('{nope');
    expect(r.ok).toBe(false);
  });

  it('reports field paths', () => {
    const e = mutate((p) => (p.steps[1].pool = 'nope'));
    expect(e).toContainEqual({ path: 'steps[1].pool', message: 'unknown pool "nope"' });
  });

  it('rejects non-https and invalid image URLs', () => {
    expect(mutate((p) => (p.pools.maps.items[0].image = 'http://x.test/a.png')).map((e) => e.path)).toContain('pools.maps.items[0].image');
    expect(mutate((p) => (p.pools.maps.items[0].image = 'not a url')).length).toBeGreaterThan(0);
    expect(mutate((p) => (p.pools.maps.items[0].image = 'javascript:alert(1)')).length).toBeGreaterThan(0);
  });

  it('rejects wrong version, empty steps, empty pool', () => {
    expect(mutate((p) => (p.version = 2)).length).toBeGreaterThan(0);
    expect(mutate((p) => (p.steps = [])).length).toBeGreaterThan(0);
    expect(mutate((p) => (p.pools.maps.items = [])).length).toBeGreaterThan(0);
  });

  it('rejects duplicate item ids', () => {
    expect(mutate((p) => (p.pools.maps.items[1].id = 'm1')).map((e) => e.path)).toContain('pools.maps.items[1].id');
  });

  it('rejects count above pool size and non-integer count', () => {
    expect(mutate((p) => (p.steps[1].count = 4)).map((e) => e.path)).toContain('steps[1].count');
    expect(mutate((p) => (p.steps[1].count = 1.5)).length).toBeGreaterThan(0);
  });

  describe('tag rules', () => {
    it('chosen/fixed need tag and values', () => {
      const e = mutate((p) => (p.tagging = { assignment: 'chosen' }));
      expect(e.map((x) => x.path)).toEqual(expect.arrayContaining(['tagging.tag', 'tagging.values']));
    });
    it('fixed needs seats within values', () => {
      expect(mutate((p) => (p.tagging = { assignment: 'fixed', tag: 'side', values: ['nato', 'pact'] })).map((e) => e.path)).toContain('tagging.seats');
      expect(
        mutate((p) => (p.tagging = { assignment: 'fixed', tag: 'side', values: ['nato', 'pact'], seats: { A: 'x', B: 'pact' } })).map((e) => e.path),
      ).toContain('tagging.seats.A');
    });
    it('fixed with sameTag forbid rejects equal seats', () => {
      expect(
        mutate((p) => (p.tagging = { assignment: 'fixed', tag: 'side', values: ['nato', 'pact'], sameTag: 'forbid', seats: { A: 'nato', B: 'nato' } })).map((e) => e.path),
      ).toContain('tagging.seats');
    });
    it('choose step needs chosen assignment and matching tag', () => {
      expect(mutate((p) => (p.tagging = { assignment: 'none' })).map((e) => e.path)).toContain('steps[0].action');
      expect(mutate((p) => (p.steps[0].tag = 'faction')).map((e) => e.path)).toContain('steps[0].tag');
    });
    it('item tag values must be in tagging.values', () => {
      expect(mutate((p) => (p.pools.divisions.items[0].tags.side = 'mars')).map((e) => e.path)).toContain('pools.divisions.items[0].tags.side');
    });
    it('restrict needs tagging and a pick', () => {
      expect(mutate((p) => { p.tagging = { assignment: 'none' }; p.steps.shift(); }).map((e) => e.path)).toContain('steps[2].restrict');
      expect(mutate((p) => (p.steps[1].restrict = 'tag')).map((e) => e.path)).toContain('steps[1].restrict');
    });
  });

  describe('blind and reveal', () => {
    it('blind only on pick', () => {
      expect(mutate((p) => (p.steps[1].blind = true)).map((e) => e.path)).toContain('steps[1].blind');
    });
    it('reveal needs blind', () => {
      expect(mutate((p) => (p.steps[3].reveal = 'end')).map((e) => e.path)).toContain('steps[3].reveal');
    });
    it('reveal index must be after the step and in range', () => {
      expect(mutate((p) => (p.steps[2].reveal = 3)).length).toBe(0);
      expect(mutate((p) => (p.steps[2].reveal = 2)).map((e) => e.path)).toContain('steps[2].reveal');
      expect(mutate((p) => (p.steps[2].reveal = 4)).map((e) => e.path)).toContain('steps[2].reveal');
    });
  });
});
