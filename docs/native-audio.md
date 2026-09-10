# Native audio — the DSP core

The audio engine is being moved out of Web Audio and into **one DSP core in C**
that runs in two hosts:

```
                    core/src/*.c  (sequencer + voices + FX + master, no libc)
                       │
        ┌──────────────┴───────────────┐
   clang → wasm                    Xcode → arm64
   core/ll_core.wasm               ios/ (AVAudioEngine host — next)
   AudioWorklet, web + WKWebView   background audio, AUv3, Core MIDI, Link
```

This is option (b) from the long-running native-audio discussion: the engine
written once, hosted twice. Option (a) — Swift/AVAudioEngine only — was set
aside because it forks a one-source-file project into two engines that then
have to agree by ear forever. A C core inside AVAudioEngine is also a perfectly
good (a), so nothing here forecloses it; it just doesn't leave the web behind.

**Status (2026-09-10):** the core is complete for everything the JS engine
does today except VARY (parked in the app anyway), hosted in an AudioWorklet
behind a flag, and verified against the JS scheduler attack-for-attack. The
MP3 bounce renders offline through it. It is **off by default** until Jake
has judged it by ear. The iOS host is not started.

## Why

- **Web Audio in a WKWebView cannot play in the background** — WebKit suspends
  the AudioContext, and the entitlement that would stop it is private. The only
  fix is audio that isn't Web Audio. That is the whole reason to wrap the app
  natively, and it is also what AUv3, Core MIDI and Ableton Link need: a render
  callback that is ours.
- **The JS scheduler lives on the main thread with React.** A 100ms lookahead
  hides most stalls, but a stall longer than that drops or doubles notes, and
  on a phone the main thread is also doing layout for a 256-cell grid. The
  core's sequencer runs *inside* the render callback: sample-accurate by
  construction, and the lookahead is the render block, not a timer.
- **Determinism.** The core has no libm and is compiled with `-ffp-contract=off`
  on both targets, so the wasm renders **bit-identically** to the native build
  (`core/test/wasm.mjs` asserts it). A test that passes on Linux is a statement
  about what the phone will play, which was never true of Web Audio, whose
  oscillators, biquads and compressor are browser-specific.

## What is in the core

| file | what it is | ported from |
|---|---|---|
| `core/ll.h` | the public API, param enums, wire formats | — |
| `src/ll_seq.c` | per-part cursors over `partSeq`, per-bar lengths and speeds, master cycle, song, LOOP, swing, ratchets, tied-note mods, glide state, drum MOTION overlays | `scheduler`, `playSynthLayerStep`, `playDrumStep` |
| `src/ll_synth.c` | the synth voice: VCO×2 + sub, spread, VCF (LP, Q in dB), VCA and filter envelopes, mid-note FLT/OCT/GLIDE automation, mono choke, sends | `Bell.play` |
| `src/ll_drums.c` | 13 synthesised voices, sampler (round-robin / velocity layers / gate), per-voice strips (filter, saturation, level, pan, sends), OH choke | `DrumEngine` |
| `src/ll_fx.c` | stereo echo with HP/LP in the loop, Schroeder 8-comb reverb (tap before the shelves, LFO'd lengths), master gain, limiter | `Bell.init` |
| `src/ll_dsp.h` | biquad (Web Audio semantics), AudioParam-style automation, polyBLEP oscillator, delay line, noise, smoothers | — |
| `src/ll_math.h` | exp2 / log2 / pow / sin / tanh with no libm | — |
| `core/host.js` | the web host: wire packer, the worklet processor (as a string), `CoreHost`, and the `Bell` / `Drums` facades | — |

**The voices are ported call for call.** `Bell.play` is a sequence of
AudioParam automations (`setValueAtTime`, `linearRampToValueAtTime`, …);
`ll_auto` implements those five calls with the same semantics, so
`synth_play` reads line by line against the JS. That is deliberate: the sound
was tuned by ear over months, and "the same numbers through the same curves"
is the only port that has a chance of sounding the same. The exceptions,
which have no exact Web Audio twin, are listed under *Known differences*.

**The sequencer is the same model, run differently.** The JS walked each
cursor to a 100ms horizon in turn; the core advances the master and the three
cursors in strict time order (master first on a tie), and the master's reset
is an event **at the cycle top**, not on the tick that leaves the last step.
Getting that wrong loses step 15 of every bar — it did, once, in this port,
and the end-to-end probe's step list showed it before the oracle ran.

## The contract between the app and the core

The React side becomes a **controller**: it pushes the project and every
parameter into the core and receives events back. Nothing audio-related is
computed in JS any more.

- **Patterns** go over as bytes in the *pattern wire format* (below), one slot
  per pattern, re-sent only when the pattern object's identity changes — an
  edit ships ~2KB. `packPattern` in `core/host.js` writes it, using the app's
  own `partBars` / `partBarLens` / `partBarMults` so the core sees exactly the
  lengths the JS scheduler saw. `ll_pattern_load` reads it.
- **Everything the scheduler read from a ref** is a parameter: `ll_set` for
  globals (BPM, swing, transpose, LOOP and its bar/pattern, song mode, the
  active pattern, MOTION, the FX), `ll_set_layer` for `layerParams`,
  `ll_set_drum` for the drum mix, `ll_set_freqs` for the scale, `ll_song_set`
  for the expanded song sequence. The tables are generated from the header
  (`core/ll_params.js`, by `core/build.mjs`) so the two sides cannot drift.
- **Samples** are decoded by the app as before, then downmixed to mono,
  resampled to the engine rate if needed, and copied into the core's arena.
- **Events** come back as `{type, a, b, frame}` quads: the step each part is
  on, the playing pattern, the song position, the pulse for the bar dots, and
  every drum hit. The JS used to write these at *schedule* time (up to 100ms
  early); now they arrive at *render* time.
- **Auditions** (the row keys) are `ll_audition_note` / `ll_audition_drum`.
- **The host shadows everything it sends** (`CoreHost.shadow`), so
  `snapshot(sr)` can rebuild the live core's whole state as a message list for
  a fresh instance. That is what the offline bounce starts from.

The facades (`LLCore.Bell`, `LLCore.Drums`) present the surface of the old
`Bell` and `DrumEngine` classes — `setRvSize`, `setVoiceMix`, `play` for an
audition, `ctx`, `master` — so the ~40 engine call sites in `loudlight.jsx`
needed no edits. The MP3 bounce taps the host's post-core `master` GainNode
exactly as it tapped Bell's; `masterLevel` tells it what that node sits at
(1.0 here, since the 0.55 is inside the core).

### Pattern wire format

Little-endian. `W = bars × 16` for the part being written.

```
u32 'LLP1'   i32 id   i32 bars (pattern)   i32 master (0 none, 1 synth, 2 lead, 3 drums)
synth, then lead:
  i32 bars   i32 barLens[bars]   f32 barMults[bars]
  u8 grid[16][W]   u8 durs[16][W]   u8 params[W][8] = vel flt dly rev rhy dur(i8) oct glide
drums:
  i32 bars   i32 barLens[bars]   f32 barMults[bars]
  u8 grid[13][W]   u8 vel[13][W]   u8 rat[13][W]
  i32 hasMotion   [ i16 motion[7][13][W], -32768 = null ]   (level pan rvSend dlySend pitch env filtCut)
```

## The host

`core/host.js` is inlined into `index.html` (and the iOS payload) by
`build.mjs`, after `core/ll_params.js` and before the app, together with the
wasm as base64 — the app stays one file and the iOS payload stays offline.
The worklet processor is a string loaded from a Blob URL. Two things it does
that are worth knowing:

- **The wasm goes to the worklet as bytes and is compiled there.** A
  `WebAssembly.Module` does not survive the structured clone into an
  `AudioWorkletGlobalScope` in Chromium: the port fires `messageerror` and
  the message is silently gone. That cost an hour; the host now listens for
  `messageerror` and the processor wraps its handlers so an exception comes
  back as an `err` message instead of silence.
- **Everything sent before the worklet exists is queued and replayed at
  init.** The React effects that mirror state into the core all fire on mount,
  long before the first play, so ordering against `startEngines` is free.

The core's frame counter is pinned to the worklet's `currentFrame` on the first
render, so `ll_frame() / sampleRate` is the AudioContext's time.

## The MP3 bounce

With the core on, the bounce is **offline and faster than real time**
(`exportMP3Core`). A Worker (`WORKER_SRC` in `core/host.js`) runs the worklet
processor's own message code against a fresh wasm instance, fed the live
core's snapshot plus three overrides: song mode on if there is a song, LOOP
off, and `LL_P_STOP_AFTER` = passes × song entries. The core then **stops
itself at that cycle top** — not one note of the next pass is scheduled — and
the worker renders two more seconds for the tails. The realtime bounce could
never stop cleanly: stopping the JS scheduler left the ~100ms it had already
queued to play on. No AudioContext, no transport, no ScriptProcessor tap; an
8-pass bounce of a long song is seconds, and the transport does not have to
be free. Encoding still happens on the main thread with lamejs, as before.

The pass length shown by the progress bar is the sum of the entries' master
cycles (`patCycle(p).abs`, the same walk the core does), where the realtime
bounce estimated `bars × 16` and was wrong for any trimmed or half-time bar.
The stop itself is the core's, so the file is exactly the passes asked for.

## Switching it on

`CORE_DEFAULT` in `src/loudlight.jsx` is the default; `?core=1` on the URL
turns the core on for a session and `?core=0` forces it off, so the live site
can be A/B'd on a phone without a build. Flip the default once it has been
judged by ear.

## Verification

- `npm run test:core` (= `node core/build.mjs`) builds the wasm, then the
  native test binaries in `core/test/*.c`, then `core/test/wasm.mjs`:
  - `smoke.c` — a pattern across all three parts, 4s at 48k: finite,
    non-silent, under 0dBFS, every attack on the grid, a WAV to listen to.
  - `wasm.mjs` — the same pattern through the JS packer into the wasm, and
    the render compared **sample for sample** against the native one.
- `_core_bounce.mjs` (local harness) — the offline bounce end to end: ×1 and
  ×2 of a 2s bar come back as 4s and 6s MP3s (decoded and measured), with
  music in them, quiet tails, the transport left stopped, in about a second.
- `node core/test/oracle.mjs` (needs the built app served on :8139 and
  Playwright) — the **equivalence oracle**. The same project, built with the
  app's own constructors, is played by the JS scheduler in the browser with
  `Bell.play` / `DrumEngine.play` stubbed to record every attack, and by the
  core: the app's actual messages are captured and replayed through the real
  worklet code into the wasm in Node. Every attack must match in layer,
  time (±2 frames), length, pitch and velocity, across a song with repeats and
  swing, a free-running pattern with layer glide, and LOOP on one bar.
- `_core_play.mjs` (local harness) — end to end in the browser with the flag
  on: the worklet boots, the core reports steps in order, the master tap is
  audible, no page errors; then the same with the flag off as the control.

None of this is listening. The sound has to be judged by ear, on the phone,
against the JS engine — `?core=1` vs `?core=0` on the same project.

## Known differences from the Web Audio engine

- **Limiter.** Chromium's `DynamicsCompressorNode` is its own algorithm; the
  core has a lookahead peak limiter with the same threshold (−1dB), attack
  (2ms) and release (100ms). Judge by ear.
- **Oscillators.** Web Audio's saw/square are wavetable-bandlimited; the core
  uses polyBLEP (a little residual aliasing far up), and its triangle is naive.
- **Saturation.** The drum strip's waveshaper and the kick's `tanh` are
  computed directly (no 2× oversampling), so heavy saturation aliases a little
  more.
- **Filter coefficient updates** every 8 samples (Web Audio: per sample under
  automation).
- **Delay time changes jump** (as `setValueAtTime` did), so a tempo change
  while the echo rings still clicks. Easy to slew; not done, to stay honest to
  the JS first.
- **Stereo samples are downmixed to mono** before the strip. The bundled kits
  are mono.
- **VARY and the self-record mode are not in the core** — they are parked in
  the app (`VARY_ON=false`).

## Next steps, in order

1. **Jake listens.** `?core=1` on the phone and the desktop. Anything that
   sounds different from `?core=0` on the same project is a bug in the port
   until proven otherwise — the list above is the only sanctioned differences.
2. **Flip `CORE_DEFAULT`.** The JS engines stay in the source until the iOS
   host is done, then go.
3. ~~The MP3 bounce offline through the core.~~ Done — see above.
4. **The iOS host.** `AVAudioSourceNode` whose render block calls `ll_render`;
   the JS bridge posts the same messages over `webkit.messageHandlers` instead
   of the worklet port (`CoreHost` grows a second transport). That is what
   buys background audio, and `UIBackgroundModes: audio` becomes true.
5. Then the things native audio was for: **AUv3** (the render block is
   already the shape an AudioUnit wants), **Core MIDI**, **Ableton Link**.
