# BanPick

[![Support me on Ko-fi](https://img.shields.io/badge/Ko--fi-Support%20me-ff5e5b?logo=ko-fi&logoColor=white)](https://ko-fi.com/dotspy)

A generic pick/ban draft platform. A draft is described entirely by a **preset** (JSON). The WARNO draft is one built-in preset; there is no game-specific engine code.

## Support

BanPick is free and open. If it saves your community some drafting headaches, you can [support me on Ko-fi](https://ko-fi.com/dotspy).

## Modules

| Module | Responsibility |
| --- | --- |
| `src/model.ts` | Preset and draft types (no logic) |
| `src/schema.ts` | Preset validation (zod), field-path errors; single source of truth for builder, import and load |
| `src/turns.ts`, `src/rules.ts`, `src/draft.ts` | Engine: step expansion, availability and tag rules, turn/timer/pause state machine, replay verification |
| `src/builder/` | Builder UI: pure edit operations (edit.ts), soft step warnings (check.ts), the two-lane draft order (order.ts), share-link codec, DOM view |
| `src/timeline.ts` | Timeline view shared by the builder preview and the room: every turn in order, marked done, current, skipped or upcoming, with who acted and what was chosen (blind picks stay hidden until reveal) |
| `src/width.ts` | Page width control (Wide by default; Compact = the original narrow layout; Full): the header "Width" select saves the choice in localStorage; `index.html` applies it before first paint. `#app` uses the `--app-max` token, so pools add columns and the room, timeline and builder grow with the window. Mobile (<=40rem) is unchanged |
| `src/theme.ts` | Dark (default) and light theme: the header "Dark mode" toggle (`aria-pressed`) saves the choice in localStorage; an inline script in `index.html` applies it before first paint. Colours are tokens in `src/styles.css` (`:root` = dark, `:root[data-theme='light']`) |
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
- **Images** are optional `https` URLs per item. A broken image falls back to the item name. A pool can set `iconSize` (`"small"` | `"medium"` | `"large"`, default `medium`) to size its icons in the pool buttons, history and timeline (the builder's item table always uses small thumbnails); the WARNO presets use `large` for maps. Presets without the field stay valid. Tag values can have icons too: `tagging.images` maps a value (e.g. `nato`) to an https URL, shown on the choose buttons, history and timeline; the WARNO presets use `sides/nato.png` and `sides/pact.png` from the icons repo. The builder shows a "<tag> values" section with an image-link field and preview per tag value (any tag, any values; a preset has one tag group), validated as https by the schema. Long labels wrap inside their tile.
- **Blind picks**: a `blind` pick is hidden from the opponent until `reveal` (`"end"` or a step index).
- **Launcher**: a one-line hint under the title, then three tabs (active tab underlined): "Built-in presets", "Preset builder" (the builder lives in its own tab; Edit copy and the AI paste box switch to it) and "Build with AI". The presets tab is a two-column layout: radio-style cards on the left, grouped under their headings (generic and WARNO), each with a bold name, a muted second line (the details from the name, then total bans and picks) and a tag (MOBA, WARNO, Generic); a preview of the selected preset on the right (bans and picks per team, timer, every step in order). "Create room" (filled) and "Edit copy" (ghost) sit under the list, right-aligned. "Recently used" chips (localStorage `banpick-recent`, last 3 presets) appear once you have used a preset. The header keeps Width and Dark mode in one settings menu (the sliders icon).
- **Preset builder** (launcher tab): two columns on wide screens. Left: General (name, `Pause between steps` switch), then Steps, then Pools. Steps are one-line summaries (`#4 · Team B · ban 1 from maps · 30s · blind`); click one to edit it, or use the drag handle, arrows, duplicate and remove. `Quick fill` appends alternating A/B steps (`Alternate A/B`), a swapped copy of the last step (`Mirror`) or N copies of it (`Repeat ×N`); a step that needs more items than its pool holds shows a warning. Pools are collapsed cards (`name · 42 items` with `Scope` and `Size` chips); only one is open at a time, showing a compact table (thumbnail, id, name, tag chips) with a filter box and 50 rows per page. Click a row to edit it (id, name, tags, image link); only one row is editable at once. `Paste list` (one name per line), `Import` (JSON array or CSV `id,name,"tag=value, …",image`; existing ids are skipped) and `Export` (copies the items as JSON) sit in the pool header. Right, sticky: the draft order as a two-lane timeline (ban red dashed, pick green; each chip shows its number and pool; hovering highlights the step, clicking scrolls to it) and a collapsed `Preset JSON (advanced)` with `Copy JSON` and `Edit raw` (read-only until you press it; valid JSON then replaces the form). A sticky bar at the bottom shows the status (`Unsaved changes`, `Saved just now`, or why Save is off) with `Load from built-in`, `Reset` (back to the last saved or loaded version), `Copy share link`, `Save` and, after saving, `Create room`.
- **Build with AI** (launcher tab, advanced): a 3-step row (Copy brief, paste into any AI chat with ChatGPT/Claude/Gemini links, then a descriptive step 3 that shows ✓ Valid — N teams, N steps after the check; Upload .json sits next to the field label and the field also takes drop, and it grows with content; `Validate & preview` shows a summary or errors with paths and JSON line numbers; `View brief` shows the text; a note says nothing is uploaded). `Copy AI brief` copies a Markdown brief (src/ai-brief.ts) for any AI chat. Its field lists come from the real zod schema (src/schema.ts), and the examples are real presets, so it cannot drift; a test fails if a schema field has no description. `Download JSON example` saves the full example, and the paste box runs the existing parsePresetJson and can open a valid preset in the builder. No backend call, no API key.
- **Random**: a pick or ban step with `"random": true` also shows a "Random" tile with a dice icon as the last tile of the options grid (disabled unless it is your turn). It resolves the turn with a random item drawn from the currently available ones (same restrictions, used-item and scope rules as a manual action). Blind picks stay hidden as usual. The history and timeline mark the entry as random. Not allowed on `choose` steps. The draw runs in the captain's browser (trusted-peer model, like timers); a timer that runs out still commits the selection or a random item as before. The builder has a "Random" checkbox per step.
- **History replay**: stored drafts are replayed through the same rules on load; an illegal history is rejected.
- Presets are validated in the builder, before saving, and again when loaded.

## Known limitation: blind picks are not secret

Blind picks are hidden **in the UI only**. The draft state, including blind choices, is stored in the shared draft document and is readable by anyone who can read it (including via browser dev tools). In addition, the engine validates against the full history, so in a `global` pool an opponent trying to pick a blind-picked item is refused, which reveals it. Real secrecy needs server-side hiding (for example, Cloud Functions), which is outside this MVP. Do not use blind picks where cheating matters.

## Persistence and permissions

- `presets/{id}`: preset JSON string plus `ownerUid`, `createdAt`, `updatedAt`. Read by id only (no list queries). Only the creator (anonymous uid) can update; this is enforced in `firestore.rules` and in `savePreset`. Presets cannot be deleted. **Presets expire 6 months (183 days) after their last save**: `loadPreset` reports them as expired and `firestore.rules` refuses to serve them (`PRESET_TTL_MS` in `src/persist/docs.ts` and the `fresh()` helper in the rules hold the same number). Saving again renews the clock; `updatedAt` may not be set more than 5 minutes into the future. Expired documents stay in the database (there is no backend to delete them), they are only unreadable.
- `drafts/{id}`: seats are bound to the uid that claimed them. Rules check seat ownership and phase transitions; move legality is enforced by the client engine and re-verified on load. preset, 	urnTeams and recorded history are top-level fields so rules can pin them: they cannot change after creation, history grows by at most one entry per write (for the turn now playing, by that team's seat, or an auto entry once the deadline has passed), 	urnIndex only moves forward and exactly when an entry is added, and a seat sets only its own confirm flag. **Not enforceable in rules** (the state blob is opaque JSON): pool membership, tag restrictions, blind/availability legality, the other fields inside state (ready flags, selection, connected), deadline values, strict one-step turn advance (exhausted pools legally skip turns), preset name/step-count limits and tagging image links (the preset is one string; only item image links are checked to be https). Clients detect tampering by replaying history, they cannot prevent it. Spectators cannot advance overdue timers.
- Presets can also be shared without a database through the compressed link produced by the builder (`#<code>`).
- The Firestore **security rules are tested against the emulator**: `npm run test:rules` (75 rules tests plus 7 adapter tests in `rules-tests/`). It needs a **HotSpot JDK 21+ on PATH or `JAVA_HOME`** (for example Corretto or Temurin). OpenJ9/Semeru does not work and cannot be fixed from this repo: the emulator (v1.22.0) sizes objects in `SizeOf.isCompressedOops`, which calls `HotSpotDiagnosticMXBean.getVMOption("UseCompressedOops")`. OpenJ9 throws `IllegalArgumentException: OpenJ9 doesn't support the API`, so loading rules returns a 500 (see `firestore-debug.log`). Checked on Semeru 21.0.3 (OpenJ9 0.44); setting `-XX:±UseCompressedOops` via `JAVA_TOOL_OPTIONS` does not help. Supported: Corretto, Temurin or any other HotSpot JDK (verified on Corretto 25). The first run downloads the emulator jar. The rules tests are separate from `npm test`, which needs no Java. The Firestore adapters (`src/persist/firestore.ts`, `src/room/firestore.ts`) are now covered by emulator tests (`rules-tests/adapters.test.ts`); only a real Firebase project and anonymous auth remain untested (blocked: no project of our own is configured; see below).

### Firestore free-tier (Spark) quotas

Source: <https://firebase.google.com/docs/firestore/quotas>, read on 2026-11-04. Quotas are daily and reset around midnight Pacific time; one free database per project.

| Free quota | Amount |
| --- | --- |
| Stored data | 1 GiB |
| Document reads | 50,000 per day |
| Document writes | 20,000 per day |
| Document deletes | 20,000 per day |
| Outbound data transfer | 10 GiB per month |

Hard limit relevant here: a document is at most 1 MiB. Presets are capped at 100,000 characters by `firestore.rules`.

Rough budget (our estimate, not from Firebase): every write to a draft is pushed to each open listener and counts as one read per listener, so a draft with 2 captains and a few spectators does about 3-5 reads per write. A short draft is roughly 20-40 writes, so the writes limit allows on the order of 500-1,000 drafts per day, and reads are the tighter limit when many spectators watch. Re-check the quotas page before launch, as they can change.

## Running a draft

Open `#room/<roomId>/<presetRef>`: one link for everyone, with no seat in it. A browser without a seat chooses Team A, Team B or Watch; a taken seat is shown as taken. Claiming is first come, first served and bound to the browser's anonymous uid, so a reload restores the seat, and a captain can leave the seat in the lobby to change it. `presetRef` is `builtin-<id>` for a WARNO preset or a saved preset id. The first opener creates `drafts/{roomId}`; each seat is bound to the browser's anonymous uid. Set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID` (for example in `.env.local`) and enable Anonymous sign-in. Picking is two clicks: select, then confirm; if the timer runs out the selected (or a random) item is committed by any connected browser. Captains can set their name in the form above the draft. If the live subscription errors, the room shows Connection lost… Reconnecting… and resubscribes with exponential backoff (1 s, 2 s, 4 s … capped at 30 s). Writes that fail with a transient Firestore error (unavailable, deadline-exceeded, borted) are retried up to 3 times with the same backoff; permission and validation errors are not retried. This logic is in src/room/backoff.ts and src/room/room.ts and is tested with a flaky in-memory store.

## Example presets and emulator dev mode

Built-in examples live in `src/examples/presets.json`: **Captains Mode** (A pick, B pick, A ban, B ban, fixed sides) and **Fixed sides (blind)**. For a local two-browser run, start `firebase emulators:start --only firestore,auth` (HotSpot JDK) and run Vite with `VITE_FIREBASE_EMULATORS=true` plus demo `VITE_FIREBASE_*` values. A manual two-browser run (captain A, captain B, spectator) passed 41/41 checks for seats, turn order, timers, pauses, blind reveal and spectator view.

Known limits: captains are trusted peers, so a seat owner can forge `deadline`, `confirm` or `ready` in the state, and deadlines use client clocks (same as WARNO). The UI/UX review findings are fixed: a built-in preset launcher and a links panel with the one room link, focus kept while editing, JSON and route errors shown, a "You are Captain X" line, item images, plain-language turn text, a timer that updates without re-rendering (with `aria-live` on the turn text), labelled controls, number limits, save feedback, viewport, title and hashchange handling. Re-run in two browsers: 41/41 room checks plus 6/6 builder checks. A second UI/UX pass added a design system in `src/styles.css` (colour, type, spacing tokens; 44px tap targets; visible focus ring; seat, turn-mode, selected-item and pick/ban history styling; mobile layout), an app header, a friendly error box with a back link, visible field labels, `aria-pressed` on the selected item, and a "Room created" confirmation. Unit tests: 466 (`npm test`); rules tests: 44 (`npm run test:rules`; it can also be run against already-running emulators with `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npx vitest run --config vitest.rules.config.ts`).

## Not verified against a real Firebase project

The adapters and anonymous sign-in (src/firebase.ts) have only run against the emulator. To verify: create a dedicated Firebase project, enable Anonymous sign-in, set the VITE_FIREBASE_* variables, deploy `firestore.rules` (`firebase deploy --only firestore:rules --project <id>`; the deployed rules must match this repo, otherwise picks and bans fail with `permission-denied`), and run a two-browser draft. Do not reuse another app's project, since deploying the rules replaces its existing ones.

## Development

```
npm install
npm test        # vitest (unit and view tests, no Java needed)
npm run build   # production build (vite build)
npm run test:rules  # Firestore rules against the emulator (needs a HotSpot JDK 21+)
npx tsc --noEmit
npx vite        # builder UI
```

## Deploying to GitHub Pages

`.github/workflows/pages.yml` builds and deploys the site on every push to `master` (or by hand from the Actions tab). The live URL is <https://dotspy.github.io/BanPick/>. One-time setup in the repository settings:

1. **Settings > Pages**: set **Source** to **GitHub Actions**.
2. **Settings > Secrets and variables > Actions > Variables**: add `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID` and `VITE_FIREBASE_APP_ID` with the web-app values from the Firebase console. They identify the project and are not secrets, so repository variables are fine. Without them the site builds and the builder works, but rooms and saved presets show "Firebase is not configured".
3. In the Firebase console, **Authentication > Settings > Authorized domains**: add `dotspy.github.io`, otherwise anonymous sign-in is refused from the deployed site.
4. Push to `master` (or run the workflow). The first run creates the `github-pages` environment.

The build sets `BASE_PATH=/BanPick/` (see `vite.config.ts`) so assets load under the project path; routing uses the URL hash, so no 404 fallback is needed. Serving from a custom domain means setting `BASE_PATH` to `/` in the workflow.
