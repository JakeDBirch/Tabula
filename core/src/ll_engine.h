/* Internal engine state and the contracts between the core's files. One
 * static instance `G`; nothing here is visible to a host. */
#ifndef LL_ENGINE_H
#define LL_ENGINE_H
#include "../ll.h"
#include "ll_dsp.h"
#ifdef __wasm__
void* memcpy(void*,const void*,unsigned long);
void* memset(void*,int,unsigned long);
#else
#include <string.h>
#endif

#define LL_BLOCK        128      /* internal render chunk */
#define LL_NSVOICES     64       /* synth voice pool */
#define LL_NDVOICES     48       /* drum hit pool */
#define LL_NDELEM       4        /* elements per drum hit (CP has 4) */
#define LL_NMOTION      7        /* level pan rvSend dlySend pitch env filtCut */
#define LL_MOTION_NULL  (-32768)
#define LL_EVQ          1024     /* int32s of queued UI events */
#define LL_ATTQ         4096     /* int32s of queued debug attacks */
#define LL_MAX_SLOTS    8        /* sample slots per voice (rr / vel layers) */
#define LL_STRIP_W      LL_BLOCK

typedef struct { uint8_t vel,flt,dly,rev,rhy; int8_t dur; uint8_t oct,glide; } ll_stepp;

/* The parts. Lengths and rates are per bar (barLens / barMults), and `seq` is
 * partSeq: the ordered absolute columns the part plays. hasNotes is cached at
 * load — the scheduler asks it every tick. */
typedef struct {
  int bars, seqLen, hasNotes;
  int barLens[LL_MAX_BARS]; float barMults[LL_MAX_BARS];
  int16_t seq[LL_MAX_COLS];
} ll_phead;
typedef struct {
  ll_phead h;
  uint8_t grid[LL_ROWS][LL_MAX_COLS], durs[LL_ROWS][LL_MAX_COLS];
  ll_stepp params[LL_MAX_COLS];
} ll_spart;
typedef struct {
  ll_phead h;
  uint8_t grid[LL_DRUM_ROWS][LL_MAX_COLS], vel[LL_DRUM_ROWS][LL_MAX_COLS], rat[LL_DRUM_ROWS][LL_MAX_COLS];
  int hasMotion;
  int16_t motion[LL_NMOTION][LL_DRUM_ROWS][LL_MAX_COLS];
} ll_dpart;
typedef struct { int used, id, bars, master; ll_spart s[2]; ll_dpart d; } ll_pattern;

/* A synth voice — Bell.play, with its node graph flattened. */
typedef struct {
  int active, layer, mono, wave, has2, hasSub, spread, envOn;
  double t0, end, chokeAt;
  ll_auto vca, vcf, frq;
  ll_osc o1, o2, sub;
  float detRatio, subLvl, gL1, gR1, gL2, gR2, comp, qdb, baseHz, revMul, dlyMul;
  ll_bq fL, fR; int coefN; float lastCut;
} ll_svoice;

/* One element of a drum hit: an oscillator, a noise burst or a sample, through
 * up to three biquads and an envelope gain. */
enum { DE_OSC, DE_NOISE, DE_SAMPLE };
typedef struct {
  int active, kind, wave, nbq, shaper;
  double t0, end, noiseEnd, chokeAt;
  ll_osc osc; ll_auto frq, gain; ll_bq bq[3];
  const float* smp; int smpLen; double pos, rate; float smpGain;
} ll_delem;
typedef struct { int active, voice, nel, gen; double end; ll_delem el[LL_NDELEM]; } ll_dvoice;

/* A drum mixer strip — DrumEngine.voiceStrips[key]. */
typedef struct {
  ll_auto level, pan, rv, dly, cut;
  int filt; float sat, pitch, env, rvBase, dlyBase, lastCut; int coefN;
  ll_bq bq; float acc[LL_STRIP_W];
} ll_strip;

typedef struct { const float* p[LL_MAX_SLOTS]; int len[LL_MAX_SLOTS]; int n, kind, lastRR; } ll_sampleset;

typedef struct { ll_dline d; ll_bq hsh, lsh; float base; int ch; double lfoPh; float lfoRate; } ll_comb;

typedef struct {
  float sr; int inited, play;
  double frame;
  float p[LL_P_COUNT]; float lp[2][LL_L_COUNT]; float dm[LL_DRUM_ROWS][LL_D_COUNT];
  float freqs[LL_ROWS];
  ll_pattern pat[LL_MAX_PATTERNS];
  int32_t song[LL_SONG_MAX]; int songLen;
  /* transport / sequencer */
  int mstep, mFirst; double mNext;
  struct { int step; double nextAt; } cur[LL_NLAYERS];
  int songPos, pulse, playPatId;
  float lastFreq[2]; int lastGlide[2];
  /* voices */
  ll_svoice sv[LL_NSVOICES]; int monoVoice; int svGen;
  ll_dvoice dv[LL_NDVOICES]; int dvGen; int activeOH, activeOHel, activeOHgen;
  ll_strip strip[LL_DRUM_ROWS];
  ll_sampleset smp[LL_DRUM_ROWS];
  ll_rng rng;
  /* buses, per block */
  float busL[LL_NLAYERS][LL_BLOCK], busR[LL_NLAYERS][LL_BLOCK];
  float rvL[LL_BLOCK], rvR[LL_BLOCK], dlL[LL_BLOCK], dlR[LL_BLOCK];
  ll_smooth layerGain[LL_NLAYERS], drumLevel, masterGain;
  /* fx */
  ll_comb comb[8]; ll_smooth combFb, combSize, combMod, rvHf, rvLf, rvPre, dlyToRev;
  float rvSizeFactor;
  ll_dline preD; ll_dline echoL, echoR; ll_bq eHpL, eHpR, eLpL, eLpR; ll_smooth eFb, eHp, eLp; float eTime;
  int fxCoefN;
  /* master limiter */
  ll_dline limL, limR; float limEnv, limGain;
  /* queues */
  int32_t evq[LL_EVQ]; int evn;
  int32_t attq[LL_ATTQ]; int attn;
  uint8_t* scratch; int scratchCap;
} ll_engine;

extern ll_engine G;

/* helpers shared across files */
static inline float sec2f(float s){ return s*G.sr; }
static inline ll_phead* part_head(ll_pattern*p,int layer){ return layer==LL_DRUMS?&p->d.h:&p->s[layer].h; }
static inline float col_mult(const ll_phead*h,int ac){ int bi=ac/LL_COLS; return (bi>=0&&bi<h->bars&&h->barMults[bi]>0.f)?h->barMults[bi]:1.f; }
static inline float part_abs_len(const ll_phead*h){ float t=0; for(int i=0;i<h->bars;i++)t+=(float)h->barLens[i]*(h->barMults[i]>0.f?h->barMults[i]:1.f); return t; }
void ev_push(int type,int a,int b,double frame);
void att_push(int layer,int row,double frame,double dur,float hz);

/* ll_seq.c */
void seq_start(void);
void seq_run(double blockEnd);
/* ll_synth.c */
void synth_reset(void);
void synth_play(float freq,double at,const ll_stepp*sp,double noteDurF,float globalSend,float prevFreq,float glideSec,int layer,const double*modAt,const ll_stepp*modSp,int nmods);
void synth_render(int n);
/* ll_drums.c */
void drums_reset(void);
void drums_set_mix(int voice,int id,float v,double when);
void drums_play(int voice,double at,int vel,const float*mixOverride,int hasOverride);
void drums_render(int n);
/* ll_fx.c */
void fx_reset(void);
void fx_param(int id,float v);
void fx_render(float*outL,float*outR,int n);
#endif
