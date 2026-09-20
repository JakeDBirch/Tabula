/* THE MASTER BUS in the core — bus compressor, then 3-band EQ, then the
 * limiter. This is the half the oracle structurally cannot see: the oracle
 * matches ATTACKS (layer, time, length, pitch, velocity), and a master bus
 * changes none of them. A stage that silently did nothing would pass every
 * oracle scenario there is.
 *
 * So this renders the same bar four ways and asserts what you would HEAR:
 *   1. OFF is a real bypass — bit-identical to the engine before the stage
 *      existed, which is the promise every already-saved project depends on;
 *   2. the shelves actually move the bands they name, and only those;
 *   3. the compressor actually reduces peaks, and its makeup gives it back;
 *   4. nothing in there can produce a non-finite sample or break the limiter.
 */
#include "wire.h"
#include <math.h>
static int fails=0;
#define CK(c,...) do{ if(c)printf("ok   "); else {printf("FAIL ");fails++;} printf(__VA_ARGS__); printf("\n"); }while(0)

#define SR   48000
#define NSMP (SR*2)
static float L[NSMP],R[NSMP];

/* Energy below ~120Hz and above ~4kHz. Crude on purpose — the question is
 * "did the shelf move that end of the spectrum", and this answers it without
 * dragging an FFT into the test build — but the LOW side is a CASCADED pair,
 * measured at the shelf's own corner. A single 250Hz one-pole leaks so much
 * midrange that a 120Hz shelf at +12dB shows up as a few percent, which is a
 * blunt instrument reporting a working filter as a broken one. */
static void bands(const float*x,int n,double*lo,double*hi){
  double slow=0,shi=0;
  const double kl=1.0-exp(-2.0*M_PI*120.0/SR), kh=1.0-exp(-2.0*M_PI*4000.0/SR);
  double z1=0,z2=0,zh=0;
  for(int i=0;i<n;i++){
    z1+=(x[i]-z1)*kl; z2+=(z1-z2)*kl; slow+=z2*z2;      /* 2-pole LP -> low energy  */
    zh+=(x[i]-zh)*kh; { double h=x[i]-zh; shi+=h*h; }   /* 1-pole HP -> high energy */
  }
  *lo=sqrt(slow/n); *hi=sqrt(shi/n);
}
static float peak_of(const float*x,int n){ float p=0; for(int i=0;i<n;i++){ float a=fabsf(x[i]); if(a>p)p=a; } return p; }
static double rms_of(const float*x,int n){ double s=0; for(int i=0;i<n;i++)s+=x[i]*x[i]; return sqrt(s/n); }
static int finite_of(const float*a,const float*b,int n){ for(int i=0;i<n;i++)if(!isfinite(a[i])||!isfinite(b[i]))return 0; return 1; }

/* One deterministic bar, rendered from a cold engine every time so nothing
 * carries over in a filter's state or the limiter's envelope. */
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
static void save(float*dl,float*dr){ for(int i=0;i<NSMP;i++){dl[i]=L[i];dr[i]=R[i];} }

static void s_none(void){}
static void s_hi_up(void){ ll_set(LL_P_EQ_HIGH,12); }
static void s_lo_up(void){ ll_set(LL_P_EQ_LOW,12); }
static void s_mid_cut(void){ ll_set(LL_P_EQ_MIDHZ,1000); ll_set(LL_P_EQ_MID,-12); }
static void s_flat(void){ ll_set(LL_P_EQ_LOW,0); ll_set(LL_P_EQ_MID,0); ll_set(LL_P_EQ_HIGH,0); }
static void s_comp(void){ ll_set(LL_P_COMP_ON,1); ll_set(LL_P_COMP_THRESH,-30);
                          ll_set(LL_P_COMP_RATIO,8); ll_set(LL_P_COMP_ATTACK,1);
                          ll_set(LL_P_COMP_RELEASE,100); ll_set(LL_P_COMP_MAKEUP,0); }
static void s_comp_mk(void){ s_comp(); ll_set(LL_P_COMP_MAKEUP,12); }
static void s_comp_off(void){ ll_set(LL_P_COMP_ON,0); ll_set(LL_P_COMP_THRESH,-30);
                              ll_set(LL_P_COMP_RATIO,8); ll_set(LL_P_COMP_MAKEUP,12); }
/* Two input levels 20dB apart, set BEFORE the first play. Setting the master
 * for a SECOND pass over an already-rendered engine does not work: the first
 * pass's reverb and delay tails are still in the buffers at the old level and
 * bleed straight into the measurement, which read a clean 20dB step as 14dB. */
static void s_off_hi (void){ s_comp_off(); ll_set(LL_P_MASTER,0.55f); }
static void s_off_lo (void){ s_comp_off(); ll_set(LL_P_MASTER,0.055f); }
static void s_comp_hi(void){ s_comp();     ll_set(LL_P_MASTER,0.55f); }
static void s_comp_lo(void){ s_comp();     ll_set(LL_P_MASTER,0.055f); }

static float dryL[NSMP],dryR[NSMP];

int main(int argc,char**argv){
  (void)argc;(void)argv;
  /* ── the baseline ── */
  render(s_none); save(dryL,dryR);
  double dryLo,dryHi; bands(dryL,NSMP,&dryLo,&dryHi);
  float dryPk=peak_of(dryL,NSMP); double dryRms=rms_of(dryL,NSMP);
  CK(finite_of(dryL,dryR,NSMP),"baseline render is finite");
  CK(dryRms>0.01,"baseline is not silent (rms %.4f, peak %.3f)",dryRms,dryPk);

  /* ── 1. OFF IS A REAL BYPASS ──────────────────────────────────────────
   * The values are set, the switches are not — and the output has to be
   * bit-identical, not merely close. This is the assertion that says an
   * existing project renders exactly what it always did. */
  render(s_comp_off);
  int same=1; float worst=0;
  for(int i=0;i<NSMP;i++){ float d=fabsf(L[i]-dryL[i]); if(d>worst)worst=d; if(L[i]!=dryL[i]||R[i]!=dryR[i])same=0; }
  CK(same,"COMP off with a -30dB threshold and +12dB makeup is BIT-IDENTICAL to no master bus (max |d| %.3e)",worst);
  render(s_flat);
  same=1; for(int i=0;i<NSMP;i++)if(L[i]!=dryL[i]||R[i]!=dryR[i]){same=0;break;}
  CK(same,"a FLAT EQ is bit-identical too — flat is bypassed, not passed through");

  /* ── 2. the EQ moves the band it names ────────────────────────────────── */
  /* Measured as a BALANCE (high energy over low), not as absolute energy in a
   * band: the limiter sits after the EQ, so a +12 boost that pushes into it
   * comes back partly gained down, and an absolute assertion would be
   * measuring the limiter as much as the shelf. The balance is immune to any
   * gain applied to both ends. (The first cut of this test asserted absolute
   * energy and LOW +12 read as a mere +9%, which is the limiter, not a broken
   * shelf.) */
  const double dryBal=dryHi/dryLo;
  render(s_hi_up); double hLo,hHi; bands(L,NSMP,&hLo,&hHi);
  CK(finite_of(L,R,NSMP),"HIGH +12 render is finite");
  CK(hHi/hLo>dryBal*1.2,"HIGH +12 tilts the balance UP (hi/lo %.3f -> %.3f)",dryBal,hHi/hLo);

  render(s_lo_up); double lLo,lHi; bands(L,NSMP,&lLo,&lHi);
  CK(finite_of(L,R,NSMP),"LOW +12 render is finite");
  CK(lHi/lLo<dryBal*0.85,"LOW +12 tilts it DOWN (hi/lo %.3f -> %.3f)",dryBal,lHi/lLo);

  render(s_mid_cut);
  CK(finite_of(L,R,NSMP),"MID -12 at 1kHz render is finite");
  CK(rms_of(L,NSMP)<dryRms,"MID -12 at 1kHz takes energy out (rms %.4f -> %.4f)",dryRms,rms_of(L,NSMP));

  /* ── 3. the compressor compresses ─────────────────────────────────────── */
  render(s_comp);
  float cPk=peak_of(L,NSMP); double cRms=rms_of(L,NSMP);
  CK(finite_of(L,R,NSMP),"compressed render is finite");
  CK(cPk<dryPk,"the compressor brings the peak down (%.3f -> %.3f)",dryPk,cPk);
  CK(cRms<dryRms,"  and the overall level with it (rms %.4f -> %.4f)",dryRms,cRms);
  /* THE DEFINING PROPERTY, and the only one worth asserting: a change of
   * INPUT level produces a SMALLER change of OUTPUT level. Everything else a
   * compressor does follows from that, and nothing a plain gain stage does
   * can fake it.
   *
   * The first cut of this test used CREST FACTOR instead and it went the
   * other way — 6.80 to 8.49. That is not a bug: with a 1ms attack and a
   * 100ms release the detector clamps down on a transient and then holds the
   * gain down through the body of the hit, so the body is squashed harder
   * than the peak that caused it. Perfectly ordinary over-compression, and a
   * reminder that crest factor measures the TIME CONSTANTS at least as much
   * as it measures the ratio. */
  {
    /* Measured from 0.25s in, NOT from the top. G.masterGain is a SMOOTHER
     * initialised to 0.55, so ll_set(LL_P_MASTER, …) ramps to the new value
     * over ~20ms — and the first kick lands inside that ramp, at nearly full
     * level. With the rest of the take scaled down 20dB, that one transient
     * dominates the rms and a clean 20dB step reads as 14dB. The smoothing is
     * right (it is what stops a gain change clicking); measuring the steady
     * state rather than the ramp is what was wrong. */
    const int SKIP=SR/4;
    double offHi,offLo,onHi,onLo;
    render(s_off_hi ); offHi=rms_of(L+SKIP,NSMP-SKIP);
    render(s_off_lo ); offLo=rms_of(L+SKIP,NSMP-SKIP);
    render(s_comp_hi); onHi =rms_of(L+SKIP,NSMP-SKIP);
    render(s_comp_lo); onLo =rms_of(L+SKIP,NSMP-SKIP);
    CK(offHi/offLo>9.0,"bypassed, a 20dB input step is a 20dB output step (x%.1f)",offHi/offLo);
    CK(onHi/onLo<offHi/offLo*0.7,
       "  engaged, the SAME input step is much smaller out (x%.1f vs x%.1f) — that is compression",
       onHi/onLo,offHi/offLo);
  }

  render(s_comp_mk);
  CK(rms_of(L,NSMP)>cRms,"MAKEUP gives the level back (rms %.4f -> %.4f)",cRms,rms_of(L,NSMP));
  CK(peak_of(L,NSMP)<=1.0f,"  and the limiter still holds it under 0dBFS (%.3f)",peak_of(L,NSMP));

  /* ── 4. everything at once, hard ──────────────────────────────────────── */
  render(s_comp);
  ll_set(LL_P_EQ_LOW,12); ll_set(LL_P_EQ_MID,12); ll_set(LL_P_EQ_HIGH,12);
  ll_set(LL_P_COMP_MAKEUP,12);
  ll_play(); for(int off=0;off<NSMP;off+=256)ll_render(L+off,R+off,256); ll_stop();
  CK(finite_of(L,R,NSMP),"comp + every band boosted to the stops is still finite");
  CK(peak_of(L,NSMP)<=1.0f,"  and still under 0dBFS (%.3f)",peak_of(L,NSMP));

  printf("%s\n",fails?"MASTER FAIL":"MASTER PASS"); return fails?1:0;
}
