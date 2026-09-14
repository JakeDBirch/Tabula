/* The sample arena and the pattern scratch buffer must not alias.
 *
 * ll_samples_clear() rewinds the bump arena (arenaUsed=0) so a kit can be
 * replaced wholesale. But the pattern scratch buffer was allocated out of that
 * SAME arena, and clearing does not invalidate it — so the next kit's frames
 * are handed the very bytes G.scratch still points at. The next pattern upload
 * then memcpy's wire data straight into decoded drum audio, and the kit plays
 * back with pattern bytes smeared through it: clicks, buzz, and what sounds
 * like several samples firing at once. Re-loading the kit rewrites the frames
 * over the damage, which is exactly how it was worked around on the device.
 *
 * Reported as "weird timbre/sound changes on drums when editing the mono
 * layer" — an edit is a pattern upload — and it only showed up in the iOS app
 * because that is the only place the core runs by default. */
#include "wire.h"
static int fails=0;
#define CK(c,...) do{ if(c)printf("ok   "); else {printf("FAIL ");fails++;} printf(__VA_ARGS__); printf("\n"); }while(0)

int main(){
  ll_init(48000);
  tpat p; tpat_init(&p,3,1); p.d.grid[LL_BD][0]=1;

  /* 1. A pattern upload first, so the scratch buffer is allocated while the
   *    arena is empty — it lands at offset 0, where the next kit's first
   *    sample will also land. This is the ordinary order on the device: the
   *    project's patterns are mirrored to the core before the kit finishes
   *    decoding. */
  CK(tpat_load(0,&p)==0,"a pattern loads (this allocates the scratch buffer)");

  /* 2. Load a "kit": clear, then fill a sample with a value we can check. */
  ll_samples_clear();
  const int N=20000;                     /* 80KB — comfortably past the 64KB scratch */
  float*buf=ll_sample_alloc(LL_BD,0,0,N,48000.f);
  CK(buf!=0,"a sample buffer is allocated after the clear");
  for(int i=0;i<N;i++)buf[i]=0.25f;
  ll_sample_commit(LL_BD,0,1);

  /* 3. Edit something — any grid or step edit re-uploads the pattern. */
  CK(tpat_load(0,&p)==0,"the pattern re-uploads after the kit loaded");

  /* 4. The sample must be untouched. Before the fix the wire bytes land inside
   *    it and this fails on thousands of frames. */
  int bad=0,firstBad=-1;
  for(int i=0;i<N;i++)if(buf[i]!=0.25f){ if(firstBad<0)firstBad=i; bad++; }
  if(bad)printf("     %d of %d frames corrupted, first at %d (value %g)\n",bad,N,firstBad,(double)buf[firstBad]);
  CK(bad==0,"the drum sample survives a pattern upload (scratch does not alias the arena)");

  /* 5. And the reverse: growing the scratch buffer must not land on top of a
   *    sample that is already there. */
  tpat big; tpat_init(&big,4,32); big.d.grid[LL_BD][0]=1;
  CK(tpat_load(1,&big)==0,"a large pattern loads (this grows the scratch buffer)");
  bad=0; for(int i=0;i<N;i++)if(buf[i]!=0.25f)bad++;
  CK(bad==0,"the sample also survives the scratch buffer GROWING");

  printf("%s\n",fails?"ARENA FAIL":"ARENA PASS"); return fails?1:0;
}
