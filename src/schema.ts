import { z } from 'zod';
import type { Preset } from './model';

const team = z.enum(['A', 'B']);
const name = z.string().trim().min(1).max(80);
const tagValue = z.string().trim().min(1).max(40);

const httpsUrl = z
  .string()
  .max(2000)
  .refine((v) => {
    try {
      return new URL(v).protocol === 'https:';
    } catch {
      return false;
    }
  }, 'must be a valid https:// URL');

export const itemSchema = z.object({
  id: z.string().trim().min(1).max(60),
  name,
  image: httpsUrl.optional(),
  tags: z.record(z.string(), tagValue).optional(),
});

export const poolSchema = z.object({ items: z.array(itemSchema).min(1).max(500), scope: z.enum(['global', 'shared', 'exclusive']).optional(), iconSize: z.enum(['small', 'medium', 'large']).optional() });

export const taggingSchema = z.object({
  assignment: z.enum(['chosen', 'fixed', 'none']),
  tag: tagValue.optional(),
  values: z.array(tagValue).min(2).max(20).optional(),
  images: z.record(tagValue, httpsUrl).optional(),
  sameTag: z.enum(['allow', 'forbid']).optional(),
  seats: z.object({ A: tagValue, B: tagValue }).optional(),
});

export const stepSchema = z.object({
  team,
  action: z.enum(['pick', 'ban', 'choose']),
  pool: z.string().optional(),
  tag: z.string().optional(),
  count: z.number().int().min(1).max(50).default(1),
  timer: z.number().int().min(1).max(3600).optional(),
  pause: z.union([z.literal('ready'), z.number().int().min(1).max(3600)]).optional(),
  restrict: z.literal('tag').optional(),
  blind: z.boolean().optional(),
  reveal: z.union([z.literal('end'), z.number().int().min(0)]).optional(),
  random: z.boolean().optional(),
});

/** With two values and sameTag forbid, one choice assigns both teams; otherwise each team needs its own. */
const tagsKnown = (chosenBy: Set<string>, t: z.infer<typeof taggingSchema>) =>
  chosenBy.size >= (t.sameTag === 'forbid' && t.values?.length === 2 ? 1 : 2);

export const presetSchema = z
  .object({
    version: z.literal(1),
    name,
    tagging: taggingSchema,
    pools: z.record(z.string(), poolSchema),
    steps: z.array(stepSchema).min(1).max(200),
    pauses: z.object({ between: z.boolean() }).default({ between: false }),
  })
  .superRefine((p, ctx) => {
    const bad = (path: (string | number)[], message: string) => ctx.addIssue({ code: 'custom', path, message });
    const t = p.tagging;

    if (t.assignment !== 'none') {
      if (!t.tag) bad(['tagging', 'tag'], 'required when assignment is not "none"');
      if (!t.values) bad(['tagging', 'values'], 'required when assignment is not "none"');
      if (t.values && new Set(t.values).size !== t.values.length) bad(['tagging', 'values'], 'values must be unique');
    }
    if (t.assignment === 'fixed') {
      if (!t.seats) bad(['tagging', 'seats'], 'required when assignment is "fixed"');
      else {
        for (const s of ['A', 'B'] as const) {
          if (t.values && !t.values.includes(t.seats[s])) bad(['tagging', 'seats', s], 'not in tagging.values');
        }
        if (t.sameTag === 'forbid' && t.seats.A === t.seats.B) bad(['tagging', 'seats'], 'both seats hold the same tag but sameTag is "forbid"');
      }
    }

    for (const value of Object.keys(t.images ?? {})) {
      if (!t.values?.includes(value)) bad(['tagging', 'images', value], `"${value}" not in tagging.values`);
    }

    for (const [poolName, pl] of Object.entries(p.pools)) {
      if (!poolName.trim()) bad(['pools', poolName], 'pool name is empty');
      const seen = new Set<string>();
      pl.items.forEach((it, i) => {
        if (seen.has(it.id)) bad(['pools', poolName, 'items', i, 'id'], `duplicate item id "${it.id}"`);
        seen.add(it.id);
        const v = t.tag ? it.tags?.[t.tag] : undefined;
        if (v !== undefined && t.values && !t.values.includes(v)) {
          bad(['pools', poolName, 'items', i, 'tags', t.tag!], `"${v}" not in tagging.values`);
        }
      });
    }

    const last = p.steps.length - 1;
    const chosenBy = new Set<string>();
    p.steps.forEach((s, i) => {
      const at = (f: string) => ['steps', i, f];
      if (s.action === 'choose') {
        chosenBy.add(s.team);
        if (t.assignment !== 'chosen') bad(at('action'), '"choose" needs tagging.assignment "chosen"');
        else if (s.tag !== t.tag) bad(at('tag'), `must equal tagging.tag "${t.tag}"`);
        if (s.pool) bad(at('pool'), 'not allowed for "choose"');
        if (s.count !== 1) bad(at('count'), 'must be 1 for "choose"');
        if (s.restrict) bad(at('restrict'), 'not allowed for "choose"');
        if (s.blind) bad(at('blind'), 'not allowed for "choose"');
        if (s.random) bad(at('random'), 'not allowed for "choose"');
      } else {
        if (!s.pool) bad(at('pool'), 'required for pick and ban');
        else if (!p.pools[s.pool]) bad(at('pool'), `unknown pool "${s.pool}"`);
        else if (s.count > p.pools[s.pool].items.length) bad(at('count'), 'exceeds pool size');
        if (s.tag) bad(at('tag'), 'only allowed for "choose"');
        if (s.restrict) {
          if (t.assignment === 'none') bad(at('restrict'), 'needs tagging.assignment "chosen" or "fixed"');
          else if (t.assignment === 'chosen' && !tagsKnown(chosenBy, t)) bad(at('restrict'), 'needs the tag to be chosen by an earlier "choose" step');
        }
        if (s.blind && s.action !== 'pick') bad(at('blind'), 'only allowed on "pick"');
      }
      if (s.reveal !== undefined) {
        if (!s.blind) bad(at('reveal'), 'only allowed when blind is true');
        else if (typeof s.reveal === 'number' && (s.reveal <= i || s.reveal > last)) {
          bad(at('reveal'), `step index must be after this step and at most ${last}`);
        }
      }
    });
  });

export interface ValidationError {
  path: string;
  message: string;
}

export type ValidationResult = { ok: true; preset: Preset } | { ok: false; errors: ValidationError[] };

const formatPath = (path: PropertyKey[]) =>
  path.reduce<string>((acc, k) => (typeof k === 'number' ? `${acc}[${k}]` : acc ? `${acc}.${String(k)}` : String(k)), '');

/** Validate unknown input (e.g. parsed JSON) and normalize defaults (count, pauses, reveal). */
export function validatePreset(input: unknown): ValidationResult {
  const r = presetSchema.safeParse(input);
  if (!r.success) {
    return { ok: false, errors: r.error.issues.map((e) => ({ path: formatPath(e.path), message: e.message })) };
  }
  const preset = r.data as Preset;
  for (const s of preset.steps) if (s.blind && s.reveal === undefined) s.reveal = 'end';
  return { ok: true, preset };
}

/** Parse JSON text, reporting syntax errors the same way as validation errors. */
export function parsePresetJson(text: string): ValidationResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [{ path: '', message: `invalid JSON: ${(e as Error).message}` }] };
  }
  return validatePreset(data);
}
