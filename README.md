# Tabula

A touch-first grid sequencer for quick musical ideation and serious composition. Paint notes directly onto a 16×16 matrix with your fingers, shape them with per-step parameters, and let the variation engine evolve your patterns.

**[Live app →](https://tabula.netlify.app)** *(update this URL after deploying)*

---

## What it is

Tabula is a step sequencer built around a gestural grid interface:

- **Paint** notes by dragging right, **erase** by dragging left
- **Tie** adjacent notes into longer durations by dragging across them
- **Long press** any note for per-step velocity, cutoff, delay, octave, and ratchet controls
- **Two-finger drag** to shift the entire pattern
- **Variation engine** that mutates, shifts, and randomizes patterns on every loop
- Built-in synth with sawtooth/square/triangle/sine oscillators, VCF, delay
- 8 patterns (A–H), chainable into sequences
- 11 scales: Major, Minor, Harm Min, Pentatonic, and all 7 modes
- Variable grid length (1–16 steps) and 5 speed multipliers including triplets

---

## Repo structure

```
tabula/
  tabula.html       ← compiled, deployable single file
  src/
    tabula.jsx      ← React source (edit this)
  build.sh          ← compiles src/tabula.jsx → tabula.html
  README.md
```

---

## Development workflow

### Setup (once)
```bash
npm install --save-dev @babel/core @babel/cli @babel/preset-react @babel/preset-env
chmod +x build.sh
```

You'll also need a `babel.config.json`:
```json
{
  "presets": ["@babel/preset-env", "@babel/preset-react"]
}
```

### Build
```bash
./build.sh
```

This compiles `src/tabula.jsx` into a self-contained `tabula.html` with no build server or bundler needed.

### Deploy
Push to GitHub. If connected to Netlify, it redeploys automatically in ~30 seconds.

```bash
git add src/tabula.jsx tabula.html
git commit -m "update"
git push
```

---

## iOS installation

1. Open `tabula.netlify.app` in Safari on your iPhone
2. Tap the Share button
3. Tap **Add to Home Screen**
4. Name it **Tabula**, tap Add

The app runs full-screen with no browser chrome, exactly like a native app. Updates deploy automatically — just reload.

---

## Netlify setup

1. Create a free account at [netlify.com](https://netlify.com)
2. **New site → Import from Git → GitHub**
3. Select this repo
4. Set publish directory to `/` (root)
5. No build command needed — `tabula.html` is already compiled
6. Deploy

Every push to `main` triggers a new deploy.
