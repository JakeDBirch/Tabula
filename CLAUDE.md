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

A **pattern** now holds all three parts at once — `{id, name, bars, parts:{synth, lead, drums}}` — and is the unit a song sequences. `MAX_PATTERNS` = 16. Each part keeps its own `gridLen` and `speedMult` and loops inside the pattern; everything re-syncs at the pattern top.

`patterns` + `activePatternId` are the real state. `pats` / `drumPats` / `activeId` / `activeDrumId` are **compatibility views** (`layerLib` / `partView`), and `setPats` / `setDrumPats` fold an edited per-layer library back through `mergeLayer` — that is what let ~190 per-layer call sites survive the model change unedited. `mergeLayer` handles edits, additions (a new id = a new pattern) and removals (a missing id = the pattern goes), and carries a bar-count change across all three parts. Delete these views as call sites get rewritten.

Whole-pattern lifecycle ops (`addPattern` / `dupPatternId` / `delPatternId`) go straight to `setPatterns` — duplicating through a per-layer view would produce a copy with two empty parts.

`unifyLegacyProject` migrates pre-unification saves: each populated song column becomes a pattern, then the libraries are paired by index so nothing in them is lost, and the column order becomes the `song`. Two data-loss bugs were caught here by testing, both worth remembering: a project with patterns but no arrangement migrated to only the active combination; and the old per-lane "filter ids against this layer's library" load step ran *after* unification had deleted those libraries, so it blanked every lane and wiped the arrangement. Legacy fixtures need an actual song in them or neither shows up. Lossy in one way by design: a drum pattern shared across columns becomes independent copies.

The **song page** is the pattern selector: a PATTERNS palette (tap a chip to make it the pattern every part page edits, `+` adds one) above one lane of 64 slots. Two ways to place: tap an empty slot to drop the selected pattern in, or **drag a palette chip onto a slot** (the gesture the old pattern pills had — a chip tap still just selects, drag is distinguished by a 6px threshold). Dragging also moves between slots, and off-grid clears. Runs of the same pattern draw a `×N` badge without merging the cells. The pattern pills are gone from every part page; the bar strip's handle names the current pattern instead.

The old per-layer pattern `chain`s, `synthPhrases` / `drumPhrases`, `sections` and their active ids are **gone** — they were serialized on every save but never read. `songMatrix` and `layerStore` are likewise **gone from live state** — they survive only inside the legacy readers (`unifyLegacyProject`, `migrateLegacyBass`, `_mapProjectPats`), which still have to understand old saves. Nothing in the running app reads either.

### Layer-store swap (removed)

**Gone.** Patterns used to be per-layer, so the inactive synth layer's library was parked in `layerStoreR` and swapped on every layer switch — the cause of the recurring "a track went silent when I switched layers" bug. `switchLayer` now just changes which part you're looking at, and `layerStoreR` no longer exists.

**Consequence:** the whole class of "resolve this layer's pattern from the right place" bugs is gone with it — there is one store and one active id. `_mapProjectPats` still walks a legacy save's `pats` / `drumPats` / `layerStore[layer].pats` so old packed projects decode, but nothing writes those shapes any more.

### Pattern data model

Each pattern: `grid[r][c]` (bool), `durs[r][c]` (int ≥1 note length in cells), `params[c]` (per-**column** step params), `gridLen` (loop length in steps), `bars`, `speedMult`, `id`, `name`.

- **Patterns are multi-bar** (`bars`, 1–`MAX_BARS`=32). Every per-column lane (`grid`, `durs`, `params`, drum `vel`/`rat`/`motion`) is `patW(p) = bars*COLS` wide. `gridLen` is the playable loop length in steps, now `1..bars*16` — it is the single source of truth for length; bar count is just its allocation. `resizePatBars(p,n)` grows/shrinks every lane together (do NOT resize one by hand — a half-resized pattern reads `undefined` at playback and Babel won't catch it). `normalizePatBars` repairs anything loaded from disk.
- **`COLS` (=16) means STEPS PER BAR, and also the width of the visible editor page.** It is NOT the pattern width — use `patW(p)` / `gridW(rows)` for that. Keeping COLS as the view width is what lets all the layout math (`ci/COLS`, `rect.width/COLS`, the step bar) stay untouched: the grid draws a 16-column **window** into a wider pattern.
- **Bar paging.** `barPage` (shared across layers, clamped per-pattern via `barIdxIn`/`barOffIn`) picks the visible bar; `barOff = curBar*COLS`. The strip above the grid is **chips only** (`barChips`) — tap or drag them to page — plus a bar-count handle that opens the pattern drawer on mobile. Add / duplicate / delete bar and FOLLOW live with the other pattern ops: the mobile SEQUENCE drawer (`activeSheet==="pattern"`, thumb-sized) and the desktop sidebar (`barOpsRow`, compact). The drawer is mobile-only, so anything added there needs a desktop-sidebar counterpart or desktop loses the feature. Both sheets repeat `barChips`, because a sheet covers the strip: the bar sheet needs it (ADD/DUP/DEL BAR act on the **visible** bar) and so does the step sheet (the lanes show one bar at a time). Rule of thumb: anything paged by `barOff` needs chips wherever it's shown.
- **Page-follow rides the EXISTING `followSeq`** (the transport's FOLLOW), not a toggle of its own — FOLLOW already means "keep the editor on what's playing" and the visible bar is the finer grain of that. A separate `barFollow` was tried and rejected. Chip taps don't clear it; a grid edit does, as always.
- **Two mobile sheets, not one.** `activeSheet==="bars"` (opened by the bar-count handle) holds the pattern ops + bar ops; `activeSheet==="pattern"` (the STEP chip) holds SPEED + the step lanes. Drums have no step lanes, so STEP routes to `"bars"` there. Sheet openers must be `onClick`, never `onPointerDown` — the backdrop mounts under the finger and the same tap's trailing click dismisses the sheet instantly. In render, `c` is the view column and `ac = barOff+c` is the data column. In the pointer handlers, `synthBarOffR()` / `drumBarOffR()` convert a hit-tested view column to absolute — they read live refs so the `[]`-dep useCallbacks don't bake in a stale page. **Paged, not scrolled**, deliberately: a scrolling grid needs a parent `overflow-x`, which is the iOS gesture-interception trap below.
- **Bar-scoped ops.** RAND / CLR / CPY / PST / MUT8 and the STEP-lane RST/RAND all act on the **visible bar**, not the whole pattern (`sliceCols`/`spliceCols`/`sliceFlat`/`spliceFlat`). DUP/DEL stay pattern-level and must carry `bars`. `⧉` (duplicate bar) *inserts* after the visible bar — it opens a gap with `openBarGap` and slides later bars right; overwriting the next bar instead is a bug that was caught once already.
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
- **STEP lanes**, **autosave**, **MP3/MIDI export**, and **S1–S4 save slots** (SAVE/LOAD/CLEAR, persisted via `storageSet("slots", …)`) all exist.

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

- **Push at will**: commit and push without asking (Jake lifted the old never-push rule on 2026-05-29). No force-push. Always actually run `git push` before claiming "deployed."
- **No backward-compat obligation inside the app**: a rescan, a lost automation, or a changed render of an old session are facts to report, not blockers — don't contort the code to preserve them unless asked.
- Report outcomes honestly: if you couldn't verify audio by ear, say so; don't claim it "sounds right."
- Direct, concise. Disagree when an ask is technically wrong — Jake has been burned by AI sycophancy and gives precise corrections; reread the original ask before retrying.

## Open threads

- **Cloud sync (task #87)**: chose **Supabase** for cross-device project sync (start on desktop, continue on phone). v1 = manual Save/Load to cloud (like the slots, synced), email-OTP auth. Blocked on Jake providing the Supabase **project URL + anon key** (and running the given SQL / adding `{{ .Token }}` to the magic-link email template). Reuse `getShareState(true)` to serialize. Don't create his account or enter credentials.
- Long-form content beyond 64 bars is not planned.
