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

**Verifying changes:** the build validates syntax. Logic (scheduler math, the pattern randomizer, range-slider frequency mapping) is best checked by extracting the pure function into a tiny Node harness and running Monte-Carlo/round-trip asserts — do NOT rely on headless AudioContext (gesture-gated, non-deterministic) and **do not auto-start playback** (Jake often has other audio running). UI/layout changes: verify in the browser preview (read the DOM / console, not just screenshots — screenshots have been flaky).

---

## Architecture

### Layers (three)

`SYNTH_LAYERS = ["synth","lead"]` plus drums:

- **synth** (POLY) — polyphonic, 16 rows × 16 cols.
- **lead** (MONO) — monophonic: at most one note per column, enforced by `cullMonoGrid` / `collapseToMono` after any grid mutation (RAND/MUT8/variation). Never let it go polyphonic.
- **drums** — 16-voice-ish grid, its own `drumEngine` (separate from the synth `Bell` engine) and its own `drumPats` state.

synth + lead share one `Bell` WebAudio engine — a VCO/VCF/VCA chain built fresh per `play()` call (that's the polyphony). Per-layer sound design lives in `layerParams` (waveform, ADSR, filter, octave, rvSend, dlySend…), read per-note via `play()`'s layer arg. The active-layer accessor pattern means render code like `<Knob value={waveform} onChange={setWaveform}/>` is automatically per-layer.

### Layer-store swap

Only the **active** synth-type layer's pattern library lives in live `pats` state; the other is parked in `layerStoreR.current[layer] = {pats, activeId, phrases, …}`. `switchLayer()` saves the outgoing layer and loads the incoming one. Drums never participate (own `drumPats`).

**Consequence:** when the scheduler needs a *non-active* layer's pattern it must read `layerStoreR.current[layer]`, NOT `patsR.current`. `resolveLayerPat(layer, bar)` centralizes this. Get it wrong → tracks go silent on layer switch (a recurring bug).

### Pattern data model

Each pattern: `grid[r][c]` (bool), `durs[r][c]` (int ≥1 note length in cells), `params[c]` (per-**column** step params), `gridLen` (loop length 1–16), `speedMult`, `id`, `name`.

- `params[c]` keys: `vel, flt, dly, rev, rhy, dur, oct, glide` (see `defaultStepParams`). `rev`/`dur` were added after the first arch doc.
- `rhy` is **ratchet only** (1–4 retriggers). rhy=0-as-tie is a dead semantic — durations live on `durs`.
- **`speedMult`** = per-pattern step-duration multiplier. `stepDur = 60/bpm/4 * speedMult`. The button LABEL is the speed factor, the value is its inverse: `2×` (twice as fast) = `mult 0.5`; `½×` = `mult 2`. `SPEED_OPTS` order is value-ascending (2×,1×,⅔×,½×,⅓×,¼×). Duplicating a pattern must carry `speedMult` (it's part of the pattern).
- Rows are scale degrees (pitch is already scale-quantized): `fromBot = ROWS-1-row`, tonic at `fromBot % 7 == 0`, triad tones (1/3/5) at `fromBot % 7 ∈ {0,2,4}`.

### Song matrix + scheduler

`songMatrix = {synth, lead, drums}`, each `Array(64)` of pattern-id-or-null. `songMode` = playback intent; `songView` = UI gate (decoupled). `songSyncMode` = `"sync"` | `"free"`; `songRandom` is an additive flag.

The scheduler is a per-layer lookahead loop (~25 ms tick, ~100 ms ahead). `layerStepDur = absStepDur * (pat.speedMult ?? 1)` — this is where speed enters; each layer loops within its own `gridLen`.

- **Free**: each layer advances independently via `freeR.current[layer] = {step, nextAt, bar}`, so a ½-speed pattern naturally cycles half as often.
- **Sync**: a master clock advances the shared song bar after the **shortest** pattern in the cell finishes one loop — `cycleLen = min over populated layers of round(gridLen * speedMult)` absolute steps (fallback 16). Non-song modes keep a plain 16-step master. `stepR` is read nowhere else; the visual playhead uses the per-layer step.

### Controls & interaction conventions

- **KnobSlider**: ballistic *relative* drag (dragging the full width moves ~half the range; Ctrl/Cmd = ultra-fine). **Double-tap / double-click = reset to `def`** (or 0 for bipolar, else min). No jump-to-position.
- **RangeSlider** (dual-thumb, used for delay HP/LP "FILTER" and reverb LF/HF "DAMP"): both thumbs live on a shared **log-frequency axis** (20 Hz–20 kHz); the fill between is the passband. Grab a thumb → move that corner; grab the **line between** → move both together keeping the gap; grab outside → nearer thumb. Each thumb clamps to its own param's frequency span; a gap stops them crossing. `toFreq`/`fromFreq` per thumb convert axis ⇄ param.
- **Per-step popup** (right-click / long-press a note): edits `params[c]` for that column. Rendered as a slider list (`PARAM_ARMS`) with an alternative radial long-press drag. A `sliderDragR` flag stops the radial angle-picker from also firing during a slider drag (that caused cross-param "ghost" moves).
- **Ballistic drag helper** = `ballisticDelta(pd, dim, range)`. Double-tap detection = `isDoubleTap(e, key?)` (custom, because DOM `dblclick` is unreliable on touch).
- **STEP lanes**, **autosave**, **MP3/MIDI export**, **A/B/C/D save slots** (with SAVE/LOAD/CLEAR, `tnori-slots` localStorage) all exist.

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

Autosave is separate (`tnori-autosave` localStorage): a lean snapshot (no samples) written on a debounce, samples on a dirty flag, **never during playback or export**. Restored on mount; a loaded share link is a "preview" that adopts on first edit.

User samples serialize as base64 in saves (`serializeSamples`); kits load via `loadKit`. Samples ARE wired up now (older doc said otherwise).

---

## Critical lessons (don't relearn)

- **`return_react2`**: module-level arrow functions returning JSX broke the old artifact viewer's CJS transform. Inline JSX; never extract to a top-level `const X = () => <jsx>`. The build audit guards this — keep it.
- **useCallback empty-deps trap**: `useCallback(fn, [])` baked first-render closures over `pushHistory` etc. Fix is ref-based: `pushHistoryR.current` reassigned each render, stable callbacks invoke `.current()`. Same for `captureSnapshotR`. Don't collapse back to direct closures.
- **Grid pointer events** live on the parent `gridRef` container, not per-cell. If you change grid event handling, test on iPhone immediately.
- **iOS gesture interception**: parent `touch-action: pan-x` / `overflow-x: auto` makes Safari swallow gestures at the OS level — vertical drags don't propagate. If a drag feels "stuck horizontally," check the parent's `touch-action`.
- **Babel compiles undefined refs happily** — only fails at runtime. When you rename/extract a variable, grep the old name everywhere before building.
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
