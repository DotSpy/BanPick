# BanPick

A generic pick/ban draft platform. A draft is described entirely by a **preset** (JSON). The WARNO draft is one built-in preset; there is no game-specific engine code.

## Modules

| Module | Responsibility |
| --- | --- |
| `src/model.ts` | Preset and draft types (no logic) |
| `src/schema.ts` | Preset validation (zod), field-path errors; single source of truth for builder, import and load |
| `src/turns.ts`, `src/rules.ts`, `src/draft.ts` | Engine: step expansion, availability and tag rules, turn/timer/pause state machine, replay verification |
| `src/builder/` | Builder UI: pure edit operations, draft-order preview, share-link codec, DOM view |
| `src/persist/` | Documents, store port and use cases, Firestore adapter |
| `src/warno/` | WARNO data and the function that turns it into presets |
| `firestore.rules` | Security rules for `presets` and `drafts` |

The engine depends only on the `Preset` type. Nothing outside `src/warno/` knows about WARNO.

## Preset format

```jsonc
{
  "version": 1,
  "name": "My draft",
  "tagging": { "assignment": "chosen", "tag": "side", "values": ["nato", "pact"], "sameTag": "forbid" },
  "pools": {
    "maps": { "items": [{ "id": "m1", "name": "Hill", "image": "https://example.com/hill.png" }] },
    "divisions": { "scope": "shared", "items": [{ "id": "d1", "name": "1st Armored", "tags": { "side": "nato" } }] }
  },
  "steps": [
    { "team": "A", "action": "ban", "pool": "maps", "count": 2, "timer": 30 },
    { "team": "A", "action": "choose", "tag": "side", "count": 1 },
    { "team": "B", "action": "pick", "pool": "divisions", "count": 1, "restrict": "tag", "blind": true, "reveal": "end" }
  ],
  "pauses": { "between": false }
}
```

## Rules

- **Steps** are expanded into single-action turns (`count: n` becomes n turns). Actions are `pick`, `ban` and `choose` (choose a tag value).
- **Pools** have a scope. `global` (default): any pick or ban removes the item for everyone. `shared`: a ban removes the item from the opponent's options only, and a pick removes it for the picker only. `exclusive`: like `shared`, but a pick removes the item for both teams. The WARNO division rule (shared by default, exclusive for the open-exclusive preset) is expressed this way.
- **Tags** are attached to items. Assignment is `chosen` (a team picks a value in a `choose` step), `fixed` (a value per seat), or `none`. With `sameTag: "forbid"` the opponent cannot choose the value already taken; with two values the opponent gets the other one automatically and their choose turn is skipped. Tags are derived from history, never stored.
- **`restrict: "tag"`** limits a step to items carrying the tag value of the team that owns the choice. For a ban on a non-global pool that is the opponent.
- **Timers**: `timer` seconds per turn; on timeout the selected item (or a random available one) is chosen automatically.
- **Pauses**: `pause` is seconds before the step, or `"ready"` to wait until both captains confirm. `pauses.between` adds a confirm gate after each pick.
- **Images** are optional `https` URLs per item. A broken image falls back to the item name.
- **Blind picks**: a `blind` pick is hidden from the opponent until `reveal` (`"end"` or a step index).
- **History replay**: stored drafts are replayed through the same rules on load; an illegal history is rejected.
- Presets are validated in the builder, before saving, and again when loaded.

## Known limitation: blind picks are not secret

Blind picks are hidden **in the UI only**. The draft state, including blind choices, is stored in the shared draft document and is readable by anyone who can read it (including via browser dev tools). In addition, the engine validates against the full history, so in a `global` pool an opponent trying to pick a blind-picked item is refused, which reveals it. Real secrecy needs server-side hiding (for example, Cloud Functions), which is outside this MVP. Do not use blind picks where cheating matters.

## Persistence and permissions

- `presets/{id}`: preset JSON string plus `ownerUid`, `createdAt`, `updatedAt`. Read by id only (no list queries). Only the creator (anonymous uid) can update; this is enforced in `firestore.rules` and in `savePreset`. Presets cannot be deleted.
- `drafts/{id}`: seats are bound to the uid that claimed them. Rules check seat ownership and phase transitions; move legality is enforced by the client engine and re-verified on load.
- Presets can also be shared without a database through the compressed link produced by the builder (`#<code>`).
- The Firestore adapter and the rules are **not covered by automated tests** (no emulator in this repo). Verify them manually, and check current Firebase Spark quotas before launch.

## Not in the MVP

No undo/redo, no series (multi-game) logic, no preset deletion, no server-side hiding of blind picks.

## Development

```
npm install
npm test        # vitest
npx tsc --noEmit
npx vite        # builder UI
```
