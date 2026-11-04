import { describe, expect, it } from 'vitest';
import { decodePreset, encodePreset } from '../src/builder/share';
import { draftOrder } from '../src/builder/preview';
import { newPreset } from '../src/builder/edit';
import { expandSteps } from '../src/turns';
import { builtinPresets } from '../src/warno/preset';

describe('share link codec', () => {
  it('round-trips a preset', async () => {
    const p = newPreset();

    const result = await decodePreset(await encodePreset(p));

    expect(result).toEqual({ ok: true, preset: p });
  });

  it('produces url-safe output', async () => {
    expect(await encodePreset(newPreset())).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('reports a corrupted link as an error', async () => {
    const result = await decodePreset('@@not-a-link@@');

    expect(result.ok).toBe(false);
  });

  it('reports a well-formed link holding an invalid preset', async () => {
    const bad = await encodePreset({ ...newPreset(), steps: [] });

    expect((await decodePreset(bad)).ok).toBe(false);
  });
});

describe('draft order preview', () => {
  it('lists one row per turn, numbered from 1', () => {
    const rows = draftOrder(newPreset());

    expect(rows.map((r) => r.n)).toEqual([1]);
  });

  it('describes action and target', () => {
    expect(draftOrder(newPreset())[0]).toMatchObject({ team: 'A', text: 'ban items' });
  });

  it('expands counted steps like the engine for built-ins', () => {
    const { preset } = builtinPresets[0];

    expect(draftOrder(preset)).toHaveLength(expandSteps(preset.steps).length);
  });
});
