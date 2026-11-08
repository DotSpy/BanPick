import type { ZodObject } from 'zod';
import { examplePresets } from './examples';
import type { Preset } from './model';
import { itemSchema, poolSchema, presetSchema, stepSchema, taggingSchema } from './schema';

/** The smallest valid preset: one shared pool, one ban and one pick, no tags. */
export const minimalExample: Preset = {
  version: 1,
  name: 'Minimal draft',
  tagging: { assignment: 'none' },
  pools: { items: { items: [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Bravo' }, { id: 'c', name: 'Charlie' }] } },
  steps: [
    { team: 'A', action: 'ban', pool: 'items', count: 1 },
    { team: 'B', action: 'pick', pool: 'items', count: 1 },
  ],
  pauses: { between: false },
};

/** The full example in the brief is a shipped preset, so it is always valid. */
export const fullExample = () => examplePresets.find((p) => p.id === 'moba-draft')!.preset;

/** Plain-language meaning of each field. A test asserts every schema field is described, so this cannot drift unnoticed. */
export const fieldNotes: Record<string, Record<string, string>> = {
  preset: {
    version: 'always 1',
    name: 'preset title, 1-80 characters',
    tagging: 'optional grouping of items (for example sides); see Tagging',
    pools: 'object: pool name -> pool; steps refer to pools by name',
    steps: 'ordered list of 1-200 steps; each step expands to `count` turns',
    pauses: '`{ "between": true }` waits for both captains to confirm after each pick, before the next turn; default `{ "between": false }`',
  },
  tagging: {
    assignment: '`none` = no tags; `fixed` = each team always has a given tag value (needs `seats`); `chosen` = a team picks a value in a `choose` step',
    tag: 'name of the tag on items (for example "side"); required unless assignment is `none`',
    values: 'allowed tag values, 2-20 unique strings; required unless assignment is `none`',
    images: 'optional https image URL per tag value; keys must be in `values`',
    sameTag: '`forbid` = both teams must hold different values; `allow` = they may share one',
    seats: 'for `fixed`: `{ "A": value, "B": value }`, both in `values`',
  },
  pool: {
    items: 'the choices, 1-500 items',
    scope: '`global` = any pick or ban removes the item for everyone (default); `shared` = each team has its own copy, a pick removes it for that team only; `exclusive` = a pick removes it for both teams. In shared and exclusive pools a ban removes the item from the opponent only',
    iconSize: 'size of item images everywhere (default medium)',
  },
  item: {
    id: 'unique within the pool, 1-60 characters',
    name: 'shown name, 1-80 characters',
    image: 'optional https:// image URL; without one the first letter is shown',
    tags: 'optional `{ tagName: value }`; the value must be in `tagging.values`',
  },
  step: {
    team: '`A` or `B`, the acting captain',
    action: '`pick`, `ban` or `choose` (a team chooses a tag value, no pool)',
    pool: 'pool name; required for pick and ban, not allowed for choose',
    tag: 'for choose only: must equal `tagging.tag`',
    count: 'how many consecutive turns this step expands to (1-50, default 1); must be 1 for choose and not exceed the pool size',
    timer: 'seconds per turn (1-3600); when it runs out a turn is resolved automatically; omit for no timer',
    pause: 'before each turn: `"ready"` waits for both captains, or a number of seconds (1-3600)',
    restrict: '`"tag"` limits the choices to items whose tag matches the tag value of the team the turn belongs to (the opponent for a ban on a shared or exclusive pool); needs tagging assignment `fixed` or `chosen`',
    blind: 'pick only: the choice stays hidden from the opponent until `reveal`',
    reveal: 'only with blind: `"end"` (default) or the index of a later step after which the choice is shown',
    random: 'pick and ban only: the acting captain gets a Random tile that resolves the turn with a random available item',
  },
};

const rules = [
  'Return exactly one JSON object and nothing else: no Markdown fences, no comments, no text before or after it.',
  '`version` must be 1. Every step needs `team` and `action`.',
  '`pick` and `ban` steps need a `pool` that exists in `pools`; `count` may not exceed that pool\'s item count.',
  '`choose` steps are only valid when `tagging.assignment` is `chosen`, must use `tag` equal to `tagging.tag`, and may not have `pool`, `restrict`, `blind`, `random` or a `count` other than 1.',
  'Item ids are unique inside a pool. Image URLs (items and `tagging.images`) must be https://.',
  'When `tagging.assignment` is not `none`, `tag` and `values` are required; values are unique. For `fixed`, `seats` is required and both seats must be in `values` (different values if `sameTag` is `forbid`).',
  '`restrict: "tag"` is not allowed when assignment is `none`; with `chosen` an earlier `choose` step must already have set the tag.',
  '`blind` is only for `pick`; `reveal` is only allowed with `blind` and a numeric `reveal` must point to a later step.',
  '`tags` values on items and keys of `tagging.images` must be listed in `tagging.values`.',
];

const keysOf = (s: ZodObject): string[] => Object.keys(s.shape);

const fieldTable = (section: string, schema: ZodObject) =>
  keysOf(schema).map((k) => `- \`${k}\`: ${fieldNotes[section][k] ?? ''}`).join('\n');

const json = (p: unknown) => '```json\n' + JSON.stringify(p, null, 2) + '\n```';

/** Markdown brief for an AI assistant. Field lists come from the real schema. */
export function buildAiBrief(example: Preset = fullExample()): string {
  return [
    '# Task: write a BanPick draft preset',
    'You write a custom pick/ban draft preset as JSON for BanPick. I will give you my documents and rules. Read them, then produce one preset that follows the format below exactly.',
    '## Format',
    '### Preset',
    fieldTable('preset', presetSchema),
    '### Tagging (optional grouping, for example sides)',
    fieldTable('tagging', taggingSchema),
    '### Pool',
    fieldTable('pool', poolSchema),
    '### Item',
    fieldTable('item', itemSchema),
    '### Step',
    fieldTable('step', stepSchema),
    '### Display notes',
    '- Banned items stay visible in the pool, greyed out with a red cross, and cannot be chosen again. Picked items leave the pool.',
    '- Pools with few items are shown as large tiles. Set `iconSize` to `small`, `medium` or `large` to size the images.',
    '- A step with `random: true` adds a Random tile as the last tile of the pool.',
    '## Validation rules',
    rules.map((r) => `- ${r}`).join('\n'),
    '## Minimal valid example',
    json(minimalExample),
    `## Full example: ${example.name}`,
    json(example),
    '## Output',
    'Return one JSON object only wrapped in ```json ```. If my rules cannot be expressed in this format, pick the closest valid preset and put nothing else in the reply.',
    '',
  ].join('\n');
}
