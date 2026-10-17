/* The synth voice — Bell.play from src/loudlight.jsx, ported call for call.
 * Every AudioParam automation in the JS (setValueAtTime, linearRamp,
 * exponentialRamp, setTargetAtTime, cancelAndHold) becomes a point on an
 * ll_auto, so the two can be read side by side. The node graph is flattened:
 *   o[0..n) (UNISON) → [spread pan + comp] → VCF (LP, Q in dB) → VCA → bus[layer]
 *   sub (sine, /2) ───────────────────────────────→ VCA        (post-filter)
 *   VCA → rev send, dly send
 * Read the JS for the WHY of each constant; only the how differs here. */
#include "ll_engine.h"

static inline float ms_(float v){ return ll_max(0.001f,v/1000.f); }
static inline float vcf_hz(float v){ return ll_round(20.f*ll_pow(1000.f,v/100.f)); }

void synth_reset(void){ for(int i=0;i<LL_NSVOICES;i++)G.sv[i].active=0; G.monoVoice=-1; }
/* The arena is about to be reused: a voice still reading a sample would read
 * whatever lands there next. Drums do the same in drums_stop_samples. */
void synth_stop_samples(void){ for(int i=0;i<LL_NSVOICES;i++){ ll_svoice*v=&G.sv[i]; if(v->active&&v->wave==WV_SAMPLE){ v->active=0; if(G.monoVoice==i)G.monoVoice=-1; } } }

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
  #define VELMIX(val) (1.f-(ll_clamp((val),0,100)/100.f)*(1.f-velRaw))
  float velMulAmp=VELMIX(p[LL_L_VELAMP]);
  float velMulFlt=VELMIX(p[LL_L_VELFLT]);
  float decayK=ll_clamp(p[LL_L_VELENV],0,100)/100.f;
  float decayVF=1.f-velRaw;
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
  float atk=ms_(p[LL_L_ATTACK]), dec=ms_(p[LL_L_DECAY])*decayScale, sus=ll_max(0.001f,p[LL_L_SUSTAIN]/100.f);
  /* The RELEASE is its own time. 0 means the patch predates the control, and
   * then it is the decay — exactly what it used to be. JS twin: Bell.play. */
  float rel=ms_(p[LL_L_RELEASE]>0.f?p[LL_L_RELEASE]:p[LL_L_DECAY])*decayScale;
  float rawDur=(float)(noteDurF/sr);
  float modDur=rawDur*(1.f+durMod);
  float dur=ll_max(atk+0.015f,modDur);
  float end=dur+rel;
  float decayFraction=dur>=atk+dec?1.f:ll_max(0.f,(dur-atk)/ll_max(0.001f,dec));

  ll_svoice*v=alloc_voice();
  memset(v,0,sizeof *v);
  v->active=1; v->layer=layer; v->t0=t; v->chokeAt=-1; v->mono=monoSingle;
  v->wave=(int)p[LL_L_WAVE]; if(v->wave<0||v->wave>WV_SAMPLE)v->wave=WV_SAW;
  /* ── SAMPLE ── the layer's one-shot stands in for o1. No detune stack and
   * no spread (there is one reader, as MONO has one oscillator), and with no
   * sample loaded the voice is SILENT rather than a saw: a sampler with
   * nothing in it makes no sound, and the SOUND page says so. */
  int isSample=v->wave==WV_SAMPLE;
  if(isSample){
    ll_sampleset*ss=&G.smp[LL_DRUM_ROWS+(layer==LL_LEAD?1:0)];
    if(ss->n>0&&ss->p[0]){ v->smp=ss->p[0]; v->smpLen=ss->len[0]; v->srcRatio=ss->sr[0]/sr; }
    float root=p[LL_L_ROOT]>0.f?p[LL_L_ROOT]:60.f;
    v->rootHz=440.f*ll_exp2((root-69.f)/12.f);
  }
  /* ── UNISON ── n readers of the pitch. The three tables are the JS's
   * UNI_OFF / UNI_PAN / UNI_PEAK, kept as numbers rather than formulas so the
   * two engines cannot drift by a rounding: n=2 is the old o1/o2 pair exactly
   * (k=0 at the pitch panned left, k=1 at +detune panned right, peak 0.28),
   * n=1 the old single oscillator (peak 0.42). */
  static const float UNI_OFF[LL_UNISON_MAX+1][LL_UNISON_MAX]={{0},{0},{0,1},{0,1,-1},{0,1,-1,2}};
  static const float UNI_PAN[LL_UNISON_MAX+1][LL_UNISON_MAX]={{0},{0},{-1,1},{-1,1,0},{-1,1,-1.f/3.f,1.f/3.f}};
  static const float UNI_PEAK[LL_UNISON_MAX+1]={0.f,0.42f,0.28f,0.22862f,0.19799f};
  int uni=(int)p[LL_L_UNISON];
  if(uni<1)uni=(p[LL_L_DETUNE]>2.f&&!monoSingle&&!isSample)?2:1;   /* the rule before the control */
  if(uni>LL_UNISON_MAX)uni=LL_UNISON_MAX;
  v->n=uni;
  for(int k=0;k<uni;k++){ v->detR[k]=ll_exp2(UNI_OFF[uni][k]*p[LL_L_DETUNE]/1200.f); v->pos[k]=0; }

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
  float peak=UNI_PEAK[uni]*velMulAmp*mixMul;
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
  float spreadAmt=(uni>1)?ll_clamp(p[LL_L_SPREAD],0,100)/100.f:0.f;
  if(spreadAmt>0.f){
    v->spread=1; v->comp=1.f+spreadAmt;
    for(int k=0;k<uni;k++){ float pan=UNI_PAN[uni][k]*spreadAmt; v->gL[k]=ll_min(1.f,1.f-pan); v->gR[k]=ll_min(1.f,1.f+pan); }
  } else { v->spread=0; v->comp=1.f; for(int k=0;k<uni;k++)v->gL[k]=v->gR[k]=1.f; }
  /* ── oscillators ── */
  auto_init(&v->frq,playFreq);
  if(prevFreq>0.f&&glideSec>0.f){
    auto_set(&v->frq,t,ll_max(1.f,prevFreq));
    auto_exp(&v->frq,t+sec2f(glideSec),ll_max(1.f,playFreq));
  }
  v->subLvl=ll_clamp(p[LL_L_SUB],0,100)/100.f;
  v->hasSub=v->subLvl>0.f;
  if(monoSingle)G.monoVoice=(int)(v-G.sv);
  /* Mid-note OCT/GLIDE pitch automation for tied notes. */
  if(hasMods){
    float prevModFreq=playFreq; int prevModGlide=glide_pct(sp)>0;
    for(int i=0;i<nmods;i++){
      double mAt=modAt[i]; const ll_stepp*m=&modSp[i];
      if(mAt<=t||mAt>=t+sec2f(dur))continue;
      float mPlayFreq=freq*ll_exp2((float)((int)m->oct-2)+layerOct);
      if(ll_fabs(mPlayFreq-prevModFreq)>0.5f){
        if(prevModGlide)auto_exp(&v->frq,mAt,ll_max(1.f,mPlayFreq)); else auto_set(&v->frq,mAt,ll_max(1.f,mPlayFreq));
      }
      prevModFreq=mPlayFreq; prevModGlide=glide_pct(m)>0;
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
      float sum=0.f,L=0.f,R=0.f;
      for(int k=0;k<v->n;k++){
        float x, fk=f1*v->detR[k];
        if(v->wave==WV_SAMPLE){
          if(v->smp){
            int ip=(int)v->pos[k];
            if(ip+1<v->smpLen){ float fr=(float)(v->pos[k]-ip); x=v->smp[ip]+(v->smp[ip+1]-v->smp[ip])*fr; } else x=0.f;
            v->pos[k]+=(double)((fk/v->rootHz)*v->srcRatio);
          } else x=0.f;
        } else x=osc_run(&v->o[k],v->wave,fk,sr);
        if(v->spread){ L+=x*v->gL[k]; R+=x*v->gR[k]; } else sum+=x;
      }
      float sb=v->hasSub?osc_run(&v->sub,WV_SINE,f1*0.5f,sr)*v->subLvl:0.f;
      if(v->spread){ L=bq_run(&v->fL,L*v->comp); R=bq_run(&v->fR,R*v->comp); }
      else { L=R=bq_run(&v->fL,sum); }
      L=(L+sb)*g; R=(R+sb)*g;
      bL[i]+=L; bR[i]+=R;
      G.rvL[i]+=L*v->revMul; G.rvR[i]+=R*v->revMul;
      G.dlL[i]+=L*v->dlyMul; G.dlR[i]+=R*v->dlyMul;
      if(tt>=v->end){ v->active=0; if(G.monoVoice==vi)G.monoVoice=-1; break; }
    }
    bq_undenorm(&v->fL); bq_undenorm(&v->fR);
  }
}
