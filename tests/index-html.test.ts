import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

describe('index.html', () => {
  it('declares a responsive viewport', () => {
    expect(html).toMatch(/<meta name="viewport" content="width=device-width/);
  });

  it('has a page title', () => {
    expect(html).toMatch(/<title>[^<]+<\/title>/);
  });
});
