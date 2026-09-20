/* THE MASTER BUS in the core — DRIVE (a fixed glue compressor into a
 * saturator) then EXCITE (three band generators in parallel), in front of the
 * limiter.
 *
 * This is the half the oracle structurally cannot see: the oracle matches
 * ATTACKS (layer, time, length, pitch, velocity) and nothing in here changes
 * one, so a stage that silently did nothing would pass every scenario there
 * is.
 *
 * And for a CHARACTER stage the thing to assert is HARMONICS, not levels. A
 * plain gain can fake "louder" and a filter can fake "brighter"; nothing but
 * a nonlinearity can put energy at a frequency that was not in the input. So
 * most of this feeds ONE TONE through the bus (ll_debug_bus_probe) and reads
 * the bins that were empty going in — a mix already has energy everywhere,
 * which makes the music fixture useless for this and right for "is it finite,
 * is it under 0dBFS, is it still roughly the same loudness".
 */
#include "wire.h"
#include <math.h>
static int fails=0;
#define CK(c,...) do{ if(c)printf("ok   "); else {printf("FAIL ");fails++;} printf(__VA_ARGS__); printf("\n"); }while(0)

#define SR   48000
#define NSMP (SR*2)
static float L[NSMP],R[NSMP],sig[NSMP];
static float dryL[NSMP],dryR[NSMP];

/* One-bin Goertzel — no FFT in the test build, and one bin is all a harmonic
 * check needs. Skips the first 0.25s so the filters and the glue compressor's
 * envelope are settled. */
#define SKIP (SR/4)
static double bin(const float*x,double hz){
  double w=2.0*M_PI*hz/(double)SR, c=2.0*cos(w), s1=0,s2=0;
  int n=NSMP-SKIP;
  for(int i=SKIP;i<NSMP;i++){ double s0=x[i]+c*s1-s2; s2=s1; s1=s0; }
  return sqrt(s1*s1+s2*s2-c*s1*s2)/(n*0.5);
}
static double rms_of(const float*x,int n){ double s=0; for(int i=0;i<n;i++)s+=x[i]*x[i]; return sqrt(s/n); }
static float  peak_of(const float*x,int n){ float p=0; for(int i=0;i<n;i++){ float a=fabsf(x[i]); if(a>p)p=a; } return p; }
static int    finite_of(const float*a,const float*b,int n){ for(int i=0;i<n;i++)if(!isfinite(a[i])||!isfinite(b[i]))return 0; return 1; }

static void probe(double hz,double amp,void(*setup)(void)){
  ll_init(SR);
  if(setup)setup();
  for(int i=0;i<NSMP;i++)sig[i]=(float)(amp*sin(2.0*M_PI*hz*i/(double)SR));
  ll_debug_bus_probe(sig,sig,NSMP,L,R);
}
/* One deterministic bar of real music, from a cold engine every time. */
static void render(void(*setup)(void)){
  ll_init(SR);
  tpat p; tpat_init(&p,3,1);
  p.s[0].grid[8][0]=1; p.s[0].grid[10][4]=1; p.s[0].grid[12][8]=1; p.s[0].grid[8][12]=1;
  p.d.grid[LL_BD][0]=1; p.d.grid[LL_BD][8]=1; p.d.grid[LL_SD][4]=1; p.d.grid[LL_SD][12]=1;
  p.d.grid[LL_CH][2]=1; p.d.grid[LL_CH][6]=1; p.d.grid[LL_CH][10]=1; p.d.grid[LL_CH][14]=1;
  tpat_load(0,&p);
  ll_set(LL_P_ACTIVE_PAT,3);
  if(setup)setup();
  ll_play();
  for(int off=0;off<NSMP;off+=256)ll_render(L+off,R+off,256);
  ll_stop();
}

static void s_none (void){}
/* Everything SET but every amount at zero — so the bypass checks test the
 * SWITCHES rather than the defaults. */
/* Everything SET and turned all the way UP, but both SWITCHES off — so the
 * bypass checks test the SWITCHES rather than the amounts. That is the whole
 * point of having switches: a setting you can compare without losing it. */
static void s_allset_off(void){ ll_set(LL_P_DRIVE_ON,0); ll_set(LL_P_DRIVE_CHAR,LL_DRIVE_CLIP); ll_set(LL_P_DRIVE,100);
                                ll_set(LL_P_EX_ON,0); ll_set(LL_P_EX_THUMP,100); ll_set(LL_P_EX_BODY,100); ll_set(LL_P_EX_AIR,100); }
static void s_drv  (int chr,float d){ ll_set(LL_P_DRIVE_ON,1); ll_set(LL_P_DRIVE_CHAR,chr); ll_set(LL_P_DRIVE,d); }
static void s_tape (void){ s_drv(LL_DRIVE_TAPE,85); }
static void s_tube (void){ s_drv(LL_DRIVE_TUBE,85); }
static void s_clip (void){ s_drv(LL_DRIVE_CLIP,85); }
static void s_full (void){ s_drv(LL_DRIVE_TAPE,100); }
/* The FIRST NOTCH. DRIVE was "way too aggressive" and this is where it
 * showed: 1.3% third harmonic on a 1kHz tone before you had really turned it
 * on, and 6.4% second on TUBE. */
static void s_gentle (void){ s_drv(LL_DRIVE_TAPE,20); }
static void s_gentleT(void){ s_drv(LL_DRIVE_TUBE,20); }
static void s_ex   (void){ ll_set(LL_P_EX_ON,1); }
static void s_thump(void){ s_ex(); ll_set(LL_P_EX_THUMP,100); }
static void s_body (void){ s_ex(); ll_set(LL_P_EX_BODY,100); }
static void s_air  (void){ s_ex(); ll_set(LL_P_EX_AIR,100); }
static void s_all  (void){ s_clip(); s_ex(); ll_set(LL_P_EX_THUMP,100); ll_set(LL_P_EX_BODY,100); ll_set(LL_P_EX_AIR,100); }

int main(int argc,char**argv){
  (void)argc;(void)argv;

  /* ── 1. THE CURVES THEMSELVES ─────────────────────────────────────────
   * ll_shape is the contract the JS engine writes out again from the same
   * algebra, so its shape is worth stating directly rather than only
   * inferring it from a spectrum. */
  {
    int tapeSym=1, tubeAsym=0;
    for(double x=0.05;x<3.0;x+=0.05){
      float a=ll_shape(LL_DRIVE_TAPE,(float)x,0), b=ll_shape(LL_DRIVE_TAPE,(float)-x,0);
      if(fabsf(a+b)>1e-6f)tapeSym=0;
      float c=ll_shape(LL_DRIVE_TUBE,(float)x,LL_TUBE_BIAS), d=ll_shape(LL_DRIVE_TUBE,(float)-x,LL_TUBE_BIAS);
      if(fabsf(c+d)>1e-3f)tubeAsym=1;
    }
    CK(tapeSym,"TAPE's curve is SYMMETRIC (odd harmonics only)");
    CK(tubeAsym,"TUBE's curve is ASYMMETRIC (which is what makes even harmonics)");
    CK(fabsf(ll_shape(LL_DRIVE_CLIP,9.f,0)-1.f)<1e-3f,"CLIP saturates at unity like the other two (%.4f)",ll_shape(LL_DRIVE_CLIP,9.f,0));
    CK(fabsf(ll_shape(LL_DRIVE_CLIP,0.2f,0)-0.2f)<0.002f,"  but is still LINEAR at 0.2 where TAPE has already bent (%.4f vs %.4f)",
       ll_shape(LL_DRIVE_CLIP,0.2f,0),ll_shape(LL_DRIVE_TAPE,0.2f,0));
    CK(fabsf(ll_shape(LL_DRIVE_TUBE,0.f,LL_TUBE_BIAS))<1e-4f,"TUBE's bias is taken back off, so silence stays silent (%.2e)",
       fabsf(ll_shape(LL_DRIVE_TUBE,0.f,LL_TUBE_BIAS)));
    /* The bias SCALES WITH THE KNOB, so at bias 0 TUBE simply IS tape. That
     * is the property that gives the flavour a clean end instead of arriving
     * fully formed at the first notch, which is what it used to do. */
    CK(fabsf(ll_shape(LL_DRIVE_TUBE,0.6f,0)-ll_shape(LL_DRIVE_TAPE,0.6f,0))<1e-6f,
       "at bias 0 TUBE is exactly TAPE — the flavour scales in with the knob");
  }

  /* ── 2. OFF IS A REAL BYPASS ──────────────────────────────────────────
   * The flavour is chosen, the amounts are zero, and the output has to be
   * BIT-IDENTICAL — not merely close. This is the assertion that says an
   * existing project renders exactly what it always did. */
  render(s_none);
  for(int i=0;i<NSMP;i++){ dryL[i]=L[i]; dryR[i]=R[i]; }
  double dryRms=rms_of(dryL,NSMP); float dryPk=peak_of(dryL,NSMP);
  CK(finite_of(dryL,dryR,NSMP),"baseline render is finite");
  CK(dryRms>0.01,"baseline is not silent (rms %.4f, peak %.3f)",dryRms,dryPk);
  render(s_allset_off);
  int same=1; for(int i=0;i<NSMP;i++)if(L[i]!=dryL[i]||R[i]!=dryR[i]){same=0;break;}
  CK(same,"with BOTH SWITCHES OFF and every amount at 100 it is BIT-IDENTICAL to no master bus");

  /* ── 3. DRIVE MAKES HARMONICS, and the three flavours differ ──────────
   * A 1kHz tone in. Nothing but a nonlinearity can put anything at 2k or 3k. */
  double f0=1000;
  probe(f0,0.5,s_none);   double c1=bin(L,f0), c2=bin(L,2*f0), c3=bin(L,3*f0);
  CK(finite_of(L,R,NSMP),"clean probe is finite");
  CK(c2/c1<0.002&&c3/c1<0.002,"clean: the bus adds no harmonics at all (2nd %.1e, 3rd %.1e of the tone)",c2/c1,c3/c1);

  /* THE CLEAN END — the assertion the whole retune exists for. At the first
   * notch of the knob the stage has to be essentially transparent, or DRIVE
   * has no gentle half and every setting is a commitment. What failed it:
   * TAPE 1.28%, TUBE 6.41%, before the shaper learned to scale the signal
   * INTO the curve rather than always seeing the mix at full level. */
  probe(f0,0.5,s_gentle);  double g1=bin(L,f0), g3=bin(L,3*f0);
  CK(g3/g1<0.006,"DRIVE 20 is nearly CLEAN on TAPE (3rd %.2f%%, was 1.28%%)",100*g3/g1);
  probe(f0,0.5,s_gentleT); double v1=bin(L,f0), v2=bin(L,2*f0);
  CK(v2/v1<0.006,"DRIVE 20 is nearly clean on TUBE too (2nd %.2f%%, was 6.41%%)",100*v2/v1);

  probe(f0,0.5,s_tape);   double t1=bin(L,f0), t2=bin(L,2*f0), t3=bin(L,3*f0);
  CK(finite_of(L,R,NSMP),"TAPE probe is finite");
  CK(t3/t1>0.01,"TAPE generates a 3rd harmonic (%.1f%% of the tone)",100*t3/t1);
  CK(t2<t3*0.5,"  and almost no 2nd — a symmetric curve cannot make even harmonics (2nd %.2f%%, 3rd %.2f%%)",
     100*t2/t1,100*t3/t1);

  probe(f0,0.5,s_tube);   double u1=bin(L,f0), u2=bin(L,2*f0);
  CK(finite_of(L,R,NSMP),"TUBE probe is finite");
  CK(u2/u1>0.02,"TUBE generates a 2nd harmonic (%.1f%% of the tone)",100*u2/u1);
  CK((u2/u1)>(t2/t1)*5.0,"  and far more of it than TAPE (%.2f%% vs %.2f%%) — that is the whole difference",
     100*u2/u1,100*t2/t1);

  /* CLIP is a WALL, not a curve, so "harder than TAPE" is only true at the
   * stop. Below it CLIP is the CLEANER of the two, because it stays linear
   * while tanh is already bending — and that crossover IS the flavour. An
   * earlier version asserted CLIP harder at 85 and failed at 3.5% against
   * TAPE's 4.1%: the curve was right and the assertion was describing a
   * different kind of distortion box. */
  probe(f0,0.5,s_clip);   double k1=bin(L,f0), k3=bin(L,3*f0);
  CK(finite_of(L,R,NSMP),"CLIP probe is finite");
  {
    static void(*mid[2])(void)={s_tape,s_clip};
    double m3[2],m1[2];
    for(int i=0;i<2;i++){
      ll_init(SR); s_drv(i?LL_DRIVE_CLIP:LL_DRIVE_TAPE,60);
      for(int j=0;j<NSMP;j++)sig[j]=(float)(0.5*sin(2.0*M_PI*f0*j/(double)SR));
      ll_debug_bus_probe(sig,sig,NSMP,L,R);
      m1[i]=bin(L,f0); m3[i]=bin(L,3*f0);
    }
    (void)mid;
    CK((m3[1]/m1[1])<(m3[0]/m1[0])*0.5,
       "  at DRIVE 60 CLIP is still the CLEANER one (3rd %.2f%% vs TAPE's %.2f%%)",
       100*m3[1]/m1[1],100*m3[0]/m1[0]);
  }
  {
    double f3[2],f1[2];
    for(int i=0;i<2;i++){
      ll_init(SR); s_drv(i?LL_DRIVE_CLIP:LL_DRIVE_TAPE,100);
      for(int j=0;j<NSMP;j++)sig[j]=(float)(0.5*sin(2.0*M_PI*f0*j/(double)SR));
      ll_debug_bus_probe(sig,sig,NSMP,L,R);
      f1[i]=bin(L,f0); f3[i]=bin(L,3*f0);
    }
    CK((f3[1]/f1[1])>(f3[0]/f1[0])*1.3,
       "  and at the STOP it is much harder (3rd %.1f%% vs TAPE's %.1f%%) — a wall, not a curve",
       100*f3[1]/f1[1],100*f3[0]/f1[0]);
  }

  /* ── 4. DRIVE IS CHARACTER, NOT VOLUME ────────────────────────────────
   * The whole claim of the trim. Full drive on real music must not simply
   * arrive louder, or the knob is a fader with extra steps. */
  {
    static void(*fl[3])(void)={s_tape,s_tube,s_clip};
    static const char*nm[3]={"TAPE","TUBE","CLIP"};
    for(int i=0;i<3;i++){
      render(fl[i]);
      double dB=20.0*log10(rms_of(L,NSMP)/dryRms);
      CK(finite_of(L,R,NSMP),"%s on music is finite",nm[i]);
      CK(fabs(dB)<4.5,"  %s at 85 changes the SOUND, not the level (%+.1f dB)",nm[i],dB);
      CK(peak_of(L,NSMP)<=1.0f,"  %s stays under 0dBFS (%.3f)",nm[i],peak_of(L,NSMP));
    }
    render(s_full);
    double dB=20.0*log10(rms_of(L,NSMP)/dryRms);
    CK(fabs(dB)<4.5,"DRIVE at the stop is still not a volume knob (%+.1f dB)",dB);
  }

  /* ── 5. THE EXCITER'S THREE BANDS, each measured where it works ───────*/
  /* THUMP: a 60Hz tone. Rectification is a frequency doubler, so what comes
   * back is 120Hz and up — the harmonics the ear reads as weight on a phone
   * that cannot reproduce 60Hz at all. */
  probe(60,0.5,s_none);  double n60=bin(L,60), n120=bin(L,120);
  probe(60,0.5,s_thump); double p60=bin(L,60), p120=bin(L,120);
  CK(finite_of(L,R,NSMP),"THUMP probe is finite");
  /* Measured against the TONE, not against the clean run's 120Hz bin: that
   * bin is numerically empty, so a ratio against it is a divide-by-noise
   * that prints x7e12 and means nothing. */
  CK(n120/n60<0.01,"clean: nothing at 120Hz to begin with (%.3f%% of the tone)",100*n120/n60);
  CK(p120/p60>0.15,"THUMP puts harmonics ABOVE the bass (120Hz is %.0f%% of the tone)",100*p120/p60);
  CK(p60/n60<1.6,"  without just adding more sub (60Hz x%.2f)",p60/n60);

  /* BODY: 1kHz, in the 300..3000 band. Saturation there means a 3rd. */
  probe(f0,0.35,s_body); double b1=bin(L,f0), b3=bin(L,3*f0);
  CK(finite_of(L,R,NSMP),"BODY probe is finite");
  CK(b3/b1>0.01,"BODY thickens the mids with harmonics (3rd %.1f%%)",100*b3/b1);

  /* AIR: 4kHz, above the 3.5k corner. Aphex-style — distort the top and hand
   * back only what was GENERATED, so the 3rd at 12k is the whole point. */
  probe(4000,0.35,s_none); double na1=bin(L,4000), na=bin(L,12000);
  probe(4000,0.35,s_air);  double pa1=bin(L,4000), pa=bin(L,12000);
  CK(finite_of(L,R,NSMP),"AIR probe is finite");
  CK(na/na1<0.005,"clean: nothing at 12kHz to begin with (%.3f%% of the tone)",100*na/na1);
  CK(pa/pa1>0.03,"AIR makes detail that was not there to lift (12kHz is %.1f%% of the tone)",100*pa/pa1);

  /* ── 6. EVERYTHING AT ONCE, HARD ──────────────────────────────────────*/
  render(s_all);
  CK(finite_of(L,R,NSMP),"CLIP at 85 with all three exciters at 100 is finite");
  CK(peak_of(L,NSMP)<=1.0f,"  and the limiter still holds it under 0dBFS (%.3f)",peak_of(L,NSMP));
  CK(rms_of(L,NSMP)>dryRms*0.4,"  and it has not collapsed into nothing (rms %.4f vs %.4f)",rms_of(L,NSMP),dryRms);

  printf("%s\n",fails?"MASTER FAIL":"MASTER PASS"); return fails?1:0;
}
