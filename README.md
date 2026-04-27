# Tabula

A touch-first grid sequencer that runs as a single static HTML file. Built primarily for iPhone (added to home screen as a PWA), works on desktop too.

**[Live →](https://jakedbirch.github.io/Tabula)**

---

## What it is

Four layers (synth, lead, bass, drums) playing simultaneously through a 16×16 step grid per pattern. Patterns are arranged into songs via a 16×16 song matrix where each cell is a pattern reference for one layer at one bar. Each layer has its own independent synth design (waveform, envelope, filter, octave, delay send) feeding through a shared audio graph.

Notes have true per-row polyphony with editable durations — drag a note rightward to extend it; other rows continue their own notes independently. Step lanes for velocity, filter, delay, ratchet, octave, glide, and duration control sit in a slide-up drawer per pattern. A variation engine can mutate patterns each loop. Sync and free song-playback modes — sync locks all layers to one clock, free lets layers drift apart by their own gridLen.

---

## Repo layout

```
tabula/
├── src/tabula.jsx       ← source — edit this
├── index.html           ← compiled artifact (generated, don't edit by hand)
├── build.mjs            ← compile pipeline
├── babel.config.json
├── package.json
├── kits.json            ← drum kit defs (samples not yet hooked up)
├── samples/             ← future drum WAVs
├── CLAUDE.md            ← project memory for Claude Code (read this first if pairing)
└── README.md
```

---

## Development

### Setup (once)

```bash
npm install
```

### Build

```bash
npm run build
```

This compiles `src/tabula.jsx` into a self-contained `index.html` with a CDN-hosted React runtime. No bundler, no dev server. Open `index.html` directly in a browser to test, or commit and push to deploy.

### Audit standalone

```bash
npm run audit
```

Runs just the `return_react2` audit pass (a Babel CJS-mode regression check for module-level arrow functions returning JSX, which would silently break the artifact viewer). The audit is also part of `npm run build`.

### Deploy

GitHub Pages serves `index.html` from `main`. Push and it deploys within ~30s.

```bash
git add -A
git commit -m "..."
git push
```

---

## iOS install

1. Open the live URL in Safari on iPhone
2. Share → Add to Home Screen
3. Name it Tabula

Runs full-screen with no browser chrome.

---

## Pairing with Claude Code

Read `CLAUDE.md` before making changes. It documents architecture decisions, the layer-store swap mechanism, true polyphony data model, sync/free modes, the ref-based history closure pattern, and a list of bugs not to relearn.
