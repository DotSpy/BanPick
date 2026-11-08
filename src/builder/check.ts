import type { Preset } from '../model';

/**
 * Soft warnings per step (same index as `preset.steps`, '' when fine). They never block saving: the engine
 * skips turns when nothing is left, but a step that asks for more than the pool holds is usually a mistake.
 * Global pools are shared by every step, so their counts add up; other scopes are checked per step.
 */
export function stepWarnings(preset: Preset): string[] {
  const used: Record<string, number> = {};
  return preset.steps.map((s) => {
    const pool = s.pool ? preset.pools[s.pool] : undefined;
    if (s.action === 'choose' || !s.pool || !pool) return '';
    const total = pool.items.length;
    const needed = (pool.scope ?? 'global') === 'global' ? (used[s.pool] = (used[s.pool] ?? 0) + s.count) : s.count;
    return needed > total ? `Pool "${s.pool}" has ${total} item${total === 1 ? '' : 's'}, but the steps up to here need ${needed}.` : '';
  });
}
