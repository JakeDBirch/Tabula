/* A 0.5s sample recorded at 22050 must last 0.5s on a 48k engine: the core
 * resamples on playback, so the host never has to. One BD hit at step 0. */
#include "wire.h"
#include <math.h>
static int fails=0;
#define CK(c,...) do{ if(c)printf("ok   "); else {printf("FAIL ");fails++;} printf(__VA_ARGS__); printf("\n"); }while(0)
int main(){
  const int SR=48000; ll_init(SR);
  tpat p; tpat_init(&p,3,1); p.d.grid[LL_BD][0]=1;
  CK(tpat_load(0,&p)==0,"pattern loads");
  const int SRC=22050, N=SRC/2;
  float*buf=ll_sample_alloc(LL_BD,0,0,N,(float)SRC);
  CK(buf!=0,"sample buffer allocated");
  for(int i=0;i<N;i++)buf[i]=0.5f*sinf(2.f*3.14159265f*440.f*i/SRC);
  ll_sample_commit(LL_BD,0,1);
  ll_set(LL_P_ACTIVE_PAT,3); ll_set(LL_P_RV_SIZE,0); ll_set_drum(LL_BD,LL_D_RVSEND,0); ll_set_drum(LL_BD,LL_D_DLYSEND,0);
  ll_play();
  static float L[48000],R[48000];
  for(int off=0;off<SR;off+=256)ll_render(L+off,R+off,256);
  ll_stop();
  double e[10]={0}; for(int i=0;i<SR;i++)e[i*10/SR]+=L[i]*L[i];
  for(int k=0;k<10;k++)e[k]=sqrt(e[k]/(SR/10));
  printf("     rms per 100ms: "); for(int k=0;k<10;k++)printf("%.3f ",e[k]); printf("\n");
  CK(e[3]>0.05&&e[4]>0.05,"the sample is still sounding at 0.3-0.5s (it lasts 0.5s, not 0.23s)");
  CK(e[6]<0.002&&e[8]<0.002,"and is over by 0.6s");
  /* clearing while a hit is reading the arena must not read reused memory */
  ll_play(); ll_render(L,R,256); ll_samples_clear(); ll_render(L,R,4096); ll_stop();
  int fin=1; for(int i=0;i<4096;i++)if(!isfinite(L[i]))fin=0;
  CK(fin,"samples_clear mid-hit leaves a finite render");
  printf("%s\n",fails?"SAMPLER FAIL":"SAMPLER PASS"); return fails?1:0;
}
