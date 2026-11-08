import { describe, expect, it } from 'vitest';
import { splitName, stepLines, summary, timerSummary, totals } from '../src/preset-info';
import { makePreset, step } from './fixtures';

describe('splitName', () => {
  it.each([
    ['2v2 Open pool - exclusive (one by one)', '2v2 Open pool', 'exclusive \u00b7 one by one'],
    ['1v1 Best of 3 (1v1 + 2v2 maps)', '1v1 Best of 3', '1v1 + 2v2 maps'],
    ['Fixed sides, blind picks', 'Fixed sides', 'blind picks'],
    ['Captains Mode', 'Captains Mode', ''],
  ])('splits %j', (name, title, meta) => {
    expect(splitName(name)).toEqual({ title, meta });
  });
});

describe('preset summary', () => {
  const preset = makePreset([step('A', 'ban', 'maps', { count: 2 }), step('B', 'pick', 'maps')]);

  it('counts bans and picks per team', () => {
    expect(totals(preset)).toEqual({ A: { ban: 2, pick: 0 }, B: { ban: 0, pick: 1 } });
  });

  it('describes total bans and picks in one line', () => {
    expect(summary(preset)).toBe('2 bans \u00b7 1 pick');
  });

  it('lists each step with its team, action, pool and count', () => {
    expect(stepLines(preset)).toEqual([{ team: 'A', text: 'Team A bans 2 maps' }, { team: 'B', text: 'Team B picks maps' }]);
  });

  it('adds timer, blind, random and pause details to a step line', () => {
    const p = makePreset([step('A', 'pick', 'maps', { timer: 30, blind: true, random: true, pause: 'ready' })]);

    expect(stepLines(p)[0].text).toBe('Team A picks maps \u00b7 blind \u00b7 random allowed \u00b7 30s \u00b7 ready check first');
  });
});

describe('timerSummary', () => {
  it('says there are no timers when none is set', () => {
    expect(timerSummary(makePreset([step('A', 'ban', 'maps')]))).toBe('No timers');
  });

  it('gives one value when every turn has the same timer', () => {
    expect(timerSummary(makePreset([step('A', 'ban', 'maps', { timer: 30 }), step('B', 'ban', 'maps', { timer: 30 })]))).toBe('30s per turn');
  });

  it('gives a range when timers differ', () => {
    expect(timerSummary(makePreset([step('A', 'ban', 'maps', { timer: 15 }), step('B', 'ban', 'maps', { timer: 45 })]))).toBe('15\u201345s per turn');
  });
});