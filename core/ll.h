/* Loud Light DSP core — public API.
 *
 * ONE engine, TWO hosts. The same C renders inside an AudioWorklet on the web
 * (compiled to wasm by clang, no libc) and inside AVAudioEngine on iOS (compiled
 * by Xcode as plain C). It owns the sequencer AND the voices: the host only
 * hands it the project, pushes parameter changes, and pulls stereo blocks.
 *
 * Everything is sample-accurate and deterministic: no libm (own math, so the
 * two hosts render bit-identically), no allocation after init except the
 * sample arena, no threads. Times are in FRAMES at the engine's sample rate.
 *
 * Wire formats (pattern, samples) are documented in docs/native-audio.md and
 * written by packPatternForCore() in src/loudlight.jsx. Keep the three in step.
 */
#ifndef LL_H
#define LL_H
#include <stdint.h>

#define LL_VERSION       1
#define LL_COLS          16      /* steps per bar — the editor's page width */
#define LL_MAX_BARS      32
#define LL_MAX_COLS      (LL_MAX_BARS*LL_COLS)
#define LL_ROWS          16      /* synth rows */
#define LL_DRUM_ROWS     13
#define LL_MAX_PATTERNS  16
#define LL_SONG_MAX      256     /* 64 slots × up to 4 repeats */

enum { LL_SYNTH=0, LL_LEAD=1, LL_DRUMS=2, LL_NLAYERS=3 };

/* Drum voices, in the app's DRUM_VOICES row order. */
enum { LL_BD,LL_SD,LL_RM,LL_CP,LL_HT,LL_MT,LL_LT,LL_CH,LL_OH,LL_CY,LL_CL,LL_SH,LL_CB };

/* Global parameters — ll_set(id, v). Ranges are the app's own 0..100 knobs
 * unless noted; the core applies the same curves the Web Audio engine did. */
enum ll_param {
  LL_P_BPM,          /* beats per minute */
  LL_P_TRANSPOSE,    /* semitones */
  LL_P_SWING,        /* 0..100 */
  LL_P_DLY_TIME,     /* seconds */
  LL_P_DLY_FB,       /* 0..1 */
  LL_P_DLY_HP,       /* 0..100 → hpHz */
  LL_P_DLY_LP,       /* 0..100 → lpHz */
  LL_P_RV_SIZE,      /* 0..100 */
  LL_P_RV_DAMP,      /* 0..100 */
  LL_P_RV_LFDAMP,    /* 0..100 */
  LL_P_RV_PREDELAY,  /* ms */
  LL_P_RV_MOD,       /* 0..100 */
  LL_P_DLY_TO_REV,   /* 0..100 */
  LL_P_DRUM_LEVEL,   /* 0..150 */
  LL_P_DRUM_FXTRIM,  /* 0..100 */
  LL_P_DRUM_AUDIBLE, /* 0/1 — mute/solo outcome for the drum layer */
  LL_P_SONG_MODE,    /* 0/1 */
  LL_P_LOOP,         /* 0/1 */
  LL_P_LOOP_BAR,     /* bar index */
  LL_P_LOOP_PAT,     /* pattern id, -1 none */
  LL_P_ACTIVE_PAT,   /* pattern id being edited */
  LL_P_MASTER,       /* master gain, 0.55 default */
  LL_P_MOTION,       /* 0/1 — drum MOTION automation on */
  LL_P_STOP_AFTER,   /* stop the transport at the top of this many cycles (0 = never) — the bounce */
  LL_P_COUNT
};

/* Per-layer synth parameters — ll_set_layer(layer, id, v). Only SYNTH and
 * LEAD have these. Mirrors layerParams[layer]. */
enum ll_lparam {
  LL_L_WAVE,         /* 0 sine, 1 square, 2 sawtooth, 3 triangle */
  LL_L_DETUNE,       /* cents */
  LL_L_ATTACK,       /* ms */
  LL_L_DECAY,        /* ms */
  LL_L_SUSTAIN,      /* 0..100 */
  LL_L_CUTOFF,       /* 0..100 → vcfHz */
  LL_L_RES,          /* 0..100 → Q dB ×0.28 */
  LL_L_FENV,         /* 0..100 filter env amount */
  LL_L_OCTAVE,       /* -2..2 */
  LL_L_DLYSEND,      /* 0..100 */
  LL_L_RVSEND,       /* 0..100 */
  LL_L_MIX,          /* 0..100 */
  LL_L_FXTRIM,       /* 0..100 */
  LL_L_SUB,          /* 0..100 */
  LL_L_SPREAD,       /* 0..100 */
  LL_L_GLIDE,        /* 0..100 */
  LL_L_MONO,         /* 0/1 monoSingle */
  LL_L_VELAMP, LL_L_VELAMP_INV,
  LL_L_VELFLT, LL_L_VELFLT_INV,
  LL_L_VELENV, LL_L_VELENV_INV,
  LL_L_AUDIBLE,      /* 0/1 — mute/solo outcome */
  LL_L_COUNT
};

/* Per-drum-voice mix — ll_set_drum(voice, id, v). Mirrors drumMix[row]. */
enum ll_dparam {
  LL_D_LEVEL,        /* 0..200 */
  LL_D_PAN,          /* -100..100 */
  LL_D_RVSEND,       /* 0..100 */
  LL_D_DLYSEND,      /* 0..100 */
  LL_D_PITCH,        /* semitones -12..12 */
  LL_D_FILT,         /* 0 off, 1 lp, 2 hp, 3 bp */
  LL_D_FILTCUT,      /* 0..100 → filtCutHz */
  LL_D_ENV,          /* 0..100 */
  LL_D_SAT,          /* 0..100 */
  LL_D_COUNT
};

/* Events the core reports back to the UI, drained with ll_events(). Each is
 * four int32s: {type, a, b, frame}. */
enum ll_event {
  LL_EV_STEP=1,      /* a=layer, b=absolute column now sounding */
  LL_EV_SONGPOS,     /* a=song position (index into the expanded sequence) */
  LL_EV_PULSE,       /* a=bar*4+quarter of the master column */
  LL_EV_DRUMHIT,     /* a=row, b=velocity */
  LL_EV_PLAYPAT,     /* a=pattern id now playing */
  LL_EV_STOPPED      /* transport stopped itself (never, today — reserved) */
};

#ifdef __cplusplus
extern "C" {
#endif

/* Lifecycle. The engine is a single static instance; ll_init may be called
 * again to re-initialise at a new sample rate (it forgets everything). */
void  ll_init(float sample_rate);
float ll_sample_rate(void);
int   ll_version(void);

/* Project. Pattern slots are addressed by index (0..15); a pattern's id is
 * inside its wire bytes. ll_scratch returns a buffer the host writes the wire
 * bytes into, then ll_pattern_load parses it. ll_pattern_clear empties a slot. */
uint8_t* ll_scratch(int bytes);
int   ll_pattern_load(int slot, int bytes);     /* returns 0 ok, <0 error */
void  ll_pattern_clear(int slot);
void  ll_song_set(const int32_t* ids, int n);   /* expanded sequence of pattern ids */
void  ll_set_freqs(const float* f16);           /* row → Hz, index 0 = top row */

/* Parameters. Set before or after ll_init; all are plain floats. */
void  ll_set(int id, float v);
void  ll_set_layer(int layer, int id, float v);
void  ll_set_drum(int voice, int id, float v);
float ll_get(int id);

/* Samples. One arena, cleared wholesale (kits load whole). kind: 0 single,
 * 1 round-robin, 2 velocity layers (soft→hard). Returns a float buffer of
 * `frames` mono samples at the engine rate for the host to fill, or NULL. */
void   ll_samples_clear(void);
float* ll_sample_alloc(int voice, int kind, int slot, int frames);
void   ll_sample_commit(int voice, int kind, int nslots);

/* Clock. The host may pin the core's frame counter to its own (the worklet's
 * currentFrame) so that `frame / sample_rate` is the AudioContext's time. */
void  ll_set_frame(double frame);
/* Static render buffers of LL_BLOCK frames for hosts that cannot pass memory
 * in (wasm): render into ll_out(0)/ll_out(1) with ll_render_out(n). */
float* ll_out(int ch);
void   ll_render_out(int n);

/* Transport. */
void  ll_play(void);
void  ll_stop(void);
int   ll_playing(void);
double ll_frame(void);
int   ll_cycles(void);        /* cycle tops passed since ll_play */

/* Auditions — a note or a hit right now, outside the sequencer. `hz` is the
 * frequency to sound (the host applies transpose, as Bell.play's caller did). */
void  ll_audition_note(int layer, float hz, float seconds);
void  ll_audition_drum(int voice, int vel);

/* Take the FX tails to silence (before a bounce). */
void  ll_flush(void);

/* Render `n` frames of stereo into the two buffers. */
void  ll_render(float* outL, float* outR, int n);

/* Drain queued UI events into `out` (capacity in int32s); returns the number
 * of int32s written (a multiple of 4). */
int   ll_events(int32_t* out, int cap);

/* Test hook: every voice trigger since the last drain, as {layer,row,frame,
 * dur_frames} int32 quads plus the frequency as float bits in a fifth slot.
 * Compiled in always; costs nothing unless drained. */
int   ll_debug_attacks(int32_t* out, int cap);

#ifdef __cplusplus
}
#endif
#endif
