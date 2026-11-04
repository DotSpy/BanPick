import { describe, expect, it } from 'vitest';
import { parsePresetJson, validatePreset } from '../src/schema';

/** A fresh valid preset on every call. */
const warnoLike = (): any => ({
  version: 1,
  name: 'WARNO 1v1',
  tagging: { assignment: 'chosen', tag: 'side', values: ['nato', 'pact'], sameTag: 'forbid' },
  pools: {
    maps: { items: [{ id: 'm1', name: 'Hill', image: 'https://x.test/a.png' }, { id: 'm2', name: 'Lake' }, { id: 'm3', name: 'Town' }] },
    divisions: { scope: 'perTeam', items: [{ id: 'cav', name: '1 CAV', tags: { side: 'nato' } }, { id: 'gd', name: 'GD', tags: { side: 'pact' } }] },
  },
  steps: [
    { team: 'A', action: 'choose', tag: 'side' },
    { team: 'A', action: 'ban', pool: 'maps', count: 1, timer: 30 },
    { team: 'B', action: 'pick', pool: 'maps', blind: true },
    { team: 'A', action: 'pick', pool: 'divisions', restrict: 'tag' },
  ],
  pauses: { between: false },
});

/** Paths of all errors after applying `change` to a valid preset. */
const errorPaths = (change: (p: any) => void): string[] => {
  const p = warnoLike();
  change(p);
  const r = validatePreset(p);
  return r.ok ? [] : r.errors.map((e) => e.path);
};

describe('valid presets', () => {
  it('accepts a preset using every feature', () => {
    expect(validatePreset(warnoLike()).ok).toBe(true);
  });

  it('defaults step count to 1', () => {
    const r = validatePreset(warnoLike());

    expect(r.ok && r.preset.steps[2].count).toBe(1);
  });

  it("defaults reveal of a blind step to 'end'", () => {
    const r = validatePreset(warnoLike());

    expect(r.ok && r.preset.steps[2].reveal).toBe('end');
  });

  it('defaults pauses to off', () => {
    const p = warnoLike();
    delete p.pauses;

    const r = validatePreset(p);

    expect(r.ok && r.preset.pauses).toEqual({ between: false });
  });

  it('accepts a preset without tags', () => {
    const r = validatePreset({
      version: 1,
      name: 'Captains Mode',
      tagging: { assignment: 'none' },
      pools: { heroes: { items: [{ id: 'a', name: 'Axe' }, { id: 'b', name: 'Lina' }] } },
      steps: [{ team: 'A', action: 'ban', pool: 'heroes', count: 2 }],
    });

    expect(r.ok).toBe(true);
  });

  it('accepts fixed tags with seats', () => {
    const paths = errorPaths((p) => {
      p.tagging = { assignment: 'fixed', tag: 'side', values: ['nato', 'pact'], sameTag: 'forbid', seats: { A: 'nato', B: 'pact' } };
      p.steps.shift();
    });

    expect(paths).toEqual([]);
  });
});

describe('error reporting', () => {
  it('reports invalid JSON text', () => {
    const r = parsePresetJson('{nope');

    expect(!r.ok && r.errors[0].message).toMatch(/invalid JSON/);
  });

  it('parses valid JSON text', () => {
    expect(parsePresetJson(JSON.stringify(warnoLike())).ok).toBe(true);
  });

  it('names the failing field by path', () => {
    const p = warnoLike();
    p.steps[1].pool = 'nope';

    const r = validatePreset(p);

    expect(!r.ok && r.errors).toContainEqual({ path: 'steps[1].pool', message: 'unknown pool "nope"' });
  });

  it('reports several errors at once', () => {
    expect(errorPaths((p) => { p.steps[1].pool = 'nope'; p.name = ''; }).length).toBeGreaterThanOrEqual(2);
  });

  it('rejects non-object input', () => {
    expect(validatePreset(null).ok).toBe(false);
  });
});

describe('structure', () => {
  it.each([
    ['wrong version', (p: any) => (p.version = 2)],
    ['no steps', (p: any) => (p.steps = [])],
    ['empty pool', (p: any) => (p.pools.maps.items = [])],
    ['empty name', (p: any) => (p.name = ' ')],
    ['non-integer count', (p: any) => (p.steps[1].count = 1.5)],
    ['zero timer', (p: any) => (p.steps[1].timer = 0)],
    ['unknown scope', (p: any) => (p.pools.maps.scope = 'everyone')],
  ])('rejects %s', (_, change) => {
    expect(errorPaths(change).length).toBeGreaterThan(0);
  });

  it('rejects duplicate item ids in a pool', () => {
    expect(errorPaths((p) => (p.pools.maps.items[1].id = 'm1'))).toContain('pools.maps.items[1].id');
  });

  it('rejects a step on an unknown pool', () => {
    expect(errorPaths((p) => (p.steps[1].pool = 'nope'))).toContain('steps[1].pool');
  });

  it('rejects a count larger than the pool', () => {
    expect(errorPaths((p) => (p.steps[1].count = 4))).toContain('steps[1].count');
  });

  it('requires a pool for pick and ban', () => {
    expect(errorPaths((p) => delete p.steps[1].pool)).toContain('steps[1].pool');
  });

  it.each([
    ['timed', 10],
    ['ready', 'ready'],
  ])('accepts a %s pause', (_, pause) => {
    expect(errorPaths((p) => (p.steps[1].pause = pause))).toEqual([]);
  });

  it.each([0, -1, 1.5, 'later'])('rejects pause %s', (pause) => {
    expect(errorPaths((p) => (p.steps[1].pause = pause)).length).toBeGreaterThan(0);
  });
});

describe('image links', () => {
  it.each(['http://x.test/a.png', 'not a url', 'javascript:alert(1)', 'data:image/png;base64,AAAA'])('rejects %s', (url) => {
    expect(errorPaths((p) => (p.pools.maps.items[0].image = url))).toContain('pools.maps.items[0].image');
  });

  it('accepts an https URL', () => {
    expect(errorPaths((p) => (p.pools.maps.items[0].image = 'https://cdn.test/x.webp'))).toEqual([]);
  });
});

describe('tagging', () => {
  it.each(['tag', 'values'])('chosen assignment requires %s', (field) => {
    expect(errorPaths((p) => (p.tagging = { assignment: 'chosen' }))).toContain(`tagging.${field}`);
  });

  it('fixed assignment requires seats', () => {
    expect(errorPaths((p) => (p.tagging = { assignment: 'fixed', tag: 'side', values: ['nato', 'pact'] }))).toContain('tagging.seats');
  });

  it('fixed seat values must be listed in values', () => {
    const paths = errorPaths((p) => (p.tagging = { assignment: 'fixed', tag: 'side', values: ['nato', 'pact'], seats: { A: 'x', B: 'pact' } }));

    expect(paths).toContain('tagging.seats.A');
  });

  it('fixed seats must differ when sameTag is forbid', () => {
    const paths = errorPaths(
      (p) => (p.tagging = { assignment: 'fixed', tag: 'side', values: ['nato', 'pact'], sameTag: 'forbid', seats: { A: 'nato', B: 'nato' } }),
    );

    expect(paths).toContain('tagging.seats');
  });

  it('tag values must be unique', () => {
    expect(errorPaths((p) => (p.tagging.values = ['nato', 'nato']))).toContain('tagging.values');
  });

  it('item tag values must be listed in tagging.values', () => {
    expect(errorPaths((p) => (p.pools.divisions.items[0].tags.side = 'mars'))).toContain('pools.divisions.items[0].tags.side');
  });
});

describe('step rules', () => {
  it('choose needs assignment "chosen"', () => {
    expect(errorPaths((p) => (p.tagging = { assignment: 'none' }))).toContain('steps[0].action');
  });

  it('choose must name the tagging tag', () => {
    expect(errorPaths((p) => (p.steps[0].tag = 'faction'))).toContain('steps[0].tag');
  });

  it('choose cannot have a pool', () => {
    expect(errorPaths((p) => (p.steps[0].pool = 'maps'))).toContain('steps[0].pool');
  });

  it('choose must have count 1', () => {
    expect(errorPaths((p) => (p.steps[0].count = 2))).toContain('steps[0].count');
  });

  it('restrict needs a tag assignment', () => {
    const paths = errorPaths((p) => {
      p.tagging = { assignment: 'none' };
      p.steps.shift();
    });

    expect(paths).toContain('steps[2].restrict');
  });

  it('blind is only allowed on pick', () => {
    expect(errorPaths((p) => (p.steps[1].blind = true))).toContain('steps[1].blind');
  });

  it('reveal needs blind', () => {
    expect(errorPaths((p) => (p.steps[3].reveal = 'end'))).toContain('steps[3].reveal');
  });

  it('reveal may be a later step index', () => {
    expect(errorPaths((p) => (p.steps[2].reveal = 3))).toEqual([]);
  });

  it.each([2, 1, 4])('rejects reveal index %s (not after the step, or past the last step)', (index) => {
    expect(errorPaths((p) => (p.steps[2].reveal = index))).toContain('steps[2].reveal');
  });
});
