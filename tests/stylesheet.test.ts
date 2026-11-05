import { readFileSync } from 'node:fs';
import { build } from 'vite';
import { describe, expect, it } from 'vitest';

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');

describe('stylesheet', () => {
  it('is imported by the entry module', () => {
    expect(read('../src/main.ts')).toMatch(/^import '\.\/styles\.css';/);
  });

  it('styles the classes the views render', () => {
    const css = read('../src/styles.css');

    const missing = ['.items', '.selected', '.turn', '.timer', '.role', '.errors', '.links', '.hint', '.seat', '.error-box', '.secondary', '.history', '.row', '.timeline', '.tl'].filter((c) => !css.includes(c));

    expect(missing).toEqual([]);
  });

  it('is emitted by the production build and linked from index.html', async () => {
    const out = (await build({ logLevel: 'silent', build: { write: false } })) as { output: { fileName: string; type: string; source?: string | Uint8Array }[] }[] | { output: { fileName: string; type: string; source?: string | Uint8Array }[] };
    const files = (Array.isArray(out) ? out[0] : out).output;

    const css = files.find((f) => f.fileName.endsWith('.css'));
    const html = String(files.find((f) => f.fileName === 'index.html')?.source);

    expect([!!css, css ? html.includes(css.fileName) : false]).toEqual([true, true]);
  }, 60_000);
});

describe('item tile text', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const tileRule = css.split('\n').find((l) => l.startsWith('.items button {')) ?? '';

  it('wraps long labels inside the tile', () => {
    expect(tileRule).toContain('overflow-wrap: anywhere');
  });

  it('lets the tile shrink to its grid cell', () => {
    expect([tileRule.includes('min-width: 0'), tileRule.includes('max-width: 100%')]).toEqual([true, true]);
  });

  it('lets narrow grid columns shrink below their content', () => {
    expect(css).toContain('repeat(2, minmax(0, 1fr))');
  });
});
