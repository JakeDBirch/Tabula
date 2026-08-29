# Tabula — handoff notes for Claude Code

Project memory. Read before touching code. Live: https://jakedbirch.github.io/Tabula · Repo: https://github.com/JakeDBirch/Tabula

Author is Jake Birch — production-audio professional, tech-literate (Python, Apps Script, hardware) but not a JS dev. Wants the proper/native solution over wrappers or hacks, even if slower. Judges audio and touch feel **by ear / by hand on his iPhone** — headless tests can't replace that.

---

## What Tabula is

A touch-first grid sequencer that runs as a **single static HTML file**. Built primarily for iPhone (added to home screen as a PWA); works on desktop too. Web Audio API, React 18 (UMD), no framework/bundler beyond a Babel build.

---

## Build / run

```bash
npm ci            # or npm install — pulls Babel (@babel/core, cli, preset-env, preset-react)
npm run build     # compiles src/tabula.jsx → index.html   (ALWAYS run after editing)
npm run audit     # standalone CJS return_react2 audit
```

- **`src/tabula.jsx` is THE source.** `index.html` is a generated artifact — never edit it by hand.
- `build.mjs` strips the React import + `export default`, appends the mount call, runs Babel (preset-env + preset-react, `--compact`), wraps the output in an HTML scaffold with React 18 UMD CDN + PWA meta, then runs a **CJS audit pass** that greps for `return_react2` and fails the build if found (see Critical lessons). Keep the audit.
- GitHub Pages serves `index.html` from `main` — a push auto-deploys in ~30s.
- Preview locally: `.claude/launch.json` defines a `tabula` static server on :8137 rooted at the repo (works the same in a cloud sandbox). Serving the built `index.html` is the only way to see changes.

**Verifying changes:** the build validates syntax. For grid/paging/codec work, a headless Playwright pass over the built `index.html` is worth the setup (`npm i --no-save playwright react@18.2.0 react-dom@18.2.0`, serve a copy with the CDN `<script src>`s pointed at the local UMD builds, then drive the DOM and read back `localStorage["tnori-autosave"]` to assert on real pattern data). That's how the duplicate-bar overwrite bug was caught. Filter resource 404s out of the console check — a bare static server has no samples/manifest/lamejs. Logic (scheduler math, the pattern randomizer, range-slider frequency mapping) is best checked by extracting the pure function into a tiny Node harness and running Monte-Carlo/round-trip asserts — do NOT rely on headless AudioContext (gesture-gated, non-deterministic) and **do not auto-start playback** (Jake often has other audio running). UI/layout changes: verify in the browser preview (read the DOM / console, not just screenshots — screenshots have been flaky).

---

## Architecture

### Layers (three)

`SYNTH_LAYERS = ["synth","lead"]` plus drums:

- **synth** (POLY) — polyphonic, 16 rows × 16 cols.
- **lead** (MONO) — monophonic: at most one note per column, enforced by `cullMonoGrid` / `collapseToMono` after any grid mutation (RAND/MUT8/variation). Never let it go polyphonic.
- **drums** — 16-voice-ish grid, its own `drumEngine` (separate from the synth `Bell` engine) and its own `drumPats` state.

synth + lead share one `Bell` WebAudio engine — a VCO/VCF/VCA chain built fresh per `play()` call (that's the polyphony). Per-layer sound design lives in `layerParams` (waveform, ADSR, filter, octave, rvSend, dlySend…), read per-note via `play()`'s layer arg. The active-layer accessor pattern means render code like `<Knob value={waveform} onChange={setWaveform}/>` is automatically per-layer.

### Unified patterns (in progress)

A **pattern** now holds all three parts at once — `{id, name, bars, parts:{synth, lead, drums}}` — and is the unit a song sequences. `MAX_PATTERNS` = 16. Each part keeps its own **bar count**, `gridLen` and `speedMult`, and loops inside the pattern; everything re-syncs at the pattern top. A part's bar count is simply its own allocated lane width (`partBars`, which also understands a *packed* part via `_w` — measuring a packed sparse grid as one bar would rewrite every multi-bar pattern on save). The pattern's `bars` is derived: the longest part, re-computed by `syncPatBars` after anything reshapes a part, and it's what the master clock cycles on.

`patterns` + `activePatternId` are the real state. `pats` / `drumPats` / `activeId` / `activeDrumId` are **compatibility views** (`layerLib` / `partView`), and `setPats` / `setDrumPats` fold an edited per-layer library back through `mergeLayer` — that is what let ~190 per-layer call sites survive the model change unedited. `mergeLayer` handles edits, additions (a new id = a new pattern) and removals (a missing id = the pattern goes). A bar-count change touches **only the edited layer's part** — it used to carry across all three, which is what made adding a drum bar lengthen the synth. Delete these views as call sites get rewritten.

Whole-pattern lifecycle ops (`addPattern` / `dupPatternId` / `delPatternId`) go straight to `setPatterns` — duplicating through a per-layer view would produce a copy with two empty parts.

`unifyLegacyProject` migrates pre-unification saves: each populated song column becomes a pattern, then the libraries are paired by index so nothing in them is lost, and the column order becomes the `song`. Two data-loss bugs were caught here by testing, both worth remembering: a project with patterns but no arrangement migrated to only the active combination; and the old per-lane "filter ids against this layer's library" load step ran *after* unification had deleted those libraries, so it blanked every lane and wiped the arrangement. Legacy fixtures need an actual song in them or neither shows up. Lossy in one way by design: a drum pattern shared across columns becomes independent copies.

The **song page** is the pattern selector: a PATTERNS palette (tap a chip to make it the pattern every part page edits; `+` adds one, and DUP / DEL in the header act on the selected chip — DEL is two-tap-armed because deleting a pattern also empties its song slots) above one lane of 64 slots, laid out 8 across (`SONG_COLS`) and starting at two rows, growing a row at a time as the song fills — a slot holds a whole pattern now, so there was never a reason to show all 64 at once. Two ways to place: tap an empty slot to drop the selected pattern in, or **drag a palette chip onto a slot** (the gesture the old pattern pills had — a chip tap still just selects, drag is distinguished by a 6px threshold). Dragging also moves between slots, and off-grid clears. A drop lands on a **cell** (replace) or on the **seam** between two cells (insert / reorder, sliding the rest right): `_songHit` picks the nearest cell rect — measured once at drag start, since 64 `getBoundingClientRect`s per pointermove would be felt on a phone — and reads the outer 22% of its width as a seam. Nearest-rect rather than `elementFromPoint` so the gap between cells is a seam rather than "off the grid"; the off-grid slop is deliberately tight (0.35 cell) because off-grid CLEARS a slot and a near miss shouldn't. A slot can also **repeat**: press-and-hold (or right-click) a filled slot for a picker of 1–`SONG_MAX_REP`=4, drawn in the cell as that many pips with the sounding pass lit. Repeats live in a parallel `songRep` array rather than making a slot an object — `song` is a flat id list at four persistence sites, in the packed codec and in the legacy readers — and they expand inside `songSeq`, so the scheduler and `songPosR` still see a plain list and needed no changes; `_songPlayingSlot` walks the counts to map back to a cell. The count belongs to the slot's contents, so it travels on a drag and resets when a slot is cleared. Runs of the same pattern draw a `×N` badge that counts **plays, not cells**, and only when the run spans more than one cell. Above the symbol, mirroring the pips, is a row of **bar dots** — one per bar of the pattern; on the playing cell the current bar's dot swells on every quarter note, so the song page carries the tempo. They flex to fit (true dots to 8 bars, a segmented bar past that, since 32 countable dots don't fit a phone-sized cell). It rides `songPulse`, a `bar*4+quarter` integer the master clock publishes only when it changes — two renders a second at 120bpm, not eight — and the pulse restarts by keying the lit dot on `songPulse` so React remounts it and the CSS animation replays. The pattern pills are gone from every part page; the bar strip's handle names the current pattern instead.

The old per-layer pattern `chain`s, `synthPhrases` / `drumPhrases`, `sections` and their active ids are **gone** — they were serialized on every save but never read. `songMatrix` and `layerStore` are likewise **gone from live state** — they survive only inside the legacy readers (`unifyLegacyProject`, `migrateLegacyBass`, `_mapProjectPats`), which still have to understand old saves. Nothing in the running app reads either.

### Layer-store swap (removed)

**Gone.** Patterns used to be per-layer, so the inactive synth layer's library was parked in `layerStoreR` and swapped on every layer switch — the cause of the recurring "a track went silent when I switched layers" bug. `switchLayer` now just changes which part you're looking at, and `layerStoreR` no longer exists.

**Consequence:** the whole class of "resolve this layer's pattern from the right place" bugs is gone with it — there is one store and one active id. `_mapProjectPats` still walks a legacy save's `pats` / `drumPats` / `layerStore[layer].pats` so old packed projects decode, but nothing writes those shapes any more.

### Pattern data model

Each pattern: `grid[r][c]` (bool), `durs[r][c]` (int ≥1 note length in cells), `params[c]` (per-**column** step params), `gridLen` (loop length in steps), `bars`, `speedMult`, `id`, `name`.

- **Parts loop to fill, and every bar op is per-part.** A part sounds its own length and repeats it for as long as the pattern lasts, so a 1-bar drum part keeps going through a 4-bar pattern. Loop-to-fill comes from parts having **different bar counts** — NOT from a part's `gridLen` being shorter than its own allocation. That distinction is the whole design: if a part were allocated 4 bars but only sounded 1, the editor would show you three empty bars while you heard bar 1 repeating, and editing bar 1 would change all four. So ADD BAR / DUP BAR / ×2 / DEL BAR act on the **active part alone**, and a part that grows gets a real, empty, independently editable bar (`resizePatBars` grows `gridLen` with the allocation). The drums page shows the drums' bars; the synth page shows the synth's. `growLenTo` (synth tap / both paint paths / `setDrumCell`) still re-extends a part after the length slider has trimmed it mid-bar; erasing never shortens.
- **×2** (`doublePattern`, in `barOpsRow` and the SEQUENCE drawer) doubles the ACTIVE part and copies its data into the new half — the fast way to get a second nearly-identical pass to vary. A 1-bar drum loop under a doubled melody doesn't want doubling; it wants to keep looping to fill.
- **Patterns are multi-bar** (`bars`, 1–`MAX_BARS`=32). Every per-column lane (`grid`, `durs`, `params`, drum `vel`/`rat`/`motion`) is `patW(p) = bars*COLS` wide. `gridLen` is the playable loop length in steps, now `1..bars*16` — it is the single source of truth for length; bar count is just its allocation. `resizePatBars(p,n)` grows/shrinks every lane together (do NOT resize one by hand — a half-resized pattern reads `undefined` at playback and Babel won't catch it). `normalizePatBars` repairs anything loaded from disk.
- **`COLS` (=16) means STEPS PER BAR, and also the width of the visible editor page.** It is NOT the pattern width — use `patW(p)` / `gridW(rows)` for that. Keeping COLS as the view width is what lets all the layout math (`ci/COLS`, `rect.width/COLS`, the step bar) stay untouched: the grid draws a 16-column **window** into a wider pattern.
- **Bar paging.** `barPage` (shared across layers, clamped per-pattern via `barIdxIn`/`barOffIn`) picks the visible bar; `barOff = curBar*COLS`. The strip above the grid is **chips only** (`barChips`) — tap or drag them to page — plus a bar-count handle that opens the pattern drawer on mobile. Add / duplicate / delete bar and FOLLOW live with the other pattern ops: the mobile SEQUENCE drawer (`activeSheet==="pattern"`, thumb-sized) and the desktop sidebar (`barOpsRow`, compact). The drawer is mobile-only, so anything added there needs a desktop-sidebar counterpart or desktop loses the feature. Both sheets repeat `barChips`, because a sheet covers the strip: the bar sheet needs it (ADD/DUP/DEL BAR act on the **visible** bar) and so does the step sheet (the lanes show one bar at a time). Rule of thumb: anything paged by `barOff` needs chips wherever it's shown.
- **Adding a bar lands you on it.** ADD BAR pages to the new last bar and DUP BAR to the copy, and both clear FOLLOW — otherwise the playhead drags the page straight back off the bar you just made.
- **LOOP cycles one bar**, not the whole pattern: `patLen` becomes `COLS` and each part's cursor runs `loopOff + step%COLS`. The bar belongs to whatever is playing — the song's current entry in song mode, the pattern you're editing otherwise.
- **LOOP is pinned, not live.** `loopBar` is captured from the visible bar the moment LOOP is switched on and held there — paging, FOLLOW and the playhead can't move it (it used to read `barPageR` every tick, so the loop crawled around under you). Move it by switching LOOP off and on again from the bar you want. The scheduler reads `loopBarR`; `barPageR` now only feeds the editor's view offset. The pinned chip is marked with a steel underline (`C_LOOP`, the LOOP button's colour) — deliberately a different channel from the current-page fill and the gold `C_VARY` playing ring, so all three states read at once on a 2px-wide chip. `loopBar` is persisted at every `loopMode` site and clamped when the pattern shrinks. It pins the **pattern** too (`loopPat`): a bar index alone got applied to whatever the song was playing, so looping bar 4 of pattern B while the song sat in A sounded A's bar 4. Switching to a different pattern while LOOP is on moves the loop with you — that's explicit, unlike paging or FOLLOW.
- **LOOP holds the song's place instead of overriding it.** In song mode LOOP parks `songPosR` on the current entry and cycles one bar of *that* pattern; switching LOOP off carries on from where it was held. `inSong` is now just `songModeR.current` — the loop gate moved onto the song-advance step in the master clock. `loopBar` is a bar *index*, so it clamps into a shorter song entry.
- **Page-follow rides the EXISTING `followSeq`** (the transport's FOLLOW), not a toggle of its own — FOLLOW already means "keep the editor on what's playing" and the visible bar is the finer grain of that. A separate `barFollow` was tried and rejected. Chip taps don't clear it; a grid edit does, as always.
- **Two mobile sheets, not one.** `activeSheet==="bars"` (opened by the bar-count handle) holds the pattern ops + bar ops; `activeSheet==="pattern"` (the STEP chip) holds SPEED + the step lanes. Drums have no step lanes, so STEP routes to `"bars"` there. Sheet openers must be `onClick`, never `onPointerDown` — the backdrop mounts under the finger and the same tap's trailing click dismisses the sheet instantly. In render, `c` is the view column and `ac = barOff+c` is the data column. In the pointer handlers, `synthBarOffR()` / `drumBarOffR()` convert a hit-tested view column to absolute — they read live refs so the `[]`-dep useCallbacks don't bake in a stale page. **Paged, not scrolled**, deliberately: a scrolling grid needs a parent `overflow-x`, which is the iOS gesture-interception trap below.
- **Bar-scoped ops.** RAND / CLR / CPY / PST / MUT8 and the STEP-lane RST/RAND all act on the **visible bar**, not the whole pattern (`sliceCols`/`spliceCols`/`sliceFlat`/`spliceFlat`). DUP/DEL stay pattern-level and must carry `bars`. `⧉` (duplicate bar) *inserts* after the visible bar — it opens a gap with `openBarGap` and slides later bars right; overwriting the next bar instead is a bug that was caught once already. It must go through `setPatterns` and insert into **all three parts**: doing it through a per-layer view makes `mergeLayer` resize the other two, which appends a blank bar at the END rather than inserting one, and the parts slide out of alignment.
- **VARY rerolls per bar** (`s % COLS === 0`), scoped to that bar's column window, so shifts/ghosts wrap inside the bar and earlier bars keep their roll. On a 1-bar pattern this is identical to the old per-loop behaviour.

- `params[c]` keys: `vel, flt, dly, rev, rhy, dur, oct, glide` (see `defaultStepParams`). `rev`/`dur` were added after the first arch doc.
- `rhy` is **ratchet only** (1–4 retriggers). rhy=0-as-tie is a dead semantic — durations live on `durs`.
- **`speedMult`** = per-pattern step-duration multiplier. `stepDur = 60/bpm/4 * speedMult`. The button LABEL is the speed factor, the value is its inverse: `2×` (twice as fast) = `mult 0.5`; `½×` = `mult 2`. `SPEED_OPTS` order is value-ascending (2×,1×,⅔×,½×,⅓×,¼×). Duplicating a pattern must carry `speedMult` (it's part of the pattern).
- Rows are scale degrees (pitch is already scale-quantized): `fromBot = ROWS-1-row`, tonic at `fromBot % 7 == 0`, triad tones (1/3/5) at `fromBot % 7 ∈ {0,2,4}`.

### Song + scheduler

`song` = `Array(64)` of pattern-id-or-null; `songSeq` is that list with its gaps closed, and `songPosR` indexes it. `songMode` = playback intent; `songView` = UI gate (decoupled). There is no sync/free/random any more — playback is always linear.

The scheduler is a lookahead loop (~25 ms tick, ~100 ms ahead) over ONE pattern:

- **Parts** each run their own cursor (`freeR.current[layer] = {step, nextAt}`) at `absStepDur * part.speedMult`, looping within their own `gridLen`. They drift apart inside the pattern — that's the polymeter.
- **The master clock is one pattern long** (`patLen = bars * COLS` absolute steps). When it wraps, the song advances to its next entry and every part cursor resets to step 0. That single rule replaced sync/free/random and the old `cycleLen = min over populated layers` fudge, which existed only to invent a shared bar for three independent lanes.

### Controls & interaction conventions

- **KnobSlider**: ballistic *relative* drag (dragging the full width moves ~half the range; Ctrl/Cmd = ultra-fine). **Double-tap / double-click = reset to `def`** (or 0 for bipolar, else min). No jump-to-position.
- **RangeSlider** (dual-thumb, used for delay HP/LP "FILTER" and reverb LF/HF "DAMP"): both thumbs live on a shared **log-frequency axis** (20 Hz–20 kHz); the fill between is the passband. Grab a thumb → move that corner; grab the **line between** → move both together keeping the gap; grab outside → nearer thumb. Each thumb clamps to its own param's frequency span; a gap stops them crossing. `toFreq`/`fromFreq` per thumb convert axis ⇄ param.
- **Per-step popup** (right-click / long-press a note): edits `params[c]` for that column. Rendered as a slider list (`PARAM_ARMS`) with an alternative radial long-press drag. A `sliderDragR` flag stops the radial angle-picker from also firing during a slider drag (that caused cross-param "ghost" moves).
- **Ballistic drag helper** = `ballisticDelta(pd, dim, range)`. Double-tap detection = `isDoubleTap(e, key?)` (custom, because DOM `dblclick` is unreliable on touch).
- **STEP lanes**, **autosave**, **MP3/MIDI export**, and the **project library** (named projects, persisted via `storageSet("projects", …)`) all exist.

### The PROJECT menu

Everything that isn't playing or editing — NEW PROJECT, the project library, LINK / EXPORT / IMPORT / MIDI / MP3 — lives behind **one menu**, `projectMenuBody`. It used to be a permanently-open column pinned to the bottom of the desktop sidebar; none of it is wanted mid-take. Desktop opens it as a modal (a `☰ PROJECT` button where the panel was; ESC or a backdrop tap closes, and the keydown handler hands the keyboard to the modal while it's open so space types a space instead of starting playback). Mobile keeps the existing PROJECT bottom sheet, which now renders MIX and then the same body. **One body, two mounts** — don't fork it, or the platforms drift.

### The project library

**Named projects in a list, not fixed slots.** A project is `{id,name,updated,data}`: `id` is opaque and permanent and is what SAVE / LOAD / DELETE address; `name` is only ever a label. Picking a row highlights it and fills the name field, and **one** set of three buttons acts on the pick — three buttons per slot × four slots was the old shape and it forced a filing decision on every save. SAVE with a row picked overwrites it under whatever the name field now says, so **renaming is just editing the name and saving**; with nothing picked SAVE creates a new project. Tapping the picked row again, or DESELECT, gets you back to creating. Don't add a second `＋ NEW`-ish button — one already exists at the top of the menu meaning "reset the live session", and the two labels collided the first time round.

**A new project arrives already named.** `randomName` picks two words (756 combinations, avoiding names already in the list) and drops them in the name field whenever the target becomes "new" — on open, on DESELECT, on NEW PROJECT. "Untitled 3" is a label you have to replace before it means anything; a name you can recognise a month later means nobody has to invent one before they're allowed to save. Always editable, and `⟲` in the DESELECT slot rolls again.

DEVICE and CLOUD are the same list against different stores, chosen by a segmented toggle, which is what keeps it to one set of buttons. Local lives at `storageSet("projects", …)`; `migrateSlotLibrary` carries a legacy `{S1..S4}` save across as four named projects (it also passes an already-migrated array straight through). `PROJ_MAX`=24 guards the ~5MB localStorage quota against ~250KB projects; a quota failure rolls the list back so what's on screen matches what's on disk.

`showFlash` used to print into that always-visible panel, so hiding the panel would have hidden "SAVED S1" / "UNDO" / "MIDI EXPORTED". There's now one **floating status toast** (top-centre, above the modal's scrim) that shows `flash || shareFlash` for the whole app. Note `loadKit` finishes with its own `showFlash(kit.label)`, so a LOAD's confirmation is usually stomped by the kit name a beat later — pre-existing, mildly annoying, unfixed.

### Cloud sync (Supabase)

The cloud is the same named list on the account instead of the device, reached by the DEVICE/CLOUD toggle. **The table needed no schema change to go from slots to names**: the `slot` column carries the project id and the `name` column the label, which is what it was reserved for. Save is `JSON.stringify(getShareState(true))` into one `text` column; load is `applyShareState(JSON.parse(...))` — the same packed payload a file export carries, which is only viable because of the sparse codec (~244KB for 32 bars, not ~2.4MB). Refused above `CLOUD_MAX_BYTES` (6MB) before it leaves the device.

Auth is email one-time-code, hand-rolled over `fetch` against Supabase's REST endpoints rather than `supabase-js` — Tabula is one static file with two UMD tags, and an SDK from a CDN would also have to be precached by the service worker. Only the **refresh token** is persisted (`storageSet("cloud", …)`); every launch trades it for a fresh pair, and a failure drops the session rather than showing a dead account. The slot list selects `slot,name,updated_at` and deliberately **not** `data` — opening the menu shouldn't download every project. `sw.js` skips `/auth/v1/` and `/rest/v1/`; they're cross-origin GETs that would otherwise land in its cache-first branch and serve a stale list forever.

`CLOUD_URL` / `CLOUD_KEY` at the top of the source are blank, so `CLOUD_ON` is false, the whole section doesn't render and nothing touches the network. Filling them in + `npm run build` is the entire switch-on. The anon key is public by design (RLS decides who sees what), so it belongs in the source. Setup, SQL and the email-template change: `docs/cloud-sync.md`.

### FX

Global delay + reverb buses; each layer has send amounts, and per-step `dly`/`rev` override the layer default. Reverb = Schroeder 8-comb (Freeverb-ish), tap BEFORE the feedback shelves so damping compounds per recirculation (true frequency-dependent decay). `setRvSize` scales both feedback and comb delay length (concave, up to ~2.6× room). `setRvMod` = per-comb LFO chorus on the tail. `RV_DAMP_DB` = per-pass shelf cut.

---

## Persistence — the multi-site rule

When you add saved state, add it to EVERY site or saves/undo silently lose it:

1. `SESSION_DEFAULTS` (freeze) **and** the matching reset in `doNew`.
2. `captureSnapshotR` / `applySnapshot` (undo/redo).
3. `getShareState` / `applyShareState` (share links + file export/import).
4. `doSave` snap object / `doLoad` apply — and the `[["key",setter],…]` load arrays (there are several; grep the sibling param, e.g. `rvPreDelay`, to find them all).
5. The **play-start re-apply** block that pushes FX values to the engine on every play.
6. For engine params also: state + `useEffect(()=>bell.current.setX(x),[x])` + the engine method + the UI control.

**Sparse codec (required, not an optimization).** `packProject` / `unpackProject` (built on `packPat` / `unpackPat`) store only the cells that are ON and the values that differ from default. Dense JSON costs ~3.3KB per bar per pattern, so a 32-bar project serializes to ~2.4MB — which breaks share links (whole project base64'd into the URL) and blows the ~5MB localStorage quota autosave lives in, and would put 50 dense undo snapshots in phone memory. Packed, that same project is ~244KB, and an ordinary project is ~4× smaller than the old dense 1-bar encoding. Applied at all four persistence sites; `packPat` also serves as the undo deep copy (it returns fresh arrays for every heavy lane, so no JSON round-trip is needed first). Decoding is tolerant — anything without the `_pk` marker is a pre-codec dense save and passes straight through, so old projects still load.

Autosave is separate (`storageSet("autosave", …)` — `window.storage`, falling back to `tnori-`-prefixed localStorage): a lean snapshot (no samples) written on a debounce, samples on a dirty flag, **never during playback or export**. Restored on mount; a loaded share link is a "preview" that adopts on first edit.

User samples serialize as base64 in saves (`serializeSamples`); kits load via `loadKit`. Samples ARE wired up now (older doc said otherwise).

---

## Critical lessons (don't relearn)

- **`return_react2`**: module-level arrow functions returning JSX broke the old artifact viewer's CJS transform. Inline JSX; never extract to a top-level `const X = () => <jsx>`. The build audit guards this — keep it.
- **useCallback empty-deps trap**: `useCallback(fn, [])` baked first-render closures over `pushHistory` etc. Fix is ref-based: `pushHistoryR.current` reassigned each render, stable callbacks invoke `.current()`. Same for `captureSnapshotR`. Don't collapse back to direct closures.
- **Grid pointer events** live on the parent `gridRef` container, not per-cell. If you change grid event handling, test on iPhone immediately.
- **iOS gesture interception**: parent `touch-action: pan-x` / `overflow-x: auto` makes Safari swallow gestures at the OS level — vertical drags don't propagate. If a drag feels "stuck horizontally," check the parent's `touch-action`.
- **Babel compiles undefined refs happily** — only fails at runtime. When you rename/extract a variable, grep the old name everywhere before building. Worse in JSX values: `const songPage = (<div onClick={addPattern}/>)` defined *above* `addPattern` silently binds `onClick={undefined}` (Babel lowers `const` to `var`, so there's no TDZ error and no crash — the control just does nothing). Defer the lookup: `onClick={()=>addPattern()}`.
- **A silent `catch(e){}` around project restore hides everything.** The mount restore used to swallow its exception, so a throw inside `applyShareState` looked exactly like "the project didn't load" — and because no state changed, autosave never fired either, leaving the old save in place to be re-read next time. It now logs. That is how a deleted-but-still-called `migrateLegacyBass` was found; without the log there was no symptom to chase.
- **Never call a setState function from inside another setState updater.** `setPatterns(ps=>{ …; setActivePatId(x); return next; })` looks fine and silently drops the whole update. Compute first, then call the setters in sequence.
- **Cross-layer audio**: always resolve pattern data through `resolveLayerPat` / `layerStoreR.current[layer]`, never assume `patsR.current` (only valid for the active layer).

---

## Workflow

- **Push at will, to `main`**: commit and push without asking (Jake lifted the old never-push rule on 2026-05-29; on 2026-08-29 he asked for work to land on `main` and stay there). Pages serves `index.html` from `main`, so **work parked on a feature branch has not shipped** — if a session is handed a working branch, still fast-forward `main` onto it and push before calling anything done. No force-push. Always actually run `git push`, and check `origin/main` after a `git fetch` rather than a stale local ref, before claiming "deployed."
- **No backward-compat obligation inside the app**: a rescan, a lost automation, or a changed render of an old session are facts to report, not blockers — don't contort the code to preserve them unless asked.
- Report outcomes honestly: if you couldn't verify audio by ear, say so; don't claim it "sounds right."
- Direct, concise. Disagree when an ask is technically wrong — Jake has been burned by AI sycophancy and gives precise corrections; reread the original ask before retrying.

## Open threads

- **Cloud sync (task #87)**: **built and shipped, switched off.** See "Cloud sync (Supabase)" above and `docs/cloud-sync.md`. Waiting on Jake only for the three setup steps: create the Supabase project, run the SQL, add `{{ .Token }}` to the magic-link email template — then paste the **project URL + anon key** into `CLOUD_URL` / `CLOUD_KEY` and rebuild. Don't create his account or enter credentials. Verified end-to-end against a mocked Supabase (sign-in, wrong code, save, load, overwrite, clear, refresh-token restore, sign-out); never run against the real service.
- **Cloud sync, next**: last-write-wins, manual only. Auto-sync and conflict handling are deliberately not in v1.
- **Selling it (task #88)**: the end goal is a paid iOS app + site, with project storage as the premium feature. Three things follow that aren't built yet: the premium gate must live in **RLS, not the client** (the publishable key is in the JS, so any signed-in user can hit PostgREST directly — an `entitlements` table written only by a service-role webhook, with the write policy on `projects` checking it); in-app **account deletion** is an App Store requirement; and the free Supabase plan can't ship (7-day pausing, thin backups). Naming is unresolved — "Tabula" collides with an open-source PDF tool and, worse for discovery, sits one letter from "tabla" in App Store search.
- Long-form content beyond 64 bars is not planned.
