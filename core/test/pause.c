/* PAUSE holds the position; only PLAY rewinds.
 *
 * ll_stop already left every cursor where it was — ll_play, through seq_start,
 * is what rewinds — so the whole of a pause is ll_resume's shift. G.frame keeps
 * advancing while stopped (ll_render is sample-driven and always runs so tails
 * ring out), which leaves every stored onset that many frames in the past; if
 * resume did not shift them, the sequencer would come back having "missed" the
 * whole pause and fire every step of it at once — the same fault the JS
 * scheduler's catch-up guard exists for.
 *
 * The strongest thing that can be said about a pause is what this asserts:
 * pause + resume is the SAME performance, delayed by exactly the pause. So the
 * attacks after a resume must equal the uninterrupted run's, shifted by the
 * gap, and nothing at all may sound during the gap itself. */
#include "wire.h"
static int fails=0;
#define CK(c,...) do{ if(c)printf("ok   "); else {printf("FAIL ");fails++;} printf(__VA_ARGS__); printf("\n"); }while(0)

enum { SR=48000, CAP=4096 };
typedef struct { int n; int layer[512], row[512]; double frame[512]; float hz[512]; } atts;

static void drain(atts*a){
  static int32_t q[CAP];
  int n=ll_debug_attacks(q,CAP)/5;
  for(int i=0;i<n&&a->n<512;i++){
    union{int32_t i;float f;}u; u.i=q[i*5+4];
    a->layer[a->n]=q[i*5]; a->row[a->n]=q[i*5+1];
    a->frame[a->n]=(double)q[i*5+2]; a->hz[a->n]=u.f; a->n++;
  }
}
static void render(int frames){
  static float L[512],R[512];
  for(int off=0;off<frames;off+=512){ int m=frames-off<512?frames-off:512; ll_render(L,R,m); }
}
int main(){
  ll_init(SR);
  float freqs[LL_ROWS]; for(int r=0;r<LL_ROWS;r++)freqs[r]=100.f+r;
  ll_set_freqs(freqs);
  ll_set_layer(LL_SYNTH,LL_L_OCTAVE,0); ll_set_layer(LL_SYNTH,LL_L_MONO,0);
  ll_set(LL_P_ACTIVE_PAT,7);

  /* Four bars, one synth onset per bar naming its own bar by pitch, and a kick
     on every beat so there is something dense enough to catch a pile-up. */
  tpat p; tpat_init(&p,7,4);
  p.master=1;
  for(int b=0;b<4;b++)p.s[0].grid[b][b*16]=1;
  for(int b=0;b<4;b++)for(int q=0;q<4;q++)p.d.grid[0][b*16+q*4]=1;
  CK(tpat_load(0,&p)==0,"pattern loads");

  /* At 120bpm a 1x step is 0.125s, so four bars is exactly 8 seconds. */
  const int HALF=SR*4, GAP=SR*3;

  /* Reference: eight seconds, uninterrupted. */
  atts ref={0}; ll_play(); render(HALF*2); drain(&ref); ll_stop();
  ll_debug_attacks((int32_t[CAP]){0},CAP);   /* discard anything queued after */
  CK(ref.n>0,"the uninterrupted run sounds (%d attacks)",ref.n);

  /* Paused: the same eight seconds of TRANSPORT with three seconds of stopped
     time spliced into the middle. */
  atts a={0}; ll_play(); render(HALF); drain(&a);
  int before=a.n;
  ll_stop(); render(GAP); 
  { atts g={0}; drain(&g); CK(g.n==0,"nothing sounds during the pause (%d attacks)",g.n); }
  ll_resume(); render(HALF); drain(&a);
  CK(a.n==ref.n,"pause + resume sounds the same number of attacks (%d, want %d)",a.n,ref.n);
  CK(before>0&&before<ref.n,"  and the pause landed mid-performance (%d of %d before it)",before,ref.n);

  /* G.frame is absolute and ll_play does not rewind it — only the sequencer's
     cursors — so the second run starts wherever the first one left the clock.
     Compare each run against its OWN first attack; the claim is about the gaps
     between attacks, not about where the transport happened to be. */
  int same=1,shifted=1;
  double base=a.n&&ref.n?a.frame[0]-ref.frame[0]:0;
  for(int i=0;i<a.n&&i<ref.n;i++){
    if(a.layer[i]!=ref.layer[i]||a.row[i]!=ref.row[i]||a.hz[i]!=ref.hz[i])same=0;
    double want=ref.frame[i]+base+(i<before?0:(double)GAP);
    if(a.frame[i]!=want)shifted=0;
  }
  CK(same,"every attack is the same voice and pitch as the uninterrupted run");
  if(!shifted)for(int i=0;i<a.n&&i<ref.n;i++){
    double want=ref.frame[i]+base+(i<before?0:(double)GAP);
    if(a.frame[i]!=want)printf("     [%d] layer %d row %d got %.0f want %.0f (d %.0f)\n",i,a.layer[i],a.row[i],a.frame[i],want,a.frame[i]-ref.frame[i]);
  }
  CK(shifted,"and every attack after the resume is the same onset, %d frames later",GAP);

  /* The other half of the promise: PLAY still rewinds. A stop followed by play
     (rather than resume) must start the four bars again from bar 0. */
  ll_stop();
  { atts z={0}; drain(&z); }
  atts r2={0}; ll_play(); render(SR/2); drain(&r2); ll_stop();
  CK(r2.n>0,"play after a stop sounds (%d attacks)",r2.n);
  int firstSynth=-1; for(int i=0;i<r2.n;i++)if(r2.layer[i]==LL_SYNTH){firstSynth=(int)(r2.hz[i]+0.5f)-100;break;}
  CK(firstSynth==0,"and it rewinds — the first synth attack is bar 0 (got bar %d)",firstSynth);

  printf(fails?"\nPAUSE FAIL\n":"\nPAUSE PASS\n");
  return fails?1:0;
}
