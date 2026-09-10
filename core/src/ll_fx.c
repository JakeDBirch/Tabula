/* The buses — Bell.init's FX graph and master chain:
 *   dly sends → echo (stereo delay, HP/LP in the loop AND on the tap, feedback)
 *               → ret ×0.9 → master;  → dlyToRev → reverb input
 *   rev sends (+ delay-to-rev) → mono downmix → pre-delay → 8 Schroeder combs
 *     (4 L, 4 R; tap BEFORE the shelves, shelves only in the feedback so the
 *     damping compounds per recirculation; slow LFO on each comb's length)
 *     → ×0.6 → master
 *   master = (synth×gain + mono×gain + drums×level×gain + rev + echo) × 0.55
 *          → limiter → out
 * The limiter is the one part with no exact Web Audio twin (Chromium's
 * DynamicsCompressor is its own algorithm): a lookahead peak limiter with the
 * same threshold / attack / release numbers, judged by ear. */
#include "ll_engine.h"

#define COMB_LEN   16384      /* ≥ 0.0451s × 2.6 × 96k + modulation */
#define PRED_LEN   65536      /* 0.5s @ 96k */
#define ECHO_LEN   524288     /* 4s @ 96k */
#define LIM_LEN    512
static float combBuf[8][COMB_LEN], predBuf[PRED_LEN], echoBufL[ECHO_LEN], echoBufR[ECHO_LEN], limBufL[LIM_LEN], limBufR[LIM_LEN];
static const float RV_DAMP_DB=-7.f;

static inline float hp_hz(float v){ return ll_round(20.f*ll_pow(100.f,v/100.f)); }
static inline float lp_hz(float v){ return ll_round(400.f*ll_pow(50.f,v/100.f)); }
static inline float rv_hf_hz(float p){ return 20000.f*ll_pow(1200.f/20000.f,ll_clamp(p,0,100)/100.f); }
static inline float rv_lf_hz(float p){ return 20.f*ll_pow(800.f/20.f,ll_clamp(p,0,100)/100.f); }

void fx_reset(void){
  const float sr=G.sr;
  static const float baseL[4]={0.0297f,0.0371f,0.0411f,0.0437f}, baseR[4]={0.0306f,0.0383f,0.0421f,0.0451f};
  static const float rates[8]={0.21f,0.27f,0.33f,0.39f,0.24f,0.30f,0.36f,0.42f};
  for(int i=0;i<8;i++){
    ll_comb*c=&G.comb[i];
    dl_init(&c->d,combBuf[i],COMB_LEN);
    c->base=i<4?baseL[i]:baseR[i-4]; c->ch=i<4?0:1; c->lfoRate=rates[i]; c->lfoPh=0;
    bq_set(&c->hsh,BQ_HSH,6000.f,0,RV_DAMP_DB,sr); bq_set(&c->lsh,BQ_LSH,200.f,0,RV_DAMP_DB,sr);
  }
  dl_init(&G.preD,predBuf,PRED_LEN); dl_init(&G.echoL,echoBufL,ECHO_LEN); dl_init(&G.echoR,echoBufR,ECHO_LEN);
  dl_init(&G.limL,limBufL,LIM_LEN); dl_init(&G.limR,limBufR,LIM_LEN);
  sm_init(&G.combFb,0.78f,0.02f,sr); sm_init(&G.combSize,1.f,0.06f,sr); sm_init(&G.combMod,0.f,0.03f,sr);
  sm_init(&G.rvHf,6000.f,0.02f,sr); sm_init(&G.rvLf,200.f,0.02f,sr); sm_init(&G.rvPre,0.f,0.02f,sr); sm_init(&G.dlyToRev,0.f,0.02f,sr);
  sm_init(&G.eFb,0.45f,0.02f,sr); sm_init(&G.eHp,hp_hz(8),0.02f,sr); sm_init(&G.eLp,lp_hz(78),0.02f,sr);
  G.eTime=0.375f*sr;
  bq_set(&G.eHpL,BQ_HP,G.eHp.v,0.5f,0,sr); G.eHpR=G.eHpL; bq_set(&G.eLpL,BQ_LP,G.eLp.v,0.5f,0,sr); G.eLpR=G.eLpL;
  G.limEnv=0.f; G.limGain=1.f; G.fxCoefN=0; G.rvSizeFactor=1.f;
}
void fx_param(int id,float v){
  switch(id){
    case LL_P_RV_SIZE:{ float n=ll_clamp(v,0,100)/100.f; sm_set(&G.combFb,0.50f+ll_pow(n,0.7f)*0.46f); G.rvSizeFactor=1.f+ll_pow(n,0.75f)*1.6f; sm_set(&G.combSize,G.rvSizeFactor); break; }
    case LL_P_RV_MOD: sm_set(&G.combMod,(ll_clamp(v,0,100)/100.f)*0.004f*G.sr); break;
    case LL_P_RV_DAMP: sm_set(&G.rvHf,rv_hf_hz(v)); break;
    case LL_P_RV_LFDAMP: sm_set(&G.rvLf,rv_lf_hz(v)); break;
    case LL_P_RV_PREDELAY: sm_set(&G.rvPre,ll_clamp(v,0,500)/1000.f*G.sr); break;
    case LL_P_DLY_TO_REV: sm_set(&G.dlyToRev,ll_clamp(v,0,100)/100.f); break;
    case LL_P_DLY_TIME: G.eTime=ll_max(0.f,v)*G.sr; break;
    case LL_P_DLY_FB: sm_set(&G.eFb,v); break;
    case LL_P_DLY_HP: sm_set(&G.eHp,hp_hz(v)); break;
    case LL_P_DLY_LP: sm_set(&G.eLp,lp_hz(v)); break;
    default: break;
  }
}
static inline float nod(float x){ return ll_fabs(x)<1e-15f?0.f:x; }

void fx_render(float*outL,float*outR,int n){
  const float sr=G.sr;
  const float thr=0.89125094f;           /* -1 dBFS */
  const int la=(int)(0.002f*sr);         /* 2ms lookahead */
  const float relK=1.f-ll_exp(-1.f/(0.1f*sr)), attK=1.f-ll_exp(-1.f/(0.002f*sr));
  float lastHf=-1,lastLf=-1,lastEHp=-1,lastELp=-1;
  for(int i=0;i<n;i++){
    /* ── echo ── */
    float fb=sm_tick(&G.eFb), ehp=sm_tick(&G.eHp), elp=sm_tick(&G.eLp);
    int recompute=((G.fxCoefN++)&31)==0;
    if(recompute){
      if(ehp!=lastEHp){ bq_set(&G.eHpL,BQ_HP,ehp,0.5f,0,sr); G.eHpR.b0=G.eHpL.b0;G.eHpR.b1=G.eHpL.b1;G.eHpR.b2=G.eHpL.b2;G.eHpR.a1=G.eHpL.a1;G.eHpR.a2=G.eHpL.a2; lastEHp=ehp; }
      if(elp!=lastELp){ bq_set(&G.eLpL,BQ_LP,elp,0.5f,0,sr); G.eLpR.b0=G.eLpL.b0;G.eLpR.b1=G.eLpL.b1;G.eLpR.b2=G.eLpL.b2;G.eLpR.a1=G.eLpL.a1;G.eLpR.a2=G.eLpL.a2; lastELp=elp; }
    }
    float yL=dl_read(&G.echoL,G.eTime), yR=dl_read(&G.echoR,G.eTime);
    float fL=bq_run(&G.eLpL,bq_run(&G.eHpL,yL)), fR=bq_run(&G.eLpR,bq_run(&G.eHpR,yR));
    dl_write(&G.echoL,nod(G.dlL[i]+fL*fb)); dl_write(&G.echoR,nod(G.dlR[i]+fR*fb));
    float retL=fL*0.9f, retR=fR*0.9f;
    float d2r=sm_tick(&G.dlyToRev);
    /* ── reverb ── */
    float mono=0.5f*((G.rvL[i]+fL*d2r)+(G.rvR[i]+fR*d2r));
    float pre=sm_tick(&G.rvPre);
    dl_write(&G.preD,nod(mono));
    float x=dl_read(&G.preD,pre+1.f);
    float cfb=sm_tick(&G.combFb), size=sm_tick(&G.combSize), depth=sm_tick(&G.combMod), hf=sm_tick(&G.rvHf), lf=sm_tick(&G.rvLf);
    int reshelf=recompute&&(hf!=lastHf||lf!=lastLf);
    float rL=0.f,rR=0.f;
    for(int k=0;k<8;k++){
      ll_comb*c=&G.comb[k];
      if(reshelf){ bq_set(&c->hsh,BQ_HSH,hf,0,RV_DAMP_DB,sr); bq_set(&c->lsh,BQ_LSH,lf,0,RV_DAMP_DB,sr); }
      float del=c->base*size*sr+depth*ll_sinph((float)c->lfoPh);
      c->lfoPh+=c->lfoRate/sr; if(c->lfoPh>=1.0)c->lfoPh-=1.0;
      float y=dl_read(&c->d,del);
      if(c->ch==0)rL+=y; else rR+=y;
      float f=bq_run(&c->lsh,bq_run(&c->hsh,y));
      dl_write(&c->d,nod(x+f*cfb));
    }
    if(reshelf){ lastHf=hf; lastLf=lf; }
    float rvL=rL*0.6f, rvR=rR*0.6f;
    /* ── master ── */
    float gS=sm_tick(&G.layerGain[LL_SYNTH]), gM=sm_tick(&G.layerGain[LL_LEAD]), gD=sm_tick(&G.layerGain[LL_DRUMS]);
    float dLev=sm_tick(&G.drumLevel), mg=sm_tick(&G.masterGain);
    float L=(G.busL[LL_SYNTH][i]*gS+G.busL[LL_LEAD][i]*gM+G.busL[LL_DRUMS][i]*dLev*gD+rvL+retL)*mg;
    float R=(G.busR[LL_SYNTH][i]*gS+G.busR[LL_LEAD][i]*gM+G.busR[LL_DRUMS][i]*dLev*gD+rvR+retR)*mg;
    /* ── limiter ── */
    float pk=ll_max(ll_fabs(L),ll_fabs(R));
    if(pk>G.limEnv)G.limEnv=pk; else G.limEnv+=(pk-G.limEnv)*relK;
    float tg=G.limEnv>thr?ll_pow(G.limEnv/thr,-0.95f):1.f;
    G.limGain+=(tg-G.limGain)*(tg<G.limGain?attK:relK);
    dl_write(&G.limL,L); dl_write(&G.limR,R);
    outL[i]=dl_read(&G.limL,(float)la+1.f)*G.limGain;
    outR[i]=dl_read(&G.limR,(float)la+1.f)*G.limGain;
  }
  for(int k=0;k<8;k++){ bq_undenorm(&G.comb[k].hsh); bq_undenorm(&G.comb[k].lsh); }
  bq_undenorm(&G.eHpL);bq_undenorm(&G.eHpR);bq_undenorm(&G.eLpL);bq_undenorm(&G.eLpR);
}
