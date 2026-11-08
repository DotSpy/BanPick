// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { mountBuilder } from '../src/builder/view';
import { newPreset } from '../src/builder/edit';
import type { Preset } from '../src/model';

const mount = () => {
  const root = document.createElement('div');
  const builder = mountBuilder(root, newPreset());
  return { root, builder };
};

const clickButton = (root: HTMLElement, label: string) =>
  [...root.querySelectorAll('button')].find((b) => b.textContent === label)!.click();

const openStep = (root: HTMLElement, n = 1) => (root.querySelector(`[aria-label="Edit step ${n}"]`) as HTMLElement).click();
const openPool = (root: HTMLElement, name = 'items') => (root.querySelector(`[aria-label="Expand pool ${name}"]`) as HTMLElement).click();

describe('builder view', () => {
  it('renders the draft order preview', () => {
    const { root } = mount();

    expect(root.querySelectorAll('.order .chip')).toHaveLength(1);
  });

  it('labels the preset name and step timer visibly and titles the JSON section', () => {
    const { root } = mount();
    openStep(root);

    const labels = [...root.querySelectorAll('label')].map((l) => l.textContent);

    expect(labels).toEqual(expect.arrayContaining([expect.stringContaining('Preset name'), expect.stringContaining('Timer (s)')]));
    expect(root.querySelector('.json-adv summary')!.textContent).toBe('Preset JSON (advanced)');
  });

  it('adding a step grows the preview', () => {
    const { root } = mount();

    clickButton(root, 'Add step');

    expect(root.querySelectorAll('.order .chip')).toHaveLength(2);
  });

  it('shows no errors for a valid preset', () => {
    const { root } = mount();

    expect(root.querySelectorAll('.errors li')).toHaveLength(0);
  });

  it('shows validation errors when the preset becomes invalid', () => {
    const { root } = mount();

    (root.querySelector('[aria-label="Remove pool"]') as HTMLElement).click();

    expect(root.querySelectorAll('.errors li').length).toBeGreaterThan(0);
  });

  it('shows an image preview for items with an image link', () => {
    const p = newPreset();
    p.pools.items.items[0].image = 'https://x.test/a.png';
    const root = document.createElement('div');

    mountBuilder(root, p);
    openPool(root);

    expect(root.querySelector('img')?.getAttribute('src')).toBe('https://x.test/a.png');
  });

  it('replaces a broken image with the item name', () => {
    const p = newPreset();
    p.pools.items.items[0].image = 'https://x.test/a.png';
    const root = document.createElement('div');
    mountBuilder(root, p);
    openPool(root);

    root.querySelector('img')!.dispatchEvent(new Event('error'));

    expect(root.querySelector('img')).toBeNull();
  });

  it('renaming through the name input updates the preset', async () => {
    const { root, builder } = mount();
    const nameInput = root.querySelector('input')!;

    nameInput.value = 'Renamed';
    nameInput.dispatchEvent(new Event('change'));
    await flush();

    expect(builder.get().name).toBe('Renamed');
  });

  it('importing valid JSON replaces the preset', async () => {
    const { root, builder } = mount();
    const imported = { ...newPreset(), name: 'Imported' };
    const area = root.querySelector('textarea')!;

    area.value = JSON.stringify(imported);
    area.dispatchEvent(new Event('change'));
    await flush();

    expect(builder.get().name).toBe('Imported');
  });

  it('ignores imported JSON that is not a valid preset', async () => {
    const { root, builder } = mount();
    const area = root.querySelector('textarea')!;

    area.value = '{"nope":1}';
    area.dispatchEvent(new Event('change'));
    await flush();

    expect(builder.get().name).toBe('New preset');
  });

  it('saves a valid preset', () => {
    const root = document.createElement('div');
    const saved: unknown[] = [];
    mountBuilder(root, newPreset(), async (p) => (saved.push(p), { ok: true, links: [] }));

    clickButton(root, 'Save');

    expect(saved).toHaveLength(1);
  });

  it('does not offer saving an invalid preset', () => {
    const root = document.createElement('div');
    mountBuilder(root, { ...newPreset(), steps: [] }, async () => ({ ok: true, links: [] }));

    const save = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;

    expect(save.disabled).toBe(true);
  });

  it('shows the three seat links after a successful save', async () => {
    const root = document.createElement('div');
    const links = ['Captain A', 'Captain B', 'Spectator'].map((label) => ({ label, url: `http://x/#${label}` }));
    mountBuilder(root, newPreset(), async () => ({ ok: true, links }));

    clickButton(root, 'Save');
    await flush();

    expect([...root.querySelectorAll('.links input')].map((i) => (i as HTMLInputElement).value)).toEqual(links.map((l) => l.url));
  });

  it('shows the reason when saving fails', async () => {
    const root = document.createElement('div');
    mountBuilder(root, newPreset(), async () => ({ ok: false, error: 'offline' }));

    clickButton(root, 'Save');
    await flush();

    expect(root.querySelector('.status')!.textContent).toBe('Could not save: offline');
  });

  it('shows the parse error and marks the JSON box invalid when the text is not JSON', async () => {
    const { root } = mount();
    const area = root.querySelector('textarea')!;

    area.value = '{oops';
    area.dispatchEvent(new Event('change'));
    await flush();

    expect([root.querySelector('.json-error')!.textContent, root.querySelector('textarea')!.getAttribute('aria-invalid')]).toEqual([expect.stringMatching(/^Not valid JSON/), 'true']);
  });

  it('keeps the rejected text so it can be corrected', async () => {
    const { root } = mount();
    const area = root.querySelector('textarea')!;

    area.value = '{oops';
    area.dispatchEvent(new Event('change'));
    await flush();

    expect(root.querySelector('textarea')!.value).toBe('{oops');
  });

  it('lists schema problems for JSON that parses but is not a preset', async () => {
    const { root } = mount();
    const area = root.querySelector('textarea')!;

    area.value = '{"nope":1}';
    area.dispatchEvent(new Event('change'));
    await flush();

    expect(root.querySelector('.json-error')!.textContent).not.toBe('');
  });

  it('clears the JSON error once valid JSON is imported', async () => {
    const { root } = mount();
    const area = root.querySelector('textarea')!;
    area.value = '{oops';
    area.dispatchEvent(new Event('change'));
    await flush();

    root.querySelector('textarea')!.value = JSON.stringify(newPreset());
    root.querySelector('textarea')!.dispatchEvent(new Event('change'));
    await flush();

    expect(root.querySelector('.json-error')!.textContent).toBe('');
  });

  it('gives every input, select and textarea an accessible name', () => {
    const { root } = mount();

    const unnamed = [...root.querySelectorAll('input:not([type=checkbox]), select, textarea')].filter((e) => !e.getAttribute('aria-label'));

    expect(unnamed).toHaveLength(0);
  });

  it('limits count and timer to whole numbers, timer from 0 and count from 1', () => {
    const { root } = mount();
    openStep(root);

    const [count, timer] = [...root.querySelectorAll('li input[type=number]')] as HTMLInputElement[];

    expect([count.min, timer.min, count.step, timer.step]).toEqual(['1', '0', '1', '1']);
  });

  it('explains that a timer of 0 means no timer', () => {
    const { root } = mount();
    openStep(root);

    expect(root.querySelector('li input[type=number][aria-label*="0 = no timer"]')).not.toBeNull();
  });

  it('keeps keyboard focus on the same field after an edit re-renders the form', async () => {
    const root = document.createElement('div');
    document.body.append(root);
    const { builder } = { builder: mountBuilder(root, newPreset()) };
    const name = root.querySelector('input')!;
    name.focus();

    name.value = 'Renamed';
    name.dispatchEvent(new Event('change'));
    await flush();

    expect([document.activeElement?.getAttribute('aria-label'), builder.get().name]).toEqual(['Preset name', 'Renamed']);
    root.remove();
  });
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('pool icon size', () => {
  it('shows the pool size and previews item icons with it', () => {
    const p = newPreset();
    p.pools.items.iconSize = 'large';
    p.pools.items.items[0].image = 'https://x.test/a.png';
    const root = document.createElement('div');

    mountBuilder(root, p);
    openPool(root);

    expect([(root.querySelector('[aria-label="items icon size"]') as HTMLSelectElement).value, root.querySelector('.row img')!.classList.contains('icon-small')]).toEqual(['large', true]);
  });

  it('saves the chosen size into the preset', async () => {
    const root = document.createElement('div');
    const saved: Preset[] = [];
    mountBuilder(root, newPreset(), async (pr) => (saved.push(pr), { ok: true, links: [] }));
    const sel = root.querySelector('[aria-label="items icon size"]') as HTMLSelectElement;

    sel.value = 'small';
    sel.dispatchEvent(new Event('change'));
    await new Promise((r) => setTimeout(r, 0));
    [...root.querySelectorAll('button')].find((b) => /save/i.test(b.textContent ?? ''))!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect(saved[0].pools.items.iconSize).toBe('small');
  });
});

describe('tag value images', () => {
  const tagged = (images?: Record<string, string>): Preset => ({ ...newPreset(), tagging: { assignment: 'chosen', tag: 'team-color', values: ['red', 'blue'], ...(images ? { images } : {}) } });
  const mountTagged = (p: Preset) => {
    const root = document.createElement('div');
    mountBuilder(root, p);
    return root;
  };
  const field = (root: HTMLElement, value: string) => root.querySelector(`[aria-label="${value} image link"]`) as HTMLInputElement;
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('shows an image field for every value of any tag', () => {
    const root = mountTagged(tagged());

    expect([field(root, 'red') !== null, field(root, 'blue') !== null]).toEqual([true, true]);
  });

  it('shows no value section for presets without tag values', () => {
    const root = mountTagged(newPreset());

    expect(root.textContent).not.toContain('values');
  });

  it('previews the image of a value that has a link', () => {
    const root = mountTagged(tagged({ red: 'https://x.test/r.png' }));

    expect(root.querySelector('img[alt="red"]')!.getAttribute('src')).toBe('https://x.test/r.png');
  });

  it('stores a typed link in the preset', async () => {
    const root = document.createElement('div');
    const b = mountBuilder(root, tagged());
    const el = field(root, 'blue');

    el.value = 'https://x.test/b.png';
    el.dispatchEvent(new Event('change'));
    await flush();

    expect(b.get().tagging.images).toEqual({ blue: 'https://x.test/b.png' });
  });

  it('reports a non-https link as an error', async () => {
    const root = document.createElement('div');
    mountBuilder(root, tagged());
    const el = field(root, 'red');

    el.value = 'http://x.test/r.png';
    el.dispatchEvent(new Event('change'));
    await flush();

    expect(root.querySelector('.errors')!.textContent).toContain('tagging.images');
  });
});

describe('step row labels', () => {
  it('labels every field of a pick step so the controls line up', () => {
    const p = newPreset();
    p.steps = [{ team: 'A', action: 'pick', pool: 'items', count: 1 }];
    const root = document.createElement('div');

    mountBuilder(root, p);
    openStep(root);

    expect([...root.querySelectorAll('.step-edit > label.mini')].map((l) => l.firstChild!.textContent)).toEqual(['Team', 'Action', 'Pool', 'Count', 'Timer (s)', 'Blind', 'Random']);
  });

  it('leaves no unlabelled select in a step row', () => {
    const root = document.createElement('div');

    mountBuilder(root, newPreset());

    expect(root.querySelectorAll('ol li.row.labelled > select')).toHaveLength(0);
  });
});

describe('builder layout and tools', () => {
  const mountWith = (p: Preset = newPreset(), onSave?: Parameters<typeof mountBuilder>[2], templates: Parameters<typeof mountBuilder>[3] = []) => {
    const root = document.createElement('div');
    const b = mountBuilder(root, p, onSave, templates);
    return { root, b };
  };
  const byLabel = (root: HTMLElement, label: string) => root.querySelector(`[aria-label="${label}"]`) as HTMLElement;
  const fire = async (el: HTMLElement, type = 'change') => { el.dispatchEvent(new Event(type)); await flush(); };

  it('has no Preset builder heading and starts with General', () => {
    const { root } = mountWith();

    expect([...root.querySelectorAll('h2')].length + Number(root.querySelector('h3')!.textContent !== 'General')).toBe(0);
  });

  it('keeps the draft order and the raw JSON in the side panel', () => {
    const { root } = mountWith();

    expect([root.querySelector('.builder-side .order') !== null, root.querySelector('.builder-side details.json-adv') !== null]).toEqual([true, true]);
  });

  it('collapses the raw JSON by default', () => {
    const { root } = mountWith();

    expect((root.querySelector('details.json-adv') as HTMLDetailsElement).open).toBe(false);
  });

  it('keeps the raw JSON read-only until Edit raw is pressed', () => {
    const { root } = mountWith();

    clickButton(root, 'Edit raw');

    expect([(root.querySelector('textarea.json') as HTMLTextAreaElement).readOnly, root.querySelector('.json-adv .warn')!.textContent]).toEqual([false, expect.stringContaining('replaces everything')]);
  });

  it('offers a pause switch with a tooltip', () => {
    const { root } = mountWith();

    expect(root.querySelector('label.switch')!.getAttribute('title')).toBe('Both captains confirm between each step (after every pick)');
  });

  it('labels the pool selects and shows the item column headers', () => {
    const { root } = mountWith();

    expect([[...root.querySelectorAll('.pool-head .chip-select')].map((l) => l.firstChild!.textContent), root.querySelector('.pool-head .pool-toggle')!.textContent]).toEqual([['Scope:', 'Size:'], '\u25b8items \u00b7 2 items']);
  });

  it('renames a pool from its id field', async () => {
    const { root, b } = mountWith();
    openPool(root);
    const id = byLabel(root, 'items pool id') as HTMLInputElement;

    id.value = 'maps';
    await fire(id);

    expect(Object.keys(b.get().pools)).toEqual(['maps']);
  });

  it('adds many items from a pasted list', async () => {
    const { root, b } = mountWith();
    clickButton(root, 'Paste list');
    const area = byLabel(root, 'items items list') as HTMLTextAreaElement;
    area.value = 'Fox\nOwl';
    area.dispatchEvent(new Event('input'));

    clickButton(root, 'Add items');

    expect(b.get().pools.items.items.map((i) => i.id)).toEqual(['item-1', 'item-2', 'fox', 'owl']);
  });

  it('numbers step rows and names teams in the team select', () => {
    const { root } = mountWith();
    openStep(root);

    expect([root.querySelector('ol.steps .num')!.textContent, [...byLabel(root, 'Step 1 team').querySelectorAll('option')].map((o) => o.textContent)]).toEqual(['1', ['Team A', 'Team B']]);
  });

  it('duplicates a step', () => {
    const { root, b } = mountWith();

    byLabel(root, 'Duplicate step 1').click();

    expect(b.get().steps).toHaveLength(2);
  });

  it('quick fill appends alternating steps', () => {
    const { root, b } = mountWith();

    clickButton(root, 'Alternate A/B');

    expect(b.get().steps.slice(1).map((s) => s.team)).toEqual(['A', 'B', 'A', 'B']);
  });

  it('reorders steps when one is dropped on another', () => {
    const { root, b } = mountWith({ ...newPreset(), steps: [{ team: 'A', action: 'ban', pool: 'items', count: 1 }, { team: 'B', action: 'pick', pool: 'items', count: 1 }] });
    const drop = new Event('drop', { cancelable: true });
    Object.assign(drop, { clientY: 1e6, dataTransfer: { getData: () => '0' } });

    root.querySelectorAll('ol.steps > li')[1].dispatchEvent(drop);

    expect(b.get().steps.map((s) => s.action)).toEqual(['pick', 'ban']);
  });

  it('shows a warning on a step that needs more items than the pool has', () => {
    const p = newPreset();
    p.steps[0].count = 5;
    const { root } = mountWith(p);

    expect(root.querySelector('ol.steps .warn')!.textContent).toContain('has 2 items');
  });

  it('shows a lane per team in the draft order and a hint when empty', () => {
    const empty = mountWith({ ...newPreset(), steps: [] }).root;

    expect([mountWith().root.querySelectorAll('.order .lane').length, empty.querySelector('.order') === null, empty.querySelector('.builder-side .hint')!.textContent]).toEqual([2, true, 'Add steps to see the order.']);
  });

  it('shows the pool each chip draws from', () => {
    const { root } = mountWith();

    const pool = (root.querySelector('.order .chip .chip-pool') as HTMLElement).textContent;

    expect(pool).toBe(newPreset().steps[0].pool);
  });

  it('highlights the step row when its chip is clicked', () => {
    const { root } = mountWith();

    (root.querySelector('.order .chip') as HTMLElement).click();

    expect(root.querySelector('ol.steps > li')!.classList.contains('hl')).toBe(true);
  });

  it('explains why Save is off when the name is empty', () => {
    const { root } = mountWith({ ...newPreset(), name: ' ' }, async () => ({ ok: true, links: [] }));

    const save = [...root.querySelectorAll('button')].find((b) => b.textContent === 'Save')!;

    expect([save.disabled, root.querySelector('.bar-note')!.textContent]).toEqual([true, 'Enter a preset name to save']);
  });

  it('tracks unsaved changes and offers Create room after saving', async () => {
    const { root } = mountWith(newPreset(), async () => ({ ok: true, links: [{ label: 'Room', url: 'http://x/#r' }] }));
    clickButton(root, 'Add step');
    const unsaved = root.querySelector('.bar-note')!.textContent;

    clickButton(root, 'Save');
    await flush();

    expect([unsaved, root.querySelector('.bar-note')!.textContent, [...root.querySelectorAll('.bar-actions button')].map((b) => b.textContent).includes('Create room')]).toEqual(['Unsaved changes', 'Saved just now', true]);
  });

  it('resets to the last loaded version', () => {
    const { root, b } = mountWith();
    clickButton(root, 'Add step');

    clickButton(root, 'Reset');

    expect(b.get().steps).toHaveLength(1);
  });

  it('loads a built-in preset from the footer', async () => {
    const other = { ...newPreset(), name: 'Other' };
    const { root, b } = mountWith(newPreset(), undefined, [{ label: 'Other', preset: other }]);
    const sel = byLabel(root, 'Load from built-in') as HTMLSelectElement;

    sel.value = '0';
    await fire(sel);

    expect(b.get().name).toBe('Other');
  });

  it('asks for a numeric keypad on number fields', () => {
    const { root } = mountWith();
    openStep(root);

    expect((byLabel(root, 'Step 1 count') as HTMLInputElement).inputMode).toBe('numeric');
  });
});
