/* The synth voice — Bell.play from src/loudlight.jsx, ported call for call.
 * Every AudioParam automation in the JS (setValueAtTime, linearRamp,
 * exponentialRamp, setTargetAtTime, cancelAndHold) becomes a point on an
 * ll_auto, so the two can be read side by side. The node graph is flattened:
 *   o1,o2 → [spread pan + comp] → VCF (LP, Q in dB) → VCA → bus[layer]
 *   sub (sine, /2) ───────────────────────────────→ VCA        (post-filter)
 *   VCA → rev send, dly send
 * Read the JS for the WHY of each constant; only the how differs here. */
#include "ll_engine.h"

static inline float ms_(float v){ return ll_max(0.001f,v/1000.f); }
static inline float vcf_hz(float v){ return ll_round(20.f*ll_pow(1000.f,v/100.f)); }

void synth_reset(void){ for(int i=0;i<LL_NSVOICES;i++)G.sv[i].active=0; G.monoVoice=-1; }

static ll_svoice* alloc_voice(void){
  int best=-1; double bestEnd=1e300;
  for(int i=0;i<LL_NSVOICES;i++){ if(!G.sv[i].active)return &G.sv[i]; if(G.sv[i].end<bestEnd){bestEnd=G.sv[i].end;best=i;} }
  return &G.sv[best];  /* steal the voice closest to its end */
}

void synth_play(float freq,double at,const ll_stepp*sp,double noteDurF,float globalSend,float prevFreq,float glideSec,int layer,const double*modAt,const ll_stepp*modSp,int nmods){
  const float*p=G.lp[layer];
  const float sr=G.sr;
  double t=at;
  int hasMods=nmods>0;
  int monoSingle=p[LL_L_MONO]>0.5f;
  /* Choke the previous MONO voice at this note's start (cancelAndHold + 9ms
   * linear fade to true zero, oscillators stopped 12ms in). Applied at the
   * frame itself, see synth_render. */
  if(monoSingle&&G.monoVoice>=0){
    ll_svoice*prev=&G.sv[G.monoVoice];
    if(prev->active){ double ct=t>G.frame?t:G.frame; prev->chokeAt=ct; }
    G.monoVoice=-1;
  }
  float velRaw=sp?(float)sp->vel/127.f:1.f;
  #define VELMIX(val,inv) (1.f-(ll_clamp((val),0,100)/100.f)*(1.f-((inv)>0.5f?(1.f-velRaw):velRaw)))
  float velMulAmp=VELMIX(p[LL_L_VELAMP],p[LL_L_VELAMP_INV]);
  float velMulFlt=VELMIX(p[LL_L_VELFLT],p[LL_L_VELFLT_INV]);
  float decayK=ll_clamp(p[LL_L_VELENV],0,100)/100.f;
  float decayVF=p[LL_L_VELENV_INV]>0.5f?velRaw:(1.f-velRaw);
  float decayScale=1.f-decayK*decayVF*0.7f;
  float fltDev=sp?(((float)sp->flt-50.f)/50.f):0.f;
  float cutOff=fltDev*0.3f*40.f;
  float envScale=1.f+fltDev*0.7f;
  float stepDly=sp?(float)sp->dly/100.f:0.f;
  float globalDly=globalSend/100.f;
  float dlyMul=(sp&&sp->dly>0)?stepDly:globalDly;
  float stepOct=sp?(float)((int)sp->oct-2):0.f;
  float layerOct=p[LL_L_OCTAVE];
  float playFreq=freq*ll_exp2(stepOct+layerOct);
  float durMod=sp?(float)sp->dur/100.f:0.f;
  float atk=ms_(p[LL_L_ATTACK]), dec=ms_(p[LL_L_DECAY])*decayScale, sus=ll_max(0.001f,p[LL_L_SUSTAIN]/100.f), rel=ms_(p[LL_L_DECAY])*decayScale;
  float rawDur=(float)(noteDurF/sr);
  float modDur=rawDur*(1.f+durMod);
  float dur=ll_max(atk+0.015f,modDur);
  float end=dur+rel;
  float decayFraction=dur>=atk+dec?1.f:ll_max(0.f,(dur-atk)/ll_max(0.001f,dec));

  ll_svoice*v=alloc_voice();
  memset(v,0,sizeof *v);
  v->active=1; v->layer=layer; v->t0=t; v->chokeAt=-1; v->mono=monoSingle;
  v->wave=(int)p[LL_L_WAVE]; if(v->wave<0||v->wave>3)v->wave=WV_SAW;

  /* ── VCF ── */
  float rawCut=ll_clamp(p[LL_L_CUTOFF]+cutOff,0,100);
  float baseHz=vcf_hz(rawCut);
  v->qdb=ll_max(0.01f,p[LL_L_RES]*0.28f);
  float envAmt=(p[LL_L_FENV]/100.f)*velMulFlt*ll_max(0.f,envScale);
  float peakHz=envAmt>0.001f?baseHz*ll_pow(20000.f/ll_max(20.f,baseHz),envAmt):baseHz;
  float susHz=ll_max(20.f,baseHz+(peakHz-baseHz)*sus);
  float freqAtGate=decayFraction>=1.f?susHz:ll_max(20.f,peakHz*ll_pow(ll_max(20.f,susHz)/ll_max(20.f,peakHz),decayFraction));
  auto_init(&v->vcf,baseHz);
  v->baseHz=baseHz;
  if(envAmt>0.01f){
    v->envOn=1;
    auto_set(&v->vcf,t,baseHz);
    auto_lin(&v->vcf,t+sec2f(atk),peakHz);
    if(dur>=atk+dec){
      auto_exp(&v->vcf,t+sec2f(atk+dec),ll_max(20.f,susHz));
      if(!hasMods)auto_set(&v->vcf,t+sec2f(dur),ll_max(20.f,susHz));
    } else {
      auto_exp(&v->vcf,t+sec2f(dur),ll_max(20.f,freqAtGate));
    }
    auto_exp(&v->vcf,t+sec2f(end),ll_max(20.f,baseHz));
    /* Mid-note FLT modulation — a cutoff approach at each held sub-step. */
    for(int i=0;i<nmods;i++){
      double mAt=modAt[i]; const ll_stepp*m=&modSp[i];
      if(mAt<=t+sec2f(atk+dec)||mAt>=t+sec2f(dur))continue;
      float mFltDev=((float)m->flt-50.f)/50.f;
      float mCutOff=mFltDev*0.3f*40.f, mEnvScale=1.f+mFltDev*0.7f;
      float mBaseHz=vcf_hz(ll_clamp(p[LL_L_CUTOFF]+mCutOff,0,100));
      float mEnvAmt=(p[LL_L_FENV]/100.f)*velMulFlt*ll_max(0.f,mEnvScale);
      float mPeakHz=mEnvAmt>0.001f?mBaseHz*ll_pow(20000.f/ll_max(20.f,mBaseHz),mEnvAmt):mBaseHz;
      float mSusHz=ll_max(20.f,mBaseHz+(mPeakHz-mBaseHz)*sus);
      auto_target(&v->vcf,mAt,mSusHz,sec2f(0.015f));
    }
  }
  /* ── VCA ── */
  float mixMul=p[LL_L_MIX]/100.f;
  float peak=((p[LL_L_DETUNE]>2.f&&!monoSingle)?0.28f:0.42f)*velMulAmp*mixMul;
  float gainAtGate=decayFraction>=1.f?sus*peak:ll_max(0.001f,peak*ll_pow(ll_max(0.001f,sus),decayFraction));
  auto_init(&v->vca,0.f);
  auto_set(&v->vca,t,0.f);
  auto_lin(&v->vca,t+sec2f(atk),peak);
  if(dur>=atk+dec){
    auto_exp(&v->vca,t+sec2f(atk+dec),ll_max(0.001f,sus*peak));
    auto_set(&v->vca,t+sec2f(dur),ll_max(0.001f,sus*peak));
  } else {
    auto_exp(&v->vca,t+sec2f(dur),ll_max(0.001f,gainAtGate));
  }
  auto_exp(&v->vca,t+sec2f(end),0.0001f);
  /* ── spread ── */
  float spreadAmt=(!monoSingle&&p[LL_L_DETUNE]>2.f)?ll_clamp(p[LL_L_SPREAD],0,100)/100.f:0.f;
  if(spreadAmt>0.f){
    v->spread=1; v->comp=1.f+spreadAmt;
    v->gL1=ll_min(1.f,1.f+spreadAmt); v->gR1=ll_min(1.f,1.f-spreadAmt);   /* o1 panned left  */
    v->gL2=ll_min(1.f,1.f-spreadAmt); v->gR2=ll_min(1.f,1.f+spreadAmt);   /* o2 panned right */
  } else { v->spread=0; v->comp=1.f; v->gL1=v->gR1=v->gL2=v->gR2=1.f; }
  /* ── oscillators ── */
  auto_init(&v->frq,playFreq);
  if(prevFreq>0.f&&glideSec>0.f){
    auto_set(&v->frq,t,ll_max(1.f,prevFreq));
    auto_exp(&v->frq,t+sec2f(glideSec),ll_max(1.f,playFreq));
  }
  v->has2=(p[LL_L_DETUNE]>2.f&&!monoSingle);
  v->detRatio=ll_exp2(p[LL_L_DETUNE]/1200.f);
  v->subLvl=ll_clamp(p[LL_L_SUB],0,100)/100.f;
  v->hasSub=v->subLvl>0.f;
  if(monoSingle)G.monoVoice=(int)(v-G.sv);
  /* Mid-note OCT/GLIDE pitch automation for tied notes. */
  if(hasMods){
    float prevModFreq=playFreq; int prevModGlide=sp?sp->glide:0;
    for(int i=0;i<nmods;i++){
      double mAt=modAt[i]; const ll_stepp*m=&modSp[i];
      if(mAt<=t||mAt>=t+sec2f(dur))continue;
      float mPlayFreq=freq*ll_exp2((float)((int)m->oct-2)+layerOct);
      if(ll_fabs(mPlayFreq-prevModFreq)>0.5f){
        if(prevModGlide)auto_exp(&v->frq,mAt,ll_max(1.f,mPlayFreq)); else auto_set(&v->frq,mAt,ll_max(1.f,mPlayFreq));
      }
      prevModFreq=mPlayFreq; prevModGlide=m->glide;
    }
  }
  /* ── sends ── */
  float stepRev=sp?(float)sp->rev/100.f:0.f;
  float layerRev=p[LL_L_RVSEND]/100.f;
  float fxTrim=ll_clamp(p[LL_L_FXTRIM],0,100)/100.f;
  v->revMul=((sp&&sp->rev>0)?stepRev:layerRev)*fxTrim;
  v->dlyMul=dlyMul*fxTrim;
  v->end=t+sec2f(end+0.05f);
  bq_reset(&v->fL); bq_reset(&v->fR);
  bq_set(&v->fL,BQ_LP,baseHz,v->qdb,0,sr); v->fR=v->fL; v->lastCut=baseHz;
  auto_begin(&v->vca,t); auto_begin(&v->vcf,t); auto_begin(&v->frq,t);
  att_push(layer,-1,t,noteDurF,playFreq);
}

void synth_render(int n){
  const float sr=G.sr;
  double f0=G.frame;
  for(int vi=0;vi<LL_NSVOICES;vi++){
    ll_svoice*v=&G.sv[vi];
    if(!v->active)continue;
    float*bL=G.busL[v->layer],*bR=G.busR[v->layer];
    for(int i=0;i<n;i++){
      double tt=f0+i;
      if(tt<v->t0)continue;
      if(v->chokeAt>=0&&tt>=v->chokeAt){
        auto_cancel_hold(&v->vca,tt);
        auto_lin(&v->vca,tt+sec2f(0.009f),0.f);
        v->end=tt+sec2f(0.012f);
        v->chokeAt=-1;
      }
      float f1=auto_tick(&v->frq,tt);
      float g=auto_tick(&v->vca,tt);
      float cut=v->envOn?auto_tick(&v->vcf,tt):v->baseHz;
      if(((v->coefN++)&7)==0&&cut!=v->lastCut){ bq_set(&v->fL,BQ_LP,cut,v->qdb,0,sr); v->fR.b0=v->fL.b0;v->fR.b1=v->fL.b1;v->fR.b2=v->fL.b2;v->fR.a1=v->fL.a1;v->fR.a2=v->fL.a2; v->lastCut=cut; }
      float o1=osc_run(&v->o1,v->wave,f1,sr);
      float o2=v->has2?osc_run(&v->o2,v->wave,f1*v->detRatio,sr):0.f;
      float sb=v->hasSub?osc_run(&v->sub,WV_SINE,f1*0.5f,sr)*v->subLvl:0.f;
      float L,R;
      if(v->spread){
        L=bq_run(&v->fL,(o1*v->gL1+o2*v->gL2)*v->comp);
        R=bq_run(&v->fR,(o1*v->gR1+o2*v->gR2)*v->comp);
      } else { L=R=bq_run(&v->fL,o1+o2); }
      L=(L+sb)*g; R=(R+sb)*g;
      bL[i]+=L; bR[i]+=R;
      G.rvL[i]+=L*v->revMul; G.rvR[i]+=R*v->revMul;
      G.dlL[i]+=L*v->dlyMul; G.dlR[i]+=R*v->dlyMul;
      if(tt>=v->end){ v->active=0; if(G.monoVoice==vi)G.monoVoice=-1; break; }
    }
    bq_undenorm(&v->fL); bq_undenorm(&v->fR);
  }
}
