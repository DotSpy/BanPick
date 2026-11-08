import { describe, expect, it } from 'vitest';
import { filterIds, tabValues } from '../src/room/filter';
import { turnsOf } from '../src/turns';
import { makePreset, sideTagging, step } from './fixtures';

const setup = () => {
  const preset = makePreset([step('A', 'pick', 'divisions')], { tagging: sideTagging() });
  return { preset, turn: turnsOf(preset)[0], all: ['cav', 'ranger', 'gd', 'tank'] };
};

describe('option filter', () => {
  it('lists the distinct tag values as tabs', () => {
    const { preset, turn, all } = setup();

    expect(tabValues(preset, turn, all)).toEqual(['nato', 'pact']);
  });

  it('offers no tabs when the listed items share one tag value', () => {
    const { preset, turn } = setup();

    expect(tabValues(preset, turn, ['cav', 'ranger'])).toEqual([]);
  });

  it('keeps only the items of the chosen tab', () => {
    const { preset, turn, all } = setup();

    expect(filterIds(preset, turn, all, { query: '', tab: 'pact' })).toEqual(['gd', 'tank']);
  });

  it('matches the search text on the name, ignoring case', () => {
    const { preset, turn, all } = setup();

    expect(filterIds(preset, turn, all, { query: ' RAN', tab: null })).toEqual(['ranger']);
  });

  it('treats a tab that no longer applies as all', () => {
    const { preset, turn, all } = setup();

    expect(filterIds(preset, turn, ['cav', 'ranger'], { query: '', tab: 'pact' })).toEqual(['cav', 'ranger']);
    expect(filterIds(preset, turn, all, { query: '', tab: 'gone' })).toEqual(all);
  });
});
