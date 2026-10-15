/* A synth layer can play a SAMPLE: the layer's own one-shot stands in for the
 * oscillator, pitched from LL_L_ROOT, through the layer's VCF and VCA.
 *   - a 440Hz sine recorded as root A4 (69) and played on a row set to 880Hz
 *     comes out at 880Hz (read with a one-bin Goertzel: 880 up, 440 absent);
 *   - it is a ONE-SHOT: a 0.3s sample at rate 2 is over by 0.15s however long
 *     the note is, and the voice is silent after it;
 *   - with no sample loaded a SAMPLE layer is silent but still attacks;
 *   - a kit switch (samples_clear) under a sounding note leaves a finite render,
 *     and the re-sent sample sounds again on the next note. */
#include "wire.h"
#include <math.h>
static int fails=0;
#define CK(c,...) do{ if(c)printf("ok   "); else {printf("FAIL ");fails++;} printf(__VA_ARGS__); printf("\n"); }while(0)
static double goertzel(const float*x,int n,double hz,double sr){
  double k=2.0*cos(2.0*M_PI*hz/sr),s0=0,s1=0,s2=0;
  for(int i=0;i<n;i++){ s0=x[i]+k*s1-s2; s2=s1; s1=s0; }
  return sqrt(fabs(s1*s1+s2*s2-k*s1*s2))/n;
}
static double rms(const float*x,int a,int b){ double e=0; for(int i=a;i<b;i++)e+=x[i]*x[i]; return sqrt(e/(b-a)); }
int main(){
  const int SR=48000; ll_init(SR);
  /* one POLY note at step 0 holding 8 steps (1s at 120bpm), nothing else */
  tpat p; tpat_init(&p,3,1); p.s[0].grid[8][0]=1; p.s[0].durs[8][0]=8;
  CK(tpat_load(0,&p)==0,"pattern loads");
  float fr[LL_ROWS]; for(int i=0;i<LL_ROWS;i++)fr[i]=880.f; ll_set_freqs(fr);
  ll_set(LL_P_ACTIVE_PAT,3); ll_set(LL_P_RV_SIZE,0);
  ll_set_layer(LL_SYNTH,LL_L_WAVE,4); ll_set_layer(LL_SYNTH,LL_L_ROOT,69);
  ll_set_layer(LL_SYNTH,LL_L_RVSEND,0); ll_set_layer(LL_SYNTH,LL_L_DLYSEND,0);
  ll_set_layer(LL_SYNTH,LL_L_ATTACK,1); ll_set_layer(LL_SYNTH,LL_L_SUSTAIN,100); ll_set_layer(LL_SYNTH,LL_L_FENV,0); ll_set_layer(LL_SYNTH,LL_L_CUTOFF,100);
  ll_set_layer(LL_SYNTH,LL_L_DETUNE,8); ll_set_layer(LL_SYNTH,LL_L_SPREAD,50);
  /* 48000 is not a multiple of the 256-frame block: size for the overrun, or
   the last block writes past the array (into R, and R into whatever follows). */
  static float L[48256],R[48256];
  /* 1. no sample loaded: silent, but the attack is still reported */
  ll_play(); for(int off=0;off<SR;off+=256)ll_render(L+off,R+off,256); ll_stop();
  { int32_t q[64]; int n=ll_debug_attacks(q,64);
    CK(n>=5,"it still attacks (%d attacks reported)",n/5);
    CK(rms(L,0,SR)<1e-6,"a SAMPLE layer with nothing loaded is silent (rms %.2e)",rms(L,0,SR)); }
  /* 2. a 0.3s 440Hz sine at 22050 as the POLY sample, root A4 */
  const int SRC=22050, N=SRC*3/10;
  float*buf=ll_sample_alloc(LL_DRUM_ROWS+LL_SYNTH,0,0,N,(float)SRC);
  CK(buf!=0,"layer sample buffer allocated (voice %d)",LL_DRUM_ROWS+LL_SYNTH);
  for(int i=0;i<N;i++)buf[i]=0.8f*sinf(2.f*(float)M_PI*440.f*i/SRC);
  ll_sample_commit(LL_DRUM_ROWS+LL_SYNTH,0,1);
  ll_play(); for(int off=0;off<SR;off+=256)ll_render(L+off,R+off,256); ll_stop();
  double g880=goertzel(L+480,4800,880,SR), g440=goertzel(L+480,4800,440,SR);
  printf("     10-110ms: 880Hz %.4f, 440Hz %.4f, rms %.4f\n",g880,g440,rms(L,480,5280));
  CK(rms(L,480,5280)>0.05,"the sample sounds through the VCA (rms %.3f)",rms(L,480,5280));
  CK(g880>10*g440,"and is re-pitched from its root: 880Hz dominates 440Hz by %.0fx",g440>0?g880/g440:1e9);
  /* one-shot: 0.3s of source at rate 2 is 0.15s of output; the note holds 1s */
  double late=rms(L,SR/5,SR/2);
  CK(late<1e-4,"it is a one-shot: silent from 0.2s to 0.5s inside a 1s note (rms %.2e)",late);
  /* 3. clear the arena under a sounding note, then re-send and play again */
  ll_play(); ll_render(L,R,256); ll_samples_clear(); ll_render(L,R,4096); ll_stop();
  int fin=1; for(int i=0;i<4096;i++)if(!isfinite(L[i]))fin=0;
  CK(fin,"samples_clear mid-note leaves a finite render");
  buf=ll_sample_alloc(LL_DRUM_ROWS+LL_SYNTH,0,0,N,(float)SRC);
  for(int i=0;i<N;i++)buf[i]=0.8f*sinf(2.f*(float)M_PI*440.f*i/SRC);
  ll_sample_commit(LL_DRUM_ROWS+LL_SYNTH,0,1);
  ll_play(); for(int off=0;off<SR;off+=256)ll_render(L+off,R+off,256); ll_stop();
  CK(rms(L,480,5280)>0.05,"the re-sent sample sounds again (rms %.3f)",rms(L,480,5280));
  /* 4. the MONO layer has its own slot: loading only POLY's leaves MONO silent */
  /* SUB off: the sub oscillator is its own sine under whatever the wave is, so it would sound here on its own. */
  ll_set_layer(LL_LEAD,LL_L_WAVE,4); ll_set_layer(LL_LEAD,LL_L_RVSEND,0); ll_set_layer(LL_LEAD,LL_L_DLYSEND,0); ll_set_layer(LL_LEAD,LL_L_SUB,0);
  tpat q; tpat_init(&q,4,1); q.s[1].grid[8][0]=1; q.s[1].durs[8][0]=8;
  CK(tpat_load(1,&q)==0,"MONO-only pattern loads");
  ll_set(LL_P_ACTIVE_PAT,4);
  ll_play(); for(int off=0;off<SR;off+=256)ll_render(L+off,R+off,256); ll_stop();
  /* from 0.4s, past the previous POLY note's tail */
  CK(rms(L,SR*2/5,SR)<1e-6,"MONO on SAMPLE with only POLY's sample loaded is silent (its own slot is empty; rms %.2e)",rms(L,SR*2/5,SR));
  printf("%s\n",fails?"LSAMPLE FAIL":"LSAMPLE PASS"); return fails?1:0;
}
