/* The drum engine — DrumEngine from src/loudlight.jsx. Thirteen synthesised
 * voices built from oscillators, noise bursts and biquads (each a port of the
 * JS node graph), a sampler with round-robin and velocity layers, and one
 * persistent mixer STRIP per voice:
 *   hits (summed) → filter → saturation → level → pan → drum bus
 *                                                     └→ rev / dly sends
 * The strip's scheduled params are ll_autos so MOTION can lock a value at a
 * note's own onset (setVoiceMix's `when`), exactly as the JS does. */
#include "ll_engine.h"

static inline float filt_cut_hz(float v){ return 20.f*ll_pow(1000.f,ll_clamp(v,0,100)/100.f); }

void drums_reset(void){
  for(int i=0;i<LL_NDVOICES;i++)G.dv[i].active=0;
  G.activeOH=-1;
  for(int v=0;v<LL_DRUM_ROWS;v++){
    ll_strip*s=&G.strip[v];
    memset(s,0,sizeof *s);
    auto_init(&s->level,0.6f); auto_init(&s->pan,0.f); auto_init(&s->rv,0.f); auto_init(&s->dly,0.f); auto_init(&s->cut,20000.f);
    s->env=100.f; s->lastCut=20000.f;
    bq_set(&s->bq,BQ_LP,20000.f,0.7f,0,G.sr);
  }
}
/* Drop consumed automation points so a strip's list never fills up. */
static void auto_compact(ll_auto*a){
  if(a->idx<16)return;
  int keep=a->idx-1; if(keep<0)keep=0;         /* keep the last entered point as the base */
  int n=a->n-keep; for(int i=0;i<n;i++)a->p[i]=a->p[i+keep]; a->n=n; a->idx-=keep;
}
static void strip_sched(ll_auto*a,float v,double when){
  double now=G.frame;
  if(when<0){ auto_target(a,now,v,sec2f(0.008f)); }
  else { double at=when-sec2f(0.004f); if(at<now)at=now; auto_set(a,at,v); }
}
void drums_set_mix(int voice,int id,float v,double when){
  ll_strip*s=&G.strip[voice];
  float fxTrim=ll_clamp(G.p[LL_P_DRUM_FXTRIM],0,100)/100.f;
  switch(id){
    case LL_D_LEVEL: strip_sched(&s->level,ll_clamp(v/100.f,0,2),when); break;
    case LL_D_PAN: strip_sched(&s->pan,ll_clamp(v/100.f,-1,1),when); break;
    case LL_D_RVSEND: s->rvBase=ll_clamp(v/100.f,0,1); strip_sched(&s->rv,s->rvBase*fxTrim,when); break;
    case LL_D_DLYSEND: s->dlyBase=ll_clamp(v/100.f,0,1); strip_sched(&s->dly,s->dlyBase*fxTrim,when); break;
    case LL_D_PITCH: s->pitch=ll_clamp(v,-12,12); break;
    case LL_D_ENV: s->env=ll_clamp(v,0,100); break;
    case LL_D_SAT: s->sat=ll_clamp(v,0,100); break;
    case LL_D_FILT: case LL_D_FILTCUT: {
      s->filt=(int)ll_clamp(G.dm[voice][LL_D_FILT],0,3);
      float hz=s->filt==0?20000.f:filt_cut_hz(G.dm[voice][LL_D_FILTCUT]);
      strip_sched(&s->cut,hz,when);
      break; }
  }
}

/* ── hit construction ───────────────────────────────────────────────────── */
static ll_dvoice* dv_alloc(int voice){
  int best=-1; double bestEnd=1e300;
  for(int i=0;i<LL_NDVOICES;i++){ if(!G.dv[i].active){best=i;break;} if(G.dv[i].end<bestEnd){bestEnd=G.dv[i].end;best=i;} }
  ll_dvoice*d=&G.dv[best]; memset(d,0,sizeof *d); d->active=1; d->voice=voice; d->gen=++G.dvGen; d->end=0; return d;
}
static ll_delem* el_new(ll_dvoice*d,int kind,double t0){
  if(d->nel>=LL_NDELEM)return 0;
  ll_delem*e=&d->el[d->nel++]; memset(e,0,sizeof *e);
  e->active=1; e->kind=kind; e->t0=t0; e->chokeAt=-1; auto_init(&e->gain,0.f); auto_init(&e->frq,0.f);
  return e;
}
static void el_bq(ll_delem*e,int type,float hz,float q){ if(e->nbq<3){ bq_set(&e->bq[e->nbq],type,hz,q,0,G.sr); e->nbq++; } }
/* _env: exponential in, out and down — no linear-to-zero artefacts. */
static void env_(ll_auto*g,double t,float pk,float atk,float dec,float sus,float rel){
  auto_set(g,t,0.0001f);
  auto_exp(g,t+sec2f(atk),pk);
  auto_exp(g,t+sec2f(atk+dec),ll_max(0.0001f,pk*sus));
  auto_exp(g,t+sec2f(atk+dec+rel),0.0001f);
}
static double env_end(double t,float atk,float dec,float rel){ return t+sec2f(atk+dec+rel); }
static void el_finish(ll_dvoice*d,ll_delem*e,double end){
  e->end=end; if(end>d->end)d->end=end;
  auto_begin(&e->gain,e->t0); auto_begin(&e->frq,e->t0);
}
static ll_delem* osc_el(ll_dvoice*d,int wave,double t,double stop){ ll_delem*e=el_new(d,DE_OSC,t); if(e){e->wave=wave;} return e; }
static ll_delem* noise_el(ll_dvoice*d,double t,float durSec){ ll_delem*e=el_new(d,DE_NOISE,t); if(e)e->noiseEnd=t+sec2f(durSec); return e; }

/* chokeOH: fast-fade whatever open hat is sounding. */
static void choke_oh(double t){
  if(G.activeOH<0)return;
  ll_dvoice*d=&G.dv[G.activeOH];
  if(d->active&&d->gen==G.activeOHgen&&G.activeOHel<d->nel){
    ll_delem*e=&d->el[G.activeOHel];
    double at=t>G.frame?t:G.frame;
    auto_cancel_from(&e->gain,at);
    auto_target(&e->gain,at,0.0001f,sec2f(0.008f));
    if(e->gain.idx>e->gain.n)e->gain.idx=e->gain.n;
  }
  G.activeOH=-1;
}
static void set_active_oh(ll_dvoice*d,ll_delem*e){ G.activeOH=(int)(d-G.dv); G.activeOHel=(int)(e-d->el); G.activeOHgen=d->gen; }

void drums_play(int voice,double t,int vel,const float*ov,int hasOv){
  if(voice<0||voice>=LL_DRUM_ROWS)return;
  ll_strip*strip=&G.strip[voice];
  float v=ll_max(0.001f,(float)vel/127.f);
  if(voice==LL_CH||voice==LL_OH)choke_oh(t);
  float pitchSemi=hasOv?ov[4]:strip->pitch;
  float pr=ll_exp2(pitchSemi/12.f);
  att_push(LL_DRUMS,voice,t,0,(float)vel);
  ev_push(LL_EV_DRUMHIT,voice,vel,t);
  /* ── sample? ── */
  ll_sampleset*ss=&G.smp[voice];
  if(ss->n>0){
    int idx=0;
    if(ss->kind==1){ idx=(int)(rng_f(&G.rng)*ss->n); if(idx>=ss->n)idx=ss->n-1; if(ss->n>1&&ss->lastRR==idx)idx=(idx+1)%ss->n; ss->lastRR=idx; }
    else if(ss->kind==2){ idx=(int)(((float)vel/128.f)*ss->n); if(idx<0)idx=0; if(idx>ss->n-1)idx=ss->n-1; }
    ll_dvoice*d=dv_alloc(voice);
    ll_delem*e=el_new(d,DE_SAMPLE,t);
    e->smp=ss->p[idx]; e->smpLen=ss->len[idx]; e->rate=pr; e->pos=0; e->smpGain=v;
    auto_init(&e->gain,v);
    float env01=(hasOv?ov[5]:strip->env)/100.f;
    float sampleDur=((float)e->smpLen/G.sr)/pr;
    double endAt=t+sec2f(sampleDur);
    if(env01<0.999f){
      const float MIN_GATE=0.012f;
      float gateDur=ll_max(MIN_GATE,MIN_GATE+(sampleDur-MIN_GATE)*env01*env01);
      float rel=ll_min(0.05f,ll_max(0.004f,gateDur*0.35f));
      double relStart=t+sec2f(gateDur-rel); if(relStart<t+sec2f(0.0005f))relStart=t+sec2f(0.0005f);
      auto_set(&e->gain,t,v); auto_set(&e->gain,relStart,v); auto_lin(&e->gain,t+sec2f(gateDur),0.0001f);
      endAt=t+sec2f(gateDur+0.01f);
    }
    el_finish(d,e,endAt);
    if(voice==LL_OH)set_active_oh(d,e);
    return;
  }
  ll_dvoice*d=dv_alloc(voice);
  ll_delem*e;
  switch(voice){
  case LL_BD:{
    e=osc_el(d,WV_SINE,t,t+sec2f(0.7f)); e->shaper=1;
    el_bq(e,BQ_LP,200.f*pr,0.7f);
    auto_set(&e->frq,t,220.f*pr); auto_exp(&e->frq,t+sec2f(0.25f),28.f*pr);
    env_(&e->gain,t,1.1f*v,0.002f,0.18f,0.001f,0.45f); el_finish(d,e,t+sec2f(0.7f));
    e=osc_el(d,WV_SINE,t,t+sec2f(0.02f));
    auto_set(&e->frq,t,400.f*pr); auto_exp(&e->frq,t+sec2f(0.012f),60.f*pr);
    env_(&e->gain,t,0.7f*v,0.001f,0.01f,0.001f,0.005f); el_finish(d,e,t+sec2f(0.02f));
    e=noise_el(d,t,0.015f); el_bq(e,BQ_LP,300.f*pr,1.f);
    env_(&e->gain,t,0.5f*v,0.001f,0.005f,0.001f,0.008f); el_finish(d,e,env_end(t,0.001f,0.005f,0.008f)+sec2f(0.01f));
    break; }
  case LL_SD:{
    e=osc_el(d,WV_SINE,t,t+sec2f(0.15f));
    auto_set(&e->frq,t,240.f*pr); auto_exp(&e->frq,t+sec2f(0.025f),160.f*pr);
    env_(&e->gain,t,0.55f*v,0.001f,0.025f,0.001f,0.06f); el_finish(d,e,t+sec2f(0.15f));
    e=noise_el(d,t,0.01f); el_bq(e,BQ_BP,5000.f*pr,0.3f);
    env_(&e->gain,t,0.9f*v,0.0005f,0.006f,0.001f,0.004f); el_finish(d,e,env_end(t,0.0005f,0.006f,0.004f)+sec2f(0.01f));
    e=noise_el(d,t,0.35f); el_bq(e,BQ_HP,800.f*pr,1.f); el_bq(e,BQ_BP,2500.f*pr,0.6f);
    env_(&e->gain,t,0.65f*v,0.002f,0.05f,0.05f,0.18f); el_finish(d,e,env_end(t,0.002f,0.05f,0.18f)+sec2f(0.01f));
    break; }
  case LL_LT: case LL_MT: case LL_HT:{
    float base=voice==LL_LT?72.f:voice==LL_MT?98.f:130.f;
    float dec=voice==LL_LT?0.12f:voice==LL_MT?0.10f:0.08f;
    float stp=voice==LL_LT?0.5f:voice==LL_MT?0.42f:0.35f;
    float rel=voice==LL_LT?0.22f:voice==LL_MT?0.18f:0.14f;
    float freq=base*pr;
    e=osc_el(d,WV_SINE,t,t+sec2f(stp)); el_bq(e,BQ_LP,freq*4.f,1.f);
    auto_set(&e->frq,t,freq*2.8f); auto_exp(&e->frq,t+sec2f(dec),freq);
    env_(&e->gain,t,0.8f*v,0.001f,dec,0.001f,rel); el_finish(d,e,t+sec2f(stp));
    e=noise_el(d,t,0.012f); el_bq(e,BQ_BP,freq*6.f,1.f);
    env_(&e->gain,t,0.4f*v,0.001f,0.008f,0.001f,0.006f); el_finish(d,e,env_end(t,0.001f,0.008f,0.006f)+sec2f(0.01f));
    break; }
  case LL_CH:{
    e=noise_el(d,t,0.12f); el_bq(e,BQ_BP,8400.f*pr,1.5f); el_bq(e,BQ_BP,11200.f*pr,2.f); el_bq(e,BQ_HP,7000.f*pr,1.f);
    env_(&e->gain,t,0.55f*v,0.001f,0.018f,0.001f,0.022f); el_finish(d,e,env_end(t,0.001f,0.018f,0.022f)+sec2f(0.01f));
    break; }
  case LL_OH:{
    e=noise_el(d,t,0.9f); el_bq(e,BQ_BP,8400.f*pr,1.2f); el_bq(e,BQ_BP,11200.f*pr,1.5f); el_bq(e,BQ_HP,6500.f*pr,1.f);
    env_(&e->gain,t,0.5f*v,0.001f,0.06f,0.12f,0.55f); el_finish(d,e,env_end(t,0.001f,0.06f,0.55f)+sec2f(0.02f));
    set_active_oh(d,e);
    break; }
  case LL_CY:{
    e=noise_el(d,t,1.8f); el_bq(e,BQ_HP,5500.f*pr,1.f); el_bq(e,BQ_BP,7800.f*pr,0.5f); el_bq(e,BQ_BP,12000.f*pr,0.8f);
    env_(&e->gain,t,0.42f*v,0.002f,0.3f,0.25f,1.1f); el_finish(d,e,env_end(t,0.002f,0.3f,1.1f)+sec2f(0.02f));
    break; }
  case LL_CP:{
    static const float delays[4]={0.f,0.010f,0.022f,0.038f};
    for(int i=0;i<4;i++){
      double ti=t+sec2f(delays[i]);
      e=noise_el(d,ti,0.06f); el_bq(e,BQ_BP,(1800.f-i*120.f)*pr,1.8f); el_bq(e,BQ_HP,900.f*pr,1.f);
      float pk=i==0?0.75f*v:i==3?0.9f*v:0.55f*v;
      env_(&e->gain,ti,pk,0.001f,0.012f+i*0.005f,0.001f,0.04f+i*0.02f);
      el_finish(d,e,env_end(ti,0.001f,0.012f+i*0.005f,0.04f+i*0.02f)+sec2f(0.01f));
    }
    break; }
  case LL_CL:{
    e=noise_el(d,t,0.05f); el_bq(e,BQ_BP,2800.f*pr,3.f); el_bq(e,BQ_HP,1800.f*pr,1.f);
    env_(&e->gain,t,0.8f*v,0.001f,0.018f,0.001f,0.012f); el_finish(d,e,env_end(t,0.001f,0.018f,0.012f)+sec2f(0.01f));
    double t2=t+sec2f(0.004f);
    e=noise_el(d,t2,0.02f); el_bq(e,BQ_BP,3800.f*pr,4.f);
    env_(&e->gain,t2,0.5f*v,0.001f,0.008f,0.001f,0.006f); el_finish(d,e,env_end(t2,0.001f,0.008f,0.006f)+sec2f(0.01f));
    break; }
  case LL_CB:{
    static const float freqs[2]={562.f,845.f};
    for(int i=0;i<2;i++){
      e=osc_el(d,WV_SQUARE,t,t+sec2f(0.65f)); auto_init(&e->frq,freqs[i]*pr);
      el_bq(e,BQ_BP,700.f*pr,0.6f); el_bq(e,BQ_HP,300.f*pr,1.f);
      env_(&e->gain,t,0.38f*v*(i==0?1.f:0.8f),0.001f,0.06f,0.08f,0.42f); el_finish(d,e,t+sec2f(0.65f));
    }
    e=osc_el(d,WV_SQUARE,t,t+sec2f(0.01f)); auto_init(&e->frq,700.f*pr);
    env_(&e->gain,t,0.6f*v,0.001f,0.004f,0.001f,0.003f); el_finish(d,e,t+sec2f(0.01f));
    break; }
  case LL_RM:{
    e=osc_el(d,WV_TRI,t,t+sec2f(0.04f));
    auto_set(&e->frq,t,1700.f*pr); auto_exp(&e->frq,t+sec2f(0.01f),400.f*pr);
    env_(&e->gain,t,0.7f*v,0.0005f,0.012f,0.001f,0.01f); el_finish(d,e,t+sec2f(0.04f));
    e=noise_el(d,t,0.02f); el_bq(e,BQ_BP,2600.f*pr,2.5f);
    env_(&e->gain,t,0.6f*v,0.0005f,0.008f,0.001f,0.006f); el_finish(d,e,env_end(t,0.0005f,0.008f,0.006f)+sec2f(0.01f));
    break; }
  case LL_SH:{
    e=noise_el(d,t,0.14f); el_bq(e,BQ_HP,5000.f,1.f); el_bq(e,BQ_BP,9000.f,0.6f);
    env_(&e->gain,t,0.4f*v,0.005f,0.04f,0.001f,0.05f); el_finish(d,e,env_end(t,0.005f,0.04f,0.05f)+sec2f(0.01f));
    break; }
  default: d->active=0; break;
  }
}

/* ── render ─────────────────────────────────────────────────────────────── */
static const float TANH3=0.99505475f;   /* tanh(3) */
void drums_render(int n){
  const float sr=G.sr;
  double f0=G.frame;
  int touched[LL_DRUM_ROWS]; for(int v=0;v<LL_DRUM_ROWS;v++){ touched[v]=0; for(int i=0;i<n;i++)G.strip[v].acc[i]=0.f; }
  for(int di=0;di<LL_NDVOICES;di++){
    ll_dvoice*d=&G.dv[di];
    if(!d->active)continue;
    float*acc=G.strip[d->voice].acc;
    int alive=0;
    for(int ei=0;ei<d->nel;ei++){
      ll_delem*e=&d->el[ei];
      if(!e->active)continue;
      alive=1; touched[d->voice]=1;
      for(int i=0;i<n;i++){
        double tt=f0+i;
        if(tt<e->t0)continue;
        float x;
        if(e->kind==DE_OSC){ float f=auto_tick(&e->frq,tt); x=osc_run(&e->osc,e->wave,f,sr); }
        else if(e->kind==DE_NOISE){ x=tt<e->noiseEnd?rng_noise(&G.rng):0.f; }
        else {
          int p=(int)e->pos;
          if(p+1<e->smpLen){ float fr=(float)(e->pos-p); x=e->smp[p]+(e->smp[p+1]-e->smp[p])*fr; } else x=0.f;
          e->pos+=e->rate;
        }
        if(e->shaper){ x=ll_clamp(x,-1.f,1.f); x=ll_tanh(x*3.f)/TANH3; }
        for(int b=0;b<e->nbq;b++)x=bq_run(&e->bq[b],x);
        acc[i]+=x*auto_tick(&e->gain,tt);
        if(tt>=e->end){ e->active=0; break; }
      }
      if(e->active)for(int b=0;b<e->nbq;b++)bq_undenorm(&e->bq[b]);
    }
    if(!alive)d->active=0;
  }
  float*bL=G.busL[LL_DRUMS],*bR=G.busR[LL_DRUMS];
  for(int v=0;v<LL_DRUM_ROWS;v++){
    ll_strip*s=&G.strip[v];
    if(!touched[v]&&ll_fabs(s->bq.z1)+ll_fabs(s->bq.z2)<1e-9f){ continue; }
    float k=s->sat/100.f; k=k*k*16.f;
    float lastPan=1e9f, pL=1.f, pR=1.f;
    static const int types[4]={BQ_LP,BQ_LP,BQ_HP,BQ_BP};
    for(int i=0;i<n;i++){
      double tt=f0+i;
      float cut=auto_tick(&s->cut,tt);
      if(((s->coefN++)&7)==0&&cut!=s->lastCut){ bq_set(&s->bq,types[s->filt],cut,0.7f,0,sr); s->lastCut=cut; }
      float x=bq_run(&s->bq,s->acc[i]);
      x=ll_clamp(x,-1.f,1.f);
      if(k>0.0001f)x=((1.f+k)*x)/(1.f+k*ll_fabs(x));
      float lvl=auto_tick(&s->level,tt), pan=auto_tick(&s->pan,tt);
      if(pan!=lastPan){ float a=(pan+1.f)*0.25f*LL_PI; pL=ll_cos(a); pR=ll_sin(a); lastPan=pan; }
      float L=x*lvl*pL, R=x*lvl*pR;
      float rv=auto_tick(&s->rv,tt), dl=auto_tick(&s->dly,tt);
      bL[i]+=L; bR[i]+=R;
      G.rvL[i]+=L*rv; G.rvR[i]+=R*rv; G.dlL[i]+=L*dl; G.dlR[i]+=R*dl;
    }
    bq_undenorm(&s->bq);
    auto_compact(&s->level); auto_compact(&s->pan); auto_compact(&s->rv); auto_compact(&s->dly); auto_compact(&s->cut);
  }
}
