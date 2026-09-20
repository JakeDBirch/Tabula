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
behind a flag on the web and in **AVAudioEngine inside the iOS shell**, and
verified against the JS scheduler attack-for-attack. The MP3 bounce renders
offline through it. On the web it is **off by default** until Jake has judged
it by ear; in the app it is always on, because it is the only audio that
survives the screen locking. The Swift host is type-checked by CI, not yet run
on a device.

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
| `src/ll_fx.c` | stereo echo with HP/LP in the loop, Schroeder 8-comb reverb (tap before the shelves, LFO'd lengths), master gain, DRIVE (fixed glue comp + oversampled saturator), EXCITE (3 parallel band generators), limiter | `Bell.init` |
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

## Transport: play, stop, resume

Three entry points, and the asymmetry between them is deliberate.
`ll_play` rewinds (it calls `seq_start`); `ll_stop` only clears `G.play`,
leaving every cursor where it was; `ll_resume` puts `G.play` back and shifts
`mNext` and each part's `nextAt` forward by the frames that passed since
`stopFrame`. That shift is not optional: `ll_render` is sample-driven and keeps
running while stopped so tails ring out, so without it the sequencer comes back
holding a fistful of onsets that are already in the past and fires them all at
once — the same pile-up the JS scheduler's catch-up guard exists to prevent.
Shifting every cursor by the SAME amount is what preserves each part's phase
against the master, so a paused polymeter resumes in phase.

The host message is `cont` (`LLCore.resumeTransport`), named away from
`CoreHost.resume`, which is the AudioContext's. `core/test/pause.c` asserts
that a pause plus a resume is the same performance delayed by exactly the gap,
to the frame, and that `ll_play` after a stop still rewinds.

## The iOS host

`ios/LoudLight/CoreAudioHost.swift` hosts the same C files in AVAudioEngine.
`project.yml` compiles `core/src/*.c` into the app target with
`-ffp-contract=off` (arm64 would otherwise fuse multiply-adds and round
differently from the wasm), and `Bridging.h` exposes `ll.h` to Swift.

- **Transport.** The page detects `webkit.messageHandlers.core` and switches
  `CoreHost` to the native transport: no AudioContext, no worklet. The same
  messages go over the bridge as JSON, binary as base64 (`nativePost`), and
  the shell calls `onNativeEvents` / `onNativePong` back through
  `evaluateJavaScript`. The shell injects `window.__LL_NATIVE_SR` at document
  start so the page knows the engine rate before its first message.
- **Render.** An `AVAudioSourceNode` render block calls `ll_render` into the
  two float buffers. The sequencer runs inside it, so the music keeps going
  when the screen locks or the app is backgrounded — `UIBackgroundModes:
  audio` and the `.playback` session finally do what they say.
- **Threads.** One `os_unfair_lock` guards every call into the core: the
  render holds it for a block, a message for microseconds. A sample's frames
  are copied outside the lock into a region that is private until the commit
  (`ll_sample_alloc` bumps under the lock; `ll_sample_commit` publishes).
- **Samples cross the bridge as base64 Float32** with their own rate; the core
  resamples on playback (`ll_sample_alloc(..., src_rate)`), so neither host
  resamples. A kit is a few MB over the bridge, once per kit switch.
- **Events** are drained on a 30Hz timer and dropped while the app is not
  active — the page's JS may be suspended and the audio does not need it.
- **The bounce needs no native code:** the Worker + wasm path works inside
  the WKWebView, from the same shadow.
- **Nothing decodes through the engine's context.** `bell.current.ctx` is a
  stand-in in the shell; kits and user samples decode through an
  OfflineAudioContext (`_decodeCtx`) and the mic recorder makes its own real
  AudioContext (`_micCtx`). The first device build got this wrong and played
  the synthesised drums in place of a cloud-loaded project's kit.

Not yet run on a device. The things to check there are in
`docs/ios-testflight.md`: lock the screen mid-song, switch apps, take a call,
and that the JS-side `playing` state agrees with the engine when you come
back.

## Switching it on

`CORE_DEFAULT` in `src/loudlight.jsx` is the web default; `?core=1` on the
URL turns the core on for a session and `?core=0` forces it off, so the live
site can be A/B'd on a phone without a build. Flip the default once it has
been judged by ear. Inside the iOS shell (`CORE_NATIVE`, i.e. the bridge
exists) the core is always on.

## Verification

- `npm run test:core` (= `node core/build.mjs`) builds the wasm, then the
  native test binaries in `core/test/*.c`, then `core/test/wasm.mjs`:
  - `smoke.c` — a pattern across all three parts, 4s at 48k: finite,
    non-silent, under 0dBFS, every attack on the grid, a WAV to listen to.
  - `wasm.mjs` — the same pattern through the JS packer into the wasm, and
    the render compared **sample for sample** against the native one.
  - `master.c` — **MOJO**, the half the oracle structurally cannot see: the
    oracle matches ATTACKS and nothing in DRIVE or EXCITE changes one, so a
    stage that silently did nothing would pass every scenario there is.
    For a CHARACTER stage the thing to assert is **harmonics**, not levels — a
    plain gain can fake "louder" and a filter can fake "brighter", but nothing
    except a nonlinearity can put energy at a frequency that was not in the
    input. So most of it pushes ONE TONE through the bus (`ll_debug_bus_probe`,
    which exists for exactly this) and reads the bins that were empty going
    in, with a one-bin Goertzel rather than an FFT. It asserts that OFF is
    bit-identical to no master bus at all (flavour chosen, amounts at zero, so
    it is the switch under test and not the defaults); that TAPE makes odd
    harmonics and **almost no even ones** while TUBE makes many times more 2nd
    than TAPE, which is the whole difference between them; that CLIP is harder
    than TAPE at the same setting; that each flavour changes the sound without
    changing the level by more than a few dB; and that each exciter band puts
    harmonics where it claims to.
    Three earlier versions asserted the wrong things and are worth not
    repeating. **Crest factor** went the wrong way for the old compressor (a
    1ms attack with a 100ms release squashes the body of a hit harder than the
    transient that caused it — ordinary, and a reminder that crest measures
    the time constants as much as the ratio). An **absolute band energy**
    reading measured the limiter rather than the filter under test. And a
    ratio against a **numerically empty bin** printed `x7e12` and meant
    nothing — a generated harmonic is measured against the TONE.
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
- `_core_native.mjs` (local harness) — the native transport with the iOS
  bridge shimmed: the page turns the core on, everything crosses as JSON and
  base64 (no typed arrays), play/stop go over the bridge, shell events light
  the playhead, and the offline bounce works with no AudioContext at all.
- `_core_play.mjs` (local harness) — end to end in the browser with the flag
  on: the worklet boots, the core reports steps in order, the master tap is
  audible, no page errors; then the same with the flag off as the control.

None of this is listening. The sound has to be judged by ear, on the phone,
against the JS engine — `?core=1` vs `?core=0` on the same project.

## Known differences from the Web Audio engine

- **Limiter.** Chromium's `DynamicsCompressorNode` is its own algorithm; the
  core has a lookahead peak limiter with the same threshold (−1dB), attack
  (2ms) and release (100ms). Judge by ear. It also carries a constant **+0.57dB
  of makeup gain** that the node applies at every level, including levels far
  below its threshold where it is not compressing at all — so the whole web
  build is that much hotter than the core, all the time. Deliberately left
  alone: it is in the path of every project ever made, so it is part of how the
  app has always sounded, and taking it out now would change the loudness of
  all of them. `_jsmaster.mjs` compares each engine against **its own** bypass
  for exactly this reason.
- **DRIVE's glue compressor.** The same difference a second time, and for the
  same reason: it is a `DynamicsCompressorNode` on the web and a hand-written
  feed-forward compressor in the core, given the same fixed threshold (−6dB),
  ratio (1.8:1), attack (25ms) and release (200ms). The detector is stereo-LINKED
  on both sides — two independent detectors move the image around as the mix
  ducks, the one thing a bus compressor must not do — and the core's knee is
  hard where Chromium's is 6dB, so the core bites a little more abruptly right
  at the threshold. Judge by ear. Its own makeup gain (+0.83dB in Chromium) is
  **not** left alone, because this stage is only in the path when DRIVE is on
  — uncorrected it was a level jump on the bypass switch, and a level jump into
  the curve. It is measured at runtime (`measureGlueMakeup`; the number belongs
  to the browser, and the phone is WebKit) and divided out immediately before
  the shaper. This is the one place the two engines are still allowed to
  disagree, and the disagreement has a **boundary**: below the threshold they
  measure within 0.02dB and x1.01 on harmonics, above it up to 0.55dB and x1.47
  (on CLIP, whose knee is a wall). `_jsmaster.mjs` computes that boundary from
  the stage's own `drivePre` and `threshold` rather than hardcoding a knob
  position.
- **DRIVE's saturation curves** are *not* in that category. Each is a closed
  form of one sample (`ll_shape(chr, x, bias)` in the core, `llShape` in the
  JS, which samples it into the WaveShaper's table), so the two engines fold
  on one definition rather than on two descriptions of an intent — they agree
  to float precision, tanh's last bit aside. Same for the per-flavour input
  gain and output trim, and for `k` — the scale into and back out of the
  curve, which is what the DRIVE knob actually moves.
  - TUBE's `bias` scales with the knob, so its curve is not static: the core
    passes it per sample, and the JS rebuilds the WaveShaper's 4096-point
    table when it changes (cached against the last bias, or a knob drag would
    rebuild it per pointermove for the two flavours that never use one).
- **Oversampling round the saturator differs, deliberately.** The web gets
  `oversample:"4x"` free from `WaveShaperNode`; the core does its own, at 2×,
  with two biquads each way. Both are enough that the aliasing is well below
  the harmonics being generated on purpose; 4× for free is simply better than
  4× paid for per sample on a phone. Measured, it makes no difference to the
  harmonics at all at these levels — `none`, `2x` and `4x` all read the same.
  - **But it is not free on a PARALLEL path.** Chromium's oversampling costs a
    `WaveShaperNode` **128 samples of latency at `2x` and 192 at `4x`**, and
    EXCITE's three generators run alongside the dry signal rather than in
    series with it. 128 samples is 2.7ms — two thirds of a cycle at 1kHz — so
    the band came back 118° out and SUBTRACTED: BODY at 70 made a 1kHz tone
    1.1dB *quieter* where the core made it 3.5dB louder. All three generators
    are `oversample:"none"` now, which is also what the core does (its run at
    1×, sample-aligned with the dry). The DRIVE shaper keeps its `4x`: in
    series, a constant delay is just latency.
- **EXCITE's crossover corners** are shared constants (`LL_EX_*` in
  `core/ll.h`, `EX_*` in `src/loudlight.jsx`) for the reason the shelf corners
  used to be: a band that sits somewhere else in the other engine is a project
  that sounds different depending on which one is running. The generators
  themselves are `tanh` on both sides.
- **`_jsmaster.mjs` is the JS half of `core/test/master.c`**, and the pair only
  became necessary once something was measured on one engine and shipped on the
  other. It renders the **real** `Bell` graph into an `OfflineAudioContext` —
  that is what the optional 6th argument to `Bell.init` is for — pushes one
  tone through it, and reads the bins that were empty going in, the same
  instrument `master.c` points at the core. Then it runs the same tone through
  `ll_debug_bus_probe` and asserts the two agree. Neither the oracle (attacks
  only; a master stage changes none) nor `master.c` (the core only) can see a
  JS-side defect on this bus, and the web runs the JS engine by default — which
  is how a saturator that was 12dB loud and crunchy at its first notch shipped
  with every test green.
- Both stages are **bypassed at zero and the bypass is a real one** on both
  engines — the signal does not pass through the stage at all — so an existing
  project is unaffected, which `core/test/master.c` asserts bit-for-bit with
  the flavour chosen and only the amounts at zero.
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
4. ~~The iOS host.~~ Written — see above. **Run it on the phone**: TestFlight
   build, then the on-device checks. `UIBackgroundModes: audio` is now true.
5. Then the things native audio was for: **AUv3** (the render block is
   already the shape an AudioUnit wants), **Core MIDI**, **Ableton Link**.
