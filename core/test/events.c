/* A UI mirror event must survive a FULL event queue.
 *
 * ev_push drops silently when the queue is full, and PLAYPAT / SONGPOS / PULSE
 * used to latch on the state changing rather than on the push succeeding — so a
 * dropped event was never retried and the UI kept showing the previous value
 * for ever. Reported as "sometimes the wrong pattern is highlighted and
 * blinking — one is playing back but the other one is being indicated."
 *
 * The queue fills in normal use on iOS: the host drains it on a 30Hz timer that
 * is paused while the app is inactive, so every lock and app-switch overflows
 * it. Here we fill it the same way, by rendering without draining. */
#include "wire.h"
static int fails=0;
#define CK(c,...) do{ if(c)printf("ok   "); else {printf("FAIL ");fails++;} printf(__VA_ARGS__); printf("\n"); }while(0)

static int32_t ev[4096];
/* Drain, and report the last PLAYPAT seen (or -1). */
static int drain_playpat(int*total){
  int n=ll_events(ev,(int)(sizeof(ev)/sizeof(ev[0]))), last=-1;
  if(total)*total=n;
  for(int i=0;i+3<n;i+=4) if(ev[i]==LL_EV_PLAYPAT) last=ev[i+1];
  return last;
}
int main(){
  const int SR=48000; ll_init(SR);
  static float L[4096],R[4096];
  tpat a; tpat_init(&a,101,1); a.s[0].grid[0][0]=1; a.d.grid[LL_BD][0]=1;
  tpat b; tpat_init(&b,202,1); b.s[0].grid[1][0]=1; b.d.grid[LL_BD][0]=1;
  CK(tpat_load(0,&a)==0&&tpat_load(1,&b)==0,"two patterns load");
  /* No song: the core free-runs whichever pattern is active. */
  ll_song_set(0,0);
  ll_set(LL_P_ACTIVE_PAT,101);
  ll_play();
  ll_render(L,R,1024);
  int n=0; CK(drain_playpat(&n)==101,"PLAYPAT reports the pattern it started on (101)");

  /* Fill the queue: render a long stretch WITHOUT draining. */
  for(int i=0;i<400;i++)ll_render(L,R,1024);
  /* ...and switch pattern while the host is not listening. This is the lock /
   * app-switch case: the event that says "now playing 202" is pushed into a
   * queue with no room, and is dropped. */
  ll_set(LL_P_ACTIVE_PAT,202);
  for(int i=0;i<40;i++)ll_render(L,R,1024);

  /* The host comes back and drains. What matters is that it ends up knowing
   * the pattern that is ACTUALLY playing — whether that arrives in the backlog
   * or on the next block it does not care, so neither does this test. */
  int flushed=0; int last=drain_playpat(&flushed);
  CK(flushed>0,"the backlog drains (%d int32s)",flushed);
  ll_render(L,R,1024);
  int n2=0; int later=drain_playpat(&n2);
  if(later!=-1)last=later;
  CK(last==202,"the host ends up knowing the pattern that is playing (got %d, want 202)",last);

  /* And it must not spam: once delivered, it stays quiet. */
  ll_render(L,R,1024); int n3=0; int again=drain_playpat(&n3);
  CK(again==-1,"and is not repeated once the host has it (got %d)",again);

  /* The sharp case: the queue saturated, so the ONE push at the transition is
   * guaranteed to be dropped. Pre-fix this is unrecoverable — the state latched
   * on the change, not on the send, so nothing ever pushed it again. */
  for(int i=0;i<600;i++)ll_render(L,R,1024);      /* saturate, host not listening */
  ll_set(LL_P_ACTIVE_PAT,101);                     /* change while saturated */
  for(int i=0;i<20;i++)ll_render(L,R,1024);
  int sat=0; int inBacklog=drain_playpat(&sat);
  ll_render(L,R,1024);
  int after=drain_playpat(0);
  int known=(after!=-1)?after:inBacklog;
  CK(known==101,"a change made while the queue is saturated still reaches the host (got %d, want 101)",known);

  ll_stop();
  printf("%s\n",fails?"EVENTS FAIL":"EVENTS PASS"); return fails?1:0;
}
