// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { aiPanel, errorLine } from '../src/ai-panel';
import { buildAiBrief, fieldNotes, fullExample, minimalExample } from '../src/ai-brief';
import { itemSchema, poolSchema, presetSchema, stepSchema, taggingSchema, validatePreset } from '../src/schema';
import type { Preset } from '../src/model';

const sections = { preset: presetSchema, tagging: taggingSchema, pool: poolSchema, item: itemSchema, step: stepSchema };

describe('AI brief', () => {
  it.each(Object.entries(sections))('names every %s field of the schema', (section, schema) => {
    const brief = buildAiBrief();

    const missing = Object.keys(schema.shape).filter((k) => !brief.includes(`\`${k}\``));

    expect(missing).toEqual([]);
  });

  it.each(Object.entries(sections))('describes every %s field in plain words', (section, schema) => {
    const undescribed = Object.keys(schema.shape).filter((k) => !fieldNotes[section][k]);

    expect(undescribed).toEqual([]);
  });

  it('asks for one JSON object only', () => {
    expect(buildAiBrief()).toContain('Return one JSON object only');
  });

  it('embeds the minimal and the full example as JSON', () => {
    const brief = buildAiBrief();

    expect([brief.includes(JSON.stringify(minimalExample, null, 2)), brief.includes(JSON.stringify(fullExample(), null, 2))]).toEqual([true, true]);
  });

  it('mentions banned display, iconSize and random', () => {
    const brief = buildAiBrief();

    expect(['red cross', 'iconSize', 'random']).toSatisfy((words: string[]) => words.every((w) => brief.includes(w)));
  });

  it('uses examples that validate', () => {
    expect([validatePreset(minimalExample).ok, validatePreset(fullExample()).ok]).toEqual([true, true]);
  });
});

describe('Build with AI panel', () => {
  const mount = (onOpen = (_p: Preset) => {}) => aiPanel(onOpen);
  const paste = (el: HTMLElement, text: string) => {
    const box = el.querySelector('textarea') as HTMLTextAreaElement;
    box.value = text;
    box.dispatchEvent(new Event('input'));
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Validate & preview')!.click();
  };

  it('copies the brief to the clipboard', async () => {
    const copied: string[] = [];
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: async (s: string) => void copied.push(s) }, configurable: true });
    const el = mount();

    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Copy AI brief')!.click();
    await new Promise((r) => setTimeout(r, 0));

    expect([copied, [...el.querySelectorAll('button')].find((b) => b.textContent?.startsWith('Copied'))!.textContent]).toEqual([[buildAiBrief()], 'Copied \u2713']);
  });

  it('offers the example as a JSON download', () => {
    const a = mount().querySelector('a[download]') as HTMLAnchorElement;

    expect(JSON.parse(decodeURIComponent(a.href.split(',')[1]))).toEqual(JSON.parse(JSON.stringify(fullExample())));
  });

  it('reports an invalid preset with its field path', () => {
    const el = mount();

    paste(el, JSON.stringify({ ...minimalExample, steps: [{ team: 'A', action: 'pick', pool: 'nope', count: 1 }] }));

    expect(el.querySelector('.errors')!.textContent).toContain('steps[0].pool: unknown pool "nope"');
  });

  it('reports broken JSON', () => {
    const el = mount();

    paste(el, '{ not json');

    expect(el.querySelector('.errors')!.textContent).toContain('invalid JSON');
  });

  it('says valid and opens a valid preset in the builder', () => {
    const opened: Preset[] = [];
    const el = mount((p) => opened.push(p));

    paste(el, JSON.stringify(minimalExample));
    [...el.querySelectorAll('button')].find((b) => b.textContent === 'Open in builder')!.click();

    expect([el.querySelector('.ok')!.textContent, opened.map((p) => p.name)]).toEqual([expect.stringContaining('Valid: Minimal draft'), ['Minimal draft']]);
  });

  it('shows the three steps in order', () => {
    expect([...mount().querySelectorAll('.ai-step strong')].map((s) => s.textContent)).toEqual(['Copy brief', 'Paste into any AI chat', 'Paste JSON here']);
  });

  it('disables Validate until the field has text', () => {
    const el = mount();
    const button = [...el.querySelectorAll('button')].find((b) => b.textContent === 'Validate & preview') as HTMLButtonElement;
    const before = button.disabled;
    const box = el.querySelector('textarea') as HTMLTextAreaElement;
    box.value = '{}';
    box.dispatchEvent(new Event('input'));

    expect([before, button.disabled]).toEqual([true, false]);
  });

  it('says nothing is uploaded', () => {
    expect(mount().textContent).toContain('nothing is uploaded');
  });

  it('shows the brief on request', () => {
    expect(mount().querySelector('details.brief pre')!.textContent).toBe(buildAiBrief());
  });

  it('puts a line number on a syntax error', () => {
    expect(errorLine('{\n"a": x', 'Unexpected token at position 7')).toBe(2);
  });
});
