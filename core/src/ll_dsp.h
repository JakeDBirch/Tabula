/* DSP primitives shared by the voices and the buses. Each mirrors the Web
 * Audio node it replaces closely enough that the port of Bell / DrumEngine
 * reads line for line against the JS (see the comments in ll_synth.c). */
#ifndef LL_DSP_H
#define LL_DSP_H
#include <stdint.h>
#include "ll_math.h"

/* ── Biquad, Web Audio semantics ─────────────────────────────────────────
 * Q is in dB for lowpass/highpass (that is how the spec and Chromium define
 * it, and Bell sets vcfRes*0.28 dB on that basis); linear for bandpass. The
 * shelves take a gain in dB with S=1. Transposed direct form II. */
enum { BQ_LP, BQ_HP, BQ_BP, BQ_LSH, BQ_HSH };
typedef struct { float b0,b1,b2,a1,a2,z1,z2; } ll_bq;
static inline void bq_reset(ll_bq*f){ f->z1=f->z2=0.f; }
static inline void bq_bypass(ll_bq*f){ f->b0=1.f;f->b1=f->b2=f->a1=f->a2=0.f; }
static inline void bq_set(ll_bq*f,int type,float hz,float q,float gaindb,float sr){
  float nyq=sr*0.5f, cut=hz/nyq;
  if(cut>1.f)cut=1.f; if(cut<0.f)cut=0.f;
  float b0,b1,b2,a0,a1,a2;
  if(type==BQ_LP||type==BQ_HP){
    if(cut>=1.f){ if(type==BQ_LP)bq_bypass(f); else {f->b0=f->b1=f->b2=f->a1=f->a2=0.f;} return; }
    if(cut<=0.f){ if(type==BQ_LP){f->b0=f->b1=f->b2=f->a1=f->a2=0.f;} else bq_bypass(f); return; }
    float res=ll_db2lin(q);                     /* Q in dB → linear */
    float th=LL_PI*cut, al=ll_sin(th)/(2.f*res), cs=ll_cos(th);
    if(type==BQ_LP){ float be=(1.f-cs)*0.5f; b0=be;b1=1.f-cs;b2=be; }
    else            { float be=(1.f+cs)*0.5f; b0=be;b1=-(1.f+cs);b2=be; }
    a0=1.f+al;a1=-2.f*cs;a2=1.f-al;
  } else if(type==BQ_BP){
    if(cut<=0.f||cut>=1.f||q<=0.f){ f->b0=f->b1=f->b2=f->a1=f->a2=0.f; return; }
    float th=LL_PI*cut, al=ll_sin(th)/(2.f*q), cs=ll_cos(th);
    b0=al;b1=0.f;b2=-al;a0=1.f+al;a1=-2.f*cs;a2=1.f-al;
  } else {
    float A=ll_pow(10.f,gaindb*0.025f);
    if(cut>=1.f){ if(type==BQ_LSH){f->b0=A*A;f->b1=f->b2=f->a1=f->a2=0.f;} else bq_bypass(f); return; }
    if(cut<=0.f){ if(type==BQ_LSH)bq_bypass(f); else {f->b0=A*A;f->b1=f->b2=f->a1=f->a2=0.f;} return; }
    float th=LL_PI*cut, al=0.5f*ll_sin(th)*1.41421356f, k=ll_cos(th), k2=2.f*ll_sqrt(A)*al;
    float ap=A+1.f, am=A-1.f;
    if(type==BQ_LSH){
      b0=A*(ap-am*k+k2); b1=2.f*A*(am-ap*k); b2=A*(ap-am*k-k2);
      a0=ap+am*k+k2; a1=-2.f*(am+ap*k); a2=ap+am*k-k2;
    } else {
      b0=A*(ap+am*k+k2); b1=-2.f*A*(am+ap*k); b2=A*(ap+am*k-k2);
      a0=ap-am*k+k2; a1=2.f*(am-ap*k); a2=ap-am*k-k2;
    }
  }
  float ia=1.f/a0;
  f->b0=b0*ia;f->b1=b1*ia;f->b2=b2*ia;f->a1=a1*ia;f->a2=a2*ia;
}
static inline float bq_run(ll_bq*f,float x){
  float y=f->b0*x+f->z1;
  f->z1=f->b1*x-f->a1*y+f->z2;
  f->z2=f->b2*x-f->a2*y;
  return y;
}
/* Kill denormals in a recursive state every so often. */
static inline void bq_undenorm(ll_bq*f){ if(ll_fabs(f->z1)<1e-20f)f->z1=0.f; if(ll_fabs(f->z2)<1e-20f)f->z2=0.f; }

/* ── AudioParam automation ─────────────────────────────────────────────────
 * The voices are ported from Bell.play by keeping its automation calls:
 * setValueAtTime / linearRamp / exponentialRamp / setTargetAtTime /
 * cancelAndHold. Points are kept sorted; auto_tick is called once per sample
 * with a monotonically increasing frame time and returns the value. Ramps are
 * evaluated incrementally in double, so a 400ms exponential decay is exact to
 * far below float resolution. */
#define LL_AUTO_MAX 40
enum { AK_SET, AK_LIN, AK_EXP, AK_TGT, AK_HOLD };
typedef struct { double t; float v; float k; uint8_t kind; } ll_apt; /* k: tau in frames (TGT) */
typedef struct {
  ll_apt p[LL_AUTO_MAX]; int n, idx;
  double cur, inc, mul, tk, tgt; uint8_t mode;
} ll_auto;
static inline void auto_init(ll_auto*a,float v){ a->n=0;a->idx=0;a->cur=v;a->mode=AK_HOLD;a->inc=0;a->mul=1;a->tk=0;a->tgt=v; }
static inline void auto_add(ll_auto*a,double t,float v,int kind,float k){
  if(a->n>=LL_AUTO_MAX)return;
  int i=a->n; while(i>0&&a->p[i-1].t>t){ a->p[i]=a->p[i-1]; i--; }
  a->p[i].t=t;a->p[i].v=v;a->p[i].kind=(uint8_t)kind;a->p[i].k=k;a->n++;
}
static inline void auto_set(ll_auto*a,double t,float v){ auto_add(a,t,v,AK_SET,0); }
static inline void auto_lin(ll_auto*a,double t,float v){ auto_add(a,t,v,AK_LIN,0); }
static inline void auto_exp(ll_auto*a,double t,float v){ auto_add(a,t,v<1e-6f?1e-6f:v,AK_EXP,0); }
static inline void auto_target(ll_auto*a,double t,float v,float tauFrames){ auto_add(a,t,v,AK_TGT,tauFrames); }
/* Value a ramp would reach at time t on its way from (t0,v0) to point q. */
static inline float auto_ramp_at(const ll_apt*q,double t0,double v0,double t){
  if(q->t<=t0)return q->v;
  double u=(t-t0)/(q->t-t0); if(u<0)u=0; if(u>1)u=1;
  if(q->kind==AK_LIN)return (float)(v0+(q->v-v0)*u);
  return (float)(v0*ll_pow((float)(q->v/(v0>1e-9?v0:1e-9)),(float)u));
}
/* cancelAndHoldAtTime(t): drop everything after t, and if a ramp was crossing
 * t, end it there at the value it would have had. Points at exactly t stay. */
static inline void auto_cancel_hold(ll_auto*a,double t){
  int i=0; while(i<a->n&&a->p[i].t<=t)i++;
  if(i<a->n&&(a->p[i].kind==AK_LIN||a->p[i].kind==AK_EXP)){
    /* find where the ramp started: previous point, or the initial value */
    double t0=0, v0=a->cur;
    if(i>0){ t0=a->p[i-1].t; v0=a->p[i-1].v; if(a->p[i-1].kind==AK_TGT)v0=a->cur; }
    float vh=auto_ramp_at(&a->p[i],t0,v0,t);
    a->p[i].t=t; a->p[i].v=vh; a->n=i+1;
  } else a->n=i;
  if(a->idx>a->n)a->idx=a->n;
  auto_add(a,t,0.f,AK_HOLD,0);
}
/* cancelScheduledValues(t): drop points with time >= t. */
static inline void auto_cancel_from(ll_auto*a,double t){
  int i=0; while(i<a->n&&a->p[i].t<t)i++; a->n=i;
  if(a->idx>a->n)a->idx=a->n;
}
/* Arm the approach toward the next point if it is a ramp. */
static inline void auto_arm(ll_auto*a,double t){
  a->mode=(a->mode==AK_TGT)?AK_TGT:AK_HOLD;
  if(a->idx<a->n){
    const ll_apt*q=&a->p[a->idx];
    if(q->kind==AK_LIN||q->kind==AK_EXP){
      double dt=q->t-t;
      if(dt<1.0)dt=1.0;
      if(q->kind==AK_LIN){ a->inc=(q->v-a->cur)/dt; a->mode=AK_LIN; }
      else { double c=a->cur>1e-9?a->cur:1e-9; a->mul=ll_exp2((float)(ll_log2((float)(q->v/c))/dt)); a->mode=AK_EXP; }
    }
  }
}
static inline void auto_begin(ll_auto*a,double t){ a->idx=0; auto_arm(a,t); }
static inline float auto_tick(ll_auto*a,double t){
  while(a->idx<a->n&&a->p[a->idx].t<=t){
    const ll_apt*q=&a->p[a->idx];
    switch(q->kind){
      case AK_SET: case AK_LIN: case AK_EXP: a->cur=q->v; a->mode=AK_HOLD; break;
      case AK_TGT: a->tgt=q->v; a->tk=1.0-ll_exp((float)(-1.0/(q->k>0.5f?q->k:0.5f))); a->mode=AK_TGT; break;
      case AK_HOLD: a->mode=AK_HOLD; break;
    }
    a->idx++;
    auto_arm(a,t);
  }
  switch(a->mode){
    case AK_LIN: a->cur+=a->inc; break;
    case AK_EXP: a->cur*=a->mul; break;
    case AK_TGT: a->cur+=(a->tgt-a->cur)*a->tk; break;
    default: break;
  }
  return (float)a->cur;
}

/* ── Oscillator — polyBLEP saw/square, naive triangle, polynomial sine ──── */
enum { WV_SINE, WV_SQUARE, WV_SAW, WV_TRI };
typedef struct { double ph; } ll_osc;
static inline float osc_blep(float t,float dt){
  if(t<dt){ t/=dt; return t+t-t*t-1.f; }
  if(t>1.f-dt){ t=(t-1.f)/dt; return t*t+t+t+1.f; }
  return 0.f;
}
static inline float osc_run(ll_osc*o,int wave,float hz,float sr){
  float dt=hz/sr; if(dt>0.5f)dt=0.5f; if(dt<0.f)dt=0.f;
  float t=(float)o->ph;
  float y;
  switch(wave){
    case WV_SINE: y=ll_sinph(t); break;
    case WV_SAW:  y=2.f*t-1.f-osc_blep(t,dt); break;
    case WV_SQUARE:{ y=t<0.5f?1.f:-1.f; y+=osc_blep(t,dt); float t2=t+0.5f; if(t2>=1.f)t2-=1.f; y-=osc_blep(t2,dt); break; }
    default:      y=t<0.5f?(4.f*t-1.f):(3.f-4.f*t); break;
  }
  o->ph+=dt; if(o->ph>=1.0)o->ph-=1.0;
  return y;
}

/* ── Delay line with linear interpolation (DelayNode) ─────────────────────── */
typedef struct { float*buf; int size, mask, w; } ll_dline;
static inline void dl_init(ll_dline*d,float*buf,int sizePow2){ d->buf=buf;d->size=sizePow2;d->mask=sizePow2-1;d->w=0; for(int i=0;i<sizePow2;i++)buf[i]=0.f; }
static inline void dl_write(ll_dline*d,float x){ d->buf[d->w]=x; d->w=(d->w+1)&d->mask; }
/* Read `del` frames behind the NEXT write position (i.e. after dl_write of
 * this frame, del=1 returns the sample just written). */
static inline float dl_read(const ll_dline*d,float del){
  if(del<1.f)del=1.f; float mx=(float)(d->size-2); if(del>mx)del=mx;
  int i=(int)del; float fr=del-(float)i;
  int r0=(d->w-i)&d->mask, r1=(r0-1)&d->mask;
  return d->buf[r0]+(d->buf[r1]-d->buf[r0])*fr;
}

/* ── Noise (Math.random buffers) ──────────────────────────────────────────── */
typedef struct { uint32_t s; } ll_rng;
static inline uint32_t rng_u32(ll_rng*r){ uint32_t x=r->s; x^=x<<13; x^=x>>17; x^=x<<5; r->s=x; return x; }
static inline float rng_f(ll_rng*r){ return (float)(rng_u32(r)>>8)*(1.f/16777216.f); }        /* [0,1) */
static inline float rng_noise(ll_rng*r){ return rng_f(r)*2.f-1.f; }

/* ── One-pole smoother (setTargetAtTime on a live control) ────────────────── */
typedef struct { float v, tgt, k; } ll_smooth;
static inline void sm_init(ll_smooth*s,float v,float tauSec,float sr){ s->v=s->tgt=v; s->k=1.f-ll_exp(-1.f/(tauSec*sr)); }
static inline void sm_set(ll_smooth*s,float v){ s->tgt=v; }
static inline void sm_jump(ll_smooth*s,float v){ s->v=s->tgt=v; }
static inline float sm_tick(ll_smooth*s){ s->v+=(s->tgt-s->v)*s->k; return s->v; }
#endif
