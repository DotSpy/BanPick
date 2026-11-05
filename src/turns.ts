import type { Preset, Step, Turn } from './model';

/** Expands preset steps into single-action turns (a step with count n becomes n turns). */
export function expandSteps(steps: Step[]): Turn[] {
  return steps.flatMap((s, step) =>
    Array.from({ length: s.count }, (): Turn => {
      const target = s.action === 'choose' ? s.tag! : s.pool!;
      return { team: s.team, action: s.action, target, timer: s.timer ?? 0, pause: s.pause, restrict: s.restrict, blind: s.blind, reveal: s.reveal, random: s.random, step };
    }),
  );
}

const cache = new WeakMap<Preset, Turn[]>();

export function turnsOf(preset: Preset): Turn[] {
  let t = cache.get(preset);
  if (!t) cache.set(preset, (t = expandSteps(preset.steps)));
  return t;
}
