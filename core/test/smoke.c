/* Smoke: one pattern, synth + lead + drums, 4s at 48k. Asserts the render is
 * finite and non-silent, attacks land on the grid, and writes a WAV to listen
 * to (test/build/smoke.wav). */
#include "wire.h"
#include <math.h>
static int fails=0;
#define CK(c,...) do{ if(c)printf("ok   "); else {printf("FAIL ");fails++;} printf(__VA_ARGS__); printf("\n"); }while(0)
int main(int argc,char**argv){
  const int SR=48000; ll_init(SR);
  tpat p; tpat_init(&p,7,1);
  p.s[0].grid[8][0]=1; p.s[0].grid[10][4]=1; p.s[0].grid[12][8]=1; p.s[0].durs[12][8]=4; p.s[0].grid[8][12]=1; p.s[0].params[12][4]=3; /* ratchet 3 */
  p.s[1].grid[14][0]=1; p.s[1].grid[13][2]=1; p.s[1].params[2][7]=1; p.s[1].grid[11][4]=1;
  p.d.grid[LL_BD][0]=1; p.d.grid[LL_BD][8]=1; p.d.grid[LL_SD][4]=1; p.d.grid[LL_SD][12]=1; p.d.grid[LL_CH][2]=1; p.d.grid[LL_CH][6]=1; p.d.grid[LL_OH][10]=1; p.d.grid[LL_CH][14]=1; p.d.rat[LL_CH][14]=2; p.d.grid[LL_CP][12]=1;
  CK(tpat_load(0,&p)==0,"pattern loads");
  ll_set(LL_P_ACTIVE_PAT,7);
  ll_play();
  const int N=SR*4; static float L[48000*4],R[48000*4];
  for(int off=0;off<N;off+=256)ll_render(L+off,R+off,256);
  ll_stop();
  double rms=0; int finite=1; float peak=0;
  for(int i=0;i<N;i++){ if(!isfinite(L[i])||!isfinite(R[i]))finite=0; rms+=L[i]*L[i]; if(fabsf(L[i])>peak)peak=fabsf(L[i]); }
  rms=sqrt(rms/N);
  CK(finite,"render is finite");
  CK(rms>0.01,"render is not silent (rms %.4f, peak %.3f)",rms,peak);
  CK(peak<=1.0f,"peak stays under 0dBFS (%.3f)",peak);
  static int32_t att[4096]; int n=ll_debug_attacks(att,4096)/5;
  /* 120bpm: a step is 6000 frames. Expect synth attacks at steps 0,4,8, and 3 at step 12 (ratchet), per bar ×2 bars */
  int synthN=0,drumN=0,onGrid=1;
  for(int i=0;i<n;i++){ int layer=att[i*5], fr=att[i*5+2]; if(layer==LL_DRUMS)drumN++; else if(layer==LL_SYNTH)synthN++; if(layer==LL_SYNTH){ if((fr%2000)!=0)onGrid=0; } }
  CK(synthN==12,"synth attacks over 2 bars: %d (want 12: 3 notes + a 3-ratchet, ×2)",synthN);
  CK(drumN==20,"drum attacks over 2 bars: %d (want 20)",drumN);
  CK(onGrid,"every synth attack lands on a step or a ratchet subdivision");
  char path[512]; snprintf(path,sizeof path,"%s/smoke.wav",argc>1?argv[1]:"."); write_wav(path,L,R,N,SR);
  snprintf(path,sizeof path,"%s/smoke.f32",argc>1?argv[1]:"."); { FILE*f=fopen(path,"wb"); if(f){ fwrite(L,4,N,f); fwrite(R,4,N,f); fclose(f);} }
  printf("%s\n",fails?"SMOKE FAIL":"SMOKE PASS"); return fails?1:0;
}
