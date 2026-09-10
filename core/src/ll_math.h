/* Own math, no libm. The core must render bit-identically in wasm and on iOS,
 * and a freestanding wasm build has no libm to call anyway. Accuracy is
 * ~1e-7 relative across the audio range, which is below anything audible;
 * the point is determinism, not speed. Compile with -fno-builtin so clang
 * never turns a loop here back into a libcall. */
#ifndef LL_MATH_H
#define LL_MATH_H
#include <stdint.h>

#define LL_PI  3.14159265358979323846f
#define LL_TAU 6.28318530717958647692f
#define LL_LN2 0.69314718055994530942f

static inline float ll_fabs(float x){ return __builtin_fabsf(x); }
static inline float ll_sqrt(float x){ return x>0.f?__builtin_sqrtf(x):0.f; }
static inline float ll_floor(float x){ return __builtin_floorf(x); }
static inline float ll_min(float a,float b){ return a<b?a:b; }
static inline float ll_max(float a,float b){ return a>b?a:b; }
static inline float ll_clamp(float x,float lo,float hi){ return x<lo?lo:(x>hi?hi:x); }
static inline float ll_round(float x){ return __builtin_floorf(x+0.5f); }

/* 2^x. Range-reduce to n + f, f in [-0.5,0.5], degree-6 Taylor for 2^f
 * (error < 2e-8 there), then scale by 2^n through the exponent bits. */
static inline float ll_exp2(float x){
  if(x> 127.f)x= 127.f;
  if(x<-126.f)x=-126.f;
  float n=__builtin_floorf(x+0.5f), f=x-n;
  float p=1.f+f*(0.69314718056f+f*(0.24022650696f+f*(0.05550410866f+f*(0.00961812911f+f*(0.00133335581f+f*0.00015403530f)))));
  union{ float f; uint32_t u; } s; s.u=(uint32_t)((int32_t)n+127)<<23;
  return p*s.f;
}
static inline float ll_exp(float x){ return ll_exp2(x*1.44269504089f); }

/* log2(x), x>0. Split into exponent and mantissa in [sqrt(1/2), sqrt(2)),
 * then the atanh series in t=(m-1)/(m+1), |t|<0.172, to t^11 (error < 1e-9). */
static inline float ll_log2(float x){
  if(!(x>0.f))return -126.f;
  union{ float f; uint32_t u; } s; s.f=x;
  int e=(int)((s.u>>23)&0xff)-127;
  s.u=(s.u&0x007fffffu)|0x3f800000u;         /* mantissa in [1,2) */
  float m=s.f;
  if(m>1.41421356f){ m*=0.5f; e+=1; }
  float t=(m-1.f)/(m+1.f), t2=t*t;
  float l=t*(1.f+t2*(1.f/3.f+t2*(1.f/5.f+t2*(1.f/7.f+t2*(1.f/9.f+t2*(1.f/11.f))))));
  return (float)e+l*2.88539008178f;             /* 2/ln2 */
}
static inline float ll_log(float x){ return ll_log2(x)*LL_LN2; }
static inline float ll_pow(float a,float b){ return a>0.f?ll_exp2(b*ll_log2(a)):0.f; }
static inline float ll_db2lin(float db){ return ll_exp2(db*0.16609640474f); } /* 10^(db/20) */

/* sin(x): reduce to [-pi,pi], reflect into [-pi/2,pi/2], Taylor to x^11
 * (max error ~6e-8 at pi/2). */
static inline float ll_sin(float x){
  x-=LL_TAU*__builtin_floorf(x*(1.f/LL_TAU)+0.5f);
  if(x> 1.57079632679f)x= LL_PI-x;
  else if(x<-1.57079632679f)x=-LL_PI-x;
  float x2=x*x;
  return x*(1.f+x2*(-1.f/6.f+x2*(1.f/120.f+x2*(-1.f/5040.f+x2*(1.f/362880.f+x2*(-1.f/39916800.f))))));
}
static inline float ll_cos(float x){ return ll_sin(x+1.57079632679f); }
/* sin(2*pi*phase), phase in [0,1). */
static inline float ll_sinph(float ph){ return ll_sin(ph*LL_TAU); }

static inline float ll_tanh(float x){
  if(x> 9.f)return  1.f;
  if(x<-9.f)return -1.f;
  float e=ll_exp(2.f*x);
  return (e-1.f)/(e+1.f);
}
#endif
