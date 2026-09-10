/* Engine lifecycle, the public API, the wire-format loader, the sample arena
 * and the render loop. See ll.h for the contract. */
#include "ll_engine.h"

ll_engine G;

/* Freestanding wasm has no libc: provide the two functions clang may still
 * emit calls to (struct copies and zeroing). Compiled with -fno-builtin so
 * these loops are not themselves turned back into memcpy calls. */
#ifdef __wasm__
void* memcpy(void* d,const void* s,unsigned long n){ unsigned char*a=d;const unsigned char*b=s; while(n--)*a++=*b++; return d; }
void* memset(void* d,int c,unsigned long n){ unsigned char*a=d; while(n--)*a++=(unsigned char)c; return d; }
#endif
static void zero(void*p,unsigned long n){ memset(p,0,n); }

/* ── memory: a bump arena for samples and the scratch buffer ────────────── */
#ifdef __wasm__
static uint8_t* arena_grow(unsigned long bytes){
  unsigned long pages=(bytes+65535)/65536;
  unsigned long prev=__builtin_wasm_memory_grow(0,pages);
  if(prev==(unsigned long)-1)return 0;
  return (uint8_t*)(prev*65536);
}
#else
#include <stdlib.h>
static uint8_t* arena_grow(unsigned long bytes){ return (uint8_t*)malloc(bytes); }
#endif
#define ARENA_BYTES (48u<<20)   /* 48MB: two full kits decoded to float, with room */
static uint8_t* arena=0; static unsigned long arenaUsed=0, arenaCap=0;
static void* arena_alloc(unsigned long bytes){
  bytes=(bytes+15)&~15ul;
  if(!arena){ arena=arena_grow(ARENA_BYTES); arenaCap=arena?ARENA_BYTES:0; arenaUsed=0; }
  if(!arena||arenaUsed+bytes>arenaCap)return 0;
  void*p=arena+arenaUsed; arenaUsed+=bytes; return p;
}

/* ── queues ─────────────────────────────────────────────────────────────── */
void ev_push(int type,int a,int b,double frame){
  if(G.evn+4>LL_EVQ)return;
  G.evq[G.evn++]=type; G.evq[G.evn++]=a; G.evq[G.evn++]=b; G.evq[G.evn++]=(int32_t)frame;
}
void att_push(int layer,int row,double frame,double dur,float hz){
  if(G.attn+5>LL_ATTQ)return;
  union{float f;int32_t i;}u; u.f=hz;
  G.attq[G.attn++]=layer; G.attq[G.attn++]=row; G.attq[G.attn++]=(int32_t)(frame+0.5);
  G.attq[G.attn++]=(int32_t)(dur+0.5); G.attq[G.attn++]=u.i;
}
int ll_events(int32_t*out,int cap){ int n=G.evn<cap?G.evn:cap; n-=n%4; for(int i=0;i<n;i++)out[i]=G.evq[i]; G.evn=0; return n; }
int ll_debug_attacks(int32_t*out,int cap){ int n=G.attn<cap?G.attn:cap; n-=n%5; for(int i=0;i<n;i++)out[i]=G.attq[i]; G.attn=0; return n; }

/* ── lifecycle ──────────────────────────────────────────────────────────── */
static void defaults(void){
  float*p=G.p;
  p[LL_P_BPM]=120; p[LL_P_TRANSPOSE]=0; p[LL_P_SWING]=0;
  p[LL_P_DLY_TIME]=0.375f; p[LL_P_DLY_FB]=0.45f; p[LL_P_DLY_HP]=8; p[LL_P_DLY_LP]=78;
  p[LL_P_RV_SIZE]=50; p[LL_P_RV_DAMP]=40; p[LL_P_RV_LFDAMP]=0; p[LL_P_RV_PREDELAY]=0; p[LL_P_RV_MOD]=0; p[LL_P_DLY_TO_REV]=0;
  p[LL_P_DRUM_LEVEL]=85; p[LL_P_DRUM_FXTRIM]=100; p[LL_P_DRUM_AUDIBLE]=1;
  p[LL_P_SONG_MODE]=0; p[LL_P_LOOP]=0; p[LL_P_LOOP_BAR]=0; p[LL_P_LOOP_PAT]=-1; p[LL_P_ACTIVE_PAT]=-1;
  p[LL_P_MASTER]=0.55f; p[LL_P_MOTION]=0;
  for(int l=0;l<2;l++){
    float*q=G.lp[l];
    q[LL_L_WAVE]=WV_SAW; q[LL_L_DETUNE]=l?0:8; q[LL_L_ATTACK]=8; q[LL_L_DECAY]=400; q[LL_L_SUSTAIN]=40;
    q[LL_L_CUTOFF]=80; q[LL_L_RES]=15; q[LL_L_FENV]=0; q[LL_L_OCTAVE]=0; q[LL_L_DLYSEND]=50; q[LL_L_RVSEND]=30;
    q[LL_L_MIX]=85; q[LL_L_FXTRIM]=100; q[LL_L_SUB]=l?50:0; q[LL_L_SPREAD]=50; q[LL_L_GLIDE]=0; q[LL_L_MONO]=l?1:0;
    q[LL_L_VELAMP]=100; q[LL_L_VELAMP_INV]=0; q[LL_L_VELFLT]=100; q[LL_L_VELFLT_INV]=0; q[LL_L_VELENV]=0; q[LL_L_VELENV_INV]=0;
    q[LL_L_AUDIBLE]=1;
  }
  for(int v=0;v<LL_DRUM_ROWS;v++){
    float*d=G.dm[v]; d[LL_D_LEVEL]=60; d[LL_D_PAN]=0; d[LL_D_RVSEND]=0; d[LL_D_DLYSEND]=0; d[LL_D_PITCH]=0;
    d[LL_D_FILT]=0; d[LL_D_FILTCUT]=100; d[LL_D_ENV]=100; d[LL_D_SAT]=0;
  }
  /* C major, index 0 = top row (the app's default table) */
  static const float cmaj[16]={1046.50f,987.77f,880.00f,783.99f,698.46f,659.25f,587.33f,523.25f,493.88f,440.00f,392.00f,349.23f,329.63f,293.66f,261.63f,130.81f};
  for(int i=0;i<16;i++)G.freqs[i]=cmaj[i];
}
void ll_init(float sr){
  zero(&G,sizeof G);
  G.sr=sr>1000.f?sr:48000.f;
  G.rng.s=0x9E3779B9u;
  defaults();
  for(int l=0;l<LL_NLAYERS;l++)sm_init(&G.layerGain[l],1.f,0.012f,G.sr);
  sm_init(&G.drumLevel,0.85f,0.02f,G.sr);
  sm_init(&G.masterGain,0.55f,0.02f,G.sr);
  G.monoVoice=-1; G.activeOH=-1; G.pulse=-1; G.playPatId=-1;
  synth_reset(); drums_reset(); fx_reset();
  for(int i=0;i<LL_P_COUNT;i++)fx_param(i,G.p[i]);
  for(int v=0;v<LL_DRUM_ROWS;v++)for(int i=0;i<LL_D_COUNT;i++)drums_set_mix(v,i,G.dm[v][i],-1);
  G.inited=1;
}
float ll_sample_rate(void){ return G.sr; }
int ll_version(void){ return LL_VERSION; }
double ll_frame(void){ return G.frame; }

/* ── parameters ─────────────────────────────────────────────────────────── */
void ll_set(int id,float v){
  if(id<0||id>=LL_P_COUNT)return;
  G.p[id]=v;
  switch(id){
    case LL_P_DRUM_LEVEL: sm_set(&G.drumLevel,ll_clamp(v,0,150)/100.f); break;
    case LL_P_DRUM_AUDIBLE: sm_set(&G.layerGain[LL_DRUMS],v>0.5f?1.f:0.f); break;
    case LL_P_MASTER: sm_set(&G.masterGain,v); break;
    case LL_P_DRUM_FXTRIM: for(int r=0;r<LL_DRUM_ROWS;r++)drums_set_mix(r,LL_D_RVSEND,G.dm[r][LL_D_RVSEND],-1),drums_set_mix(r,LL_D_DLYSEND,G.dm[r][LL_D_DLYSEND],-1); break;
    default: fx_param(id,v); break;
  }
}
float ll_get(int id){ return (id>=0&&id<LL_P_COUNT)?G.p[id]:0.f; }
void ll_set_layer(int layer,int id,float v){
  if(layer<0||layer>1||id<0||id>=LL_L_COUNT)return;
  G.lp[layer][id]=v;
  if(id==LL_L_AUDIBLE)sm_set(&G.layerGain[layer],v>0.5f?1.f:0.f);
}
void ll_set_drum(int voice,int id,float v){
  if(voice<0||voice>=LL_DRUM_ROWS||id<0||id>=LL_D_COUNT)return;
  G.dm[voice][id]=v;
  drums_set_mix(voice,id,v,-1);
}
void ll_set_freqs(const float*f){ for(int i=0;i<LL_ROWS;i++)G.freqs[i]=f[i]; }
void ll_song_set(const int32_t*ids,int n){ if(n>LL_SONG_MAX)n=LL_SONG_MAX; for(int i=0;i<n;i++)G.song[i]=ids[i]; G.songLen=n; }

/* ── samples ────────────────────────────────────────────────────────────── */
void ll_samples_clear(void){ arenaUsed=0; for(int v=0;v<LL_DRUM_ROWS;v++){ G.smp[v].n=0; G.smp[v].kind=0; G.smp[v].lastRR=-1; } }
float* ll_sample_alloc(int voice,int kind,int slot,int frames){
  if(voice<0||voice>=LL_DRUM_ROWS||slot<0||slot>=LL_MAX_SLOTS||frames<=0)return 0;
  float*b=(float*)arena_alloc((unsigned long)frames*sizeof(float));
  if(!b)return 0;
  G.smp[voice].p[slot]=b; G.smp[voice].len[slot]=frames; G.smp[voice].kind=kind;
  return b;
}
void ll_sample_commit(int voice,int kind,int nslots){
  if(voice<0||voice>=LL_DRUM_ROWS)return;
  G.smp[voice].kind=kind; G.smp[voice].n=nslots>LL_MAX_SLOTS?LL_MAX_SLOTS:nslots; G.smp[voice].lastRR=-1;
}

/* ── patterns: the wire format ──────────────────────────────────────────── */
uint8_t* ll_scratch(int bytes){
  if(bytes>G.scratchCap){
    int cap=bytes<(1<<16)?(1<<16):bytes;
    uint8_t*s=(uint8_t*)arena_alloc((unsigned long)cap);   /* leaks the old one; rare */
    if(!s)return 0;
    G.scratch=s; G.scratchCap=cap;
  }
  return G.scratch;
}
typedef struct { const uint8_t*p; int n, i, err; } rd;
static int32_t rd_i32(rd*r){ if(r->i+4>r->n){r->err=1;return 0;} int32_t v; memcpy(&v,r->p+r->i,4); r->i+=4; return v; }
static float rd_f32(rd*r){ if(r->i+4>r->n){r->err=1;return 0;} float v; memcpy(&v,r->p+r->i,4); r->i+=4; return v; }
static const uint8_t* rd_bytes(rd*r,int n){ if(r->i+n>r->n){r->err=1;return 0;} const uint8_t*b=r->p+r->i; r->i+=n; return b; }
static void head_finish(ll_phead*h){
  int n=0;
  for(int i=0;i<h->bars;i++){ int o=i*LL_COLS; for(int c=0;c<h->barLens[i];c++)if(n<LL_MAX_COLS)h->seq[n++]=(int16_t)(o+c); }
  if(!n)h->seq[n++]=0;
  h->seqLen=n;
}
static int rd_head(rd*r,ll_phead*h){
  int bars=rd_i32(r); if(r->err||bars<1||bars>LL_MAX_BARS)return -2;
  h->bars=bars;
  for(int i=0;i<bars;i++){ int l=rd_i32(r); h->barLens[i]=l<0?0:(l>LL_COLS?LL_COLS:l); }
  for(int i=0;i<bars;i++){ float m=rd_f32(r); h->barMults[i]=m>0.f?m:1.f; }
  return r->err?-3:0;
}
int ll_pattern_load(int slot,int bytes){
  if(slot<0||slot>=LL_MAX_PATTERNS||!G.scratch)return -1;
  rd r={G.scratch,bytes,0,0};
  ll_pattern*P=&G.pat[slot];
  static ll_pattern tmp; zero(&tmp,sizeof tmp);
  if(rd_i32(&r)!=0x31504C4C)return -1;
  tmp.id=rd_i32(&r); tmp.bars=rd_i32(&r); tmp.master=rd_i32(&r);
  for(int l=0;l<2;l++){
    ll_spart*s=&tmp.s[l];
    if(rd_head(&r,&s->h))return -2;
    int W=s->h.bars*LL_COLS;
    const uint8_t*g=rd_bytes(&r,LL_ROWS*W), *d=rd_bytes(&r,LL_ROWS*W), *pp=rd_bytes(&r,W*8);
    if(r.err)return -3;
    for(int row=0;row<LL_ROWS;row++)for(int c=0;c<W;c++){ s->grid[row][c]=g[row*W+c]; s->durs[row][c]=d[row*W+c]; if(g[row*W+c])s->h.hasNotes=1; }
    for(int c=0;c<W;c++){ const uint8_t*q=pp+c*8; s->params[c].vel=q[0];s->params[c].flt=q[1];s->params[c].dly=q[2];s->params[c].rev=q[3];s->params[c].rhy=q[4];s->params[c].dur=(int8_t)q[5];s->params[c].oct=q[6];s->params[c].glide=q[7]; }
    head_finish(&s->h);
  }
  {
    ll_dpart*d=&tmp.d;
    if(rd_head(&r,&d->h))return -2;
    int W=d->h.bars*LL_COLS;
    const uint8_t*g=rd_bytes(&r,LL_DRUM_ROWS*W), *v=rd_bytes(&r,LL_DRUM_ROWS*W), *ra=rd_bytes(&r,LL_DRUM_ROWS*W);
    if(r.err)return -3;
    for(int row=0;row<LL_DRUM_ROWS;row++)for(int c=0;c<W;c++){ d->grid[row][c]=g[row*W+c]; d->vel[row][c]=v[row*W+c]; d->rat[row][c]=ra[row*W+c]; if(g[row*W+c])d->h.hasNotes=1; }
    d->hasMotion=rd_i32(&r);
    if(d->hasMotion){
      const uint8_t*m=rd_bytes(&r,LL_NMOTION*LL_DRUM_ROWS*W*2); if(r.err)return -3;
      for(int k=0;k<LL_NMOTION;k++)for(int row=0;row<LL_DRUM_ROWS;row++)for(int c=0;c<W;c++){ int16_t x; memcpy(&x,m+((k*LL_DRUM_ROWS+row)*W+c)*2,2); d->motion[k][row][c]=x; }
    }
    head_finish(&d->h);
  }
  if(r.err)return -3;
  tmp.used=1;
  *P=tmp;
  return 0;
}
void ll_pattern_clear(int slot){ if(slot>=0&&slot<LL_MAX_PATTERNS)G.pat[slot].used=0; }

/* ── transport ──────────────────────────────────────────────────────────── */
void ll_play(void){ if(!G.inited)ll_init(48000); seq_start(); G.play=1; }
void ll_stop(void){ G.play=0; ev_push(LL_EV_STOPPED,0,0,G.frame); }
int ll_playing(void){ return G.play; }
void ll_audition_note(int layer,float hz,float seconds){
  if(!G.inited)ll_init(48000);
  if(layer<0||layer>1)layer=0;
  synth_play(hz,G.frame,0,seconds*G.sr,G.lp[layer][LL_L_DLYSEND],0.f,0.f,layer,0,0,0);
}
void ll_set_frame(double f){ if(!G.inited)ll_init(48000); G.frame=f; }
static float outBuf[2][LL_BLOCK];
float* ll_out(int ch){ return outBuf[ch&1]; }
void ll_render_out(int n){ if(n>LL_BLOCK)n=LL_BLOCK; ll_render(outBuf[0],outBuf[1],n); }
void ll_audition_drum(int voice,int vel){ if(!G.inited)ll_init(48000); drums_play(voice,G.frame+(double)(int)(0.01f*G.sr),vel,0,0); }
void ll_flush(void){ sm_jump(&G.combFb,0.f); sm_jump(&G.eFb,0.f); }

/* ── render ─────────────────────────────────────────────────────────────── */
void ll_render(float*outL,float*outR,int n){
  if(!G.inited)ll_init(48000);
  int off=0;
  while(off<n){
    int m=n-off; if(m>LL_BLOCK)m=LL_BLOCK;
    seq_run(G.frame+m);
    for(int l=0;l<LL_NLAYERS;l++)for(int i=0;i<m;i++){ G.busL[l][i]=0.f; G.busR[l][i]=0.f; }
    for(int i=0;i<m;i++){ G.rvL[i]=G.rvR[i]=G.dlL[i]=G.dlR[i]=0.f; }
    synth_render(m);
    drums_render(m);
    fx_render(outL+off,outR+off,m);
    G.frame+=m; off+=m;
  }
}
