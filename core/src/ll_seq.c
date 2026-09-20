/* The sequencer — a port of `scheduler`, `playSynthLayerStep` and
 * `playDrumStep` from src/loudlight.jsx. Same model: each part runs its own
 * cursor through partSeq at its own per-bar rate, and a master clock one
 * pattern long (counted in the master part's own steps, priced per tick from
 * that step's bar) snaps every cursor back to 0 when it wraps and advances the
 * song. What changed is only HOW it runs: the JS version walked each cursor to
 * a 100ms horizon in turn, which meant a part could schedule past a master
 * wrap that then reset it — a latent double-trigger that only a stalled main
 * thread could expose. Here the master and the three cursors are advanced in
 * strict time order (master first on a tie), so a cycle top is produced by
 * exactly one cursor, and the lookahead is the render block, not a timer. */
#include "ll_engine.h"

typedef struct {
  /* inLoop: LOOP is on at all — pin the pattern and hold the song's place.
   * barLock: and pin ONE bar of it. LL_P_LOOP is 0 off / 1 bar / 2 pattern, so
   * a whole-pattern loop is inLoop without barLock: everything runs its own
   * full length, the song just doesn't advance. */
  ll_pattern*pat; int inSong, inLoop, barLock, loopBarIdx, loopOff;
  int mLayer; ll_phead*mHead; int patLen; float absStep, bpm; int loopMasterLen, mLoopBar, loopBars;
} ctx_t;

static ll_pattern* find_pat(int id){ if(id<0)return 0; for(int i=0;i<LL_MAX_PATTERNS;i++)if(G.pat[i].used&&G.pat[i].id==id)return &G.pat[i]; return 0; }
static ll_pattern* first_pat(void){ for(int i=0;i<LL_MAX_PATTERNS;i++)if(G.pat[i].used)return &G.pat[i]; return 0; }

/* masterLayerOf: recorded wins, empty or not; else the longest populated. */
static int master_layer(ll_pattern*p){
  if(p->master>=1&&p->master<=3)return p->master-1;
  int best=-1; float bl=-1;
  for(int l=0;l<LL_NLAYERS;l++){ ll_phead*h=part_head(p,l); if(!h->hasNotes)continue; float al=part_abs_len(h); if(al>bl){bl=al;best=l;} }
  return best;
}
/* patCycle().steps — the cycle in the master's own steps. */
static int pat_cycle_steps(ll_pattern*p,int mLayer){
  if(mLayer<0){ int n=p->bars*LL_COLS; return n<1?1:n; }
  ll_phead*mh=part_head(p,mLayer);
  float one=part_abs_len(mh); if(one<1e-9f)one=1e-9f;
  float longest=one;
  for(int l=0;l<LL_NLAYERS;l++){ ll_phead*h=part_head(p,l); if(h->hasNotes){ float al=part_abs_len(h); if(al>longest)longest=al; } }
  float q=longest/one-1e-9f; int reps=(int)q; if((float)reps<q)reps++; if(reps<1)reps=1;
  int st=mh->seqLen*reps; return st<1?1:st;
}

/* The LOOP window's columns: N bars from `loopBar`, each wrapped into this
 * part's OWN bar count (the loop-to-fill rule the free-running cursor obeys).
 * N=1 is the old single-bar pin exactly, which is why this generalises it
 * rather than replacing it. Walked rather than materialised: a window is at
 * most four bars, so finding the i'th column is a couple of compares and the
 * render thread allocates nothing. */
static int loop_win_len(ll_phead*h,int loopBar,int n){
  int pb=h->bars<1?1:h->bars, total=0;
  if(n<1)n=1;
  for(int j=0;j<n;j++){
    int b=((loopBar+j)%pb+pb)%pb;
    int l=h->barLens[b];
    total+=l>0?l:LL_COLS;
  }
  return total>0?total:LL_COLS;
}
static int loop_win_col(ll_phead*h,int loopBar,int n,int i){
  int pb=h->bars<1?1:h->bars;
  if(n<1)n=1;
  if(i<0)i=0;
  for(int j=0;j<n;j++){
    int b=((loopBar+j)%pb+pb)%pb;
    int l=h->barLens[b]; if(l<=0)l=LL_COLS;
    if(i<l)return b*LL_COLS+i;
    i-=l;
  }
  return ((loopBar%pb)+pb)%pb*LL_COLS;   /* unreachable while i < window length */
}
static int build_ctx(ctx_t*c){
  c->inSong=G.p[LL_P_SONG_MODE]>0.5f;
  c->inLoop=G.p[LL_P_LOOP]>0.5f;
  c->barLock=G.p[LL_P_LOOP]>1.5f?0:c->inLoop;
  ll_pattern*cur=0;
  if(c->inSong&&G.songLen){
    if(G.songPos<0||G.songPos>=G.songLen)G.songPos=0;
    cur=find_pat(G.song[G.songPos]);
  }
  if(c->inLoop){ ll_pattern*lp=find_pat((int)G.p[LL_P_LOOP_PAT]); if(lp)cur=lp; }
  if(!cur)cur=find_pat((int)G.p[LL_P_ACTIVE_PAT]);
  if(!cur)cur=first_pat();
  if(!cur)return 0;
  c->pat=cur;
  int bars=cur->bars<1?1:cur->bars;
  int lb=(int)G.p[LL_P_LOOP_BAR]; if(lb<0)lb=0; if(lb>bars-1)lb=bars-1;
  c->loopBarIdx=c->barLock?lb:-1;
  c->loopOff=c->loopBarIdx*LL_COLS;   /* the PATTERN's bar; each part wraps it */
  c->mLayer=master_layer(cur);
  c->mHead=c->mLayer>=0?part_head(cur,c->mLayer):0;
  /* THE PATTERN'S OWN TEMPO WINS, and it is resolved HERE rather than at the
   * param, because in a song the pattern changes under the clock: ctx_setup
   * runs per block and has already picked `cur`, so a tempo change lands on
   * the entry that asked for it without the host being told anything. */
  c->bpm=cur->bpm>1.f?cur->bpm:(G.p[LL_P_BPM]>1.f?G.p[LL_P_BPM]:1.f);
  c->absStep=G.sr*60.f/c->bpm/4.f;
  /* The master is a part like any other and can be the SHORT one, so it wraps
   * the pinned bar into its own length exactly as the others do. */
  c->mLoopBar=0; c->loopMasterLen=LL_COLS;
  c->loopBars=(int)G.p[LL_P_LOOP_BARS]; if(c->loopBars<1)c->loopBars=1;
  if(c->barLock&&c->mHead){
    int pb=c->mHead->bars<1?1:c->mHead->bars;
    c->mLoopBar=((c->loopBarIdx%pb)+pb)%pb;
    c->loopMasterLen=loop_win_len(c->mHead,c->mLoopBar,c->loopBars);
  }
  c->patLen=c->barLock?c->loopMasterLen:pat_cycle_steps(cur,c->mLayer);
  if(c->patLen<1)c->patLen=1;
  return 1;
}
static double master_dur(ctx_t*c,int i){
  if(!c->mHead)return c->absStep;
  int col=c->barLock
    ?loop_win_col(c->mHead,c->mLoopBar,c->loopBars,i%c->loopMasterLen)
    :c->mHead->seq[i%c->mHead->seqLen];
  return c->absStep*col_mult(c->mHead,col);
}

/* ── step players ───────────────────────────────────────────────────────── */
static void play_synth_step(int layer,ll_pattern*P,int s,double at,double stepDur,float bpm){
  ll_spart*part=&P->s[layer];
  const float*lp=G.lp[layer];
  float ratio=ll_exp2(G.p[LL_P_TRANSPOSE]/12.f);
  int W=part->h.bars*LL_COLS;
  const ll_stepp*sp=(s>=0&&s<W)?&part->params[s]:0;
  int rhy=sp?(sp->rhy<1?1:sp->rhy):1; int ratch=rhy;
  double subDur=stepDur/ratch;
  int monoOne=lp[LL_L_MONO]>0.5f;
  /* The EFFECTIVE tempo, passed in: the layer glide is "up to ~1 beat", and
   * a beat belongs to whatever tempo the pattern is actually playing at. */
  for(int r=0;r<LL_ROWS;r++){
    if(!part->grid[r][s])continue;
    int dur=part->durs[r][s]<1?1:part->durs[r][s];
    double noteDur=stepDur*dur;
    float f=G.freqs[r]*ratio;
    float stepOct=sp?(float)((int)sp->oct-2):0.f, layerOct=lp[LL_L_OCTAVE];
    float actualF=f*ll_exp2(stepOct+layerOct);
    /* How far INTO the next step the slide runs, as a fraction of a step. It
     * was a fixed 1/32 note, which is exactly half a step at 1x — so 50 here
     * reproduces the old sound and everything either side of it is new range.
     * Measured in steps, so it tracks tempo AND this bar's own rate. */
    int glidePct=glide_pct(sp);
    int hasGlide=glidePct>0;
    float layerGlide01=ll_clamp(lp[LL_L_GLIDE],0,100)/100.f;
    float stepGlideTime=(float)(glidePct/100.0*stepDur);
    float layerGlideTime=layerGlide01*(60.f/bpm);
    int usePrev=G.lastGlide[layer]||layerGlide01>0.f;
    float prevF=(usePrev&&G.lastFreq[layer]>0.f)?G.lastFreq[layer]:0.f;
    float glideTime=(prevF>0.f&&prevF!=actualF)?ll_max(stepGlideTime,layerGlideTime):0.f;
    G.lastFreq[layer]=actualF;
    G.lastGlide[layer]=hasGlide||layerGlide01>0.f;
    /* tied-note mods: FLT / OCT / GLIDE of the held-through columns */
    double modAt[LL_MAX_COLS]; const ll_stepp* modSp[LL_MAX_COLS]; int nm=0;
    if(dur>1&&ratch==1){
      for(int i=1;i<dur&&nm<LL_MAX_COLS;i++){ int subC=(s+i)%W; modAt[nm]=at+i*stepDur; modSp[nm]=&part->params[subC]; nm++; }
    }
    if(ratch>1){
      for(int ri=0;ri<ratch;ri++)synth_play(f,at+ri*subDur,sp,subDur*0.9,lp[LL_L_DLYSEND],ri==0?prevF:0.f,ri==0?glideTime:0.f,layer,0,0,0);
    } else {
      /* modSp is an array of pointers; synth_play takes a flat array — copy */
      ll_stepp mods[LL_MAX_COLS]; for(int i=0;i<nm;i++)mods[i]=*modSp[i];
      synth_play(f,at,sp,noteDur,lp[LL_L_DLYSEND],prevF,glideTime,layer,modAt,mods,nm);
    }
    if(monoOne)break;
  }
}
static void play_drum_step(ll_pattern*P,int s,double at,double stepDur){
  ll_dpart*d=&P->d;
  int motionOn=G.p[LL_P_MOTION]>0.5f;
  for(int r=0;r<LL_DRUM_ROWS;r++){
    if(!d->grid[r][s])continue;
    int vel=d->vel[r][s]; if(vel<1)vel=100;
    float ov[LL_NMOTION]; int hasOv=0;
    if(motionOn){
      /* MOTION on: re-assert the effective mix on EVERY hit — the base, overlaid
       * with this step's motion value per automated param (null → keep base). */
      static const int map[LL_NMOTION]={LL_D_LEVEL,LL_D_PAN,LL_D_RVSEND,LL_D_DLYSEND,LL_D_PITCH,LL_D_ENV,LL_D_FILTCUT};
      for(int k=0;k<LL_NMOTION;k++){
        float v=G.dm[r][map[k]];
        if(d->hasMotion){ int16_t m=d->motion[k][r][s]; if(m!=LL_MOTION_NULL)v=(float)m; }
        ov[k]=v;
      }
      hasOv=1;
      for(int k=0;k<LL_NMOTION;k++)drums_set_mix(r,map[k],ov[k],at);
    }
    int rat=d->rat[r][s]<1?1:d->rat[r][s];
    if(rat>1&&stepDur>0){ double sub=stepDur/rat; for(int i=0;i<rat;i++)drums_play(r,at+i*sub,vel,ov,hasOv); }
    else drums_play(r,at,vel,ov,hasOv);
  }
}

/* ── the walk ───────────────────────────────────────────────────────────── */
void seq_start(void){
  double t0=G.frame;
  G.mstep=0; G.mNext=t0; G.mFirst=1; G.cycles=0;
  for(int l=0;l<LL_NLAYERS;l++){ G.cur[l].step=0; G.cur[l].nextAt=t0; }
  G.songPos=0; G.pulse=-1; G.playPatId=-1;
  /* Receipts reset too, or a restart that lands on the same values as last
   * time would deliver nothing and leave the UI on the old run's readout. */
  G.sentSongPos=-2; G.sentPulse=-2; G.sentPatId=-2;
  G.lastFreq[0]=G.lastFreq[1]=0.f; G.lastGlide[0]=G.lastGlide[1]=0;
}
static void part_tick(ctx_t*c,int layer){
  ll_pattern*P=c->pat;
  ll_phead*h=part_head(P,layer);
  int len=h->seqLen;
  /* LOOP pins a bar of the PATTERN; a part shorter than the pattern does not
   * have it. Wrap into this part's own length — the loop-to-fill rule the
   * free-running cursor obeys. Without it an 8-bar part under a 16-bar one was
   * read past the end of its grid and fell silent for every loop bar past 8. */
  int lBar=0, loopLen=0;
  if(c->barLock){ int pb=h->bars<1?1:h->bars; lBar=((c->loopBarIdx%pb)+pb)%pb;
                 loopLen=loop_win_len(h,lBar,c->loopBars); }
  int st=G.cur[layer].step;
  int s=c->barLock?loop_win_col(h,lBar,c->loopBars,st%loopLen):h->seq[st%len];
  double stepDur=c->absStep*col_mult(h,s);
  double at=G.cur[layer].nextAt;
  float sw=G.p[LL_P_SWING];
  double playAt=(sw>0.f&&(s%2==1))?at+(sw/100.f)*(stepDur/3.0):at;
  int audible=layer==LL_DRUMS?G.p[LL_P_DRUM_AUDIBLE]>0.5f:G.lp[layer][LL_L_AUDIBLE]>0.5f;
  if(audible){ if(layer==LL_DRUMS)play_drum_step(P,s,playAt,stepDur); else play_synth_step(layer,P,s,playAt,stepDur,c->bpm); }
  ev_push(LL_EV_STEP,layer,s,playAt);
  G.playPatId=P->id;            /* truth; ui_sync below handles delivery */
  G.cur[layer].step=c->barLock?(st+1)%loopLen:(st+1)%len;
  G.cur[layer].nextAt=at+stepDur;
}
/* The master's events are STEP BOUNDARIES: at G.mNext, step G.mstep begins.
 * The reset of every part cursor (and the song advance) is the event at the
 * boundary where step 0 begins — the top of the next cycle — not the tick
 * that leaves step 15. The JS scheduler expressed the same thing through its
 * loop order (parts to the horizon first, then the master's reset, which
 * pointed the cursors at the cycle top); in a time-ordered walk the reset
 * has to be placed AT the cycle top or the last step of every cycle is lost
 * to it. Master first on a tie, so the cycle top is produced by the reset
 * cursor and not by a part's natural continuation. */
static void master_tick(ctx_t*c){
  int st=G.mstep; double t=G.mNext;
  if(st==0&&!G.mFirst){
    /* The bounce stops the transport HERE, at a cycle top: no note of the
     * next cycle is scheduled, and the tails ring out under the host's tail
     * seconds. Exactly where the realtime bounce could never stop. */
    G.cycles++;
    int stopAfter=(int)G.p[LL_P_STOP_AFTER];
    if(stopAfter>0&&G.cycles>=stopAfter){ G.play=0; ev_push(LL_EV_STOPPED,G.cycles,0,t); return; }
    if(c->inSong&&!c->inLoop&&G.songLen>1){ G.songPos=(G.songPos+1)%G.songLen; }
    for(int l=0;l<LL_NLAYERS;l++){ G.cur[l].step=0; G.cur[l].nextAt=t; }
  }
  G.mFirst=0;
  int mcol=c->mHead?c->mHead->seq[st%c->mHead->seqLen]:st;
  int pb=c->barLock?c->loopBarIdx:mcol/LL_COLS;
  int pq=pb*4+(mcol%LL_COLS)/4;
  G.pulse=pq;
  G.mNext=t+master_dur(c,st);
  G.mstep=(st+1)%c->patLen;
}
/* Deliver any UI mirror the host has not been told about yet, latching ONLY on
 * a successful push. A full queue therefore costs a late update, never a lost
 * one: the next block tries again. This is why the three values above are set
 * unconditionally where they are computed — they are audio truth, and delivery
 * is a separate concern with its own receipts.
 * Runs before the !G.play gate so a retry still happens once the transport has
 * stopped, and after every tick so the common case is still immediate. */
void ui_sync(double t){
  if(G.sentPatId !=G.playPatId && ev_push(LL_EV_PLAYPAT,G.playPatId,0,t)) G.sentPatId =G.playPatId;
  if(G.sentSongPos!=G.songPos  && ev_push(LL_EV_SONGPOS,G.songPos, 0,t)) G.sentSongPos=G.songPos;
  if(G.sentPulse  !=G.pulse    && ev_push(LL_EV_PULSE,  G.pulse,   0,t)) G.sentPulse  =G.pulse;
}
void seq_run(double bEnd){
  ui_sync(G.frame);
  if(!G.play)return;
  for(int guard=0;guard<100000;guard++){
    if(!G.play){ ui_sync(G.frame); return; }
    ctx_t c;
    if(!build_ctx(&c)){ G.mNext=bEnd; for(int l=0;l<LL_NLAYERS;l++)G.cur[l].nextAt=bEnd; return; }
    double te=G.mNext; int which=-1;
    for(int l=0;l<LL_NLAYERS;l++)if(G.cur[l].nextAt<te){ te=G.cur[l].nextAt; which=l; }
    if(te>=bEnd)return;
    if(which<0)master_tick(&c); else part_tick(&c,which);
    ui_sync(te);
  }
}
