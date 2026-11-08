// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountBuilder } from '../src/builder/view';
import { addPool, importItems, mirrorLastStep, newPreset, parseItemList, repeatLastStep } from '../src/builder/edit';
import { poolSummary, stepSummary } from '../src/builder/summary';
import type { Preset } from '../src/model';

const flush = () => new Promise((r) => setTimeout(r, 0));
const byLabel = (root: HTMLElement, label: string) => root.querySelector(`[aria-label="${label}"]`) as HTMLElement;
const click = (root: HTMLElement, label: string) => byLabel(root, label).click();
const clickText = (root: HTMLElement, text: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === text)!.click();

const bigPreset = (n: number): Preset => {
  const p = newPreset();
  p.pools.items.items = Array.from({ length: n }, (_, i) => ({ id: `i${i}`, name: `Item ${i}`, tags: i === 0 ? { side: 'nato' } : undefined }));
  return p;
};

const mount = (p: Preset) => {
  const root = document.createElement('div');
  const b = mountBuilder(root, p);
  return { root, b };
};

describe('collapsible pools', () => {
  it('renders no item rows until a pool is expanded', () => {
    const { root } = mount(bigPreset(130));

    expect(root.querySelectorAll('.items-table .row.item')).toHaveLength(0);
  });

  it('shows the pool name and item count in the header', () => {
    const { root } = mount(bigPreset(42));

    expect(root.querySelector('.pool-toggle')!.textContent).toContain('items \u00b7 42 items');
  });

  it('keeps only one pool open at a time', () => {
    const { root } = mount(addPool(newPreset(), 'extra'));
    click(root, 'Expand pool items');

    click(root, 'Expand pool extra');

    expect([...root.querySelectorAll('.pool.open')].map((s) => s.querySelector('.pool-toggle')!.getAttribute('aria-label'))).toEqual(['Collapse pool extra']);
  });

  it('shows at most 50 rows and loads more on request', () => {
    const { root } = mount(bigPreset(130));
    click(root, 'Expand pool items');
    const first = root.querySelectorAll('.items-table .row.item').length;

    clickText(root, 'Show 50 more (80 left)');

    expect([first, root.querySelectorAll('.items-table .row.item').length]).toEqual([50, 100]);
  });

  it('filters rows by name without re-rendering the field', () => {
    const { root } = mount(bigPreset(130));
    click(root, 'Expand pool items');
    const filter = byLabel(root, 'Filter items items') as HTMLInputElement;

    filter.value = 'Item 12';
    filter.dispatchEvent(new Event('input'));

    expect([root.querySelectorAll('.items-table .row.item').length, byLabel(root, 'Filter items items') === filter]).toEqual([11, true]);
  });

  it('shows tags as chips, not raw text', () => {
    const { root } = mount(bigPreset(3));
    click(root, 'Expand pool items');

    expect(root.querySelector('.items-table .tag-chip')!.textContent).toBe('side: nato');
  });

  it('edits only one row at a time', () => {
    const { root } = mount(bigPreset(3));
    click(root, 'Expand pool items');
    click(root, 'Edit items item 1');

    click(root, 'Edit items item 2');

    expect([...root.querySelectorAll('.row.item.editing')]).toHaveLength(1);
    expect(byLabel(root, 'items item 2 id')).not.toBeNull();
  });

  it('edits the image link of the open row', async () => {
    const { root, b } = mount(bigPreset(2));
    click(root, 'Expand pool items');
    click(root, 'Edit items item 1');
    const url = byLabel(root, 'items item 1 image link') as HTMLInputElement;

    url.value = 'https://x.test/a.png';
    url.dispatchEvent(new Event('change'));
    await flush();

    expect(b.get().pools.items.items[0].image).toBe('https://x.test/a.png');
  });

  it('opens the pool when Paste list is pressed in the header', () => {
    const { root } = mount(bigPreset(2));

    clickText(root, 'Paste list');

    expect(byLabel(root, 'items items list')).not.toBeNull();
  });

  it('offers Import and Export in the pool header', () => {
    const { root } = mount(bigPreset(2));

    expect([...root.querySelectorAll('.pool-actions button')].map((b) => b.textContent)).toEqual(['Paste list', 'Import', 'Export', '']);
  });
});

describe('collapsed steps', () => {
  it('shows a one-line summary and no fields until the step is opened', () => {
    const p = newPreset();
    p.steps = [{ team: 'B', action: 'ban', pool: 'items', count: 1, timer: 30 }];
    const { root } = mount(p);

    expect([root.querySelector('.step-summary')!.textContent, root.querySelector('.step-edit')]).toEqual(['#1 \u00b7 Team B \u00b7 ban 1 from items \u00b7 30s', null]);
  });

  it('opens the fields when the summary is clicked', () => {
    const { root } = mount(newPreset());

    click(root, 'Edit step 1');

    expect(root.querySelector('.step-edit')).not.toBeNull();
  });

  it('places Steps before Pools', () => {
    const { root } = mount(newPreset());

    expect([...root.querySelectorAll('.builder-main > h3')].map((h) => h.textContent)).toEqual(['General', 'Steps', 'Pools']);
  });

  it('mirrors the last step with the teams swapped', async () => {
    const { root, b } = mount(newPreset());
    const before = b.get().steps.length;

    clickText(root, 'Mirror');

    expect(b.get().steps.slice(before).map((s) => s.team)).toEqual([b.get().steps[before - 1].team === 'A' ? 'B' : 'A']);
  });

  it('repeats the last step N times', () => {
    const { root, b } = mount(newPreset());
    const before = b.get().steps.length;

    clickText(root, 'Repeat \u00d7N');

    expect(b.get().steps.length).toBe(before + 4);
  });

  it('highlights the step row under a hovered chip', () => {
    const { root } = mount(newPreset());

    root.querySelector('.order .chip')!.dispatchEvent(new Event('mouseenter'));

    expect(root.querySelector('ol.steps > li')!.classList.contains('hover')).toBe(true);
  });
});

describe('item import and step repeat edits', () => {
  it('parses a JSON array of items', () => {
    expect(parseItemList('[{"id":"a","name":"A","tags":{"side":"x"}}]')).toEqual([{ id: 'a', name: 'A', tags: { side: 'x' } }]);
  });

  it('parses CSV with a quoted tags column', () => {
    expect(parseItemList('a,Alpha,"side=x, tier=1",https://x.test/a.png')).toEqual([{ id: 'a', name: 'Alpha', tags: { side: 'x', tier: '1' }, image: 'https://x.test/a.png' }]);
  });

  it('skips imported ids already in the pool', () => {
    const p = importItems(newPreset(), 'items', `${newPreset().pools.items.items[0].id},Dup\nnew,New`);

    expect(p.pools.items.items.map((i) => i.id)).toEqual([...newPreset().pools.items.items.map((i) => i.id), 'new']);
  });

  it('leaves steps alone when there is nothing to repeat or mirror', () => {
    const p = { ...newPreset(), steps: [] };

    expect([repeatLastStep(p, 3), mirrorLastStep(p)]).toEqual([p, p]);
  });

  it('summarises a blind random pick', () => {
    expect(stepSummary({ team: 'A', action: 'pick', pool: 'maps', count: 2, blind: true, random: true }, 3)).toBe('#4 \u00b7 Team A \u00b7 pick 2 from maps \u00b7 blind \u00b7 random');
  });

  it('uses the singular for one item in the pool header', () => {
    expect(poolSummary('maps', { items: [{ id: 'a', name: 'A' }] })).toBe('maps \u00b7 1 item');
  });
});
