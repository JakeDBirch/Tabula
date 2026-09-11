/* LOOP on a bar the shorter part does not have.
 *
 * A pattern is as long as its longest part, and shorter parts LOOP TO FILL —
 * a 1-bar drum part keeps sounding through a 4-bar pattern. LOOP pins a bar of
 * the PATTERN, so with a 16-bar synth over an 8-bar drum part, looping bar 12
 * asks the drum part for a bar it does not have. It used to be handed column
 * 176 of a part that is 128 columns wide and fall silent. The loop bar has to
 * wrap into each part's own length, which is the same rule the free-running
 * cursor already obeys: bar 12 of the pattern is bar 12 % 8 = bar 4 of the
 * drums.
 *
 * Each bar carries a different marker so the test can say WHICH bar sounded:
 * synth row = bar index, drum voice = bar index. */
#include "wire.h"
#include <math.h>
static int fails=0;
#define CK(c,...) do{ if(c)printf("ok   "); else {printf("FAIL ");fails++;} printf(__VA_ARGS__); printf("\n"); }while(0)

/* Render `sec` seconds with LOOP pinned to `bar`, and report what sounded. */
static void loop_at(int bar,int*synthRow,int*drumVoice,int*nSynth,int*nDrum){
  ll_set(LL_P_LOOP,1); ll_set(LL_P_LOOP_BAR,(float)bar); ll_set(LL_P_LOOP_PAT,5); ll_set(LL_P_ACTIVE_PAT,5);
  ll_play();
  enum{ N=48000*3 };
  static float L[N],R[N];
  /* N is not a multiple of the block, so the last call must be short — a full
     block there walks off the end of the buffer, and the corruption it caused
     was itself mistaken for the bug under test. */
  for(int off=0;off<N;off+=256){ int m=N-off<256?N-off:256; ll_render(L+off,R+off,m); }
  ll_stop();
  static int32_t att[4096];
  int n=ll_debug_attacks(att,4096)/5;
  *synthRow=-1;*drumVoice=-1;*nSynth=0;*nDrum=0;
  for(int i=0;i<n;i++){
    int layer=att[i*5],row=att[i*5+1];
    union{int32_t i;float f;}u; u.i=att[i*5+4];
    if(layer==LL_DRUMS){ (*nDrum)++; if(*drumVoice<0)*drumVoice=row; }
    /* A synth attack carries row -1 and its frequency, and the frequencies are
       set to 100+row, so the pitch names the bar. */
    else if(layer==LL_SYNTH){ (*nSynth)++; if(*synthRow<0)*synthRow=(int)(u.f+0.5f); }
  }
}
int main(){
  const int SR=48000; ll_init(SR);
  /* Row r sounds at exactly (100+r) Hz, so a synth attack names its own bar. */
  float freqs[LL_ROWS]; for(int r=0;r<LL_ROWS;r++)freqs[r]=100.f+r;
  ll_set_freqs(freqs);
  ll_set_layer(LL_SYNTH,LL_L_OCTAVE,0); ll_set_layer(LL_SYNTH,LL_L_MONO,0);

  tpat p; tpat_init(&p,5,16);
  p.master=1;                       /* synth is the master: 16 bars */
  p.d.bars=8;                       /* drums are half as long and loop to fill */
  /* bar b: synth row b at step 0; drum voice b at step 0 */
  for(int b=0;b<16;b++)p.s[0].grid[b][b*16]=1;
  for(int b=0;b<8;b++)p.d.grid[b][b*16]=1;
  CK(tpat_load(0,&p)==0,"pattern loads (16-bar synth over an 8-bar drum part)");

  int sr_,dv,ns,nd;
  /* Sanity: loop a bar BOTH parts have. */
  loop_at(3,&sr_,&dv,&ns,&nd);
  CK(ns>0&&sr_==103,"loop bar 4: the synth sounds its bar 4 (%.0fHz → row %d)",(double)sr_,sr_-100);
  CK(nd>0&&dv==3,  "  and the drums sound their bar 4 (voice %d)",dv);

  /* The bug: a bar past the drum part's own length. */
  loop_at(11,&sr_,&dv,&ns,&nd);
  CK(ns>0&&sr_==111,"loop bar 12: the synth sounds its bar 12 (row %d)",sr_-100);
  CK(nd>0,          "  THE DRUMS STILL SOUND (%d hits)",nd);
  CK(dv==3,         "  and it is their bar 4, because 12 wraps into 8 (voice %d, want 3)",dv);

  /* The last bar of the pattern, and one that wraps to the drums' first bar. */
  loop_at(15,&sr_,&dv,&ns,&nd);
  CK(ns>0&&sr_==115,"loop bar 16: the synth sounds its bar 16 (row %d)",sr_-100);
  CK(nd>0&&dv==7,   "  and the drums sound their bar 8 (voice %d, want 7)",dv);
  loop_at(8,&sr_,&dv,&ns,&nd);
  CK(nd>0&&dv==0,   "loop bar 9: the drums wrap to their bar 1 (voice %d, want 0)",dv);

  printf("%s\n",fails?"LOOPWRAP FAIL":"LOOPWRAP PASS"); return fails?1:0;
}
