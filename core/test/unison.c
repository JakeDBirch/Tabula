/* UNISON: a synth note is n readers of one pitch. The thing that has to hold
 * is that the control's ABSENCE (0) is the stack this engine always had:
 *   - POLY, detune 8, unison 0 renders BIT-IDENTICAL to unison 2 (the old
 *     o1/o2 pair, k=0 at the pitch panned left, k=1 at +detune panned right);
 *   - MONO (monoSingle) with unison 0 renders bit-identical to unison 1;
 *   - unison 1 on POLY is a single oscillator: it differs from 2, and its
 *     two channels are identical (nothing to pan);
 *   - 3 and 4 render finite and under 0dBFS, and each differs from the last. */
#include "wire.h"
#include <math.h>
static int fails=0;
#define CK(c,...) do{ if(c)printf("ok   "); else {printf("FAIL ");fails++;} printf(__VA_ARGS__); printf("\n"); }while(0)
#define N 48256
static float L[N],R[N];
static void take(int layer,int uni,float*outL,float*outR){
  ll_init(48000);
  tpat p; tpat_init(&p,3,1); p.s[layer].grid[8][0]=1; p.s[layer].durs[8][0]=4;
  tpat_load(0,&p); ll_set(LL_P_ACTIVE_PAT,3); ll_set(LL_P_RV_SIZE,0);
  ll_set_layer(layer,LL_L_RVSEND,0); ll_set_layer(layer,LL_L_DLYSEND,0); ll_set_layer(layer,LL_L_SUB,0);
  ll_set_layer(LL_SYNTH,LL_L_DETUNE,8); ll_set_layer(LL_SYNTH,LL_L_SPREAD,50);
  ll_set_layer(layer,LL_L_UNISON,(float)uni);
  ll_play(); for(int off=0;off<48000;off+=256)ll_render(outL+off,outR+off,256); ll_stop();
}
static int same(const float*a,const float*b,int n){ for(int i=0;i<n;i++)if(a[i]!=b[i])return 0; return 1; }
static double rms(const float*x,int n){ double e=0; for(int i=0;i<n;i++)e+=x[i]*x[i]; return sqrt(e/n); }
static float peak(const float*x,int n){ float p=0; for(int i=0;i<n;i++){float v=fabsf(x[i]);if(v>p)p=v;} return p; }
int main(){
  static float L0[N],R0[N],L1[N],R1[N],L2[N],R2[N],L3[N],R3[N],L4[N],R4[N];
  take(LL_SYNTH,0,L0,R0); take(LL_SYNTH,2,L2,R2); take(LL_SYNTH,1,L1,R1); take(LL_SYNTH,3,L3,R3); take(LL_SYNTH,4,L4,R4);
  CK(rms(L0,48000)>0.01,"POLY renders (rms %.3f)",rms(L0,48000));
  CK(same(L0,L2,48000)&&same(R0,R2,48000),"POLY: unison 0 (the old rule, detune 8) is BIT-IDENTICAL to unison 2");
  CK(!same(L1,L2,48000),"unison 1 differs from 2 (a single oscillator, no pair)");
  CK(same(L1,R1,48000),"unison 1: left and right are identical — one reader, nothing to pan");
  CK(!same(L2,R2,48000),"unison 2 with SPREAD 50: left and right differ");
  int fin=1; for(int i=0;i<48000;i++)if(!isfinite(L3[i])||!isfinite(L4[i])||!isfinite(R4[i]))fin=0;
  CK(fin,"unison 3 and 4 render finite");
  CK(!same(L3,L2,48000)&&!same(L4,L3,48000),"3 and 4 each differ from the one before");
  CK(peak(L4,48000)<1.f&&peak(R4,48000)<1.f,"unison 4 stays under 0dBFS (peak %.3f / %.3f)",peak(L4,48000),peak(R4,48000));
  printf("     rms by stack: 1 %.3f, 2 %.3f, 3 %.3f, 4 %.3f\n",rms(L1,48000),rms(L2,48000),rms(L3,48000),rms(L4,48000));
  take(LL_LEAD,0,L0,R0); take(LL_LEAD,1,L1,R1); take(LL_LEAD,2,L2,R2);
  CK(same(L0,L1,48000),"MONO: unison 0 is bit-identical to unison 1 (monoSingle was always one oscillator)");
  CK(!same(L2,L1,48000),"MONO can now stack: unison 2 differs from 1");
  printf("%s\n",fails?"UNISON FAIL":"UNISON PASS"); return fails?1:0;
}
