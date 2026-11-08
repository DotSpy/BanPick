// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { linksPanel } from '../src/links';
import { mountLauncher } from '../src/launcher';
import { makePreset, step } from './fixtures';

const click = (root: HTMLElement, label: string) => [...root.querySelectorAll('button')].find((b) => b.textContent === label)!.click();

describe('links panel', () => {
  it('shows each link in a read-only labelled input', () => {
    const el = linksPanel([{ label: 'Captain A', url: 'http://x/a' }]);

    const input = el.querySelector('input')!;

    expect([input.value, input.readOnly, input.getAttribute('aria-label')]).toEqual(['http://x/a', true, 'Captain A link']);
  });

  it('copies a link to the clipboard and says so', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (s: string) => void copied.push(s) }, configurable: true });
    const el = linksPanel([{ label: 'Captain A', url: 'http://x/a' }]);

    click(el, 'Copy');
    await new Promise((r) => setTimeout(r, 0));

    expect([copied, el.querySelector('[role=status]')!.textContent]).toEqual([['http://x/a'], 'Copied']);
  });

  it('asks the user to copy by hand when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async () => Promise.reject(new Error('denied')) }, configurable: true });
    const el = linksPanel([{ label: 'Captain A', url: 'http://x/a' }]);

    click(el, 'Copy');
    await new Promise((r) => setTimeout(r, 0));

    expect(el.querySelector('[role=status]')!.textContent).toBe('Press Ctrl+C to copy');
  });
});

const pickCard = (root: HTMLElement, id: string) => {
  const input = root.querySelector(`input[type=radio][value=${id}]`) as HTMLInputElement;
  input.checked = true;
  input.dispatchEvent(new Event('change'));
};

const memory = (seed: Record<string, string> = {}) => {
  const data = { ...seed };
  return { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) };
};

describe('launcher', () => {
  const presets = [
    { id: 'one', preset: makePreset([step('A', 'ban', 'maps')]), tag: 'Generic' },
    { id: 'two', preset: { ...makePreset([step('B', 'ban', 'maps')]), name: 'Second - with details (more)' }, tag: 'WARNO' },
  ];
  const groups = [
    { label: 'Built-in presets', presets: presets.slice(0, 1) },
    { label: 'WARNO presets', presets: presets.slice(1) },
  ];
  const mount = (onEditCopy = (_p: unknown) => {}, storage = memory()) => {
    const root = document.createElement('div');
    mountLauncher(root, { groups, base: 'http://h/', newId: () => 'room1', onEditCopy, builder: document.createElement('div'), storage });
    return root;
  };
  const radio = (root: HTMLElement, id: string) => root.querySelector(`input[type=radio][value=${id}]`) as HTMLInputElement;
  const tab = (root: HTMLElement, name: string) => [...root.querySelectorAll('[role=tab]')].find((t) => t.textContent === name) as HTMLElement;

  it('shows one radio card per preset with its name and tag', () => {
    const cards = [...mount().querySelectorAll('.preset-card')].map((c) => [c.querySelector('strong')!.textContent, c.querySelector('.tag')!.textContent]);

    expect(cards).toEqual([['Test', 'Generic'], ['Second', 'WARNO']]);
  });

  it('shows the name details on a muted second line with the pick and ban counts', () => {
    const meta = mount().querySelectorAll('.card-meta')[1].textContent;

    expect(meta).toBe('with details \u00b7 more \u00b7 1 ban \u00b7 0 picks');
  });

  it('selects the first card by default and previews it', () => {
    const root = mount();

    expect([radio(root, 'one').checked, root.querySelector('.preset-preview h3')!.textContent]).toEqual([true, 'Test']);
  });

  it('previews the card the user selects', () => {
    const root = mount();

    pickCard(root, 'two');

    expect([root.querySelector('.preset-preview h3')!.textContent, root.querySelector('.preview-steps li')!.textContent]).toEqual(['Second', 'Team B bans maps']);
  });

  it('puts each preset card under its labelled group', () => {
    const root = mount();

    const shown = [...root.querySelectorAll('fieldset')].map((g) => [g.querySelector('legend')!.textContent, [...g.querySelectorAll('input')].map((i) => i.value)]);

    expect(shown).toEqual([['Built-in presets', ['one']], ['WARNO presets', ['two']]]);
  });

  it('uses no native select', () => {
    expect(mount().querySelector('select')).toBeNull();
  });

  it('explains the three steps under the title', () => {
    expect(mount().querySelector('.onboarding')!.textContent).toBe('Pick a preset, create a room, share the link with the other team.');
  });

  it('lists the preset builder as its own tab between the presets and Build with AI', () => {
    expect([...mount().querySelectorAll('[role=tab]')].map((t) => t.textContent)).toEqual(['Built-in presets', 'Preset builder', 'Build with AI']);
  });

  it('puts a sparkle icon on the Build with AI tab', () => {
    expect(tab(mount(), 'Build with AI').querySelector('svg.glyph')).not.toBeNull();
  });

  it('shows the Build with AI tab only after it is selected', () => {
    const root = mount();
    const ai = tab(root, 'Build with AI');

    const before = (root.querySelectorAll('[role=tabpanel]')[2] as HTMLElement).hidden;
    ai.click();

    expect([before, (root.querySelectorAll('[role=tabpanel]')[2] as HTMLElement).hidden, ai.getAttribute('aria-selected')]).toEqual([true, false, 'true']);
  });

  it('creates a room with one shared link for the selected card', () => {
    const root = mount();
    pickCard(root, 'two');

    click(root, 'Create room');

    expect([...root.querySelectorAll('.links input')].map((i) => (i as HTMLInputElement).value)).toEqual(['http://h/#room/room1/builtin-two']);
  });

  it('confirms the room was created and that one link is shared', () => {
    const root = mount();

    click(root, 'Create room');

    expect(root.querySelector('p.hint[role=status]')!.textContent).toContain('Room created');
  });

  it('puts the actions after the list, with Create room last and filled', () => {
    const actions = [...mount().querySelectorAll('.launcher-actions button')];

    expect([actions.map((b) => b.textContent), actions[0].classList.contains('ghost'), actions[0].querySelector('svg')!== null, actions[1].querySelector('svg') !== null]).toEqual([['Edit copy', 'Create room'], true, true, true]);
  });

  it('hands a copy of the selected preset to the builder and opens its tab', () => {
    const edited: unknown[] = [];
    const root = mount((p) => edited.push(p));

    click(root, 'Edit copy');

    expect([edited[0], edited[0] === presets[0].preset, tab(root, 'Preset builder').getAttribute('aria-selected')]).toEqual([presets[0].preset, false, 'true']);
  });

  it('does not load a preset into the builder just because the selection changes', () => {
    const edited: unknown[] = [];
    const root = mount((p) => edited.push(p));

    pickCard(root, 'two');

    expect(edited).toEqual([]);
  });
});

describe('launcher, recently used', () => {
  const entries = [
    { id: 'one', preset: makePreset([step('A', 'ban', 'maps')]), tag: 'Generic' },
    { id: 'two', preset: { ...makePreset([step('B', 'ban', 'maps')]), name: 'Second' }, tag: 'WARNO' },
  ];
  const mount = (storage = memory()) => {
    const root = document.createElement('div');
    mountLauncher(root, { groups: [{ label: 'All', presets: entries }], base: 'http://h/', newId: () => 'r', onEditCopy: () => {}, builder: document.createElement('div'), storage });
    return root;
  };

  it('hides the section while there is no history', () => {
    expect((mount().querySelector('.recent') as HTMLElement).hidden).toBe(true);
  });

  it('shows the presets used before, newest first', () => {
    const root = mount(memory({ 'banpick-recent': JSON.stringify(['two', 'one']) }));

    expect([...root.querySelectorAll('.recent .recent-chip')].map((c) => c.textContent)).toEqual(['Second', 'Test']);
  });

  it('remembers a preset once a room is created from it', () => {
    const storage = memory();
    const root = mount(storage);
    pickCard(root, 'two');

    click(root, 'Create room');

    expect([storage.getItem('banpick-recent'), (root.querySelector('.recent') as HTMLElement).hidden]).toEqual(['["two"]', false]);
  });

  it('selects a preset again from its chip', () => {
    const root = mount(memory({ 'banpick-recent': '["two"]' }));

    (root.querySelector('.recent .recent-chip') as HTMLElement).click();

    expect((root.querySelector('input[value=two]') as HTMLInputElement).checked).toBe(true);
  });

  it('ignores remembered ids that no longer exist', () => {
    const root = mount(memory({ 'banpick-recent': '["gone"]' }));

    expect((root.querySelector('.recent') as HTMLElement).hidden).toBe(true);
  });
});
