/* The buses — Bell.init's FX graph and master chain:
 *   dly sends → echo (stereo delay, HP/LP in the loop AND on the tap, feedback)
 *               → ret ×0.9 → master;  → dlyToRev → reverb input
 *   rev sends (+ delay-to-rev) → mono downmix → pre-delay → 8 Schroeder combs
 *     (4 L, 4 R; tap BEFORE the shelves, shelves only in the feedback so the
 *     damping compounds per recirculation; slow LFO on each comb's length)
 *     → ×0.6 → master
 *   master = (synth×gain + mono×gain + drums×level×gain + rev + echo) × 0.55
 *          → DRIVE → EXCITE → limiter → out
 *
 * DRIVE and EXCITE are CHARACTER, not correction. Five params, none of them a
 * unit: an amount and a flavour for the drive, and three amounts for the
 * exciter. Nothing in here is meant to be dialled to a number.
 *
 * THE LIMITER and the DRIVE's glue compressor have no exact Web Audio twin —
 * Chromium's DynamicsCompressor is its own algorithm with its own detector and
 * release curve — so both are written here with the same threshold / ratio /
 * attack / release numbers the JS node is given, and judged by ear. The
 * SATURATION CURVES are shared as FORMULAE: each is a closed-form function of
 * one sample, exported here as ll_shape and written out again in the JS
 * engine's WaveShaper curve builder from the same three lines of algebra. Two
 * implementations of one definition rather than two descriptions of an intent,
 * so they agree to float precision — tanh's last bit aside. */
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

/* ── THE SATURATION CURVES ───────────────────────────────────────────────
 * Three flavours, each a closed-form function of ONE sample, because that is
 * what lets the JS engine share them: the same three lines of algebra build
 * its WaveShaperNode curve table, so both engines fold on one definition
 * rather than on two descriptions of an intent.
 *
 * TAPE  — symmetric soft compression. Odd harmonics, gentle. The HF loss and
 *         the low-end head bump that make it read as TAPE rather than as
 *         "quiet clipping" are filters, and live outside this function.
 * TUBE  — the same curve with a DC BIAS pushed through it and taken back off.
 *         An asymmetric transfer curve is what generates EVEN harmonics, and
 *         even harmonics are what "warm" means; symmetric clipping can only
 *         ever give you odd ones, which is the sound of a fuzz pedal.
 * CLIP  — x/(1+x^6)^(1/6). Unity slope at zero like the others, saturating at
 *         ±1 like the others, but it stays LINEAR until it nearly gets there
 *         and then slams: a wall rather than a curve. That is what makes it
 *         the aggressive flavour, and getting it wrong is instructive — the
 *         first cut was the classic cubic soft clip x - x³/3, which measured
 *         as barely harder than TAPE (3rd harmonic 4.2% against 3.4%). Of
 *         course it did: x - x³/3 is the first two terms of tanh's own
 *         series, so "cubic soft clip" and "tanh" are the same curve wearing
 *         different names. Three flavours that measure the same are one
 *         flavour and two lies.
 */
static inline float shape_tape(float x){ return ll_tanh(x); }
static inline float shape_tube(float x,float b){
  /* The bias is passed in rather than fixed, because it SCALES WITH DRIVE —
   * see LL_TUBE_BIAS. Taking ll_tanh(b) back off is what keeps silence
   * silent; without it the stage would sit on a DC offset. */
  return ll_tanh(x+b)-ll_tanh(b);
}
static inline float shape_clip(float x){
  float x2=x*x, x6=x2*x2*x2;
  return x*ll_pow(1.f+x6,-1.f/6.f);
}
float ll_shape(int chr,float x,float bias){
  return chr==LL_DRIVE_CLIP?shape_clip(x):chr==LL_DRIVE_TUBE?shape_tube(x,bias):shape_tape(x);
}

/* DRIVE's derived coefficients. Recomputed only when the knob or the flavour
 * moves — a per-sample ll_exp of two constants is pure waste.
 *
 * `driveTrim` is the whole reason this reads as a character control: the
 * pre-gain climbs to LL_DRIVE_MAX_DB, and the trim takes most of it straight
 * back out, so turning DRIVE up changes what the mix SOUNDS like rather than
 * how loud it is. Most, not all — a saturator genuinely does raise the
 * average level as it eats the peaks, and compensating that away too would
 * make the knob feel like it was doing nothing. */
static void drive_coef(void){
  const float sr=G.sr>0.f?G.sr:48000.f;
  /* The knob's own curve — most of the travel is the gentle half. */
  const float raw=ll_clamp(G.driveAmt,0.f,1.f);
  const float d=ll_pow(raw,LL_DRIVE_CURVE);
  G.driveOn=(G.driveSw&&raw>0.f);
  G.driveBias=(G.driveChar==LL_DRIVE_TUBE)?LL_TUBE_BIAS*d:0.f;
  /* Each flavour needs its OWN amount of signal to bite on, because the knee
   * is in a different place on each curve. CLIP stays linear until nearly
   * unity by design, and the glue compressor in front of it holds the level
   * well below that — so with a shared pre-gain the "aggressive" flavour
   * measured CLEANER than TAPE (3rd harmonic 0.5% against 3.4%). A flavour
   * you cannot reach is not a flavour.
   *
   * The extra gain SCALES WITH THE KNOB rather than being a constant, so at
   * low DRIVE all three are still gentle and the choice is a colour; it is
   * only as you push that they separate into three different kinds of loud. */
  float charIn  = (G.driveChar==LL_DRIVE_CLIP)?1.f+d*0.85f
                : (G.driveChar==LL_DRIVE_TUBE)?1.f+d*0.10f : 1.f;
  float charOut = (G.driveChar==LL_DRIVE_CLIP)?1.f/(1.f+d*0.55f)
                : (G.driveChar==LL_DRIVE_TUBE)?1.f/(1.f+d*0.08f) : 1.f;
  /* k scales INTO the curve; 1/k scales back out, so the stage is unity
   * through the linear region and only departs from it as the signal climbs
   * into the bend. That is what makes DRIVE a character control: what changes
   * is WHERE ON THE CURVE you are, not how loud the result is. */
  const float k=LL_DRIVE_IN_MIN+d*(LL_DRIVE_IN_MAX-LL_DRIVE_IN_MIN);
  G.drivePre=k*charIn;
  G.driveTrim=(1.f/k)*charOut;
  G.glueAttK=1.f-ll_exp(-1.f/(LL_GLUE_ATTACK_MS *0.001f*sr));
  G.glueRelK=1.f-ll_exp(-1.f/(LL_GLUE_RELEASE_MS*0.001f*sr));
  /* TAPE's two filters, and they scale WITH the knob — tape loses top and
   * gains bottom the harder you hit it, which is most of why it is recognised
   * by ear at all. The other two flavours leave the signal's balance alone. */
  float lossHz = 20000.f-d*7000.f;            /* 20k clean -> 13k melted */
  float bumpDb = (G.driveChar==LL_DRIVE_TAPE)? d*1.4f : 0.f;
  bq_set(&G.tapeLpL,BQ_LP,(G.driveChar==LL_DRIVE_TAPE)?lossHz:20000.f,0,0,sr);
  G.tapeLpR=G.tapeLpL;
  bq_set(&G.headBumpL,BQ_LSH,90.f,0,bumpDb,sr); G.headBumpR=G.headBumpL;
}

/* 2x oversampling filters: Butterworth-ish pair at just under the ORIGINAL
 * Nyquist, run at the doubled rate. Same coefficients up and down. */
static void os_coef(void){
  const float sr2=(G.sr>0.f?G.sr:48000.f)*2.f, fc=(G.sr>0.f?G.sr:48000.f)*0.45f;
  bq_set(&G.osUpL1,BQ_LP,fc,-3.f,0,sr2);      /* Q in dB here, per bq_set */
  bq_set(&G.osUpL2,BQ_LP,fc, 3.f,0,sr2);
  G.osUpR1=G.osUpL1; G.osUpR2=G.osUpL2;
  G.osDnL1=G.osUpL1; G.osDnL2=G.osUpL2; G.osDnR1=G.osUpL1; G.osDnR2=G.osUpL2;
}

/* EXCITE is BYPASSED when all three amounts are zero, and that is a real
 * bypass rather than a null setting: it is what makes this stage cost an
 * existing project exactly nothing, in CPU and in sound alike. */
static void excite_coef(void){
  const float sr=G.sr>0.f?G.sr:48000.f;
  G.exOn=(G.exSw&&(G.exThump>0.f||G.exBody>0.f||G.exAir>0.f));
  if(!G.exOn)return;
  bq_set(&G.exLoL   ,BQ_LP,LL_EX_LO_HZ    ,0,0,sr); G.exLoR   =G.exLoL;
  bq_set(&G.exThHpL ,BQ_HP,LL_EX_LO_HP_HZ ,0,0,sr); G.exThHpR =G.exThHpL;
  bq_set(&G.exMidHpL,BQ_HP,LL_EX_MID_LO_HZ,0,0,sr); G.exMidHpR=G.exMidHpL;
  bq_set(&G.exMidLpL,BQ_LP,LL_EX_MID_HI_HZ,0,0,sr); G.exMidLpR=G.exMidLpL;
  bq_set(&G.exHiL   ,BQ_HP,LL_EX_HI_HZ    ,0,0,sr); G.exHiR   =G.exHiL;
  bq_set(&G.exAirHpL,BQ_HP,LL_EX_HI_HZ*1.2f,0,0,sr); G.exAirHpR=G.exAirHpL;
}
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
  G.glueEnv=0.f; G.glueGain=1.f; G.exThDcL=G.exThDcR=0.f;
  bq_reset(&G.tapeLpL);bq_reset(&G.tapeLpR);bq_reset(&G.headBumpL);bq_reset(&G.headBumpR);
  bq_reset(&G.osUpL1);bq_reset(&G.osUpL2);bq_reset(&G.osUpR1);bq_reset(&G.osUpR2);
  bq_reset(&G.osDnL1);bq_reset(&G.osDnL2);bq_reset(&G.osDnR1);bq_reset(&G.osDnR2);
  bq_reset(&G.exLoL);bq_reset(&G.exLoR);bq_reset(&G.exThHpL);bq_reset(&G.exThHpR);
  bq_reset(&G.exMidHpL);bq_reset(&G.exMidHpR);bq_reset(&G.exMidLpL);bq_reset(&G.exMidLpR);
  bq_reset(&G.exHiL);bq_reset(&G.exHiR);bq_reset(&G.exAirHpL);bq_reset(&G.exAirHpR);
  drive_coef(); os_coef(); excite_coef();
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
    case LL_P_DRIVE_ON:   G.driveSw=v>0.5f?1:0; drive_coef(); break;
    case LL_P_DRIVE:      G.driveAmt=ll_clamp(v,0,100)/100.f; drive_coef(); break;
    case LL_P_DRIVE_CHAR: G.driveChar=(int)ll_clamp(v,0,2);     drive_coef(); break;
    case LL_P_EX_ON:      G.exSw=v>0.5f?1:0; excite_coef(); break;
    case LL_P_EX_THUMP:   G.exThump=ll_clamp(v,0,100)/100.f; excite_coef(); break;
    case LL_P_EX_BODY:    G.exBody =ll_clamp(v,0,100)/100.f; excite_coef(); break;
    case LL_P_EX_AIR:     G.exAir  =ll_clamp(v,0,100)/100.f; excite_coef(); break;
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
    /* ── DRIVE ── one knob: into a FIXED glue compressor, then a saturator,
     * then a trim that takes most of the pre-gain back out. Off is a real
     * BYPASS — an untouched project must render exactly what it rendered
     * before this stage existed, not merely something close to it. */
    if(G.driveOn){
      L*=G.drivePre; R*=G.drivePre;
      /* Stereo-LINKED peak detector: two independent ones move the image
       * around as the mix ducks, which is the one thing a bus compressor
       * must not do. Attack when rising, release when falling. */
      float pk=ll_max(ll_fabs(L),ll_fabs(R));
      G.glueEnv+=(pk-G.glueEnv)*(pk>G.glueEnv?G.glueAttK:G.glueRelK);
      const float thrLin=ll_db2lin(LL_GLUE_THRESH_DB);
      if(G.glueEnv>thrLin){
        /* over^(1/ratio - 1) is the gain that puts `over` dB above threshold
         * back down to over/ratio above it, in the linear domain so there is
         * one pow per sample rather than a log/exp pair. */
        G.glueGain=ll_pow(G.glueEnv/thrLin,1.f/LL_GLUE_RATIO-1.f);
      }else G.glueGain=1.f;
      L*=G.glueGain; R*=G.glueGain;
      /* TAPE's HF loss goes BEFORE the curve — tape loses the top on the way
       * in, and filtering after the fold would only tidy up the harmonics it
       * had already made. */
      if(G.driveChar==LL_DRIVE_TAPE){ L=bq_run(&G.tapeLpL,L); R=bq_run(&G.tapeLpR,R); }
      /* 2x oversampled saturation. Zero-stuffing doubles the rate and halves
       * the level, so the interpolator's input is pre-doubled; the decimator
       * then keeps one sample in two. */
      {
        float oL=0.f,oR=0.f;
        for(int k=0;k<2;k++){
          float uL=k?0.f:L*2.f, uR=k?0.f:R*2.f;
          uL=bq_run(&G.osUpL2,bq_run(&G.osUpL1,uL));
          uR=bq_run(&G.osUpR2,bq_run(&G.osUpR1,uR));
          uL=ll_shape(G.driveChar,uL,G.driveBias);
          uR=ll_shape(G.driveChar,uR,G.driveBias);
          uL=bq_run(&G.osDnL2,bq_run(&G.osDnL1,uL));
          uR=bq_run(&G.osDnR2,bq_run(&G.osDnR1,uR));
          if(k==0){ oL=uL; oR=uR; }
        }
        L=oL; R=oR;
      }
      if(G.driveChar==LL_DRIVE_TAPE){ L=bq_run(&G.headBumpL,L); R=bq_run(&G.headBumpR,R); }
      L*=G.driveTrim; R*=G.driveTrim;
    }
    /* ── EXCITE ── three generators, each listening to one band and adding
     * its HARMONICS back in parallel with the dry signal. Nothing is re-summed
     * from the bands, so the crossover is a router and does not have to add
     * back to unity. Bypassed at zero, really. */
    if(G.exOn){
      if(G.exThump>0.f){
        /* The low band, rectified. A rectifier is a frequency DOUBLER, so
         * what comes back is the bass's own harmonics an octave up and
         * beyond — which the ear hears as weight even on a speaker that
         * cannot reproduce the fundamental at all. That is the whole trick,
         * and it is why the result is HIGH-PASSED: adding more sub would do
         * nothing on a phone, which is where this is played. */
        float bL=bq_run(&G.exLoL,L), bR=bq_run(&G.exLoR,R);
        float rL=ll_fabs(bL)*2.f-0.5f*ll_fabs(bL), rR=ll_fabs(bR)*2.f-0.5f*ll_fabs(bR);
        /* DC blocker: a rectifier's output is all positive, and a DC offset
         * on the master bus eats headroom for nothing. */
        G.exThDcL+=(rL-G.exThDcL)*0.0005f; G.exThDcR+=(rR-G.exThDcR)*0.0005f;
        rL-=G.exThDcL; rR-=G.exThDcR;
        L+=bq_run(&G.exThHpL,ll_tanh(rL))*G.exThump*0.9f;
        R+=bq_run(&G.exThHpR,ll_tanh(rR))*G.exThump*0.9f;
      }
      if(G.exBody>0.f){
        /* The mids, saturated and blended back — density rather than level. */
        float mL=bq_run(&G.exMidLpL,bq_run(&G.exMidHpL,L));
        float mR=bq_run(&G.exMidLpR,bq_run(&G.exMidHpR,R));
        L+=ll_tanh(mL*2.2f)*G.exBody*0.33f;
        R+=ll_tanh(mR*2.2f)*G.exBody*0.33f;
      }
      if(G.exAir>0.f){
        /* Aphex-style: take the top, distort it, high-pass what comes out so
         * only the GENERATED content returns, and add it back. It is not a
         * shelf — a shelf lifts what is already there, and this makes detail
         * that was not there to lift. */
        float hL=bq_run(&G.exHiL,L), hR=bq_run(&G.exHiR,R);
        L+=bq_run(&G.exAirHpL,ll_tanh(hL*3.f))*G.exAir*0.42f;
        R+=bq_run(&G.exAirHpR,ll_tanh(hR*3.f))*G.exAir*0.42f;
      }
    }
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
  if(G.driveOn){ bq_undenorm(&G.tapeLpL);bq_undenorm(&G.tapeLpR);
                 bq_undenorm(&G.headBumpL);bq_undenorm(&G.headBumpR);
                 bq_undenorm(&G.osUpL1);bq_undenorm(&G.osUpL2);bq_undenorm(&G.osUpR1);bq_undenorm(&G.osUpR2);
                 bq_undenorm(&G.osDnL1);bq_undenorm(&G.osDnL2);bq_undenorm(&G.osDnR1);bq_undenorm(&G.osDnR2); }
  if(G.exOn){ bq_undenorm(&G.exLoL);bq_undenorm(&G.exLoR);bq_undenorm(&G.exThHpL);bq_undenorm(&G.exThHpR);
              bq_undenorm(&G.exMidHpL);bq_undenorm(&G.exMidHpR);bq_undenorm(&G.exMidLpL);bq_undenorm(&G.exMidLpR);
              bq_undenorm(&G.exHiL);bq_undenorm(&G.exHiR);bq_undenorm(&G.exAirHpL);bq_undenorm(&G.exAirHpR); }
}
