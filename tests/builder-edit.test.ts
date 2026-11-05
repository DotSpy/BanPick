import { describe, expect, it } from 'vitest';
import {
  addItem, addPool, addStep, formatTags, moveStep, newPreset, parseTags, removePool, removeStep,
  setPoolIconSize, setPoolScope, setTagImage, setTagging, updateItem, updateStep,
} from '../src/builder/edit';
import { validatePreset } from '../src/schema';
import type { Preset } from '../src/model';

const withBlind = (): Preset => {
  const p = newPreset();
  p.steps = [
    { team: 'A', action: 'pick', pool: 'items', count: 1, blind: true, reveal: 2 },
    { team: 'B', action: 'ban', pool: 'items', count: 1 },
    { team: 'A', action: 'ban', pool: 'items', count: 1 },
  ];
  return p;
};

describe('builder edit: immutability', () => {
  it('does not mutate the input preset', () => {
    const p = newPreset();
    const before = JSON.stringify(p);

    addStep(p);

    expect(JSON.stringify(p)).toBe(before);
  });
});

describe('builder edit: new preset', () => {
  it('is valid', () => {
    expect(validatePreset(newPreset()).ok).toBe(true);
  });
});

describe('builder edit: pools', () => {
  it('adds a pool', () => {
    expect(Object.keys(addPool(newPreset(), 'maps').pools)).toContain('maps');
  });

  it('removing a pool also removes steps that used it', () => {
    const p = removePool(addPool(newPreset(), 'maps'), 'items');

    expect(p.steps).toEqual([]);
  });

  it('sets pool scope', () => {
    expect(setPoolScope(newPreset(), 'items', 'exclusive').pools.items.scope).toBe('exclusive');
  });

  it('adds an item', () => {
    const p = addItem(newPreset(), 'items', { id: 'x', name: 'X' });

    expect(p.pools.items.items.map((i) => i.id)).toContain('x');
  });

  it('drops an emptied image field', () => {
    const p = updateItem(newPreset(), 'items', 0, { image: '' });

    expect('image' in p.pools.items.items[0]).toBe(false);
  });

  it('drops empty tags', () => {
    const p = updateItem(newPreset(), 'items', 0, { tags: {} });

    expect('tags' in p.pools.items.items[0]).toBe(false);
  });
});

describe('builder edit: tags text', () => {
  it('parses key=value pairs', () => {
    expect(parseTags('side=nato, nation=US')).toEqual({ side: 'nato', nation: 'US' });
  });

  it('ignores incomplete pairs', () => {
    expect(parseTags('side=, =x, ok=1')).toEqual({ ok: '1' });
  });

  it('round-trips through format', () => {
    expect(parseTags(formatTags({ a: '1', b: '2' }))).toEqual({ a: '1', b: '2' });
  });
});

describe('builder edit: steps', () => {
  it('adds a ban step on the first pool', () => {
    const p = addStep(newPreset(), 'B');

    expect(p.steps[1]).toEqual({ team: 'B', action: 'ban', pool: 'items', count: 1 });
  });

  it('turning a step into choose sets the tag and removes the pool', () => {
    const p0 = setTagging(newPreset(), { assignment: 'chosen', tag: 'side', values: ['nato', 'pact'], forbid: true } as Preset['tagging']);

    const p = updateStep(p0, 0, { action: 'choose' });

    expect(p.steps[0]).toMatchObject({ action: 'choose', tag: 'side' });
    expect('pool' in p.steps[0]).toBe(false);
  });

  it('turning blind off removes reveal', () => {
    const p = updateStep(withBlind(), 0, { blind: false });

    expect('reveal' in p.steps[0]).toBe(false);
  });

  it('turning blind on defaults reveal to end', () => {
    const p = updateStep(newPreset(), 0, { action: 'pick', blind: true });

    expect(p.steps[0].reveal).toBe('end');
  });

  it('removing a step shifts later reveal indices', () => {
    const p = removeStep(withBlind(), 1);

    expect(p.steps[0].reveal).toBe(1);
  });

  it('removing the revealed step falls back to end', () => {
    const p = removeStep(withBlind(), 2);

    expect(p.steps[0].reveal).toBe('end');
  });

  it('moving the revealed step updates the reveal index', () => {
    const p = moveStep(withBlind(), 2, 1);

    expect(p.steps[0].reveal).toBe(1);
  });

  it('moving out of range returns the same preset', () => {
    const p = withBlind();

    expect(moveStep(p, 0, 9)).toBe(p);
  });
});

describe('setPoolIconSize', () => {
  it('sets the size on the pool without touching the original', () => {
    const p = newPreset();

    const next = setPoolIconSize(p, 'items', 'large');

    expect([next.pools.items.iconSize, p.pools.items.iconSize]).toEqual(['large', undefined]);
  });
});

describe('setTagImage', () => {
  const tagged = (): Preset => ({ ...newPreset(), tagging: { assignment: 'chosen', tag: 'side', values: ['nato', 'pact'] } });

  it('sets the image of one value', () => {
    expect(setTagImage(tagged(), 'nato', 'https://x.test/n.png').tagging.images).toEqual({ nato: 'https://x.test/n.png' });
  });

  it('removes the image and the empty map when the link is cleared', () => {
    const withImage = setTagImage(tagged(), 'nato', 'https://x.test/n.png');

    expect(setTagImage(withImage, 'nato', '  ').tagging.images).toBeUndefined();
  });

  it('keeps other values images', () => {
    const one = setTagImage(tagged(), 'nato', 'https://x.test/n.png');

    expect(setTagImage(one, 'pact', 'https://x.test/p.png').tagging.images).toEqual({ nato: 'https://x.test/n.png', pact: 'https://x.test/p.png' });
  });

  it('does not change the original preset', () => {
    const p = tagged();

    setTagImage(p, 'nato', 'https://x.test/n.png');

    expect(p.tagging.images).toBeUndefined();
  });
});
