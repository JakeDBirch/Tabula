import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── Scales — all 7 church modes, root C3 at row 15 (bottom) ─────────────────
// Ascending from C3: each mode built from C so tonal center stays fixed
const SCALES = {
  major:   { label:"MAJOR",   freqs:[587.33,523.25,493.88,440,392,349.23,329.63,293.66,261.63,246.94,220,196,174.61,164.81,146.83,130.81] },
  minor:   { label:"MINOR",   freqs:[587.33,523.25,466.16,415.3,392,349.23,311.13,293.66,261.63,233.08,207.65,196,174.61,155.56,146.83,130.81] },
  harmmin: { label:"HARM MIN",freqs:[587.33,523.25,493.88,415.3,392,349.23,311.13,293.66,261.63,246.94,207.65,196,174.61,155.56,146.83,130.81] },
  pent:    { label:"PENTA",   freqs:[587.33,523.25,440,392,329.63,293.66,261.63,220,196,164.81,146.83,130.81,110,98,82.41,65.41] },
  ionian:  { label:"IONIAN",  freqs:[587.33,523.25,493.88,440,392,349.23,329.63,293.66,261.63,246.94,220,196,174.61,164.81,146.83,130.81] },
  dorian:  { label:"DORIAN",  freqs:[587.33,523.25,466.16,440,392,349.23,311.13,293.66,261.63,233.08,220,196,174.61,155.56,146.83,130.81] },
  phryg:   { label:"PHRYG",   freqs:[554.37,523.25,466.16,415.3,392,349.23,311.13,277.18,261.63,233.08,207.65,196,174.61,155.56,138.59,130.81] },
  lydian:  { label:"LYDIAN",  freqs:[587.33,523.25,493.88,440,392,369.99,329.63,293.66,261.63,246.94,220,196,185,164.81,146.83,130.81] },
  mixo:    { label:"MIXO",    freqs:[587.33,523.25,466.16,440,392,349.23,329.63,293.66,261.63,233.08,220,196,174.61,164.81,146.83,130.81] },
  aeolian: { label:"AEOLIAN", freqs:[587.33,523.25,466.16,415.3,392,349.23,311.13,293.66,261.63,233.08,207.65,196,174.61,155.56,146.83,130.81] },
  locrian: { label:"LOCRIAN", freqs:[554.37,523.25,466.16,415.3,369.99,349.23,311.13,277.18,261.63,233.08,207.65,185,174.61,155.56,138.59,130.81] },
};

// All modes are 7 notes/octave. Root at row 15 → octave rows at 15,8,1; 5ths at 11,4
const SCALE_SPAN=7;


// ─── Other constants ──────────────────────────────────────────────────────────
const DLY_NOTES = [
  {label:"1/16", mult:.25},{label:"1/16·",mult:.375},{label:"1/8",  mult:.5},
  {label:"⅛·",  mult:.75},{label:"1/4",  mult:1},   {label:"¼·",  mult:1.5},
  {label:"1/2",  mult:2},  {label:"½·",  mult:3},   {label:"1/1",  mult:4},
];
const ROWS=16,COLS=16;
// Device detection — multiple signals for reliability across browsers and iframe contexts
const IS_MOBILE = (()=>{
  try {
    return navigator.maxTouchPoints > 0
      || window.innerWidth < 768
      || window.screen.width < 768
      || window.matchMedia('(pointer: coarse)').matches
      || /Android|iPhone|iPad|iPod|Mobile|CriOS/i.test(navigator.userAgent);
  } catch(e) { return false; }
})();
const PAT_COLORS=["#a8c5a0","#c4967a","#9fb4c7","#c9a96e","#b5a0c4","#7aaa96","#c4b07a","#a09ec4"];
const SLOTS=["S1","S2","S3","S4"];
const SPEED_OPTS=[
  {label:"2×",  mult:0.5},
  {label:"1×",  mult:1},
  {label:"½×",  mult:2},
  {label:"¼×",  mult:4},
  {label:"⅔×",  mult:1.5}, // triplet: each step = 3/2 of a 16th = 16th note triplet
];
const SHIFT_THRESHOLD=10;
const WAVEFORMS=["sawtooth","square","triangle","sine"];
const WF_LABELS=["SAW","SQ","TRI","SIN"];
// Section accent colors for synth panels
const C_OSC="#7ecfb3", C_ENV="#d4956a", C_FILT="#c97b8a", C_DLY="#8bbf9f";

const rowHue=r=>Math.round(195-(r/(ROWS-1))*135);
const rowCol=r=>"hsl("+rowHue(r)+",100%,62%)";
const patCol=i=>PAT_COLORS[i%PAT_COLORS.length];
let _id=0;
const mkGrid=()=>Array.from({length:ROWS},()=>new Array(COLS).fill(false));
const defaultStepParams=()=>Array.from({length:COLS},()=>({vel:100,cut:50,dly:0,rhy:1,dur:0,oct:2,glide:0}));
const mkPat=name=>({id:++_id,name,grid:mkGrid(),params:defaultStepParams(),gridLen:16});

const vcfHz=v=>Math.round(20*Math.pow(1000,v/100)); // 20Hz–20kHz
const vcfLbl=v=>{const f=vcfHz(v);return f>=1000?(f/1000).toFixed(1)+"k":String(f);};
const hpHz=v=>Math.round(20*Math.pow(100,v/100));
const hpLbl=v=>{const f=hpHz(v);return f>=1000?(f/1000).toFixed(1)+"k":String(f);};
const lpHz=v=>Math.round(400*Math.pow(50,v/100));
const lpLbl=v=>{const f=lpHz(v);return f>=1000?(f/1000).toFixed(1)+"k":String(f);};
const stR=st=>Math.pow(2,st/12);
const ms=v=>Math.max(0.001,v/1000);

const storageSet=async(k,v)=>{try{await window.storage.set(k,v);return;}catch(e){}try{localStorage.setItem("tnori-"+k,v);}catch(e){}};
const storageGet=async k=>{try{const r=await window.storage.get(k);if(r&&r.value)return r.value;}catch(e){}try{const v=localStorage.getItem("tnori-"+k);if(v)return v;}catch(e){}return null;};

const genVariation=(grid,vp={})=>{
  const g=grid.map(r=>[...r]);
  const drop=(vp.dropRate??13)/100;
  const shift=(vp.shiftRate??17)/100;
  const sRange=vp.shiftRange??1;
  const pitch=(vp.pitchRate??0)/100;
  const pRange=vp.pitchRange??1;
  const ghost=(vp.ghostRate??0)/100;
  const on=[];
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(!grid[r][c])continue;
    const roll=Math.random();
    if(roll<drop){ g[r][c]=false; }
    else if(roll<drop+shift){
      const nc=(c+(Math.floor(Math.random()*sRange*2+1)-sRange)+COLS)%COLS;
      if(!g[r][nc]){g[r][c]=false;g[r][nc]=true;}
    } else if(Math.random()<pitch){
      const nr=Math.max(0,Math.min(ROWS-1,r+(Math.floor(Math.random()*pRange*2+1)-pRange)));
      if(!g[nr][c]){g[r][c]=false;g[nr][c]=true;}
    }
    if(g[r][c])on.push([r,c]);
  }
  if(ghost>0){
    for(const[br,bc]of on){
      if(Math.random()<ghost){
        const nr=Math.max(0,Math.min(ROWS-1,br+Math.floor(Math.random()*3)-1));
        const nc=(bc+Math.floor(Math.random()*5)-2+COLS)%COLS;
        g[nr][nc]=true;
      }
    }
  }
  return g;
};

// Jitter a step's params by vary settings
const jitterStepParam=(sp,vp)=>{
  if(!sp)return sp;
  const jit=(v,amt,lo,hi)=>Math.max(lo,Math.min(hi,v+Math.round((Math.random()*2-1)*amt)));
  return{
    vel: vp.velJitter>0   ? jit(sp.vel, vp.velJitter*0.4, 0,127) : sp.vel,
    cut: vp.cutJitter>0   ? jit(sp.cut, vp.cutJitter*0.25,0,100) : sp.cut,
    dly: vp.dlyJitter>0   ? jit(sp.dly, vp.dlyJitter*0.4, 0,100) : sp.dly,
    rhy: vp.rhyJitter>0&&Math.random()<vp.rhyJitter/100 ? [0,1,1,2,3,4][Math.floor(Math.random()*6)] : sp.rhy,
    oct: vp.octJitter>0   &&Math.random()<vp.octJitter/100 ? Math.max(0,Math.min(4,sp.oct+(Math.random()<.5?1:-1))) : sp.oct,
    glide: vp.glideJitter>0 ? (Math.random()<vp.glideJitter/100?1:sp.glide) : sp.glide,
    dur:   vp.durJitter>0   ? jit(sp.dur??0, vp.durJitter*0.8, -100, 100) : (sp.dur??0),
  };
};

// ─── KnobSlider with accent color ─────────────────────────────────────────────
function KnobSlider({label,value,min,max,onChange,display,accent}){
  const ref=useRef(null);
  const col=accent||"rgba(255,255,255,0.6)";
  const compute=useCallback(e=>{
    const rect=ref.current.getBoundingClientRect();
    onChange(Math.round(min+Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*(max-min)));
  },[min,max,onChange]);
  const pct=((value-min)/(max-min))*100;
  return(
    <div style={S.knobWrap}>
      <div style={Object.assign({},S.knobLabel,{color:col+"cc"})}>{label}</div>
      <div ref={ref} style={S.knobTrackWrap}
        onPointerDown={e=>{e.stopPropagation();ref.current.setPointerCapture(e.pointerId);compute(e);}}
        onPointerMove={e=>{if(e.buttons){e.stopPropagation();compute(e);}}}>
        <div style={S.knobTrackBg}/>
        <div style={Object.assign({},S.knobTrackFill,{width:pct+"%",background:col+"88"})}/>
        <div style={Object.assign({},S.knobThumb,{left:pct+"%",background:col,boxShadow:"0 0 8px "+col+"99"})}/>
      </div>
      <div style={Object.assign({},S.knobValue,{color:col})}>{display}</div>
    </div>
  );
}
function StepPicker({label,display,sub,onDec,onInc,accent}){
  const col=accent||"rgba(255,255,255,0.6)";
  return(
    <div style={S.knobWrap}>
      <div style={Object.assign({},S.knobLabel,{color:col+"cc"})}>{label}</div>
      <div style={S.spRow}>
        <button style={Object.assign({},S.spBtnLg,{borderColor:col+"44",color:col})} onClick={onDec}>▼</button>
        <span style={Object.assign({},S.spValLg,{color:col})}>{display}</span>
        <button style={Object.assign({},S.spBtnLg,{borderColor:col+"44",color:col})} onClick={onInc}>▲</button>
      </div>
      {sub&&<div style={Object.assign({},S.knobValue,{color:col+"88"})}>{sub}</div>}
    </div>
  );
}

// ─── Step param lane definitions ─────────────────────────────────────────────
const LANES=[
  {key:"vel",  label:"VEL",  color:"#c8bfb0",min:0,   max:127, def:100, center:null, bool:false},
  {key:"cut",  label:"CUT",  color:"#c97b8a",min:0,   max:100, def:50,  center:50,   bool:false},
  {key:"dly",  label:"DLY",  color:"#7aaa96",min:0,   max:100, def:0,   center:null, bool:false},
  {key:"rhy",  label:"RTCH", color:"#c9a96e",min:1,   max:4,   def:1,   center:null, bool:false},
  {key:"dur",  label:"DUR",  color:"#9fb4c7",min:-100,max:100, def:0,   center:0,    bool:false},
  {key:"oct",  label:"OCT",  color:"#b5a0c4",min:0,   max:4,   def:2,   center:2,    bool:false},
  {key:"glide",label:"GLIDE",color:"#00bcd4",min:0,   max:1,   def:0,   center:null, bool:true},
];
// rhy: 1=×1 (normal), 2=×2, 3=×3, 4=×4 ratchet. Tie done via grid only.
// dur: -100 to +100 — percentage modifier on note gate length (0=default)
// oct: 0=−2, 1=−1, 2=0, 3=+1, 4=+2

const PARAM_ARMS=[
  {key:"rhy", label:"RTCH", color:"#c9a96e", angle:150, min:1,    max:4,   discrete:true},
  {key:"dly", label:"DLY",  color:"#7aaa96", angle:120, min:0,    max:100, discrete:false},
  {key:"vel", label:"VEL",  color:"#c8bfb0", angle:90,  min:0,    max:127, discrete:false},
  {key:"dur", label:"DUR",  color:"#9fb4c7", angle:60,  min:-100, max:100, discrete:false},
  {key:"cut", label:"CUT",  color:"#c97b8a", angle:30,  min:0,    max:100, discrete:false},
  {key:"oct", label:"OCT",  color:"#b5a0c4", angle:10,  min:0,    max:4,   discrete:true},
];

function StepLane({lane,values,activeStep,onChange,tall,colHasNote}){
  const ref=useRef(null);
  const drag=useRef({active:false});

  // Bool lanes (GLIDE): tap-to-toggle, no drag
  if(lane.bool){
    return(
      <div style={Object.assign({},S.laneRow,tall?{height:36}:{})}>
        {!tall&&<div style={Object.assign({},S.laneLabel,{color:lane.color+"99"})}>{lane.label}</div>}
        <div style={{...S.laneBars,alignItems:"center",gap:2}}>
          {Array.from({length:COLS},(_,c)=>{
            const on=!!(values[c]??lane.def);
            const isAct=c===activeStep;
            const locked=colHasNote&&!colHasNote[c];
            return(
              <div key={c} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
                height:"100%",opacity:locked?0.15:1,cursor:locked?"default":"pointer"}}
                onPointerDown={e=>{e.stopPropagation();if(locked)return;onChange(c,on?0:1);}}>
                <div style={{width:"70%",aspectRatio:"1",borderRadius:"3px",
                  background:on?(isAct?"#fff":lane.color):lane.color+"22",
                  border:"1px solid "+(on?lane.color:lane.color+"44"),
                  boxShadow:on&&isAct?"0 0 6px "+lane.color:"none",
                  transition:"background .08s, box-shadow .08s"}}/>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const getCV=useCallback(e=>{
    const rect=ref.current.getBoundingClientRect();
    const col=Math.max(0,Math.min(COLS-1,Math.floor((e.clientX-rect.left)/rect.width*COLS)));
    const pct=1-Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));
    return{col,val:Math.round(lane.min+pct*(lane.max-lane.min))};
  },[lane]);
  const onDown=useCallback(e=>{
    e.stopPropagation();ref.current.setPointerCapture(e.pointerId);
    if(lane.key==='rhy'){
      const rect=ref.current.getBoundingClientRect();
      const col=Math.max(0,Math.min(COLS-1,Math.floor((e.clientX-rect.left)/rect.width*COLS)));
      if(colHasNote&&!colHasNote[col])return;
      const cur=Math.round(values[col]??lane.def);
      const next=cur>=4?1:cur+1; // cycle ×1→×2→×3→×4→×1
      onChange(col,next);
      return;
    }
    drag.current.active=true;const{col,val}=getCV(e);
    if(colHasNote&&!colHasNote[col])return; // locked
    onChange(col,val);
  },[getCV,onChange,lane,values,colHasNote]);
  const onMove=useCallback(e=>{
    if(!drag.current.active)return;e.stopPropagation();
    const{col,val}=getCV(e);
    if(colHasNote&&!colHasNote[col])return; // locked
    onChange(col,val);
  },[getCV,onChange,colHasNote]);
  const onUp=useCallback(()=>{drag.current.active=false;},[]);
  return(
    <div style={Object.assign({},S.laneRow,tall?{height:52}:{})}>
      {!tall&&<div style={Object.assign({},S.laneLabel,{color:lane.color+"99"})}>{lane.label}</div>}
      <div ref={ref} style={S.laneBars}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        {Array.from({length:COLS},(_,c)=>{
          const v=values[c]??lane.def;
          const isAct=c===activeStep;
          const locked=colHasNote&&!colHasNote[c];
          const isRhy=lane.key==='rhy';
          const rhyVal=isRhy?Math.round(v):null;
          const isQ=c%4===0;
          const pct=isRhy ? ((rhyVal-1)/3) : (v-lane.min)/(lane.max-lane.min);
          const cp=lane.center!=null?(lane.center-lane.min)/(lane.max-lane.min):0;
          return(
            <div key={c} style={Object.assign({},S.laneBarWrap,{opacity:locked?0.15:1,borderLeft:isQ?"1px solid rgba(200,185,165,0.15)":"none"})}>
              {lane.center!=null&&<div style={Object.assign({},S.laneCenterLine,{bottom:(cp*100)+"%",borderColor:lane.color+"22"})}/>}
              <div style={Object.assign({},S.laneBar,{height:(pct*100)+"%",background:isAct?lane.color:lane.color+"55",boxShadow:isAct?"0 0 5px "+lane.color:"none",position:"relative",display:"flex",alignItems:"flex-start",justifyContent:"center"})}>
                {tall&&isRhy&&<span style={{fontSize:7,fontWeight:700,color:isAct?"#000":"rgba(0,0,0,0.8)",lineHeight:1,paddingTop:1,pointerEvents:"none"}}>{"×"+rhyVal}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Bell / Synth engine ──────────────────────────────────────────────────────
class Bell{
  constructor(){
    this.ctx=null;this.master=null;this.rev=null;
    this.dly=null;this.dlyFb=null;this.dlyReturn=null;this.dlySend=null;this.dlyHp=null;this.dlyLp=null;
    this.p={waveform:"sawtooth",detune:8,attack:8,decay:400,sustain:40,
            vcfCutoff:80,vcfRes:15,filterEnvAmt:0};
    this.stepDur=0.125;this.ready=false;
  }
  async init(dlyT,fbv,sendPct,dlyHpV,dlyLpV){
    this.ctx=new(window.AudioContext||window.webkitAudioContext)();
    await this.ctx.resume();
    const m=this.ctx.createGain();m.gain.value=0.55;m.connect(this.ctx.destination);this.master=m;

    // Reverb — fixed subtle ambience, always on
    const rv=this.ctx.createGain();rv.gain.value=0.12;rv.connect(m);this.rev=rv;
    [.057,.095,.154,.249,.403].forEach(dt=>{
      const d=this.ctx.createDelay(1);d.delayTime.value=dt;
      const g=this.ctx.createGain();g.gain.value=.07;rv.connect(d);d.connect(g);g.connect(m);
    });

    // Delay line with filters in feedback
    const dl=this.ctx.createDelay(4);dl.delayTime.value=dlyT;
    const dHp=this.ctx.createBiquadFilter();dHp.type="highpass";dHp.frequency.value=hpHz(dlyHpV);dHp.Q.value=.5;
    const dLp=this.ctx.createBiquadFilter();dLp.type="lowpass";dLp.frequency.value=lpHz(dlyLpV);dLp.Q.value=.5;
    const fb=this.ctx.createGain();fb.gain.value=fbv;
    dl.connect(dHp);dHp.connect(dLp);dLp.connect(fb);fb.connect(dl);

    // Fixed return — always at unity, no wet/dry scaling
    const ret=this.ctx.createGain();ret.gain.value=0.9;
    dl.connect(ret);ret.connect(m);
    this.dlyReturn=ret;

    // Global send gain — this is what the SEND knob controls
    const sg=this.ctx.createGain();sg.gain.value=sendPct/100;
    sg.connect(dl);
    this.dlySend=sg;

    this.dly=dl;this.dlyFb=fb;this.dlyHp=dHp;this.dlyLp=dLp;
    this.ready=true;
  }
  play(freq,at,sp,noteDur,globalSend,prevFreq,glideTime){
    if(!this.ready||this.ctx.state!=="running")return;
    const t=(at!=null)?at:this.ctx.currentTime,p=this.p;
    const velMul   = sp ? (sp.vel/127) : 1;
    const cutOff   = sp ? ((sp.cut-50)/50)*40 : 0;
    const stepDly  = sp ? sp.dly/100 : 0;
    const globalDly= (globalSend!=null) ? globalSend/100 : 0;
    // dly=0 means "use global send"; any other value overrides it entirely
    const dlyMul   = (sp && sp.dly > 0) ? stepDly : globalDly;
    const octShift = sp ? (sp.oct-2) : 0;
    const playFreq = freq * Math.pow(2, octShift);
    const durMod   = (sp && sp.dur!=null) ? sp.dur/100 : 0;
    const atk=ms(p.attack),dec=ms(p.decay),sus=Math.max(0.001,p.sustain/100),rel=ms(p.decay);
    const rawDur=noteDur!=null ? noteDur : this.stepDur;
    // dur must be >= atk+dec so envelope setValueAtTime calls stay in order (prevents clicks)
    const dur=Math.max(atk+dec+0.01, rawDur*(1+durMod));
    const end=dur+rel;

    const vcf=this.ctx.createBiquadFilter();
    vcf.type="lowpass";
    const rawCut=Math.max(0,Math.min(100,p.vcfCutoff+cutOff));
    const baseHz=vcfHz(rawCut);
    vcf.Q.value=Math.max(0.01, p.vcfRes*0.28); // floor prevents instability at Q=0
    const envAmt=p.filterEnvAmt/100;
    const peakHz=envAmt>0.001?baseHz*Math.pow(20000/Math.max(20,baseHz),envAmt):baseHz;
    const susHz=Math.max(20,baseHz+(peakHz-baseHz)*sus);
    if(envAmt>0.01){
      vcf.frequency.setValueAtTime(baseHz,t);
      vcf.frequency.linearRampToValueAtTime(peakHz,t+atk);
      vcf.frequency.exponentialRampToValueAtTime(susHz,t+atk+dec);
      vcf.frequency.setValueAtTime(susHz,t+dur);
      vcf.frequency.exponentialRampToValueAtTime(Math.max(20,baseHz),t+end);
    } else {
      vcf.frequency.value=baseHz;
    }

    const vca=this.ctx.createGain();
    const peak=(p.detune>2?0.28:0.42)*velMul;
    vca.gain.setValueAtTime(0,t);
    vca.gain.linearRampToValueAtTime(peak,t+atk);
    vca.gain.exponentialRampToValueAtTime(Math.max(0.001,sus*peak),t+atk+dec);
    vca.gain.setValueAtTime(Math.max(0.001,sus*peak),t+dur);
    vca.gain.exponentialRampToValueAtTime(0.0001,t+end);

    const o1=this.ctx.createOscillator();
    o1.type=p.waveform;
    if(prevFreq&&glideTime>0){
      // prevFreq is the actual played frequency from previous step (oct already applied)
      o1.frequency.setValueAtTime(Math.max(1,prevFreq),t);
      o1.frequency.exponentialRampToValueAtTime(Math.max(1,playFreq),t+glideTime);
    } else {
      o1.frequency.value=playFreq;
    }
    o1.connect(vcf);o1.start(t);o1.stop(t+end+.05);
    if(p.detune>2){
      const o2=this.ctx.createOscillator();
      o2.type=p.waveform;
      if(prevFreq&&glideTime>0){
        o2.frequency.setValueAtTime(Math.max(1,prevFreq),t);
        o2.frequency.exponentialRampToValueAtTime(Math.max(1,playFreq),t+glideTime);
      } else {
        o2.frequency.value=playFreq;
      }
      o2.detune.value=p.detune;
      o2.connect(vcf);o2.start(t);o2.stop(t+end+.05);
    }
    vcf.connect(vca);
    // Dry: always direct to master at full level
    vca.connect(this.master);
    // Reverb: fixed send
    vca.connect(this.rev);
    // Delay send: additive (global + step), capped at 1 — computed in dlyMul
    if(dlyMul>0){
      const stepSend=this.ctx.createGain();stepSend.gain.value=dlyMul;
      vca.connect(stepSend);stepSend.connect(this.dly);
    }
  }
  setDlyTime(s){if(!this.ready)return;if(this.dly){this.dly.delayTime.cancelScheduledValues(this.ctx.currentTime);this.dly.delayTime.setValueAtTime(s,this.ctx.currentTime);}}
  setDlyFb(v){if(!this.ready)return;if(this.dlyFb)this.dlyFb.gain.setTargetAtTime(v,this.ctx.currentTime,.02);}
  setDlyHp(v){if(!this.ready)return;if(this.dlyHp)this.dlyHp.frequency.setTargetAtTime(hpHz(v),this.ctx.currentTime,.02);}
  setDlyLp(v){if(!this.ready)return;if(this.dlyLp)this.dlyLp.frequency.setTargetAtTime(lpHz(v),this.ctx.currentTime,.02);}
  setDelaySend(pct){if(!this.ready)return;if(this.dlySend)this.dlySend.gain.setTargetAtTime(pct/100,this.ctx.currentTime,.02);}
  async resume(){if(this.ctx&&this.ctx.state==="suspended")await this.ctx.resume();}
}

// ─── Synth Panel Section ──────────────────────────────────────────────────────
function SynthSection({title,accent,children}){
  return(
    <div style={Object.assign({},S.synthSection,{borderColor:accent+"33"})}>
      <div style={Object.assign({},S.synthSectionHdr,{borderColor:accent,color:accent})}>{title}</div>
      {children}
    </div>
  );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function Tabula(){
  const [pats,setPats]=useState(()=>{
    const a=mkPat("A");
    return[a];
  });
  const [activeId,  setActiveId]  = useState(1);
  const [chain,     setChain]     = useState([1]);
  const [page,      setPage]      = useState("edit");
  const [bpm,       setBpm]       = useState(120);
  const [scale,     setScale]     = useState("major");
  const [playing,   setPlaying]   = useState(false);
  const [step,      setStep]      = useState(-1);
  const [cpos,      setCpos]      = useState(0);
  const [playId,    setPlayId]    = useState(null);
  const [loopMode,  setLoopMode]  = useState(false);
  const [followSeq, setFollowSeq] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [clipboard, setClipboard] = useState(null);
  const [slotData,  setSlotData]  = useState({S1:null,S2:null,S3:null,S4:null});
  const [flash,     setFlash]     = useState("");
  const [shareFlash,setShareFlash]= useState("");
  const importRef  = useRef(null);
  const [shifting,  setShifting]  = useState(false);
  const [varyMode,  setVaryMode]  = useState(false);
  const [recMode,   setRecMode]   = useState(false);
  const [monoMode,  setMonoMode]  = useState(false);
  const monoModeR = useRef(false);
  const [swing,     setSwing]     = useState(0);  // 0–100, 0=straight, 100=full triplet swing
  const swingR = useRef(0);
  const gridLenR   = useRef(16);
  const [speedMult, setSpeedMult] = useState(1);
  const speedMultR = useRef(1);
  const [showMenu,  setShowMenu]  = useState(false);
  const [topTrayOpen,   setTopTrayOpen]   = useState(false);
  const [bottomTrayOpen,setBottomTrayOpen]= useState(false);
  const [patMenu,   setPatMenu]   = useState(null); // {id, x, y}
  const [paramPopup,setParamPopup]= useState(null); // {col,x,y,activeArm,values}
  const popupR       = useRef(null); // mirror for handlers: {col,originX,originY,baseValues}
  const longPressR   = useRef(null); // setTimeout id
  const pointerCountR= useRef(0);    // active pointers on grid
  const [chainDrag, setChainDrag] = useState(null); // {type,id,fromIdx,x,y}
  const chainStripRef = useRef(null);
  const chainDragR    = useRef(null); // mirror of chainDrag for handlers
  // Vary params
  const [vDropRate,  setVDropRate]  = useState(13);
  const [vShiftRate, setVShiftRate] = useState(17);
  const [vShiftRange,setVShiftRange]= useState(1);
  const [vPitchRate, setVPitchRate] = useState(0);
  const [vPitchRange,setVPitchRange]= useState(1);
  const [vGhostRate, setVGhostRate] = useState(0);
  const [vVelJitter, setVVelJitter] = useState(0);
  const [vCutJitter, setVCutJitter] = useState(0);
  const [vDlyJitter, setVDlyJitter] = useState(0);
  const [vRhyJitter, setVRhyJitter] = useState(0);
  const [vOctJitter, setVOctJitter] = useState(0);
  const [vGlideJitter,setVGlideJitter]=useState(0);
  const [vDurJitter,  setVDurJitter]  =useState(0);

  // Synth
  const [waveform,     setWaveform]     = useState("sawtooth");
  const [detune,       setDetune]       = useState(8);
  const [attack,       setAttack]       = useState(8);
  const [decay,        setDecay]        = useState(400);
  const [sustain,      setSustain]      = useState(40);
  const [vcfCutoff,    setVcfCutoff]    = useState(80);
  const [vcfRes,       setVcfRes]       = useState(15);
  const [filterEnvAmt, setFilterEnvAmt] = useState(0);

  // Delay
  const [dlyIdx,    setDlyIdx]    = useState(3);
  const [dlyFbPct,  setDlyFbPct]  = useState(45);
  const [dlyWetPct, setDlyWetPct] = useState(50);
  const [dlyHpVal,  setDlyHpVal]  = useState(8);
  const [dlyLpVal,  setDlyLpVal]  = useState(78);

  const bell=useRef(new Bell());
  const stepR=useRef(0),cposR=useRef(0),tmrR=useRef(null),nextNoteR=useRef(0);
  const patsR=useRef(pats),chainR=useRef(chain);
  const bpmR=useRef(bpm),scaleR=useRef(scale);
  const loopR=useRef(false),activeIdR=useRef(activeId);
  const transpR=useRef(0),varyModeR=useRef(false),recModeR=useRef(false),recSourceIdR=useRef(null);
  const varyParamsR=useRef({dropRate:13,shiftRate:17,shiftRange:1,pitchRate:0,pitchRange:1,ghostRate:0,velJitter:0,cutJitter:0,dlyJitter:0,rhyJitter:0,octJitter:0});
  const variedGrids=useRef(new Map());
  const prevFreqByRowR=useRef({});
  const lastPlayedFreqR=useRef(null);
  const lastGlideEnabledR=useRef(false); // glide is a departure attr — enabled note slides INTO next note
  const flashTmr=useRef(null),gridRef=useRef(null);
  const gesture=useRef({state:"idle",startX:0,startY:0,baseGrid:null,cellPx:24,appliedDX:0,appliedDY:0});

  useEffect(()=>{patsR.current=pats;},[pats]);
  useEffect(()=>{chainR.current=chain;},[chain]);
  useEffect(()=>{bpmR.current=bpm;bell.current.stepDur=60/bpm/4*speedMultR.current;},[bpm]);
  useEffect(()=>{speedMultR.current=speedMult;bell.current.stepDur=60/bpmR.current/4*speedMult;},[speedMult]);
  useEffect(()=>{scaleR.current=scale;},[scale]);
  useEffect(()=>{loopR.current=loopMode;},[loopMode]);
  useEffect(()=>{if(followSeq&&playing&&playId)setActiveId(playId);},[playId,followSeq,playing]);
  useEffect(()=>{activeIdR.current=activeId;},[activeId]);
  useEffect(()=>{transpR.current=transpose;},[transpose]);
  useEffect(()=>{varyModeR.current=varyMode;},[varyMode]);
  useEffect(()=>{
    recModeR.current=recMode;
    if(recMode) recSourceIdR.current=activeId; // lock source to active pattern at record start
    else recSourceIdR.current=null;
  },[recMode]);
  useEffect(()=>{monoModeR.current=monoMode;},[monoMode]);
  useEffect(()=>{swingR.current=swing;},[swing]);
  useEffect(()=>{speedMultR.current=speedMult;},[speedMult]);
  useEffect(()=>{
    varyParamsR.current={dropRate:vDropRate,shiftRate:vShiftRate,shiftRange:vShiftRange,pitchRate:vPitchRate,pitchRange:vPitchRange,ghostRate:vGhostRate,velJitter:vVelJitter,cutJitter:vCutJitter,dlyJitter:vDlyJitter,rhyJitter:vRhyJitter,octJitter:vOctJitter,glideJitter:vGlideJitter,durJitter:vDurJitter};
  },[vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,vVelJitter,vCutJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,vGlideJitter,vDurJitter]);
  useEffect(()=>{bell.current.p.waveform=waveform;},[waveform]);
  useEffect(()=>{bell.current.p.detune=detune;},[detune]);
  useEffect(()=>{bell.current.p.attack=attack;},[attack]);
  useEffect(()=>{bell.current.p.decay=decay;},[decay]);
  useEffect(()=>{bell.current.p.sustain=sustain;},[sustain]);
  useEffect(()=>{bell.current.p.vcfCutoff=vcfCutoff;},[vcfCutoff]);
  useEffect(()=>{bell.current.p.vcfRes=vcfRes;},[vcfRes]);
  useEffect(()=>{bell.current.p.filterEnvAmt=filterEnvAmt;},[filterEnvAmt]);

  useEffect(()=>{bell.current.setDlyTime((60/bpm)*DLY_NOTES[dlyIdx].mult);},[bpm,dlyIdx]);
  useEffect(()=>{bell.current.setDlyFb(dlyFbPct/100);},[dlyFbPct]);
  const dlyWetPctR = useRef(50);
  useEffect(()=>{dlyWetPctR.current=dlyWetPct;bell.current.setDelaySend(dlyWetPct);},[dlyWetPct]);
  useEffect(()=>{bell.current.setDlyHp(dlyHpVal);},[dlyHpVal]);
  useEffect(()=>{bell.current.setDlyLp(dlyLpVal);},[dlyLpVal]);

  useEffect(()=>{
    (async()=>{const v=await storageGet("slots");if(v)try{setSlotData(JSON.parse(v));}catch(e){}})();
  },[]);

  const showFlash=msg=>{setFlash(msg);clearTimeout(flashTmr.current);flashTmr.current=setTimeout(()=>setFlash(""),1800);};

  const saveSlot=async slot=>{
    const snap={pats,chain,bpm,scale,transpose,swing,speedMult,activeId,waveform,detune,attack,decay,sustain,vcfCutoff,vcfRes,filterEnvAmt,dlyIdx,dlyFbPct,dlyWetPct,dlyHpVal,dlyLpVal};
    const next=Object.assign({},slotData,{[slot]:snap});
    setSlotData(next);await storageSet("slots",JSON.stringify(next));showFlash("SAVED "+slot);
  };
  const loadSlot=slot=>{
    const s=slotData[slot];if(!s)return;
    const maxId=Math.max(0,...s.pats.map(p=>p.id));if(maxId>=_id)_id=maxId+1;
    setPats(s.pats);setChain(s.chain);setBpm(s.bpm);setScale(s.scale);setTranspose(s.transpose||0);if(s.swing!=null)setSwing(s.swing);if(s.speedMult!=null)setSpeedMult(s.speedMult);setActiveId(s.activeId);
    if(s.waveform)setWaveform(s.waveform);
    [["detune",setDetune],["attack",setAttack],["decay",setDecay],["sustain",setSustain],
     ["vcfCutoff",setVcfCutoff],["vcfRes",setVcfRes],["filterEnvAmt",setFilterEnvAmt],
     ["dlyIdx",setDlyIdx],["dlyFbPct",setDlyFbPct],["dlyWetPct",setDlyWetPct],["dlyHpVal",setDlyHpVal],["dlyLpVal",setDlyLpVal]
    ].forEach(([k,fn])=>{if(s[k]!=null)fn(s[k]);});
    showFlash("LOADED "+slot);
  };

  const activePat=pats.find(p=>p.id===activeId);
  const gridLen=activePat?.gridLen??16;
  useEffect(()=>{gridLenR.current=gridLen;},[gridLen]);

  // ── Share / Export / Import ──────────────────────────────────────────────
  const getShareState=()=>({
    pats,chain,bpm,scale,transpose,swing,speedMult,activeId,
    waveform,detune,attack,decay,sustain,vcfCutoff,vcfRes,filterEnvAmt,
    dlyIdx,dlyFbPct,dlyWetPct,dlyHpVal,dlyLpVal,
    vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,
    vVelJitter,vCutJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,
    monoMode,loopMode
  });

  const applyShareState=s=>{
    if(!s)return;
    const maxId=Math.max(0,...(s.pats||[]).map(p=>p.id));if(maxId>=_id)_id=maxId+1;
    if(s.pats)setPats(s.pats);
    if(s.chain)setChain(s.chain);
    if(s.bpm)setBpm(s.bpm);
    if(s.scale)setScale(s.scale);
    if(s.transpose!=null)setTranspose(s.transpose);
    if(s.swing!=null)setSwing(s.swing);
    if(s.gridLen!=null)setGridLen(s.gridLen);
    if(s.speedMult!=null)setSpeedMult(s.speedMult);
    if(s.activeId)setActiveId(s.activeId);
    if(s.waveform)setWaveform(s.waveform);
    if(s.monoMode!=null)setMonoMode(s.monoMode);
    if(s.loopMode!=null)setLoopMode(s.loopMode);
    [["detune",setDetune],["attack",setAttack],["decay",setDecay],["sustain",setSustain],
     ["vcfCutoff",setVcfCutoff],["vcfRes",setVcfRes],["filterEnvAmt",setFilterEnvAmt],
     ["dlyIdx",setDlyIdx],["dlyFbPct",setDlyFbPct],["dlyWetPct",setDlyWetPct],["dlyHpVal",setDlyHpVal],["dlyLpVal",setDlyLpVal],
     ["vDropRate",setVDropRate],["vShiftRate",setVShiftRate],["vShiftRange",setVShiftRange],
     ["vPitchRate",setVPitchRate],["vPitchRange",setVPitchRange],["vGhostRate",setVGhostRate],
     ["vVelJitter",setVVelJitter],["vCutJitter",setVCutJitter],["vDlyJitter",setVDlyJitter],
     ["vRhyJitter",setVRhyJitter],["vOctJitter",setVOctJitter],["vGlideJitter",setVGlideJitter],
    ].forEach(([k,fn])=>{if(s[k]!=null)fn(s[k]);});
  };

  const encodeState=s=>{try{return btoa(unescape(encodeURIComponent(JSON.stringify(s))));}catch(e){return null;}};
  const decodeState=str=>{try{return JSON.parse(decodeURIComponent(escape(atob(str))));}catch(e){return null;}};

  const copyShareLink=()=>{
    const url=window.location.origin+window.location.pathname+'#'+encodeState(getShareState());
    navigator.clipboard.writeText(url).then(()=>{setShareFlash("LINK COPIED");setTimeout(()=>setShareFlash(""),2000);});
  };

  const exportJSON=()=>{
    const blob=new Blob([JSON.stringify(getShareState(),null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="tabula-preset.json";a.click();
  };

  const handleImport=e=>{
    const file=e.target.files?.[0];if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{
      const s=decodeState(btoa(unescape(encodeURIComponent(ev.target.result))))||JSON.parse(ev.target.result||"null");
      try{const parsed=JSON.parse(ev.target.result);applyShareState(parsed);setShareFlash("PRESET LOADED");setTimeout(()=>setShareFlash(""),2000);}
      catch(err){setShareFlash("IMPORT FAILED");setTimeout(()=>setShareFlash(""),2000);}
    };
    reader.readAsText(file);
    e.target.value="";
  };

  // Load from URL hash on mount
  useEffect(()=>{
    const hash=window.location.hash.slice(1);
    if(hash){const s=decodeState(hash);if(s){applyShareState(s);window.location.hash="";}}
  },[]);

  // Lookahead scheduler — runs every 25ms, schedules notes 100ms ahead.
  // Decouples JS timer jitter from audio precision so delay stays locked to grid.
  const scheduler=useCallback(()=>{
    if(!bell.current.ready)return;
    const ctx=bell.current.ctx;
    const LOOKAHEAD=0.1; // seconds ahead to schedule
    const stepDur=(60/bpmR.current/4)*speedMultR.current;

    while(nextNoteR.current < ctx.currentTime + LOOKAHEAD){
      const s_=stepR.current;
      const swingOffset = (s_%2===1) ? stepDur*(swingR.current/100)*0.33 : 0;
      const at=nextNoteR.current + swingOffset;
      const ch=loopR.current?[activeIdR.current]:chainR.current;
      if(ch.length){
        const cp=cposR.current,s=s_,pid=ch[cp];
        const p=patsR.current.find(x=>x.id===pid);
        const activeLen=p?(p.gridLen??16):16;
        if(s===0&&varyModeR.current&&p){
          let vg=genVariation(p.grid,varyParamsR.current);
          if(monoModeR.current){const out=Array.from({length:ROWS},()=>new Array(COLS).fill(false));for(let c=0;c<COLS;c++){const hits=[];for(let r=0;r<ROWS;r++)if(vg[r][c])hits.push(r);if(hits.length)out[hits[Math.floor(Math.random()*hits.length)]][c]=true;}vg=out;}
          variedGrids.current.set(pid,vg);
          // Self-record: always vary the original source pattern, not the current playing one
          if(recModeR.current&&patsR.current.length<8){
            const vp=varyParamsR.current;
            const src=patsR.current.find(x=>x.id===recSourceIdR.current)||p;
            let rvg=genVariation(src.grid,vp);
            if(monoModeR.current){const out=Array.from({length:ROWS},()=>new Array(COLS).fill(false));for(let c=0;c<COLS;c++){const hits=[];for(let r=0;r<ROWS;r++)if(rvg[r][c])hits.push(r);if(hits.length)out[hits[Math.floor(Math.random()*hits.length)]][c]=true;}rvg=out;}
            const newParams=(src.params||defaultStepParams()).map(sp=>jitterStepParam(sp,vp));
            const newPat={id:++_id,name:"ABCDEFGH"[patsR.current.length],grid:rvg,params:newParams,gridLen:src.gridLen??16};
            setPats(ps=>{
              if(ps.length>=8){recModeR.current=false;setRecMode(false);return ps;}
              return [...ps,newPat];
            });
            setChain(c=>[...c,newPat.id]);
          }
        }
        const grid=varyModeR.current?(variedGrids.current.get(pid)||(p&&p.grid)):(p&&p.grid);
        const freqs=SCALES[scaleR.current].freqs;
        const ratio=stR(transpR.current);
        const rawSp=(p&&p.params&&p.params[s])?p.params[s]:null;
        const sp=varyModeR.current&&rawSp?jitterStepParam(rawSp,varyParamsR.current):rawSp;

        const rhy   = sp ? Math.max(1,Math.round(sp.rhy??1)) : 1;
        const ratch = rhy;
        const isTie = false; // tie is done via grid only now
        const subDur = stepDur / ratch;

        // Non-tie step: look ahead for consecutive tied steps and extend duration
        let noteDur = stepDur;
        if(!isTie && p && p.params){
          let ts=(s+1)%COLS, count=0;
          while(count<COLS-1 && p.params[ts] && Math.round(p.params[ts].rhy??1)===0){
            noteDur+=stepDur; ts=(ts+1)%COLS; count++;
          }
        }

        if(grid)for(let r=0;r<ROWS;r++){
          if(!grid[r][s])continue;
          if(isTie)continue;
          const f=freqs[r]*ratio;
          const octShift=sp?(sp.oct-2):0;
          const actualF=f*Math.pow(2,octShift);
          const hasGlide=!!(sp&&sp.glide);
          // Departure glide: glide on step N means slide FROM step N INTO step N+1
          // So we glide if the PREVIOUS step had glide enabled
          const prevF=lastGlideEnabledR.current?(lastPlayedFreqR.current??null):null;
          const glideTime=prevF&&prevF!==actualF?(60/bpmR.current/8)*speedMultR.current:0;
          lastPlayedFreqR.current=actualF;
          lastGlideEnabledR.current=hasGlide; // store for next step to read
          if(ratch>1){
            for(let ri=0;ri<ratch;ri++)bell.current.play(f,at+ri*subDur,sp,subDur*0.9,dlyWetPctR.current,ri===0?prevF:null,ri===0?glideTime:0);
          } else {
            bell.current.play(f,at,sp,noteDur,dlyWetPctR.current,prevF,glideTime);
          }
        }
        setStep(s);setCpos(cp);setPlayId(pid);
        const ns=(s+1)%activeLen;stepR.current=ns;
        if(ns===0)cposR.current=(cp+1)%ch.length;
      }
      nextNoteR.current+=stepDur;
    }
  },[]);

  const startStop=async()=>{
    if(playing){clearInterval(tmrR.current);setPlaying(false);setStep(-1);setPlayId(null);prevFreqByRowR.current={};lastPlayedFreqR.current=null;lastGlideEnabledR.current=false;setRecMode(false);recModeR.current=false;return;}
    const dlyT=(60/bpm)*DLY_NOTES[dlyIdx].mult;
    if(!bell.current.ready)await bell.current.init(dlyT,dlyFbPct/100,dlyWetPct,dlyHpVal,dlyLpVal);
    else await bell.current.resume();
    bell.current.stepDur=60/bpm/4*speedMult;
    if(!loopR.current&&!chainR.current.length){chainR.current=[activeId];setChain([activeId]);}
    stepR.current=0;cposR.current=0;
    nextNoteR.current=bell.current.ctx.currentTime+0.05; // small initial offset
    tmrR.current=setInterval(scheduler,25);setPlaying(true);
  };
  useEffect(()=>()=>clearInterval(tmrR.current),[]);

  // Lock the interface against iOS sheet-dismiss swipe and long-press selection
  useEffect(()=>{
    const noSelect=e=>e.preventDefault();
    const noContext=e=>{
      // Allow right-click on the grid (handled by onContextMenu for param popup)
      if(e.target&&(e.target.dataset?.grid||e.target.closest?.('[data-grid]')))return;
      e.preventDefault();
    };
    const clearSel=()=>{try{window.getSelection()?.removeAllRanges();}catch(e){}};

    // Block touchmove for any touch that didn't start inside a scrollable container.
    // Use a per-touch-identifier map so multi-touch is handled correctly.
    const scrollableStarts = new Map(); // identifier → boolean
    const onTouchStart = e => {
      for(const t of e.changedTouches){
        let el = document.elementFromPoint(t.clientX, t.clientY);
        let scrollable = false;
        while(el && el !== document.body){
          const ov = window.getComputedStyle(el).overflowY;
          if((ov==='scroll'||ov==='auto') && el.scrollHeight > el.clientHeight + 2){
            scrollable = true; break;
          }
          el = el.parentElement;
        }
        scrollableStarts.set(t.identifier, scrollable);
      }
    };
    const onTouchEnd = e => {
      for(const t of e.changedTouches) scrollableStarts.delete(t.identifier);
    };
    const noOverscroll = e => {
      // Block if ALL active touches started on non-scrollable elements
      let anyScrollable = false;
      for(const t of e.touches){
        if(scrollableStarts.get(t.identifier)) { anyScrollable = true; break; }
      }
      if(!anyScrollable && e.cancelable) e.preventDefault();
    };

    document.addEventListener('selectstart',    noSelect,    {passive:false});
    document.addEventListener('contextmenu',    noContext,   {passive:false});
    document.addEventListener('selectionchange',clearSel,    {passive:true});
    document.addEventListener('touchstart',     onTouchStart,{passive:true});
    document.addEventListener('touchend',       onTouchEnd,  {passive:true});
    document.addEventListener('touchcancel',    onTouchEnd,  {passive:true});
    document.addEventListener('touchmove',      noOverscroll,{passive:false});
    return()=>{
      document.removeEventListener('selectstart',    noSelect);
      document.removeEventListener('contextmenu',    noContext);
      document.removeEventListener('selectionchange',clearSel);
      document.removeEventListener('touchstart',     onTouchStart);
      document.removeEventListener('touchend',       onTouchEnd);
      document.removeEventListener('touchcancel',    onTouchEnd);
      document.removeEventListener('touchmove',      noOverscroll);
    };
  },[]);

  const mutatePat=fn=>setPats(ps=>ps.map(p=>p.id!==activeId?p:Object.assign({},p,{grid:fn(p.grid)})));

  // Collapse a grid to at most one note per column (keep a random one)
  const collapseToMono=g=>{
    const out=mkGrid();
    for(let c=0;c<COLS;c++){
      const hits=[];
      for(let r=0;r<ROWS;r++)if(g[r][c])hits.push(r);
      if(hits.length)out[hits[Math.floor(Math.random()*hits.length)]][c]=true;
    }
    return out;
  };

  const toggleMono=()=>setMonoMode(m=>{
    const next=!m;
    if(next) setPats(ps=>ps.map(p=>p.id!==activeId?p:Object.assign({},p,{grid:collapseToMono(p.grid)})));
    return next;
  });

  const mutatePat1=()=>mutatePat(g=>{
    const varied=genVariation(g,varyParamsR.current);
    return monoModeR.current?collapseToMono(varied):varied;
  });

  const handleGridDown=useCallback(e=>{
    if(e.button===2)return; // right-click handled by onContextMenu only
    e.preventDefault();
    pointerCountR.current++;
    const g=gesture.current;

    // Shift+click on desktop = two-finger drag (pattern shift)
    if(e.shiftKey&&!IS_MOBILE){
      clearTimeout(longPressR.current);longPressR.current=null;
      if(popupR.current){
        const {col}=popupR.current;
        const vals=paramPopupValuesR.current;
        if(vals)setPats(ps=>ps.map(p=>{
          if(p.id!==activeIdR.current)return p;
          const params=(p.params||defaultStepParams()).map((sp,i)=>i===col?Object.assign({},sp,vals):sp);
          return Object.assign({},p,{params});
        }));
        setParamPopup(null);popupR.current=null;
      }
      g.state="shift";setShifting(true);
      g.startX=e.clientX;g.startY=e.clientY;g.appliedDX=0;g.appliedDY=0;
      g.shiftPointerID=e.pointerId;
      gridRef.current&&gridRef.current.setPointerCapture(e.pointerId);
      const pat=patsR.current.find(p=>p.id===activeIdR.current);
      g.baseGrid=pat?pat.grid.map(r=>[...r]):null;
      g.baseParams=pat?(pat.params||defaultStepParams()).map(s=>({...s})):null;
      return;
    }

    // Second finger down → shift mode, dismiss popup
    if(pointerCountR.current>=2){
      clearTimeout(longPressR.current);longPressR.current=null;
      if(popupR.current){
        const {col}=popupR.current;
        const vals=paramPopupValuesR.current;
        if(vals)setPats(ps=>ps.map(p=>{
          if(p.id!==activeIdR.current)return p;
          const params=(p.params||defaultStepParams()).map((sp,i)=>i===col?Object.assign({},sp,vals):sp);
          return Object.assign({},p,{params});
        }));
        setParamPopup(null);popupR.current=null;
      }
      if(g.state==="pending"||g.state==="paint"||g.state==="popup-idle"){
        g.state="shift";setShifting(true);
        // Anchor shift to this (second) pointer's position and capture it
        g.startX=e.clientX;g.startY=e.clientY;g.appliedDX=0;g.appliedDY=0;
        g.shiftPointerID=e.pointerId;
        gridRef.current&&gridRef.current.setPointerCapture(e.pointerId);
        const pat=patsR.current.find(p=>p.id===activeIdR.current);
        g.baseGrid=pat?pat.grid.map(r=>[...r]):null;
        g.baseParams=pat?(pat.params||defaultStepParams()).map(s=>({...s})):null;
      }
      return;
    }

    // Compute cell from physical coordinates — most reliable on mobile
    // (elementFromPoint and e.target both fail when note rects intercept)
    const gridEl=gridRef.current;
    let r=null,c=null,hasCell=false;
    if(gridEl){
      const rect=gridEl.getBoundingClientRect();
      const relY=e.clientY-rect.top, relX=e.clientX-rect.left;
      const ri=Math.floor(relY/(rect.height/ROWS));
      const ci=Math.floor(relX/(rect.width/COLS));
      if(ri>=0&&ri<ROWS&&ci>=0&&ci<COLS){r=ri;c=ci;hasCell=true;}
    }
    const pat=patsR.current.find(p=>p.id===activeIdR.current);
    const isOnNote=hasCell&&pat&&pat.grid[r]&&pat.grid[r][c];

    // Popup is sticky — dismiss if empty space AND outside arm reach; otherwise re-engage
    if(popupR.current){
      const pr=popupR.current;
      // Dismiss if dragging far from popup origin
      const distFromOrigin=Math.sqrt((e.clientX-pr.originX)**2+(e.clientY-pr.originY)**2);
      if(!isOnNote&&distFromOrigin>160){
        g.state="pending-dismiss";g.startX=e.clientX;g.startY=e.clientY;
        gridRef.current&&gridRef.current.setPointerCapture(e.pointerId);
        return;
      }
      g.state="popup";
      gridRef.current&&gridRef.current.setPointerCapture(e.pointerId);
      return;
    }

    g.state="pending";g.startX=e.clientX;g.startY=e.clientY;g.appliedDX=0;g.appliedDY=0;
    g.baseGrid=pat?pat.grid.map(r=>[...r]):null;
    // Record initial cell and whether it had a note (for paint mode)
    g.paintStartCell=hasCell&&!isNaN(r)&&!isNaN(c)?{r,c,wasOn:!!(pat&&pat.grid[r]&&pat.grid[r][c])}:null;
    if(gridRef.current){
      const c0=gridRef.current.querySelector('[data-col="0"]'),c1=gridRef.current.querySelector('[data-col="1"]');
      if(c0&&c1){const px=c1.getBoundingClientRect().left-c0.getBoundingClientRect().left;if(px>2)g.cellPx=px;}
    }
    gridRef.current&&gridRef.current.setPointerCapture(e.pointerId);

    // Start long press timer on an ON note
    if(isOnNote){
      const gridEl2=gridRef.current;
      const rect=gridEl2?gridEl2.getBoundingClientRect():null;
      const ox=rect?rect.left+rect.width/COLS*(c+0.5):e.clientX;
      const oy=rect?rect.top+rect.height/ROWS*(r+0.5):e.clientY;
      const baseVals=Object.assign({},((pat.params&&pat.params[c])||defaultStepParams()[0]));
      g.longPressCell={r,c,ox,oy,baseVals};
      longPressR.current=setTimeout(()=>{
        if(g.state!=="pending")return;
        openParamPopup(c,ox,oy,baseVals);
      },320);
    }
  },[]);

  // Shared popup-open logic — called by both long press and right-click
  const commitAndClose=useCallback(()=>{
    const pr=popupR.current;
    if(!pr)return;
    const {col}=pr;
    const vals=paramPopupValuesR.current;
    if(vals&&col!=null)setPats(ps=>ps.map(p=>{
      if(p.id!==activeIdR.current)return p;
      const params=(p.params||defaultStepParams()).map((sp,i)=>i===col?Object.assign({},sp,vals):sp);
      return Object.assign({},p,{params});
    }));
    setParamPopup(null);popupR.current=null;
    gesture.current.state="idle";
  },[]);

  const openParamPopup=useCallback((c,ox,oy,baseVals)=>{
    const g=gesture.current;
    g.state="popup";
    popupR.current={col:c,originX:ox,originY:oy,baseValues:baseVals};
    setParamPopup({col:c,x:ox,y:oy,activeArm:null,values:{...baseVals}});
  },[]);

  const handleGridContextMenu=useCallback(e=>{
    e.preventDefault();
    const gridEl=gridRef.current;if(!gridEl)return;
    const rect=gridEl.getBoundingClientRect();
    if(e.clientX<rect.left||e.clientX>rect.right||e.clientY<rect.top||e.clientY>rect.bottom)return;
    const r=Math.floor((e.clientY-rect.top)/(rect.height/ROWS));
    const c=Math.floor((e.clientX-rect.left)/(rect.width/COLS));
    if(r<0||r>=ROWS||c<0||c>=COLS)return;
    const pat=patsR.current.find(p=>p.id===activeIdR.current);
    if(!pat||!pat.grid[r]||!pat.grid[r][c])return;
    const ox=rect.left+rect.width/COLS*(c+0.5);
    const oy=rect.top+rect.height/ROWS*(r+0.5);
    const baseVals=Object.assign({},((pat.params&&pat.params[c])||defaultStepParams()[0]));
    clearTimeout(longPressR.current);
    openParamPopup(c,ox,oy,baseVals);
  },[openParamPopup]);

  const handleGridMove=useCallback(e=>{
    const g=gesture.current;
    if(g.state==="idle"||g.state==="pending-dismiss")return;
    const dx=e.clientX-g.startX,dy=e.clientY-g.startY;

    if(g.state==="popup"&&popupR.current){
      const pr=popupR.current;
      // For mouse (right-click popup): only update on drag with button held; touch always has buttons>0
      if(e.pointerType==='mouse'&&e.buttons===0)return;
      const fdx=e.clientX-pr.originX, fdy=e.clientY-pr.originY;
      const dist=Math.sqrt(fdx*fdx+fdy*fdy);
      if(dist<14){setParamPopup(p=>p?{...p,activeArm:null}:p);return;}
      const fingerAngle=Math.atan2(-fdy,fdx)*180/Math.PI;
      let bestArm=null,bestDiff=180;
      ((popupR.current?.adaptedArms)||PARAM_ARMS).forEach(arm=>{
        const diff=Math.abs(((fingerAngle-arm.angle)+540)%360-180);
        if(diff<bestDiff){bestDiff=diff;bestArm=arm;}
      });
      if(!bestArm)return;
      const armRad=bestArm.angle*Math.PI/180;
      const proj=fdx*Math.cos(armRad)+(-fdy)*Math.sin(armRad);
      const pct=Math.max(0,Math.min(1,proj/100));
      const newVal=Math.round(pct*(bestArm.max-bestArm.min)+bestArm.min);
      setParamPopup(p=>p?{...p,activeArm:bestArm.key,values:{...p.values,[bestArm.key]:newVal}}:p);
      return;
    }

    if(g.state==="pending"){
      if(Math.sqrt(dx*dx+dy*dy)>6){
        clearTimeout(longPressR.current);longPressR.current=null;
        g.state="paint";
        const sc=g.paintStartCell;
        g.paintedCells=new Set();
        g.tieRuns=new Map();
        // Direction determines mode: right=create/tie, left=erase
        g.paintMode=dx>=0?"create":"erase";
        const snapPat=patsR.current.find(p=>p.id===activeIdR.current);
        g.existingAtStart=new Set();
        if(snapPat)for(let ri=0;ri<ROWS;ri++)for(let ci=0;ci<COLS;ci++)if(snapPat.grid[ri][ci])g.existingAtStart.add(`${ri},${ci}`);

        if(sc){
          const key=`${sc.r},${sc.c}`;
          if(!g.paintedCells.has(key)){
            g.paintedCells.add(key);
            if(g.paintMode==="erase"){
              setPats(ps=>ps.map(p=>{
                if(p.id!==activeIdR.current)return p;
                const ng=p.grid.map(r=>[...r]);ng[sc.r][sc.c]=false;
                return Object.assign({},p,{grid:ng});
              }));
            } else {
              const isExisting=g.existingAtStart.has(key);
              if(isExisting){
                if(!g.tieRuns.has(sc.r))g.tieRuns.set(sc.r,new Set());
                g.tieRuns.get(sc.r).add(sc.c);
              }
              setPats(ps=>ps.map(p=>{
                if(p.id!==activeIdR.current)return p;
                const ng=p.grid.map(r=>[...r]);
                const np=(p.params||defaultStepParams()).map(s=>({...s}));
                const colWasEmpty=!p.grid.some(row=>row[sc.c]);
                if(!isExisting&&monoModeR.current)for(let ri=0;ri<ROWS;ri++)ng[ri][sc.c]=false;
                ng[sc.r][sc.c]=true;
                np[sc.c]=(!isExisting&&colWasEmpty)?{...defaultStepParams()[0],rhy:1}:{...np[sc.c],rhy:1};
                return Object.assign({},p,{grid:ng,params:np});
              }));
            }
          }
        }
      }
      return;
    }

    if(g.state==="paint"){
      const gridEl=gridRef.current;if(!gridEl)return;
      const rect=gridEl.getBoundingClientRect();
      if(e.clientX<=rect.left||e.clientX>=rect.right||e.clientY<=rect.top||e.clientY>=rect.bottom)return;
      const cr=Math.floor((e.clientY-rect.top)/(rect.height/ROWS));
      const cc=Math.floor((e.clientX-rect.left)/(rect.width/COLS));
      if(cr<0||cr>=ROWS||cc<0||cc>=COLS)return;
      const key=`${cr},${cc}`;
      if(g.paintedCells.has(key))return;
      g.paintedCells.add(key);
      if(g.paintMode==="erase"){
        setPats(ps=>ps.map(p=>{
          if(p.id!==activeIdR.current)return p;
          const ng=p.grid.map(r=>[...r]);ng[cr][cc]=false;
          return Object.assign({},p,{grid:ng});
        }));
      } else {
        // Right drag: tie existing notes, create new ones in empty cells
        const wasExisting=g.existingAtStart.has(key);
        if(wasExisting){
          if(!g.tieRuns.has(cr))g.tieRuns.set(cr,new Set());
          g.tieRuns.get(cr).add(cc);
          setPats(ps=>ps.map(p=>{
            if(p.id!==activeIdR.current)return p;
            const np=(p.params||defaultStepParams()).map(s=>({...s}));
            const runCols=Array.from(g.tieRuns.get(cr)).sort((a,b)=>a-b);
            runCols.forEach((col,i)=>{np[col]={...np[col],rhy:i===0?1:0};});
            return Object.assign({},p,{params:np});
          }));
        } else {
          setPats(ps=>ps.map(p=>{
            if(p.id!==activeIdR.current)return p;
            const ng=p.grid.map(r=>[...r]);
            const np=(p.params||defaultStepParams()).map(s=>({...s}));
            const colWasEmpty=!p.grid.some(row=>row[cc]);
            if(monoModeR.current)for(let ri=0;ri<ROWS;ri++)ng[ri][cc]=false;
            ng[cr][cc]=true;
            np[cc]=colWasEmpty?{...defaultStepParams()[0],rhy:1}:{...np[cc],rhy:1};
            return Object.assign({},p,{grid:ng,params:np});
          }));
        }
      }
      return;
    }

    if(g.state==="shift"&&g.baseGrid&&g.baseParams){
      if(e.pointerId!==g.shiftPointerID)return; // ignore first finger
      const ndx=Math.round(dx/g.cellPx),ndy=Math.round(dy/g.cellPx);
      if(ndx!==g.appliedDX||ndy!==g.appliedDY){
        g.appliedDX=ndx;g.appliedDY=ndy;
        const sh=Array.from({length:ROWS},(_,r)=>Array.from({length:COLS},(_,c)=>g.baseGrid[(r-ndy+ROWS)%ROWS][(c-ndx+COLS)%COLS]));
        const sp=Array.from({length:COLS},(_,c)=>g.baseParams[(c-ndx+COLS)%COLS]);
        setPats(ps=>ps.map(p=>p.id!==activeIdR.current?p:Object.assign({},p,{grid:sh,params:sp})));
      }
    }
  },[]);

  const handleGridUp=useCallback(e=>{
    pointerCountR.current=Math.max(0,pointerCountR.current-1);
    clearTimeout(longPressR.current);longPressR.current=null;
    const g=gesture.current;

    if(g.state==="paint"){
      g.state="idle";setShifting(false);
      return;
    }

    if(g.state==="pending-dismiss"){
      // Commit popup values then close
      if(popupR.current){
        const {col}=popupR.current;
        const vals=paramPopupValuesR.current;
        if(vals)setPats(ps=>ps.map(p=>{
          if(p.id!==activeIdR.current)return p;
          const params=(p.params||defaultStepParams()).map((sp,i)=>i===col?Object.assign({},sp,vals):sp);
          return Object.assign({},p,{params});
        }));
        setParamPopup(null);popupR.current=null;
      }
      g.state="idle";setShifting(false);
      return;
    }

    if(g.state==="popup"){
      // Sticky — commit current values but keep popup visible
      if(popupR.current){
        const {col}=popupR.current;
        const vals=paramPopupValuesR.current;
        if(vals)setPats(ps=>ps.map(p=>{
          if(p.id!==activeIdR.current)return p;
          const params=(p.params||defaultStepParams()).map((sp,i)=>i===col?Object.assign({},sp,vals):sp);
          return Object.assign({},p,{params});
        }));
      }
      setParamPopup(p=>p?{...p,activeArm:null}:p); // clear active arm highlight
      g.state="idle";
      return;
    }

    if(g.state==="pending"){
      // Tap: use paintStartCell which was recorded before pointer capture was set
      const sc=g.paintStartCell;
      if(sc&&!isNaN(sc.r)&&!isNaN(sc.c)){
        setPats(ps=>ps.map(p=>{
          if(p.id!==activeIdR.current)return p;
          const r=sc.r,c=sc.c;
          // Check if column was empty before this tap
          const colWasEmpty=!p.grid.some(row=>row[c]);
          const newGrid=p.grid.map((row,ri)=>{
            if(monoModeR.current){
              const wasOn=p.grid[r][c];
              return row.map((v,ci)=>ci===c?(ri===r?!wasOn:false):v);
            }
            return ri!==r?row:row.map((v,ci)=>ci===c?!v:v);
          });
          // Reset column params to defaults if we just added the first note
          const wasOn=p.grid[r][c];
          const np=(p.params||defaultStepParams()).map((sp,i)=>
            i===c&&!wasOn&&colWasEmpty?defaultStepParams()[0]:sp);
          return Object.assign({},p,{grid:newGrid,params:np});
        }));
      }
    }

    if(pointerCountR.current===0){g.state="idle";setShifting(false);}
  },[]);

  const paramPopupValuesR = useRef(null);
  useEffect(()=>{
    if(paramPopup) paramPopupValuesR.current=paramPopup.values;
    else paramPopupValuesR.current=null;
  },[paramPopup]);

  const clearRow=r=>setPats(ps=>ps.map(p=>p.id!==activeIdR.current?p:Object.assign({},p,{grid:p.grid.map((row,ri)=>ri===r?new Array(COLS).fill(false):row)})));
  const clearCol=c=>setPats(ps=>ps.map(p=>p.id!==activeIdR.current?p:Object.assign({},p,{grid:p.grid.map(row=>row.map((v,ci)=>ci===c?false:v))})));
  const addPat=()=>{if(pats.length>=8)return;const p=mkPat("ABCDEFGH"[pats.length]);setPats(ps=>[...ps,p]);setActiveId(p.id);};
  const dupPat=()=>{if(pats.length>=8)return;const src=pats.find(p=>p.id===activeId);if(!src)return;const p=Object.assign({},mkPat("ABCDEFGH"[pats.length]),{grid:src.grid.map(r=>[...r]),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s)),gridLen:src.gridLen??16});setPats(ps=>[...ps,p]);setActiveId(p.id);};
  const delPat=()=>{if(pats.length<=1)return;const rem=pats.filter(p=>p.id!==activeId);setPats(rem);setChain(c=>c.filter(pid=>pid!==activeId));setActiveId(rem[0].id);};
  const copyPat=()=>{const src=pats.find(p=>p.id===activeId);if(src)setClipboard({grid:src.grid.map(r=>[...r]),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s))});};
  const pastePat=()=>{if(!clipboard)return;setPats(ps=>ps.map(p=>p.id!==activeId?p:Object.assign({},p,{grid:clipboard.grid.map(r=>[...r]),params:clipboard.params.map(s=>Object.assign({},s))})));};
  const clearPat=()=>mutatePat(()=>mkGrid());

  // ID-targeted versions — used by pill context menu so activeId is never involved
  const dupPatId=(id)=>{if(pats.length>=8)return;const src=pats.find(p=>p.id===id);if(!src)return;const p=Object.assign({},mkPat("ABCDEFGH"[pats.length]),{grid:src.grid.map(r=>[...r]),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s)),gridLen:src.gridLen??16});setPats(ps=>[...ps,p]);setActiveId(p.id);};
  const delPatId=(id)=>{if(pats.length<=1)return;const rem=pats.filter(p=>p.id!==id);setPats(rem);setChain(c=>c.filter(pid=>pid!==id));setActiveId(a=>a===id?rem[0].id:a);};
  const copyPatId=(id)=>{const src=pats.find(p=>p.id===id);if(src)setClipboard({grid:src.grid.map(r=>[...r]),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s))});};
  const pastePatId=(id)=>{if(!clipboard)return;setPats(ps=>ps.map(p=>p.id!==id?p:Object.assign({},p,{grid:clipboard.grid.map(r=>[...r]),params:clipboard.params.map(s=>Object.assign({},s))})));};
  const clearPatId=(id)=>{setPats(ps=>ps.map(p=>p.id!==id?p:Object.assign({},p,{grid:mkGrid()})));};
  const randPatId=(id)=>{setPats(ps=>ps.map(p=>{if(p.id!==id)return p;const grid=monoMode?mkGrid():Array.from({length:ROWS},()=>Array.from({length:COLS},()=>Math.random()<.12));if(monoMode){for(let c=0;c<COLS;c++){const hits=[];for(let r=0;r<ROWS;r++)if(Math.random()<.12)hits.push(r);if(hits.length)grid[hits[Math.floor(Math.random()*hits.length)]][c]=true;}}return Object.assign({},p,{grid});}));};
  const randPat=()=>mutatePat(()=>{
    if(monoMode){
      // Generate poly-density grid then collapse each column to at most one note
      const grid=mkGrid();
      for(let c=0;c<COLS;c++){
        const hits=[];
        for(let r=0;r<ROWS;r++)if(Math.random()<.12)hits.push(r);
        if(hits.length)grid[hits[Math.floor(Math.random()*hits.length)]][c]=true;
      }
      return grid;
    }
    return Array.from({length:ROWS},()=>Array.from({length:COLS},()=>Math.random()<.12));
  });
  const setStepParam=(col,key,val)=>setPats(ps=>ps.map(p=>{
    if(p.id!==activeId)return p;
    const params=(p.params||defaultStepParams()).map((sp,i)=>i===col?Object.assign({},sp,{[key]:val}):sp);
    return Object.assign({},p,{params});
  }));
  const randStepLane=(key)=>{
    const lane=LANES.find(l=>l.key===key);if(!lane)return;
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeId)return p;
      const params=(p.params||defaultStepParams()).map(sp=>Object.assign({},sp,{[key]:Math.round(lane.min+Math.random()*(lane.max-lane.min))}));
      return Object.assign({},p,{params});
    }));
  };
  const randStepAll=()=>LANES.forEach(l=>randStepLane(l.key));
  const resetStepLane=(key)=>{
    const lane=LANES.find(l=>l.key===key);if(!lane)return;
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeId)return p;
      const params=(p.params||defaultStepParams()).map(sp=>Object.assign({},sp,{[key]:lane.def}));
      return Object.assign({},p,{params});
    }));
  };
  const resetStepAll=()=>setPats(ps=>ps.map(p=>p.id!==activeId?p:Object.assign({},p,{params:defaultStepParams()})));
  const removeFromChain=i=>setChain(c=>c.filter((_,idx)=>idx!==i));
  const moveSlot=(i,dir)=>{const j=i+dir;if(j<0||j>=chain.length)return;setChain(c=>{const n=[...c];[n[i],n[j]]=[n[j],n[i]];return n;});};

  // BPM drag scrubber
  const [bpmDragging, setBpmDragging] = useState(false);
  const bpmDragRef  = useRef(null);
  const bpmDragData = useRef({startY:0, startBpm:120});

  const bpmDraggingR = useRef(false);
  const handleBpmDown = useCallback(e=>{
    e.preventDefault();e.stopPropagation();
    bpmDragData.current = {startY: e.clientY, startBpm: bpmR.current};
    bpmDraggingR.current=true;setBpmDragging(true);
    bpmDragRef.current.setPointerCapture(e.pointerId);
  },[]);
  const handleBpmMove = useCallback(e=>{
    if(!bpmDraggingR.current)return;
    e.preventDefault();e.stopPropagation();
    const dy = e.clientY - bpmDragData.current.startY;
    setBpm(Math.max(40, Math.min(300, Math.round(bpmDragData.current.startBpm - dy/2))));
  },[]);
  const handleBpmUp = useCallback(()=>{bpmDraggingR.current=false;setBpmDragging(false);},[]);

  const [stDragging, setStDragging] = useState(false);
  const stDragRef  = useRef(null);
  const stDragData = useRef({startY:0, startSt:0});
  const stDraggingR = useRef(false);

  const handleStDown = useCallback(e=>{
    e.preventDefault();e.stopPropagation();
    stDragData.current = {startY: e.clientY, startSt: transpR.current};
    stDraggingR.current=true;setStDragging(true);
    stDragRef.current.setPointerCapture(e.pointerId);
  },[]);
  const handleStMove = useCallback(e=>{
    if(!stDraggingR.current)return;
    e.preventDefault();e.stopPropagation();
    const dy = e.clientY - stDragData.current.startY;
    setTranspose(Math.max(-24, Math.min(24, Math.round(stDragData.current.startSt - dy/6))));
  },[]);
  const handleStUp = useCallback(()=>{stDraggingR.current=false;setStDragging(false);},[]);

  const [swingDragging, setSwingDragging] = useState(false);
  const swingDragRef  = useRef(null);
  const swingDragData = useRef({startY:0, startSwing:0});
  const swingDraggingR = useRef(false);
  const handleSwingDown = useCallback(e=>{
    e.preventDefault();e.stopPropagation();
    swingDragData.current = {startY: e.clientY, startSwing: swingR.current};
    swingDraggingR.current=true;setSwingDragging(true);
    swingDragRef.current.setPointerCapture(e.pointerId);
  },[]);
  const handleSwingMove = useCallback(e=>{
    if(!swingDraggingR.current)return;
    e.preventDefault();e.stopPropagation();
    const dy = e.clientY - swingDragData.current.startY;
    setSwing(Math.max(0, Math.min(100, Math.round(swingDragData.current.startSwing - dy/3))));
  },[]);
  const handleSwingUp = useCallback(()=>{swingDraggingR.current=false;setSwingDragging(false);},[]);

  // Grid length slider (horizontal, below step bar)
  const lenSliderRef = useRef(null);
  const lenDragActive = useRef(false);
  const computeLen = useCallback(clientX=>{
    const el=lenSliderRef.current; if(!el)return;
    const rect=el.getBoundingClientRect();
    const pct=Math.max(0,Math.min(1,(clientX-rect.left)/rect.width));
    const len=Math.max(1,Math.round(pct*COLS));
    setPats(ps=>ps.map(p=>p.id===activeIdR.current?Object.assign({},p,{gridLen:len}):p));
  },[]);
  const handleLenDown = useCallback(e=>{
    e.stopPropagation();e.preventDefault();
    lenDragActive.current=true;
    e.currentTarget.setPointerCapture(e.pointerId);
    computeLen(e.clientX);
  },[computeLen]);
  const handleLenMove = useCallback(e=>{
    if(!lenDragActive.current)return;
    e.stopPropagation();computeLen(e.clientX);
  },[computeLen]);
  const handleLenUp = useCallback(()=>{lenDragActive.current=false;},[]);

  // ─── Chain drag helpers ────────────────────────────────────────────────────
  const getChainInsertIdx = useCallback((cx)=>{
    const strip = chainStripRef.current;
    if(!strip) return chainR.current.length;
    const rect = strip.getBoundingClientRect();
    const slots = strip.querySelectorAll('[data-chainslot]');
    if(!slots.length) return 0;
    for(let i=0;i<slots.length;i++){
      const sr = slots[i].getBoundingClientRect();
      if(cx < sr.left + sr.width/2) return i;
    }
    return slots.length;
  },[]);

  const isOverStrip = useCallback((cy)=>{
    const strip = chainStripRef.current;
    if(!strip) return false;
    const r = strip.getBoundingClientRect();
    return cy >= r.top - 20 && cy <= r.bottom + 20;
  },[]);

  const pillLongPressR = useRef(null);

  const startPillDrag = useCallback((e, patId)=>{
    if(e.button===2) return; // right-click handled by onContextMenu
    e.preventDefault(); e.stopPropagation();
    // Long press opens context menu
    pillLongPressR.current = setTimeout(()=>{
      pillLongPressR.current = null;
      chainDragR.current = null; setChainDrag(null);
      setPatMenu({id:patId, x:e.clientX, y:e.clientY});
    }, 320);
    const d = {type:'pill', id:patId, fromIdx:-1, x:e.clientX, y:e.clientY};
    chainDragR.current = d; setChainDrag({...d});
    e.currentTarget.setPointerCapture(e.pointerId);
  },[]);

  const handlePillContextMenu = useCallback((e, patId)=>{
    e.preventDefault(); e.stopPropagation();
    setPatMenu({id:patId, x:e.clientX, y:e.clientY});
  },[]);

  const startChainDrag = useCallback((e, idx)=>{
    e.preventDefault(); e.stopPropagation();
    const d = {type:'chain', id:chainR.current[idx], fromIdx:idx, x:e.clientX, y:e.clientY};
    chainDragR.current = d; setChainDrag({...d});
    e.currentTarget.setPointerCapture(e.pointerId);
  },[]);

  const onDragMove = useCallback((e)=>{
    if(!chainDragR.current) return;
    e.stopPropagation();
    // Cancel long press if dragging
    if(pillLongPressR.current){clearTimeout(pillLongPressR.current);pillLongPressR.current=null;}
    const d = {...chainDragR.current, x:e.clientX, y:e.clientY};
    chainDragR.current = d; setChainDrag({...d});
  },[]);

  const onDragUp = useCallback((e)=>{
    const d = chainDragR.current;
    if(!d){ setChainDrag(null); return; }
    const overStrip = isOverStrip(e.clientY);
    const insertIdx = getChainInsertIdx(e.clientX);
    if(overStrip){
      setChain(ch=>{
        const next = [...ch];
        if(d.type==='chain'){
          // reorder: remove from old position, insert at new
          const [removed] = next.splice(d.fromIdx, 1);
          const target = insertIdx > d.fromIdx ? Math.max(0,insertIdx-1) : insertIdx;
          next.splice(Math.min(target, next.length), 0, removed);
        } else {
          // new pill: insert at position
          if(next.length < 32) next.splice(Math.min(insertIdx, next.length), 0, d.id);
        }
        return next;
      });
    } else if(d.type==='chain'){
      // dragged a chain slot off the strip — remove it
      setChain(ch=>ch.filter((_,i)=>i!==d.fromIdx));
    }
    chainDragR.current = null; setChainDrag(null);
  },[isOverStrip, getChainInsertIdx]);

  const loopSec=chain.length?(chain.length*COLS/(bpm/60*4)).toFixed(1):"0.0";
  const stLabel=transpose===0?"0":transpose>0?"+"+transpose:String(transpose);

  return(
    <div style={S.root} onContextMenu={e=>e.preventDefault()} onDragStart={e=>e.preventDefault()}>
      <style>{CSS}</style>

      {/* Synth-panel param popup */}
      {paramPopup&&(()=>{
        const vw=window.innerWidth, vh=window.innerHeight;
        const W=260, H=220;
        const px=Math.max(10,Math.min(vw-W-10, paramPopup.x-W/2));
        const py=Math.max(10,Math.min(vh-H-10, paramPopup.y-H-16));
        return(
          <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:400,pointerEvents:"none"}} onPointerMove={handleGridMove}>
            <div style={{position:"absolute",left:px,top:py,width:W,
              background:"rgba(26,24,20,0.96)",backdropFilter:"blur(16px)",WebkitBackdropFilter:"blur(16px)",
              borderRadius:14,border:"1px solid rgba(200,185,165,0.15)",
              boxShadow:"0 12px 40px rgba(0,0,0,0.5)",
              padding:"10px 14px 12px",pointerEvents:"all"}}
              onPointerDown={e=>e.stopPropagation()}>
              {/* Header row */}
              <div style={{display:"flex",alignItems:"center",marginBottom:8}}>
                <span style={{fontSize:9,color:"rgba(210,195,175,0.4)",letterSpacing:2,flex:1}}>STEP {(popupR.current?.col??0)+1}</span>
                <div onClick={commitAndClose} style={{width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",color:"rgba(210,195,175,0.4)",fontSize:16,cursor:"pointer",borderRadius:11}}>×</div>
              </div>
              {/* Sliders */}
              {PARAM_ARMS.map(arm=>{
                const val=paramPopup.values?.[arm.key]??arm.min;
                const active=paramPopup.activeArm===arm.key;
                const pct=(val-arm.min)/(arm.max-arm.min);
                const displayVal=arm.key==="oct"?(val-2===0?"0":(val-2>0?"+":"")+(val-2))
                  :arm.key==="rhy"?("×"+Math.max(1,val)):arm.key==="dur"?(val>0?"+"+val+"%":val+"%")
                  :val;
                return(
                  <div key={arm.key} style={{marginBottom:8}}
                    onPointerDown={e=>{
                      e.stopPropagation();
                      const rect=e.currentTarget.getBoundingClientRect();
                      const newPct=Math.max(0,Math.min(1,(e.clientX-rect.left-8)/(rect.width-16)));
                      const newVal=arm.discrete
                        ?Math.round(newPct*(arm.max-arm.min)+arm.min)
                        :Math.round(newPct*(arm.max-arm.min)+arm.min);
                      setParamPopup(p=>p?{...p,activeArm:arm.key,values:{...p.values,[arm.key]:newVal}}:p);
                      e.currentTarget.setPointerCapture(e.pointerId);
                    }}
                    onPointerMove={e=>{
                      if(e.buttons===0)return;
                      const rect=e.currentTarget.getBoundingClientRect();
                      const newPct=Math.max(0,Math.min(1,(e.clientX-rect.left-8)/(rect.width-16)));
                      const newVal=Math.round(newPct*(arm.max-arm.min)+arm.min);
                      setParamPopup(p=>p?{...p,activeArm:arm.key,values:{...p.values,[arm.key]:newVal}}:p);
                    }}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline",marginBottom:3}}>
                      <span style={{fontSize:9,fontWeight:500,color:active?arm.color:arm.color+"88",letterSpacing:1}}>{arm.label}</span>
                      <span style={{fontSize:12,fontWeight:500,color:active?arm.color:arm.color+"99"}}>{displayVal}</span>
                    </div>
                    <div style={{height:6,background:"rgba(200,185,165,0.1)",borderRadius:3,position:"relative",cursor:"ew-resize"}}>
                      <div style={{position:"absolute",left:0,top:0,bottom:0,width:(pct*100)+"%",
                        background:active?arm.color:arm.color+"66",borderRadius:3,transition:"width .04s"}}/>
                      <div style={{position:"absolute",top:-3,bottom:-3,width:10,borderRadius:3,
                        background:active?arm.color:"rgba(200,185,165,0.6)",
                        left:`calc(${pct*100}% - 5px)`}}/>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })()}

      {/* Pattern pill context menu */}
      {patMenu&&(()=>{
        const pm=patMenu;
        const vw=window.innerWidth,vh=window.innerHeight;
        const W=200,H=160;
        const px=Math.max(8,Math.min(vw-W-8,pm.x-W/2));
        const py=Math.max(8,Math.min(vh-H-8,pm.y+12));
        const close=()=>setPatMenu(null);
        const act=(fn)=>{fn();close();};
        const targetId=pm.id;
        const isOnlyPat=pats.length<=1;
        return(
          <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:500}} onPointerDown={close} onClick={close}>
            <div style={{position:"absolute",left:px,top:py,width:W,
              background:"rgba(12,12,12,0.92)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",
              borderRadius:12,border:"1px solid rgba(255,255,255,0.1)",
              boxShadow:"0 8px 32px rgba(0,0,0,0.7)",overflow:"hidden",
              pointerEvents:"all"}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:1,background:"rgba(220,200,180,0.06)"}}>
                {[
                  ["RAND",  ()=>act(()=>randPatId(targetId))],
                  ["CLR",   ()=>act(()=>clearPatId(targetId))],
                  ["CPY",   ()=>act(()=>copyPatId(targetId))],
                  ["PST",   ()=>act(()=>pastePatId(targetId)), !clipboard],
                  ["DUP",   ()=>act(()=>dupPatId(targetId)),   pats.length>=8],
                  ["DEL",   ()=>act(()=>delPatId(targetId)),   isOnlyPat, true],
                ].map(([label,fn,disabled,danger])=>(
                  <button key={label} disabled={!!disabled}
                    style={{padding:"10px 0",background:"rgba(10,10,10,0.9)",border:"none",
                      color:disabled?"rgba(255,255,255,0.2)":danger?"rgba(196,122,122,0.9)":"rgba(255,255,255,0.8)",
                      fontSize:11,fontWeight:700,letterSpacing:1.5,cursor:disabled?"default":"pointer",
                      transition:"background .1s"}}
                    onMouseEnter={e=>{if(!disabled)e.currentTarget.style.background="rgba(255,255,255,0.08)";}}
                    onMouseLeave={e=>e.currentTarget.style.background="rgba(10,10,10,0.9)"}
                    onClick={disabled?undefined:fn}>{label}</button>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Chain drag ghost */}
      {chainDrag&&(
        <div style={Object.assign({},S.chainGhost,{left:chainDrag.x-18,top:chainDrag.y-18})}>
          {(()=>{const p=pats.find(p=>p.id===chainDrag.id);const pi=Math.max(0,pats.findIndex(p=>p.id===chainDrag.id));return <span style={{color:patCol(pi)}}>{p?p.name:"?"}</span>;})()}
        </div>
      )}

      {/* Swing drag overlay */}
      {swingDragging&&(
        <div style={S.bpmOverlay}>
          <div style={S.bpmOverlayNum}>{swing}</div>
          <div style={S.bpmOverlayLbl}>SWING</div>
          <div style={S.bpmOverlayHint}>↑ drag ↓</div>
        </div>
      )}
      {bpmDragging&&(
        <div style={S.bpmOverlay}>
          <div style={S.bpmOverlayNum}>{bpm}</div>
          <div style={S.bpmOverlayLbl}>BPM</div>
          <div style={S.bpmOverlayHint}>↑ drag ↓</div>
        </div>
      )}

      {/* ST drag overlay */}
      {stDragging&&(
        <div style={S.bpmOverlay}>
          <div style={S.bpmOverlayNum}>{stLabel}</div>
          <div style={S.bpmOverlayLbl}>SEMITONES</div>
          <div style={S.bpmOverlayHint}>↑ drag ↓</div>
        </div>
      )}


      {/* ── Layout ── */}
      {/* ── Desktop layout ── */}
      {!IS_MOBILE&&(
      <div style={{display:"flex",gap:20,height:"calc(100dvh - 52px)",alignItems:"stretch"}}>

        {/* ── LEFT COLUMN ── */}
        <div style={{width:280,flexShrink:0,minHeight:0,display:"flex",flexDirection:"column",gap:0,overflow:"hidden"}}>
          {/* Brand + widgets — desktop only */}
          {!IS_MOBILE&&(
            <>
              <div style={{...S.brand,marginBottom:16}}>TABULA</div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,marginBottom:14}}>
                <select style={{...S.sel,flex:"1 1 100%"}} value={scale} onChange={e=>setScale(e.target.value)}>
                  {Object.entries(SCALES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
                <div ref={bpmDragRef} style={{...S.bpmDragTarget,flex:1}} onPointerDown={handleBpmDown} onPointerMove={handleBpmMove} onPointerUp={handleBpmUp} onPointerCancel={handleBpmUp}>
                  <span style={S.widgetN}>{bpm}</span><span style={S.widgetU}>BPM</span>
                </div>
                <div ref={stDragRef} style={{...S.bpmDragTarget,flex:1}} onPointerDown={handleStDown} onPointerMove={handleStMove} onPointerUp={handleStUp} onPointerCancel={handleStUp}>
                  <span style={S.widgetN}>{stLabel}</span><span style={S.widgetU}>ST</span>
                </div>
                <div ref={swingDragRef} style={{...S.bpmDragTarget,flex:1}} onPointerDown={handleSwingDown} onPointerMove={handleSwingMove} onPointerUp={handleSwingUp} onPointerCancel={handleSwingUp}>
                  <span style={S.widgetN}>{swing}</span><span style={S.widgetU}>SWG</span>
                </div>
              </div>
            </>
          )}
          {/* Scrollable middle section — actions, speed, save/load */}
          {!IS_MOBILE&&(
            <div style={{flex:1,overflowY:"auto",scrollbarWidth:"none"}}>
              {/* Speed row */}
              <div style={S.speedRow}>
                {SPEED_OPTS.map(({label,mult})=>(
                  <button key={label} style={Object.assign({},S.speedBtn,speedMult===mult?S.speedBtnOn:{})}
                    onClick={()=>setSpeedMult(mult)}>{label}</button>
                ))}
              </div>
              {/* Save/load inline */}
              <div style={{marginBottom:10}}>
                <div style={S.menuSaveLabel}>SAVE / LOAD</div>
                {flash&&<div style={S.menuFlash}>{flash}</div>}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {SLOTS.map(slot=>{const has=!!slotData[slot];return(
                    <div key={slot} style={{display:"flex",flexDirection:"column",gap:3,alignItems:"center"}}>
                      <span style={{...S.menuSlotName}}>{slot}{has&&<span style={S.menuSlotDot}>●</span>}</span>
                      <button style={S.menuSlotBtn} onClick={()=>saveSlot(slot)}>SAVE</button>
                      <button style={Object.assign({},S.menuSlotBtn,has?S.menuSlotBtnLit:{})} onClick={()=>loadSlot(slot)} disabled={!has}>LOAD</button>
                    </div>
                  );})}
                </div>
              </div>
              {/* Share / Export / Import */}
              <div style={{marginBottom:10}}>
                <div style={S.menuSaveLabel}>SHARE</div>
                {shareFlash&&<div style={S.menuFlash}>{shareFlash}</div>}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={copyShareLink}>LINK</button>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={exportJSON}>EXPORT</button>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={()=>importRef.current?.click()}>IMPORT</button>
                </div>
                <input ref={importRef} type="file" accept=".json" style={{display:"none"}} onChange={handleImport}/>
              </div>
            </div>
          )}

          {/* Speed row */}
          <div style={S.speedRow}>
            {SPEED_OPTS.map(({label,mult})=>(
              <button key={label} style={Object.assign({},S.speedBtn,speedMult===mult?S.speedBtnOn:{})}
                onClick={()=>setSpeedMult(mult)}>{label}</button>
            ))}
          </div>


          {/* Transport — desktop only: pills + chain + buttons pinned to bottom */}
          {!IS_MOBILE&&(
            <>
              {/* Pattern pills — pinned above transport */}
              <div style={{...S.patRow, flexShrink:0, paddingBottom:6, borderTop:"1px solid rgba(255,255,255,0.06)", paddingTop:8, marginTop:4}}>
                {pats.map((p,i)=>{
                  const isA=p.id===activeId,isP=playing&&playId===p.id,col=patCol(i);
                  const isDragging=chainDrag&&chainDrag.type==='pill'&&chainDrag.id===p.id;
                  return(
                    <div key={p.id} style={Object.assign({},S.pill,{border:"1.5px solid "+col,background:isA?col:"transparent",color:isA?"#000":col,boxShadow:isDragging?"0 0 20px "+col:isP?"0 0 14px "+col+"88":"none",opacity:isDragging?0.5:1,touchAction:"none"})}
                      onClick={()=>setActiveId(p.id)}
                      onPointerDown={e=>startPillDrag(e,p.id)}
                      onPointerMove={onDragMove}
                      onPointerUp={e=>{if(pillLongPressR.current){clearTimeout(pillLongPressR.current);pillLongPressR.current=null;}onDragUp(e);}}
                      onPointerCancel={e=>{if(pillLongPressR.current){clearTimeout(pillLongPressR.current);pillLongPressR.current=null;}onDragUp(e);}}
                      onContextMenu={e=>handlePillContextMenu(e,p.id)}>
                      {isP&&<span className="pp">●</span>}{p.name}
                    </div>
                  );
                })}
                {pats.length<8&&<button style={S.newPill} onClick={addPat}>＋</button>}
              </div>
              {/* Chain strip with FOLLOW toggle */}
              {(()=>{
                const overStrip = chainDrag && isOverStrip(chainDrag.y);
                const insertIdx = chainDrag ? getChainInsertIdx(chainDrag.x) : -1;
                return (
                  <div style={{flexShrink:0}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                      <span style={{fontSize:IS_MOBILE?7:10,letterSpacing:1,color:"rgba(255,255,255,0.25)",fontWeight:700}}>SEQ</span>
                      <div style={{flex:1}}/>
                      <button style={Object.assign({},S.loopBtnBottom,{height:22,padding:"0 8px",fontSize:IS_MOBILE?7:9},followSeq?{border:"1px solid #7aaa96",color:"#7aaa96",background:"rgba(122,170,150,0.12)"}:{})} onClick={()=>setFollowSeq(f=>!f)}>FOLLOW</button>
                    </div>
                    <div ref={chainStripRef} style={Object.assign({},S.chainStrip,{marginTop:0}, overStrip?S.chainStripHot:{})}>
                      {chain.length===0&&!chainDrag&&(
                        <span style={S.chainStripEmpty}>drag patterns here to build a sequence</span>
                      )}
                      {chain.map((pid,i)=>{
                        const pi=Math.max(0,pats.findIndex(p=>p.id===pid));
                        const p=pats.find(p=>p.id===pid);
                        const col=patCol(pi);
                        const here=playing&&!loopMode&&i===cpos;
                        const isDragging=chainDrag&&chainDrag.type==='chain'&&chainDrag.fromIdx===i;
                        const showInsert=overStrip&&insertIdx===i;
                        return (
                          <React.Fragment key={i}>
                            {showInsert&&<div style={S.chainInsertLine}/>}
                            <div data-chainslot={i}
                              style={Object.assign({},S.chainChip,{borderColor:col,background:here?col:col+"18",color:here?"#000":col,opacity:isDragging?0.3:1,touchAction:"none"})}
                              onPointerDown={e=>startChainDrag(e,i)}
                              onPointerMove={onDragMove}
                              onPointerUp={onDragUp}
                              onPointerCancel={onDragUp}>
                              {p?p.name:"?"}
                            </div>
                          </React.Fragment>
                        );
                      })}
                      {overStrip&&insertIdx>=chain.length&&<div style={S.chainInsertLine}/>}
                    </div>
                  </div>
                );
              })()}
              {/* Transport: 3-row grid — VARY/REC/MUT8 left, ▶ center, MONO/LOOP right */}
              <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gridTemplateRows:"1fr 1fr 1fr",gap:8,marginTop:"auto",paddingTop:16,alignItems:"center"}}>
                <button style={Object.assign({},S.loopBtnBottom,{width:"100%"},varyMode?{border:"1px solid #c9a96e",color:"#c9a96e",background:"rgba(201,169,110,0.12)"}:{})} onClick={()=>setVaryMode(v=>!v)}>VARY</button>
                <button style={Object.assign({},S.playBtn,playing?S.playOn:{},{gridColumn:2,gridRow:"1/4",alignSelf:"center"})} onClick={startStop}>{playing?<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><rect x="1" y="1" width="9" height="9" rx="1.5"/></svg>:<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><polygon points="1.5,0.5 10.5,5.5 1.5,10.5"/></svg>}</button>
                <button style={Object.assign({},S.loopBtnBottom,{width:"100%"},monoMode?{border:"1px solid #9fb4c7",color:"#9fb4c7",background:"rgba(159,180,199,0.12)"}:{})} onClick={toggleMono}>MONO</button>
                <button style={Object.assign({},S.loopBtnBottom,{width:"100%"},recMode?{border:"1px solid #c47a7a",color:"#c47a7a",background:"rgba(196,122,122,0.15)",fontWeight:900}:{border:"1px solid rgba(255,77,77,0.4)",color:"rgba(196,122,122,0.6)"})} onClick={()=>setRecMode(r=>!r)}>
                  {recMode?"■ REC":"● REC"}
                </button>
                <button style={Object.assign({},S.loopBtnBottom,{width:"100%"},loopMode?S.loopOn:{})} onClick={()=>setLoopMode(l=>!l)}>LOOP</button>
                <button style={Object.assign({},S.loopBtnBottom,{width:"100%"})} onClick={mutatePat1}>MUT8</button>
                <div/>
              </div>
            </>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{flex:1,minWidth:0,minHeight:0,display:"grid",gridTemplateRows:"1fr auto",overflow:"hidden"}}>
          {page==="edit"&&(
            <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",overflow:"hidden"}}>
              <div style={{width:"min(100%, calc(100dvh - 120px))",aspectRatio:"1",display:"flex",flexDirection:"column",flexShrink:0}}>
              <div ref={gridRef} data-grid="1" style={Object.assign({},S.gridWrap,shifting?S.gridShifting:{},{flex:1,display:"flex",flexDirection:"column"})}
                onPointerDown={handleGridDown} onPointerMove={handleGridMove} onPointerUp={handleGridUp} onPointerCancel={handleGridUp}
                onContextMenu={handleGridContextMenu}>
                {Array.from({length:ROWS},(_,r)=>{
                  const fromBot=ROWS-1-r;
                  const isOct=fromBot%SCALE_SPAN===0;
                  const isFifth=!isOct&&fromBot%SCALE_SPAN===4;
                  return(
                  <div key={r} style={Object.assign({},S.gridRow,{background:isOct?"rgba(200,185,165,0.06)":isFifth?"rgba(160,190,170,0.03)":"transparent",position:"relative"})}>
                    {Array.from({length:COLS},(_,c)=>{
                      const isCol=playing&&playId===activeId&&c===step,isQ=c%4===0;
                      const on=activePat?activePat.grid[r][c]:false;
                      const inactive=c>=gridLen;
                      return(<div key={c} data-row={r} data-col={c} style={Object.assign({},S.cell,{
                        background:inactive?"rgba(220,200,180,0.008)":isCol?"rgba(220,200,180,0.09)":isQ?"rgba(220,200,180,0.035)":"rgba(220,200,180,0.015)",
                        outline:isQ&&!on&&!inactive?"1px solid rgba(255,255,255,0.06)":"none",outlineOffset:"-1px",
                      })}/>);
                    })}
                    {(()=>{
                      const rects=[];let ci=0;
                      while(ci<COLS){
                        const on=activePat?activePat.grid[r][ci]:false;
                        if(on){
                          const p=activePat?.params?.[ci];
                          const rhy=p?Math.round(p.rhy??1):1;
                          if(rhy===0){ci++;continue;}
                          let span=1,nc=ci+1;
                          while(nc<COLS&&activePat?.grid[r][nc]){
                            const np2=activePat?.params?.[nc];
                            if(np2&&Math.round(np2.rhy??1)===0){span++;nc++;}else break;
                          }
                          const vel=p?(p.vel??100):100;
                          const b=0.35+(vel/127)*0.65;
                          const inactive=ci>=gridLen;
                          const bright=inactive?`rgba(220,200,180,0.12)`:`rgba(230,215,195,${b})`;
                          const glow=inactive?"none":`0 0 4px rgba(230,215,195,${b*0.5}),0 0 10px rgba(230,215,195,${b*0.22})`;
                          const isActive=!inactive&&playing&&playId===activeId&&step>=ci&&step<ci+span;
                          const L=`calc(${ci/COLS}*(100% + 2px))`;
                          const W=`calc(${span/COLS}*(100% + 2px) - 2px)`;
                          rects.push(
                            <div key={ci} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:span>1?3:2,
                              background:isActive?bright:inactive?bright:`rgba(230,215,195,${b*0.75})`,
                              boxShadow:isActive?glow:"none",
                              pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",gap:"2px",padding:"0 2px"}}>
                              {!inactive&&rhy===2&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}
                              {!inactive&&rhy===3&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}
                              {!inactive&&rhy>=4&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1px",width:"80%",height:"80%"}}>
                                {[0,1,2,3].map(i=><div key={i} style={{borderRadius:1,background:"rgba(0,0,0,0.25)"}}/>)}
                              </div>}
                            </div>
                          );
                          ci+=span;
                        } else { ci++; }
                      }
                      return rects;
                    })()}
                  </div>
                );})}
              </div>
              <div style={S.stepBar}>
                {Array.from({length:COLS},(_,c)=>{
                  const isA=playing&&c===step,isQ=c%4===0,inactive=c>=gridLen;
                  return(
                  <div key={c} style={S.stepColWrap}>
                    <div style={Object.assign({},S.stepDot,{
                      background:inactive?"rgba(220,200,180,0.06)":isA?"rgba(232,220,205,0.9)":isQ?"rgba(210,195,175,0.3)":"rgba(255,255,255,0.1)",
                      transform:inactive?"scaleY(0.2)":isA?"scaleY(1)":isQ?"scaleY(0.6)":"scaleY(0.3)"})}/>
                  </div>
                );})}
              </div>
              <div ref={lenSliderRef} style={S.lenSlider}
                onPointerDown={handleLenDown} onPointerMove={handleLenMove}
                onPointerUp={handleLenUp} onPointerCancel={handleLenUp}>
                <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${(gridLen/COLS)*100}%`,background:"rgba(210,195,175,0.15)",borderRadius:"3px 0 0 3px",transition:"width .05s"}}/>
                <div style={{position:"absolute",right:0,top:0,bottom:0,width:`${((COLS-gridLen)/COLS)*100}%`,background:"rgba(220,200,180,0.035)",borderRadius:"0 3px 3px 0"}}/>
                <div style={{position:"absolute",top:IS_MOBILE?-3:-5,bottom:IS_MOBILE?-3:-5,width:IS_MOBILE?3:5,left:`calc(${(gridLen/COLS)*100}% - ${IS_MOBILE?1:2}px)`,background:"rgba(255,255,255,0.8)",borderRadius:2,boxShadow:"0 0 6px rgba(255,255,255,0.4)"}}/>
                <span style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",fontSize:7,color:"rgba(210,195,175,0.3)",letterSpacing:1,pointerEvents:"none"}}>{gridLen}</span>
              </div>
              </div>
            </div>
          )}

          {/* Desktop: STEP/SOUND content + tabs pinned to bottom */}
          {!IS_MOBILE&&(
            <>
              {/* STEP content fills space above tabs */}
              {page==="step"&&(
                <div style={{...S.stepPage, height:"calc(100dvh - 110px)", minHeight:0, overflowY:"scroll", paddingBottom:40, paddingLeft:4, paddingRight:4}}>
                  <div style={S.stepPageHdr}>
                    <div style={S.stepPagePat}>{activePat?.name||""}</div>
                    <div style={{flex:1}}/>
                  </div>
                  {LANES.map(lane=>{
                    const vals=(activePat?(activePat.params||defaultStepParams()):defaultStepParams()).map(sp=>sp[lane.key]??lane.def);
                    const colHasNote=Array.from({length:COLS},(_,c)=>!!(activePat&&Array.from({length:ROWS},(_,r)=>activePat.grid[r][c]).some(Boolean)));
                    const curVal=playing&&playId===activeId&&step>=0?vals[step]:null;
                    const liveLabel=curVal==null?null:lane.key==="oct"?(curVal-2>0?"+":(curVal-2<0?"":""))+String(curVal-2)+"oct":lane.key==="rhy"?("×"+Math.max(1,curVal)):lane.key==="dur"?(curVal>0?"+"+curVal+"%":curVal+"%"):String(curVal);
                    return(
                      <div key={lane.key} style={S.stepLaneSection}>
                        <div style={S.stepLaneHdr}>
                          <div style={Object.assign({},S.stepLaneName,{color:lane.color})}>{lane.label}</div>
                          {liveLabel&&<div style={Object.assign({},S.stepLiveVal,{color:lane.color})}>{liveLabel}</div>}
                          <div style={{flex:1}}/>
                          <button style={Object.assign({},S.stepLaneBtn,{borderColor:lane.color+"33",color:lane.color+"99"})} onClick={()=>resetStepLane(lane.key)}>RST</button>
                          <button style={Object.assign({},S.stepLaneBtn,{borderColor:lane.color+"55",color:lane.color})} onClick={()=>randStepLane(lane.key)}>RAND</button>
                        </div>
                        <StepLane lane={lane} values={vals} colHasNote={colHasNote}
                          activeStep={playing&&playId===activeId?step:-1}
                          onChange={(col,val)=>setStepParam(col,lane.key,val)}
                          tall/>
                      </div>
                    );
                  })}
                  <div style={S.stepVaryDivider}/>
                  <SynthSection title="RHYTHM VARY / MUT8" accent="#c4967a">
                    <div style={S.threeGrid}>
                      <KnobSlider label="DROP"  value={vDropRate}  min={0} max={60} onChange={setVDropRate}  display={vDropRate+"%"}    accent="#c4967a"/>
                      <KnobSlider label="SHIFT" value={vShiftRate} min={0} max={60} onChange={setVShiftRate} display={vShiftRate+"%"}   accent="#c4967a"/>
                      <KnobSlider label="RANGE" value={vShiftRange}min={1} max={8}  onChange={setVShiftRange}display={vShiftRange+"st"} accent="#c4967a"/>
                    </div>
                  </SynthSection>
                  <SynthSection title="MELODY VARY / MUT8" accent="#b5a0c4">
                    <div style={S.threeGrid}>
                      <KnobSlider label="PITCH" value={vPitchRate} min={0} max={60} onChange={setVPitchRate} display={vPitchRate+"%"}   accent="#b5a0c4"/>
                      <KnobSlider label="RANGE" value={vPitchRange}min={1} max={12} onChange={setVPitchRange}display={vPitchRange+"st"} accent="#b5a0c4"/>
                      <KnobSlider label="GHOST" value={vGhostRate} min={0} max={60} onChange={setVGhostRate} display={vGhostRate+"%"}   accent="#b5a0c4"/>
                    </div>
                  </SynthSection>
                  <SynthSection title="STEP VARY / MUT8" accent="#9fb4c7">
                    <div style={S.threeGrid}>
                      <KnobSlider label="VEL" value={vVelJitter}  min={0} max={100} onChange={setVVelJitter}  display={vVelJitter+"%"}  accent="#9fb4c7"/>
                      <KnobSlider label="CUT" value={vCutJitter}  min={0} max={100} onChange={setVCutJitter}  display={vCutJitter+"%"}  accent="#9fb4c7"/>
                      <KnobSlider label="DLY" value={vDlyJitter}  min={0} max={100} onChange={setVDlyJitter}  display={vDlyJitter+"%"}  accent="#9fb4c7"/>
                      <KnobSlider label="RHY" value={vRhyJitter}  min={0} max={100} onChange={setVRhyJitter}  display={vRhyJitter+"%"}  accent="#9fb4c7"/>
                      <KnobSlider label="OCT" value={vOctJitter}  min={0} max={100} onChange={setVOctJitter}  display={vOctJitter+"%"}  accent="#9fb4c7"/>
                      <KnobSlider label="GLIDE" value={vGlideJitter} min={0} max={100} onChange={setVGlideJitter} display={vGlideJitter+"%"} accent="#9fb4c7"/>
                    </div>
                  </SynthSection>
                </div>
              )}
              {/* SOUND content in right column */}
              {page==="sound"&&(
                <div style={{...S.soundPage, height:"calc(100dvh - 110px)", minHeight:0, overflowY:"scroll", paddingBottom:40, paddingLeft:4, paddingRight:4}}>
                  <SynthSection title="OSCILLATOR" accent={C_OSC}>
                    <div style={S.wfRow}>
                      {WAVEFORMS.map((w,i)=>(
                        <button key={w} style={Object.assign({},S.wfBtn,{borderColor:C_OSC+(waveform===w?"":"22"),color:waveform===w?C_OSC:"rgba(210,195,175,0.35)",background:waveform===w?C_OSC+"14":"transparent"})} onClick={()=>setWaveform(w)}>
                          {WF_LABELS[i]}
                        </button>
                      ))}
                    </div>
                    <div style={S.threeGrid}>
                      <KnobSlider label="DETUNE" value={detune} min={0} max={50} onChange={setDetune} display={detune+"¢"} accent={C_OSC}/>
                    </div>
                  </SynthSection>
                  <SynthSection title="ENV" accent={C_ENV}>
                    <div style={S.threeGrid}>
                      <KnobSlider label="ATK" value={attack}  min={1}  max={2000} onChange={setAttack}  display={attack+"ms"}  accent={C_ENV}/>
                      <KnobSlider label="DEC" value={decay}   min={10} max={4000} onChange={setDecay}   display={decay+"ms"}   accent={C_ENV}/>
                      <KnobSlider label="SUS" value={sustain} min={0}  max={100}  onChange={setSustain} display={sustain+"%"}  accent={C_ENV}/>
                    </div>
                  </SynthSection>
                  <SynthSection title="FILTER" accent={C_FILT}>
                    <div style={S.threeGrid}>
                      <KnobSlider label="CUT" value={vcfCutoff}    min={0} max={100} onChange={setVcfCutoff}    display={vcfLbl(vcfCutoff)} accent={C_FILT}/>
                      <KnobSlider label="RES" value={vcfRes}       min={0} max={100} onChange={setVcfRes}       display={vcfRes+"%"}        accent={C_FILT}/>
                      <KnobSlider label="ENV" value={filterEnvAmt} min={0} max={100} onChange={setFilterEnvAmt} display={filterEnvAmt+"%"} accent={C_FILT}/>
                    </div>
                  </SynthSection>
                  <SynthSection title="DELAY" accent={C_DLY}>
                    <div style={S.threeGrid}>
                      <KnobSlider label="TIME" value={dlyIdx}    min={0} max={DLY_NOTES.length-1} onChange={setDlyIdx}    display={DLY_NOTES[dlyIdx].label} accent={C_DLY} steps={DLY_NOTES.length}/>
                      <KnobSlider label="SEND" value={dlyWetPct} min={0} max={100}                onChange={setDlyWetPct} display={dlyWetPct+"%"}            accent={C_DLY}/>
                      <KnobSlider label="FDBK" value={dlyFbPct}  min={0} max={95}                 onChange={setDlyFbPct}  display={dlyFbPct+"%"}             accent={C_DLY}/>
                      <KnobSlider label="HP"   value={dlyHpVal}  min={0} max={100}                onChange={setDlyHpVal}  display={hpLbl(dlyHpVal)}             accent={C_DLY}/>
                      <KnobSlider label="LP"   value={dlyLpVal}  min={0} max={100}                onChange={setDlyLpVal}  display={lpLbl(dlyLpVal)}             accent={C_DLY}/>
                    </div>
                  </SynthSection>
                </div>
              )}
              {/* Tabs — always at bottom, marginTop:auto pushes them down */}
              <div style={{...S.tabs, flexShrink:0, paddingTop:8}}>
                {[["edit","EDIT"],["step","STEP"],["sound","SOUND"]].map(([p,lbl])=>(
                  <button key={p} style={Object.assign({},S.tab,page===p?S.tabOn:{})} onClick={()=>setPage(p)}>{lbl}</button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      )} {/* end !IS_MOBILE desktop layout */}

      {/* ══ MOBILE LAYOUT ══ */}
      {IS_MOBILE&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,display:"flex",flexDirection:"column",background:"#1a1814",overflow:"hidden"}}>

          {/* ── TOP HANDLE ── */}
          <div style={{height:52,flexShrink:0,display:"flex",alignItems:"center",padding:"0 14px",gap:10,borderBottom:"1px solid rgba(255,255,255,0.07)",zIndex:10,touchAction:"none"}}
            onClick={()=>{setTopTrayOpen(t=>!t);setBottomTrayOpen(false);}}>
            <div style={{fontFamily:"'DM Sans',sans-serif",fontSize:15,fontWeight:300,letterSpacing:4,background:"linear-gradient(135deg,#c4a882,#9bbfaa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>TABULA</div>
            <div style={{flex:1}}/>
            <span style={{fontSize:10,color:"rgba(210,195,175,0.35)",letterSpacing:1}}>{SCALES[scale]?.label?.slice(0,5)}</span>
            <span style={{fontSize:15,fontWeight:700,color:"rgba(255,255,255,0.85)"}}>{bpm}</span>
            <span style={{fontSize:9,color:"rgba(210,195,175,0.3)",letterSpacing:1}}>BPM</span>
            {transpose!==0&&<><span style={{fontSize:15,fontWeight:700,color:"rgba(255,255,255,0.85)"}}>{stLabel}</span><span style={{fontSize:9,color:"rgba(210,195,175,0.3)"}}>ST</span></>}
            <span style={{fontSize:18,color:"rgba(210,195,175,0.3)",lineHeight:1,transition:"transform .2s",display:"inline-block",transform:topTrayOpen?"rotate(180deg)":"none"}}>⌄</span>
          </div>

          {/* ── CONTENT AREA ── */}
          <div style={{flex:1,minHeight:0,overflow:"hidden",position:"relative"}}>
            {page==="edit"&&(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:4}}>
                <div style={{width:"min(100%,calc(100dvh - 174px))",aspectRatio:"1",display:"flex",flexDirection:"column",flexShrink:0}}>
                  <div ref={gridRef} data-grid="1" style={Object.assign({},S.gridWrap,shifting?S.gridShifting:{},{flex:1,display:"flex",flexDirection:"column"})}
                    onPointerDown={handleGridDown} onPointerMove={handleGridMove} onPointerUp={handleGridUp} onPointerCancel={handleGridUp}
                    onContextMenu={handleGridContextMenu}>
                    {Array.from({length:ROWS},(_,r)=>{
                      const fromBot=ROWS-1-r;const isOct=fromBot%SCALE_SPAN===0;const isFifth=!isOct&&fromBot%SCALE_SPAN===4;
                      return(<div key={r} style={Object.assign({},S.gridRow,{background:isOct?"rgba(200,185,165,0.06)":isFifth?"rgba(160,190,170,0.03)":"transparent",position:"relative"})}>
                        {Array.from({length:COLS},(_,c)=>{
                          const isCol=playing&&playId===activeId&&c===step,isQ=c%4===0;
                          const on=activePat?activePat.grid[r][c]:false;const inactive=c>=gridLen;
                          return(<div key={c} data-row={r} data-col={c} style={Object.assign({},S.cell,{aspectRatio:"1",
                            background:inactive?"rgba(220,200,180,0.008)":isCol?"rgba(220,200,180,0.09)":isQ?"rgba(220,200,180,0.035)":"rgba(220,200,180,0.015)",
                            outline:isQ&&!on&&!inactive?"1px solid rgba(255,255,255,0.06)":"none",outlineOffset:"-1px"})}/>);
                        })}
                        {(()=>{const rects=[];let ci=0;while(ci<COLS){const on=activePat?activePat.grid[r][ci]:false;if(on){const p=activePat?.params?.[ci];const rhy=p?Math.round(p.rhy??1):1;let span=1,nc=ci+1;const vel=p?(p.vel??100):100;const b=0.35+(vel/127)*0.65;const inactive=ci>=gridLen;const bright=inactive?`rgba(220,200,180,0.12)`:`rgba(230,215,195,${b})`;const glow=inactive?"none":`0 0 4px rgba(230,215,195,${b*0.5}),0 0 10px rgba(230,215,195,${b*0.22})`;const isActive=!inactive&&playing&&playId===activeId&&step>=ci&&step<ci+span;const L=`calc(${ci/COLS}*(100% + 2px))`;const W=`calc(${span/COLS}*(100% + 2px) - 2px)`;rects.push(<div key={ci} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:span>1?3:2,background:isActive?bright:inactive?bright:`rgba(230,215,195,${b*0.75})`,boxShadow:isActive?glow:"none",pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden",gap:"2px",padding:"0 2px"}}>{!inactive&&rhy===2&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}{!inactive&&rhy===3&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}{!inactive&&rhy>=4&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1px",width:"80%",height:"80%"}}>{[0,1,2,3].map(i=><div key={i} style={{borderRadius:1,background:"rgba(0,0,0,0.25)"}}/>)}</div>}</div>);ci+=span;}else{ci++;}}return rects;})()}
                      </div>);
                    })}
                  </div>
                  <div style={S.stepBar}>{Array.from({length:COLS},(_,c)=>{const isA=playing&&c===step,isQ=c%4===0,inactive=c>=gridLen;return(<div key={c} style={S.stepColWrap}><div style={Object.assign({},S.stepDot,{background:inactive?"rgba(220,200,180,0.06)":isA?"rgba(232,220,205,0.9)":isQ?"rgba(210,195,175,0.3)":"rgba(255,255,255,0.1)",transform:inactive?"scaleY(0.2)":isA?"scaleY(1)":isQ?"scaleY(0.6)":"scaleY(0.3)"})}/></div>);})}</div>
                  <div ref={lenSliderRef} style={S.lenSlider} onPointerDown={handleLenDown} onPointerMove={handleLenMove} onPointerUp={handleLenUp} onPointerCancel={handleLenUp}>
                    <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${(gridLen/COLS)*100}%`,background:"rgba(210,195,175,0.15)",borderRadius:"3px 0 0 3px"}}/>
                    <div style={{position:"absolute",right:0,top:0,bottom:0,width:`${((COLS-gridLen)/COLS)*100}%`,background:"rgba(220,200,180,0.035)",borderRadius:"0 3px 3px 0"}}/>
                    <div style={{position:"absolute",top:-3,bottom:-3,width:3,left:`calc(${(gridLen/COLS)*100}% - 1px)`,background:"rgba(255,255,255,0.8)",borderRadius:2,boxShadow:"0 0 6px rgba(255,255,255,0.4)"}}/>
                    <span style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",fontSize:7,color:"rgba(210,195,175,0.3)",pointerEvents:"none"}}>{gridLen}</span>
                  </div>
                </div>
              </div>
            )}
            {page==="step"&&(
              <div style={{height:"100%",overflowY:"scroll",padding:"12px 12px 20px"}}>
                <div style={S.stepPageHdr}><div style={S.stepPagePat}>{activePat?.name||""}</div></div>
                {LANES.map(lane=>{
                  const vals=(activePat?(activePat.params||defaultStepParams()):defaultStepParams()).map(sp=>sp[lane.key]??lane.def);
                  const colHasNote=Array.from({length:COLS},(_,c)=>!!(activePat&&Array.from({length:ROWS},(_,r)=>activePat.grid[r][c]).some(Boolean)));
                  const curVal=playing&&playId===activeId&&step>=0?vals[step]:null;
                  const liveLabel=curVal==null?null:lane.key==="oct"?(curVal-2>0?"+":(curVal-2<0?"":""))+String(curVal-2)+"oct":lane.key==="rhy"?("×"+Math.max(1,curVal)):lane.key==="dur"?(curVal>0?"+"+curVal+"%":curVal+"%"):String(curVal);
                  return(<div key={lane.key} style={S.stepLaneSection}><div style={S.stepLaneHdr}><div style={Object.assign({},S.stepLaneName,{color:lane.color})}>{lane.label}</div>{liveLabel&&<div style={Object.assign({},S.stepLiveVal,{color:lane.color})}>{liveLabel}</div>}<div style={{flex:1}}/><button style={Object.assign({},S.stepLaneBtn,{borderColor:lane.color+"33",color:lane.color+"99"})} onClick={()=>resetStepLane(lane.key)}>RST</button><button style={Object.assign({},S.stepLaneBtn,{borderColor:lane.color+"55",color:lane.color})} onClick={()=>randStepLane(lane.key)}>RAND</button></div><StepLane lane={lane} values={vals} colHasNote={colHasNote} activeStep={playing&&playId===activeId?step:-1} onChange={(col,val)=>setStepParam(col,lane.key,val)} tall/></div>);
                })}
                <div style={S.stepVaryDivider}/>
                <SynthSection title="RHYTHM VARY / MUT8" accent="#c4967a"><div style={S.threeGrid}><KnobSlider label="DROP" value={vDropRate} min={0} max={60} onChange={setVDropRate} display={vDropRate+"%"} accent="#c4967a"/><KnobSlider label="SHIFT" value={vShiftRate} min={0} max={60} onChange={setVShiftRate} display={vShiftRate+"%"} accent="#c4967a"/><KnobSlider label="RANGE" value={vShiftRange} min={1} max={8} onChange={setVShiftRange} display={vShiftRange+"st"} accent="#c4967a"/></div></SynthSection>
                <SynthSection title="MELODY VARY / MUT8" accent="#b5a0c4"><div style={S.threeGrid}><KnobSlider label="PITCH" value={vPitchRate} min={0} max={60} onChange={setVPitchRate} display={vPitchRate+"%"} accent="#b5a0c4"/><KnobSlider label="RANGE" value={vPitchRange} min={1} max={12} onChange={setVPitchRange} display={vPitchRange+"st"} accent="#b5a0c4"/><KnobSlider label="GHOST" value={vGhostRate} min={0} max={60} onChange={setVGhostRate} display={vGhostRate+"%"} accent="#b5a0c4"/></div></SynthSection>
                <SynthSection title="STEP VARY / MUT8" accent="#9fb4c7"><div style={S.threeGrid}><KnobSlider label="VEL" value={vVelJitter} min={0} max={100} onChange={setVVelJitter} display={vVelJitter+"%"} accent="#9fb4c7"/><KnobSlider label="CUT" value={vCutJitter} min={0} max={100} onChange={setVCutJitter} display={vCutJitter+"%"} accent="#9fb4c7"/><KnobSlider label="DLY" value={vDlyJitter} min={0} max={100} onChange={setVDlyJitter} display={vDlyJitter+"%"} accent="#9fb4c7"/><KnobSlider label="RHY" value={vRhyJitter} min={0} max={100} onChange={setVRhyJitter} display={vRhyJitter+"%"} accent="#9fb4c7"/><KnobSlider label="OCT" value={vOctJitter} min={0} max={100} onChange={setVOctJitter} display={vOctJitter+"%"} accent="#9fb4c7"/><KnobSlider label="GLIDE" value={vGlideJitter} min={0} max={100} onChange={setVGlideJitter} display={vGlideJitter+"%"} accent="#9fb4c7"/></div></SynthSection>
              </div>
            )}
            {page==="sound"&&(
              <div style={{height:"100%",overflowY:"scroll",padding:"12px 12px 20px"}}>
                <SynthSection title="OSCILLATOR" accent={C_OSC}><div style={S.wfRow}>{WAVEFORMS.map((w,i)=>(<button key={w} style={Object.assign({},S.wfBtn,{borderColor:C_OSC+(waveform===w?"":"22"),color:waveform===w?C_OSC:"rgba(210,195,175,0.35)",background:waveform===w?C_OSC+"14":"transparent"})} onClick={()=>setWaveform(w)}>{WF_LABELS[i]}</button>))}</div><div style={S.threeGrid}><KnobSlider label="DETUNE" value={detune} min={0} max={50} onChange={setDetune} display={detune+"¢"} accent={C_OSC}/></div></SynthSection>
                <SynthSection title="ENV" accent={C_ENV}><div style={S.threeGrid}><KnobSlider label="ATK" value={attack} min={1} max={2000} onChange={setAttack} display={attack+"ms"} accent={C_ENV}/><KnobSlider label="DEC" value={decay} min={10} max={4000} onChange={setDecay} display={decay+"ms"} accent={C_ENV}/><KnobSlider label="SUS" value={sustain} min={0} max={100} onChange={setSustain} display={sustain+"%"} accent={C_ENV}/></div></SynthSection>
                <SynthSection title="FILTER" accent={C_FILT}><div style={S.threeGrid}><KnobSlider label="CUT" value={vcfCutoff} min={0} max={100} onChange={setVcfCutoff} display={vcfLbl(vcfCutoff)} accent={C_FILT}/><KnobSlider label="RES" value={vcfRes} min={0} max={100} onChange={setVcfRes} display={vcfRes+"%"} accent={C_FILT}/><KnobSlider label="ENV" value={filterEnvAmt} min={0} max={100} onChange={setFilterEnvAmt} display={filterEnvAmt+"%"} accent={C_FILT}/></div></SynthSection>
                <SynthSection title="DELAY" accent={C_DLY}><div style={S.threeGrid}><KnobSlider label="TIME" value={dlyIdx} min={0} max={DLY_NOTES.length-1} onChange={setDlyIdx} display={DLY_NOTES[dlyIdx].label} accent={C_DLY} steps={DLY_NOTES.length}/><KnobSlider label="SEND" value={dlyWetPct} min={0} max={100} onChange={setDlyWetPct} display={dlyWetPct+"%"} accent={C_DLY}/><KnobSlider label="FDBK" value={dlyFbPct} min={0} max={95} onChange={setDlyFbPct} display={dlyFbPct+"%"} accent={C_DLY}/><KnobSlider label="HP" value={dlyHpVal} min={0} max={100} onChange={setDlyHpVal} display={hpLbl(dlyHpVal)} accent={C_DLY}/><KnobSlider label="LP" value={dlyLpVal} min={0} max={100} onChange={setDlyLpVal} display={lpLbl(dlyLpVal)} accent={C_DLY}/></div></SynthSection>
              </div>
            )}
          </div>

          {/* ── BOTTOM HANDLE ── */}
          <div style={{flexShrink:0,borderTop:"1px solid rgba(255,255,255,0.07)",background:"rgba(26,24,20,0.98)"}}>
            {/* Pills row */}
            <div style={{display:"flex",gap:5,overflowX:"auto",scrollbarWidth:"none",padding:"7px 12px 3px",alignItems:"center",touchAction:"none"}}>
              {pats.map((p,i)=>{
                const isA=p.id===activeId,isP=playing&&playId===p.id,col=patCol(i);
                const isDragging=chainDrag&&chainDrag.type==='pill'&&chainDrag.id===p.id;
                return(<div key={p.id} style={Object.assign({},S.pill,{border:"1.5px solid "+col,background:isA?col:"transparent",color:isA?"#000":col,boxShadow:isDragging?"0 0 20px "+col:isP?"0 0 14px "+col+"88":"none",opacity:isDragging?0.5:1,touchAction:"none"})}
                  onClick={()=>setActiveId(p.id)}
                  onPointerDown={e=>startPillDrag(e,p.id)} onPointerMove={onDragMove}
                  onPointerUp={e=>{if(pillLongPressR.current){clearTimeout(pillLongPressR.current);pillLongPressR.current=null;}onDragUp(e);}}
                  onPointerCancel={e=>{if(pillLongPressR.current){clearTimeout(pillLongPressR.current);pillLongPressR.current=null;}onDragUp(e);}}
                  onContextMenu={e=>handlePillContextMenu(e,p.id)}>
                  {isP&&<span className="pp">●</span>}{p.name}
                </div>);
              })}
              {pats.length<8&&<button style={S.newPill} onClick={addPat}>＋</button>}
            </div>
            {/* Tabs + play + tray toggle */}
            <div style={{display:"flex",alignItems:"center",gap:4,padding:"3px 12px 10px"}}>
              {[["edit","EDIT"],["step","STEP"],["sound","SOUND"]].map(([p,lbl])=>(
                <button key={p} style={Object.assign({},S.tab,{flex:1,fontSize:9,padding:"10px 0"},page===p?S.tabOn:{})} onClick={()=>setPage(p)}>{lbl}</button>
              ))}
              <button style={Object.assign({},S.playBtn,{width:46,height:46,fontSize:20,flexShrink:0},playing?S.playOn:{})} onClick={startStop}>{playing?<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><rect x="1" y="1" width="9" height="9" rx="1.5"/></svg>:<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><polygon points="1.5,0.5 10.5,5.5 1.5,10.5"/></svg>}</button>
              <button style={{padding:"0 10px",height:46,border:"1px solid rgba(255,255,255,0.14)",background:bottomTrayOpen?"rgba(255,255,255,0.08)":"transparent",color:"rgba(210,195,175,0.5)",fontSize:20,cursor:"pointer",borderRadius:8,flexShrink:0,transition:"all .12s"}}
                onClick={()=>{setBottomTrayOpen(b=>!b);setTopTrayOpen(false);}}>⋯</button>
            </div>
          </div>

          {/* ── TOP TRAY ── slides down */}
          <div style={{position:"fixed",top:52,left:0,right:0,zIndex:200,
            background:"rgba(26,24,20,0.97)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
            borderBottom:"1px solid rgba(255,255,255,0.1)",
            display:topTrayOpen?"block":"none",
            
            padding:"14px 16px 18px"}}>
            <select style={{...S.sel,width:"100%",marginBottom:12,fontSize:13}} value={scale} onChange={e=>setScale(e.target.value)}>
              {Object.entries(SCALES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
            </select>
            <div style={{display:"flex",gap:8}}>
              <div ref={bpmDragRef} style={{...S.bpmDragTarget,flex:1}} onPointerDown={handleBpmDown} onPointerMove={handleBpmMove} onPointerUp={handleBpmUp} onPointerCancel={handleBpmUp}>
                <span style={S.widgetN}>{bpm}</span><span style={S.widgetU}>BPM</span>
              </div>
              <div ref={stDragRef} style={{...S.bpmDragTarget,flex:1}} onPointerDown={handleStDown} onPointerMove={handleStMove} onPointerUp={handleStUp} onPointerCancel={handleStUp}>
                <span style={S.widgetN}>{stLabel}</span><span style={S.widgetU}>ST</span>
              </div>
              <div ref={swingDragRef} style={{...S.bpmDragTarget,flex:1}} onPointerDown={handleSwingDown} onPointerMove={handleSwingMove} onPointerUp={handleSwingUp} onPointerCancel={handleSwingUp}>
                <span style={S.widgetN}>{swing}</span><span style={S.widgetU}>SWG</span>
              </div>
            </div>
          </div>

          {/* ── BOTTOM TRAY ── slides up */}
          <div style={{position:"fixed",bottom:112,left:0,right:0,zIndex:200,
            background:"rgba(26,24,20,0.97)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",
            borderTop:"1px solid rgba(255,255,255,0.1)",
            display:bottomTrayOpen?"block":"none",
            
            padding:"14px 16px 20px"}}>
            {/* Speed */}
            <div style={{...S.speedRow,marginBottom:14}}>
              {SPEED_OPTS.map(({label,mult})=>(
                <button key={label} style={Object.assign({},S.speedBtn,speedMult===mult?S.speedBtnOn:{})} onClick={()=>setSpeedMult(mult)}>{label}</button>
              ))}
            </div>
            {/* Transport */}
            <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gridTemplateRows:"1fr 1fr 1fr",gap:8,marginBottom:14,alignItems:"center"}}>
              <button style={Object.assign({},S.loopBtnBottom,{width:"100%"},varyMode?{border:"1px solid #c9a96e",color:"#c9a96e",background:"rgba(201,169,110,0.12)"}:{})} onClick={()=>setVaryMode(v=>!v)}>VARY</button>
              <button style={Object.assign({},S.playBtn,playing?S.playOn:{},{gridColumn:2,gridRow:"1/4",alignSelf:"center"})} onClick={startStop}>{playing?<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><rect x="1" y="1" width="9" height="9" rx="1.5"/></svg>:<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><polygon points="1.5,0.5 10.5,5.5 1.5,10.5"/></svg>}</button>
              <button style={Object.assign({},S.loopBtnBottom,{width:"100%"},monoMode?{border:"1px solid #9fb4c7",color:"#9fb4c7",background:"rgba(159,180,199,0.12)"}:{})} onClick={toggleMono}>MONO</button>
              <button style={Object.assign({},S.loopBtnBottom,{width:"100%"},recMode?{border:"1px solid #c47a7a",color:"#c47a7a",background:"rgba(196,122,122,0.15)",fontWeight:900}:{border:"1px solid rgba(255,77,77,0.4)",color:"rgba(196,122,122,0.6)"})} onClick={()=>setRecMode(r=>!r)}>{recMode?"■ REC":"● REC"}</button>
              <button style={Object.assign({},S.loopBtnBottom,{width:"100%"},loopMode?S.loopOn:{})} onClick={()=>setLoopMode(l=>!l)}>LOOP</button>
              <button style={Object.assign({},S.loopBtnBottom,{width:"100%"})} onClick={mutatePat1}>MUT8</button>
              <div/>
            </div>
            {/* SEQ + chain + FOLLOW */}
            <div style={{marginBottom:14}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                <span style={{fontSize:9,letterSpacing:1,color:"rgba(255,255,255,0.25)",fontWeight:700}}>SEQ</span>
                <div style={{flex:1}}/>
                <button style={Object.assign({},S.loopBtnBottom,{height:24,padding:"0 10px",fontSize:9},followSeq?{border:"1px solid #7aaa96",color:"#7aaa96",background:"rgba(122,170,150,0.12)"}:{})} onClick={()=>setFollowSeq(f=>!f)}>FOLLOW</button>
              </div>
              {(()=>{
                const overStrip=chainDrag&&isOverStrip(chainDrag.y);
                const insertIdx=chainDrag?getChainInsertIdx(chainDrag.x):-1;
                return(<div ref={chainStripRef} style={Object.assign({},S.chainStrip,{marginTop:0},overStrip?S.chainStripHot:{})}>
                  {chain.length===0&&!chainDrag&&<span style={S.chainStripEmpty}>drag patterns here to build a sequence</span>}
                  {chain.map((pid,i)=>{
                    const pi=Math.max(0,pats.findIndex(p=>p.id===pid));const p=pats.find(p=>p.id===pid);const col=patCol(pi);
                    const here=playing&&!loopMode&&i===cpos;const isDragging=chainDrag&&chainDrag.type==='chain'&&chainDrag.fromIdx===i;const showInsert=overStrip&&insertIdx===i;
                    return(<React.Fragment key={i}>{showInsert&&<div style={S.chainInsertLine}/>}<div data-chainslot={i} style={Object.assign({},S.chainChip,{borderColor:col,background:here?col:col+"18",color:here?"#000":col,opacity:isDragging?0.3:1,touchAction:"none"})} onPointerDown={e=>startChainDrag(e,i)} onPointerMove={onDragMove} onPointerUp={onDragUp} onPointerCancel={onDragUp}>{p?p.name:"?"}</div></React.Fragment>);
                  })}
                  {overStrip&&insertIdx>=chain.length&&<div style={S.chainInsertLine}/>}
                </div>);
              })()}
            </div>
            {/* Save/load */}
            <div style={S.menuSaveLabel}>SAVE / LOAD</div>
            {flash&&<div style={S.menuFlash}>{flash}</div>}
            <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:14}}>
              {SLOTS.map(slot=>{const has=!!slotData[slot];return(
                <div key={slot} style={{display:"flex",flexDirection:"column",gap:3,alignItems:"center"}}>
                  <span style={S.menuSlotName}>{slot}{has&&<span style={S.menuSlotDot}>●</span>}</span>
                  <button style={S.menuSlotBtn} onClick={()=>saveSlot(slot)}>SAVE</button>
                  <button style={Object.assign({},S.menuSlotBtn,has?S.menuSlotBtnLit:{})} onClick={()=>loadSlot(slot)} disabled={!has}>LOAD</button>
                </div>
              );})}
            </div>
            {/* Share */}
            <div style={S.menuSaveLabel}>SHARE</div>
            {shareFlash&&<div style={S.menuFlash}>{shareFlash}</div>}
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6,marginBottom:6}}>
              <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={copyShareLink}>LINK</button>
              <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={exportJSON}>EXPORT</button>
              <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={()=>importRef.current?.click()}>IMPORT</button>
            </div>
            <input ref={importRef} type="file" accept=".json" style={{display:"none"}} onChange={handleImport}/>
          </div>

          {/* Backdrop — dismiss trays on outside tap */}
          {(topTrayOpen||bottomTrayOpen)&&(
            <div style={{position:"fixed",inset:0,zIndex:190}} onClick={()=>{setTopTrayOpen(false);setBottomTrayOpen(false);}}/>
          )}

          {/* Pat context menu (mobile) */}
          {patMenu&&(()=>{
            const pm=patMenu;const vw=window.innerWidth,vh=window.innerHeight;const W=200,H=160;
            const px=Math.max(8,Math.min(vw-W-8,pm.x-W/2));const py=Math.max(8,Math.min(vh-H-8,pm.y+12));
            const close=()=>setPatMenu(null);const act=(fn)=>{fn();close();};const targetId=pm.id;const isOnlyPat=pats.length<=1;
            return(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:500}} onPointerDown={close} onClick={close}>
              <div style={{position:"absolute",left:px,top:py,width:W,background:"rgba(12,12,12,0.92)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",borderRadius:12,border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 8px 32px rgba(0,0,0,0.7)",overflow:"hidden",pointerEvents:"all"}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:1,background:"rgba(220,200,180,0.06)"}}>
                  {[["RAND",()=>act(()=>randPatId(targetId))],["CLR",()=>act(()=>clearPatId(targetId))],["CPY",()=>act(()=>copyPatId(targetId))],["PST",()=>act(()=>pastePatId(targetId)),!clipboard],["DUP",()=>act(()=>dupPatId(targetId)),pats.length>=8],["DEL",()=>act(()=>delPatId(targetId)),isOnlyPat,true]].map(([label,fn,disabled,danger])=>(
                    <button key={label} disabled={!!disabled} style={{padding:"10px 0",background:"rgba(10,10,10,0.9)",border:"none",color:disabled?"rgba(255,255,255,0.2)":danger?"rgba(196,122,122,0.9)":"rgba(255,255,255,0.8)",fontSize:11,fontWeight:700,letterSpacing:1.5,cursor:disabled?"default":"pointer"}}
                      onMouseEnter={e=>{if(!disabled)e.currentTarget.style.background="rgba(255,255,255,0.08)";}} onMouseLeave={e=>e.currentTarget.style.background="rgba(10,10,10,0.9)"}
                      onClick={disabled?undefined:fn}>{label}</button>
                  ))}
                </div>
              </div>
            </div>);
          })()}

        </div>
      )} {/* end IS_MOBILE */}
    </div>
  );
}

const CSS=`
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,wght@0,300;0,400;0,500;1,300&display=swap');
  html,body{overscroll-behavior:none;overflow:hidden;position:fixed;width:100%;height:100%;touch-action:pan-y;}
  *,*::before,*::after{
    box-sizing:border-box;
    -webkit-tap-highlight-color:transparent;
    -webkit-user-select:none!important;
    -webkit-touch-callout:none!important;
    -webkit-user-drag:none!important;
    user-select:none!important;
  }
  .pp{animation:pp .55s ease-in-out infinite;display:inline-block;margin-right:3px;font-size:7px;}
  @keyframes pp{0%,100%{opacity:1;transform:scale(1.3)}50%{opacity:.15;transform:scale(.65)}}
  select option{background:#111;color:#fff;}
`;

const S={
  root:      {fontFamily:"'DM Sans',sans-serif",background:"#1a1814",color:"#e8e0d5",height:"100dvh",overflowY:IS_MOBILE?"hidden":"hidden",overscrollBehavior:"contain",maxWidth:"none",margin:"0 auto",padding:IS_MOBILE?0:"16px 20px 20px",userSelect:"none",WebkitUserSelect:"none",WebkitTouchCallout:"none"},
  hdr:       {display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:IS_MOBILE?14:20,gap:4},
  brand:     {fontFamily:"'DM Sans',sans-serif",fontSize:IS_MOBILE?22:28,fontWeight:300,letterSpacing:6,background:"linear-gradient(135deg,#c4a882,#9bbfaa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",flexShrink:0},
  hdrR:      {display:"flex",alignItems:"center",gap:IS_MOBILE?6:10},
  sel:       {background:"rgba(200,185,165,0.05)",border:"1px solid rgba(255,255,255,0.14)",color:"rgba(255,255,255,0.7)",fontSize:IS_MOBILE?10:13,padding:"7px 8px",borderRadius:6,cursor:"pointer",flexShrink:0},
  hdrWidget: {display:"flex",alignItems:"center",gap:2,flexShrink:0},
  widgetBox: {textAlign:"center",minWidth:26},
  widgetN:   {fontSize:IS_MOBILE?20:22,fontWeight:700,display:"block",lineHeight:1.1},
  widgetU:   {fontSize:IS_MOBILE?8:11,color:"rgba(210,195,175,0.3)",letterSpacing:1,display:"block"},
  bpmDragTarget: {display:"flex",flexDirection:"column",alignItems:"center",cursor:"ns-resize",padding:IS_MOBILE?"8px 14px":"10px 18px",borderRadius:10,border:"1px solid rgba(200,185,165,0.15)",background:"rgba(200,185,165,0.04)",minWidth:IS_MOBILE?52:64,touchAction:"none",userSelect:"none",flexShrink:0},
  bpmOverlay:    {position:"fixed",top:0,left:0,right:0,bottom:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.88)",zIndex:999,pointerEvents:"none"},
  bpmOverlayNum: {fontFamily:"'DM Sans',sans-serif",fontSize:88,fontWeight:300,color:"#e8e0d5",lineHeight:1,letterSpacing:-2},
  bpmOverlayLbl: {fontSize:11,letterSpacing:1,color:"rgba(210,195,175,0.4)",marginTop:6},
  bpmOverlayHint:{fontSize:9,color:"rgba(255,255,255,0.2)",marginTop:10,letterSpacing:1},
  loopBtn:   {padding:"0 12px",height:38,borderRadius:7,border:"1px solid rgba(255,255,255,0.15)",background:"transparent",color:"rgba(210,195,175,0.3)",fontSize:9,letterSpacing:2,cursor:"pointer",transition:"all .12s",flexShrink:0},
  loopOn:    {border:"1px solid #9fb4c7",color:"#9fb4c7",background:"rgba(159,180,199,0.12)"},
  playBar:   {position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:IS_MOBILE?430:780,padding:IS_MOBILE?"12px 20px 28px":"16px 40px 32px",background:"linear-gradient(to top, #000 70%, transparent)",display:"flex",alignItems:"center",justifyContent:"center",gap:IS_MOBILE?16:24,zIndex:100},
  playBtn:   {width:IS_MOBILE?64:72,height:IS_MOBILE?64:72,borderRadius:"50%",border:"2px solid rgba(210,195,175,0.25)",background:"rgba(200,185,165,0.05)",color:"#fff",fontSize:IS_MOBILE?22:26,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all .15s",flexShrink:0},
  playOn:    {border:"2px solid #fff",background:"rgba(220,200,180,0.12)",boxShadow:"0 0 28px rgba(255,255,255,0.35)"},
  loopBtnBottom:{padding:IS_MOBILE?"0 12px":"0 16px",height:IS_MOBILE?40:44,borderRadius:10,border:"1px solid rgba(200,185,165,0.15)",background:"transparent",color:"rgba(200,185,165,0.4)",fontSize:IS_MOBILE?9:10,letterSpacing:1,cursor:"pointer",transition:"all .12s"},

  tabs:      {display:"flex",gap:3,marginBottom:IS_MOBILE?14:18},
  tab:       {flex:1,padding:IS_MOBILE?"11px 0":"13px 0",border:"1px solid rgba(200,185,165,0.12)",background:"transparent",color:"rgba(200,185,165,0.35)",fontSize:IS_MOBILE?7:12,letterSpacing:1,cursor:"pointer",borderRadius:10,transition:"all .12s"},
  tabOn:     {background:"rgba(255,255,255,0.07)",color:"#fff",border:"1px solid rgba(255,255,255,0.3)"},
  stepVaryDivider:{height:1,background:"rgba(220,200,180,0.06)",margin:"16px 0 8px"},
  speedRow:  {display:"flex",gap:4,marginBottom:IS_MOBILE?10:14},
  speedBtn:  {flex:1,padding:IS_MOBILE?"7px 0":"9px 0",border:"1px solid rgba(200,185,165,0.12)",background:"transparent",color:"rgba(200,185,165,0.4)",fontSize:IS_MOBILE?11:12,cursor:"pointer",borderRadius:10,transition:"all .12s"},
  speedBtnOn:{border:"1px solid rgba(255,255,255,0.5)",color:"#fff",background:"rgba(255,255,255,0.08)"},

  patRow:    {display:"flex",gap:IS_MOBILE?6:8,overflowX:"auto",padding:"0 0 10px",scrollbarWidth:"none"},
  pill:      {padding:IS_MOBILE?"5px 13px":"7px 16px",borderRadius:20,fontSize:IS_MOBILE?11:12,fontWeight:700,letterSpacing:2,cursor:"pointer",flexShrink:0,transition:"all .12s",display:"flex",alignItems:"center",gap:2},
  newPill:   {padding:"5px 10px",borderRadius:20,border:"1px dashed rgba(255,255,255,0.2)",background:"transparent",color:"rgba(210,195,175,0.3)",fontSize:14,cursor:"pointer",flexShrink:0},
  laneRow:   {display:"flex",alignItems:"stretch",gap:4,height:22},
  laneLabel: {width:20,flexShrink:0,fontSize:6,fontWeight:700,letterSpacing:1,display:"flex",alignItems:"center",justifyContent:"flex-end"},
  laneBars:  {flex:1,display:"flex",gap:1,alignItems:"flex-end",cursor:"pointer",touchAction:"none",position:"relative"},
  laneBarWrap:{flex:1,height:"100%",position:"relative",display:"flex",alignItems:"flex-end"},
  laneBar:   {width:"100%",borderRadius:"1px 1px 0 0",minHeight:1,transition:"height .05s"},
  laneCenterLine:{position:"absolute",left:0,right:0,borderTop:"1px solid",pointerEvents:"none"},
  gridShifting:{outline:"1px solid rgba(255,229,0,0.2)",borderRadius:4},
  gridRow:     {display:"flex",gap:IS_MOBILE?2:3,alignItems:"stretch",touchAction:"none",flex:"1 1 0"},
  cell:        {flex:1,aspectRatio:IS_MOBILE?"1":"unset",borderRadius:IS_MOBILE?2:3,touchAction:"none",transition:"box-shadow .06s, background .06s",display:"flex",alignItems:"center",justifyContent:"center",overflow:"hidden"},
  stepBar:     {display:"flex",gap:IS_MOBILE?2:3,marginTop:2,alignItems:"center"},
  stepColWrap: {flex:1,height:IS_MOBILE?12:14,display:"flex",alignItems:"center"},
  lenSlider:   {position:"relative",height:IS_MOBILE?10:20,marginTop:IS_MOBILE?4:8,borderRadius:IS_MOBILE?3:5,background:"rgba(220,200,180,0.06)",touchAction:"none",cursor:"col-resize",overflow:"visible"},
  stepDot:     {width:"100%",height:4,borderRadius:2,transition:"transform .07s, background .07s"},

  // Chain strip
  chainStrip:     {display:"flex",flexDirection:"row",gap:5,overflowX:"auto",scrollbarWidth:"none",padding:"8px 4px",marginTop:6,borderTop:"1px solid rgba(255,255,255,0.06)",minHeight:46,alignItems:"center",transition:"background .12s",borderRadius:6},
  chainStripHot:  {background:"rgba(220,200,180,0.035)",borderTop:"1px solid rgba(255,255,255,0.18)"},
  chainStripEmpty:{fontSize:IS_MOBILE?7:11,color:"rgba(210,195,175,0.15)",letterSpacing:2,whiteSpace:"nowrap"},
  chainChip:      {flexShrink:0,minWidth:30,height:30,borderRadius:8,border:"1px solid",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12,fontWeight:700,letterSpacing:1,touchAction:"none",cursor:"grab",transition:"opacity .1s"},
  chainInsertLine:{width:2,height:30,background:"rgba(255,255,255,0.6)",borderRadius:1,flexShrink:0},
  chainGhost:     {position:"fixed",zIndex:500,pointerEvents:"none",width:36,height:36,borderRadius:10,background:"rgba(30,30,30,0.95)",border:"1px solid rgba(255,255,255,0.3)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:14,fontWeight:700,boxShadow:"0 4px 20px rgba(0,0,0,0.6)"},

  // SOUND — classic synth panel look
  soundPage:      {paddingTop:4,display:"flex",flexDirection:"column",gap:6},
  synthSection:   {background:"#201e1a",borderRadius:12,border:"1px solid rgba(200,185,165,0.1)",padding:"0 0 12px",overflow:"hidden"},
  synthSectionHdr:{fontSize:IS_MOBILE?7:11,fontWeight:500,letterSpacing:1,padding:"7px 12px",borderBottom:"1px solid rgba(200,185,165,0.1)",marginBottom:10},
  wfRow:          {display:"flex",gap:4,padding:"0 12px",marginBottom:6},
  wfBtn:          {flex:1,padding:"7px 0",border:"1px solid",background:"transparent",fontSize:8,letterSpacing:1,cursor:"pointer",borderRadius:5,textAlign:"center",fontWeight:700,transition:"all .12s"},
  synthRow:       {padding:"0 12px"},
  synthSecSublbl: {fontSize:7,fontWeight:700,letterSpacing:1},
  threeGrid:      {display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,padding:"0 12px"},
  envGrid:        {display:"grid",gridTemplateColumns:"1fr 1fr",gap:8,padding:"4px 12px 0"},
  filterEnvNote:  {display:"none"},
  dlyTimeRow:     {display:"flex",alignItems:"center",gap:10,padding:"0 12px",marginBottom:8},
  dlyTimePicker:  {display:"flex",alignItems:"center",gap:8},
  dlyTimeVal:     {fontSize:16,fontWeight:700,letterSpacing:1,minWidth:32,textAlign:"center"},
  dlyArrow:       {background:"transparent",border:"none",fontSize:11,cursor:"pointer",padding:"4px 2px",opacity:.7},

  // Knob slider — synth style
  knobWrap:       {display:"flex",flexDirection:"column",gap:3},
  knobLabel:      {fontSize:IS_MOBILE?6:10,letterSpacing:2,fontWeight:700},
  knobTrackWrap:  {position:"relative",height:26,display:"flex",alignItems:"center",cursor:"pointer",touchAction:"none"},
  knobTrackBg:    {position:"absolute",left:0,right:0,height:4,borderRadius:3,background:"rgba(255,255,255,0.08)"},
  knobTrackFill:  {position:"absolute",left:0,height:4,borderRadius:3,pointerEvents:"none"},
  knobThumb:      {position:"absolute",top:"50%",transform:"translate(-50%,-50%)",width:18,height:18,borderRadius:"50%",pointerEvents:"none"},
  knobValue:      {fontSize:IS_MOBILE?10:13,fontWeight:700,letterSpacing:1},

  spRow:          {display:"flex",alignItems:"center",justifyContent:"space-between",height:44},
  spValLg:        {fontSize:28,fontWeight:700,letterSpacing:2},
  spBtnLg:        {width:44,height:44,background:"rgba(220,200,180,0.035)",border:"1px solid",color:"rgba(255,255,255,0.7)",fontSize:16,cursor:"pointer",borderRadius:10,padding:0,display:"flex",alignItems:"center",justifyContent:"center"},

  // Dropdown menu
  menuBtn:      {padding:"5px 12px",border:"1px solid rgba(255,255,255,0.14)",background:"transparent",color:"rgba(210,195,175,0.45)",fontSize:18,cursor:"pointer",borderRadius:6,lineHeight:1,flexShrink:0},
  menuOverlay:  {position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:200,background:"rgba(0,0,0,0.5)"},
  menuPanel:    {position:"absolute",bottom:110,left:10,right:10,maxWidth:410,margin:"0 auto",background:"#111",borderRadius:14,border:"1px solid rgba(220,200,180,0.12)",padding:"16px",boxShadow:"0 8px 40px rgba(0,0,0,0.8)"},
  menuGrid:     {display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14},
  mBtn:         {padding:"12px 0",border:"1px solid rgba(255,255,255,0.14)",background:"transparent",color:"rgba(255,255,255,0.55)",fontSize:10,letterSpacing:1,cursor:"pointer",borderRadius:7,textAlign:"center"},
  mBtnLit:      {border:"1px solid rgba(255,255,255,0.45)",color:"#fff"},
  mBtnDanger:   {border:"1px solid rgba(255,80,80,0.35)",color:"rgba(255,100,100,0.8)"},
  menuDivider:  {height:1,background:"rgba(255,255,255,0.08)",marginBottom:14},
  menuSaveLabel:{fontSize:IS_MOBILE?7:11,letterSpacing:1,color:"rgba(210,195,175,0.3)",marginBottom:10},
  menuFlash:    {padding:"6px 10px",background:"rgba(122,170,150,0.12)",border:"1px solid rgba(105,240,174,0.25)",borderRadius:5,fontSize:9,color:"#7aaa96",letterSpacing:1,textAlign:"center",marginBottom:10},
  menuSlots:    {display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:8},
  menuSlot:     {display:"flex",flexDirection:"column",gap:5,alignItems:"center"},
  menuSlotName: {fontSize:11,fontWeight:700,color:"rgba(210,195,175,0.5)",letterSpacing:2,position:"relative"},
  menuSlotDot:  {color:"#7aaa96",fontSize:IS_MOBILE?8:10,marginLeft:2},
  menuSlotBtn:  {width:"100%",padding:"8px 0",border:"1px solid rgba(255,255,255,0.14)",background:"transparent",color:"rgba(210,195,175,0.45)",fontSize:IS_MOBILE?8:11,letterSpacing:1,cursor:"pointer",borderRadius:5},
  menuSlotBtnLit:{border:"1px solid rgba(105,240,174,0.45)",color:"#7aaa96",background:"rgba(105,240,174,0.04)"},
  // STEP page
  stepPage:     {paddingTop:4,display:"flex",flexDirection:"column",gap:14},
  stepPageHdr:  {display:"flex",alignItems:"center",gap:10},
  stepPagePat:  {fontSize:14,fontWeight:700,color:"rgba(210,195,175,0.4)",letterSpacing:1,flex:1},
  stepPageBtns: {display:"flex",gap:8},
  stepPageBtn:  {padding:"8px 14px",border:"1px solid rgba(255,255,255,0.15)",background:"transparent",color:"rgba(210,195,175,0.5)",fontSize:IS_MOBILE?9:12,letterSpacing:2,cursor:"pointer",borderRadius:6},
  stepPageBtnRand:{border:"1px solid rgba(255,229,0,0.4)",color:"#c9a96e",background:"rgba(255,229,0,0.05)"},
  stepLaneSection:{display:"flex",flexDirection:"column",gap:6},
  stepLaneHdr:  {display:"flex",alignItems:"center",gap:8},
  stepLaneName: {fontSize:IS_MOBILE?9:12,fontWeight:700,letterSpacing:1,minWidth:32},
  stepLiveVal:  {fontSize:13,fontWeight:700,letterSpacing:1,minWidth:36,textAlign:"right"},
  stepLaneBtn:  {padding:"5px 10px",border:"1px solid",background:"transparent",fontSize:IS_MOBILE?8:11,letterSpacing:1,cursor:"pointer",borderRadius:5},
};
