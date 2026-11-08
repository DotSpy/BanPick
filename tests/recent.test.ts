import { describe, expect, it } from 'vitest';
import { loadRecent, rememberRecent } from '../src/recent';

const memory = (seed?: string) => {
  let v = seed ?? null;
  return { getItem: () => v, setItem: (_k: string, x: string) => void (v = x) };
};

describe('recent presets', () => {
  it('is empty with no history', () => {
    expect(loadRecent(memory())).toEqual([]);
  });

  it('puts the newest first and drops repeats', () => {
    const s = memory();
    rememberRecent('a', s);
    rememberRecent('b', s);

    expect(rememberRecent('a', s)).toEqual(['a', 'b']);
  });

  it('keeps only the last three', () => {
    const s = memory();
    ['a', 'b', 'c', 'd'].forEach((id) => rememberRecent(id, s));

    expect(loadRecent(s)).toEqual(['d', 'c', 'b']);
  });

  it('ignores corrupt stored data', () => {
    expect(loadRecent(memory('{not json'))).toEqual([]);
  });

  it('ignores stored data that is not a list of ids', () => {
    expect(loadRecent(memory('[1,"a",null]'))).toEqual(['a']);
  });
});