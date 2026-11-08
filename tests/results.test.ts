import { describe, expect, it } from 'vitest';
import { applyPick, type DraftState } from '../src/draft';
import { draftResults, formatDuration } from '../src/results';
import { makePreset, sideTagging, started, step } from './fixtures';

/** Plays every step in order with the given item ids, finishing at `end`. */
const play = (s: DraftState, ids: string[], end = 0) => {
  ids.forEach((id, i) => applyPick(s, s.preset.steps[i].team, id, i === ids.length - 1 ? end : 0, false));
  return s;
};

const finished = (end = 0) =>
  play(
    started(makePreset([step('A', 'choose', 'side'), step('A', 'ban', 'maps'), step('B', 'pick', 'maps'), step('A', 'pick', 'divisions'), step('B', 'pick', 'divisions')], { tagging: sideTagging() })),
    ['nato', 'map-1', 'map-2', 'cav', 'gd'],
    end,
  );

describe('draftResults', () => {
  it('shows a target picked by one team only once, as shared', () => {
    const r = draftResults(finished());

    expect(r.shared).toEqual([{ target: 'maps', picks: [{ id: 'map-2', name: 'map-2', by: 'Team B' }] }]);
  });

  it('keeps shared picks out of the team columns', () => {
    const r = draftResults(finished());

    expect(r.teams[1].groups.map((g) => g.target)).toEqual(['divisions']);
  });

  it('lists each team\'s own picks and bans per target', () => {
    const r = draftResults(finished());

    expect(r.teams[0].groups).toEqual([
      { target: 'maps', picks: [], bans: [{ id: 'map-1', name: 'map-1' }] },
      { target: 'divisions', picks: [{ id: 'cav', name: 'cav' }], bans: [] },
    ]);
  });

  it('takes the team title from its choose step', () => {
    const r = draftResults(finished());

    expect(r.teams[0].chosen).toBe('nato');
  });

  it('measures the duration from start to finish', () => {
    const s = finished(372000);
    s.startedAt = 0;

    expect(draftResults(s).durationMs).toBe(372000);
  });

  it('leaves the duration empty for drafts stored without a start time', () => {
    const s = finished(372000);
    delete s.startedAt;

    expect(draftResults(s).durationMs).toBeNull();
  });
});

describe('formatDuration', () => {
  it('writes minutes and seconds', () => {
    expect(formatDuration(372000)).toBe('6 min 12s');
  });

  it('writes seconds alone under a minute', () => {
    expect(formatDuration(45000)).toBe('45s');
  });
});

describe('random picks', () => {
  const withRandom = (done: boolean) => {
    const s = started(makePreset([step('A', 'ban', 'maps', { random: true }), step('B', 'pick', 'maps')]));
    applyPick(s, 'A', 'map-1', 0, false, true);
    if (done) applyPick(s, 'B', 'map-2', 0, false);
    return s;
  };

  it('names a random pick in the results once the draft is finished', () => {
    const r = draftResults(withRandom(true));

    expect(r.teams[0].groups[0].bans).toEqual([{ id: 'map-1', name: 'map-1' }]);
  });
});
