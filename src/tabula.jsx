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
  {label:"1/8·", mult:.75},{label:"1/4",  mult:1},   {label:"1/4·", mult:1.5},
  {label:"1/2",  mult:2},  {label:"1/2·", mult:3},   {label:"1/1",  mult:4},
];
const ROWS=16,COLS=16;
// Single shared pool of 16 abstract, structurally-distinct glyphs.
// Each field type picks from the pool with its own start offset and stride
// (strides 5, 11, 3 are all coprime with 16, so each field visits every
// symbol in a different order before wrapping). Result: same symbol palette
// across patterns/phrases/sections, but each field defaults to a different
// glyph and progresses through them in a different order.
const SYM_POOL=["☉","☾","☿","♀","♂","♃","♄","♅","♆","♇","⚳","⚴","⚵","⚶","⚷","⚸"];
const _N=SYM_POOL.length;
const symPat=i=>SYM_POOL[(0  + i*5)  %_N];
const symPhr=i=>SYM_POOL[(7  + i*11) %_N];
const symSec=i=>SYM_POOL[(11 + i*3)  %_N];
// Device detection — multiple signals for reliability across browsers and iframe contexts
const IS_MOBILE = (()=>{
  try {
    return navigator.maxTouchPoints > 0
      || window.matchMedia('(pointer: coarse)').matches      || window.screen.width < 768
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
  {label:"⅔×",  mult:1.5},
  {label:"¼×",  mult:4},
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
const defaultStepParams=()=>Array.from({length:COLS},()=>({vel:100,flt:50,dly:0,rhy:1,dur:0,oct:2,glide:0}));
const mkPat=name=>({id:++_id,name,grid:mkGrid(),params:defaultStepParams(),gridLen:16});
// ─── Drum layer ───────────────────────────────────────────────────────────────
const DRUM_VOICES=[
  {key:"BD",label:"BD",color:"#e07060"},
  {key:"SD",label:"SD",color:"#e09050"},
  {key:"LT",label:"LT",color:"#c8a840"},
  {key:"HT",label:"HT",color:"#a0b840"},
  {key:"CH",label:"CH",color:"#60b878"},
  {key:"OH",label:"OH",color:"#50a8c0"},
  {key:"CY",label:"CY",color:"#7888d0"},
  {key:"CP",label:"CP",color:"#c070c0"},
  {key:"CL",label:"CL",color:"#d4956a"},
  {key:"CB",label:"CB",color:"#9bbfaa"},
];
const DRUM_ROWS=DRUM_VOICES.length;
const mkDrumPat=name=>({id:++_id,name,grid:Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(false)),vel:Array.from({length:COLS},()=>100),gridLen:16,mix:defaultDrumMix(),vRhythm:0,vVelocity:0});
const defaultDrumMix=()=>Array.from({length:DRUM_ROWS},()=>({level:100,pan:0}));
const defaultDrums=()=>({
  grid:Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(false)),
  vel:Array.from({length:COLS},()=>100),
  gridLen:16,
  mix:defaultDrumMix()
});


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
    flt: vp.fltJitter>0   ? jit(sp.flt, vp.fltJitter*0.25,0,100) : sp.flt,
    dly: vp.dlyJitter>0   ? jit(sp.dly, vp.dlyJitter*0.4, 0,100) : sp.dly,
    rhy: vp.rhyJitter>0&&Math.random()<vp.rhyJitter/100 ? [0,1,1,2,3,4][Math.floor(Math.random()*6)] : sp.rhy,
    oct: vp.octJitter>0   &&Math.random()<vp.octJitter/100 ? Math.max(0,Math.min(4,sp.oct+(Math.random()<.5?1:-1))) : sp.oct,
    glide: vp.glideJitter>0 ? (Math.random()<vp.glideJitter/100?1:sp.glide) : sp.glide,
    dur:   vp.durJitter>0   ? jit(sp.dur??0, vp.durJitter*0.8, -100, 100) : (sp.dur??0),
  };
};

// ─── KnobSlider with accent color ─────────────────────────────────────────────
function KnobSlider({label,value,min,max,onChange,display,accent,vertical}){
  const ref=useRef(null);
  const col=accent||"rgba(255,255,255,0.6)";
  const pct=((value-min)/(max-min))*100;
  const compute=useCallback(e=>{
    const rect=ref.current.getBoundingClientRect();
    if(vertical){
      const rect=ref.current.getBoundingClientRect();
      const v=1-Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));
      onChange(Math.round(min+v*(max-min)));
    } else {
      onChange(Math.round(min+Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width))*(max-min)));
    }
  },[min,max,onChange,vertical]);
  if(vertical){
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,userSelect:"none",width:52}}>
        <div style={{fontSize:10,letterSpacing:1,fontWeight:500,color:col+"bb",textAlign:"center",lineHeight:1.4}}>
          <div>{label}</div>
          <div style={{color:col,letterSpacing:0}}>{display}</div>
        </div>
        <div ref={ref} style={{position:"relative",width:28,flex:1,minHeight:80,cursor:"ns-resize",touchAction:"none",display:"flex",justifyContent:"center"}}
          onPointerDown={e=>{e.stopPropagation();ref.current.setPointerCapture(e.pointerId);compute(e);}}
          onPointerMove={e=>{if(e.buttons){e.stopPropagation();compute(e);}}}>
          {/* Track bg — inset 8px top/bottom for visual padding */}
          <div style={{position:"absolute",top:8,bottom:8,width:4,borderRadius:3,background:"rgba(200,185,165,0.1)",left:"50%",transform:"translateX(-50%)"}}/>
          {/* Fill — from bottom up within inset track */}
          <div style={{position:"absolute",bottom:8,width:4,borderRadius:3,height:`calc((100% - 16px) * ${pct/100})`,background:col+"77",left:"50%",transform:"translateX(-50%)"}}/>
          {/* Thumb — positioned within inset track */}
          <div style={{position:"absolute",bottom:`calc(8px + (100% - 16px) * ${pct/100})`,left:"50%",transform:"translate(-50%,50%)",width:16,height:16,borderRadius:"50%",background:col,boxShadow:"0 0 8px "+col+"88",pointerEvents:"none"}}/>
        </div>
      </div>
    );
  }
  return(
    <div style={S.knobWrap}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <div style={Object.assign({},S.knobLabel,{color:col+"cc"})}>{label}</div>
        <div style={Object.assign({},S.knobValue,{color:col})}>{display}</div>
      </div>
      <div ref={ref} style={S.knobTrackWrap}
        onPointerDown={e=>{e.stopPropagation();ref.current.setPointerCapture(e.pointerId);compute(e);}}
        onPointerMove={e=>{if(e.buttons){e.stopPropagation();compute(e);}}}>
        <div style={S.knobTrackBg}/>
        <div style={Object.assign({},S.knobTrackFill,{width:pct+"%",background:col+"88"})}/>
        <div style={Object.assign({},S.knobThumb,{left:pct+"%",background:col,boxShadow:"0 0 8px "+col+"99"})}/>
      </div>
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
  {key:"flt",  label:"FLT",  color:"#c97b8a",min:0,   max:100, def:50,  center:50,   bool:false},
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
  {key:"flt", label:"FLT",  color:"#c97b8a", angle:30,  min:0,    max:100, discrete:false},
  {key:"oct", label:"OCT",  color:"#b5a0c4", angle:10,  min:0,    max:4,   discrete:true},
];

function StepLane({lane,values,activeStep,onChange,onDragStart,tall,colHasNote}){
  const ref=useRef(null);
  const drag=useRef({active:false});

  // Bool lanes (GLIDE): tap-to-toggle, no drag
  if(lane.bool){
    return(
      <div style={Object.assign({},S.laneRow,tall?{height:44}:{})}>
        {!tall&&<div style={Object.assign({},S.laneLabel,{color:lane.color+"99"})}>{lane.label}</div>}
        <div style={{...S.laneBars,alignItems:"center",gap:2}}>
          {Array.from({length:COLS},(_,c)=>{
            const on=!!(values[c]??lane.def);
            const isAct=c===activeStep;
            const locked=colHasNote&&!colHasNote[c];
            return(
              <div key={c} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center",
                height:"100%",opacity:locked?0.15:1,cursor:locked?"default":"pointer"}}
                onPointerDown={e=>{e.stopPropagation();if(locked)return;onDragStart&&onDragStart();onChange(c,on?0:1);}}>
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
    drag.current.active=true;
    const{col,val}=getCV(e);
    if(colHasNote&&!colHasNote[col])return;
    onDragStart&&onDragStart();
    onChange(col,val);
  },[getCV,onChange,lane,values,colHasNote,onDragStart]);
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
          const pct=isRhy ? Math.max(0.12, (rhyVal-1)/3) : (v-lane.min)/(lane.max-lane.min);
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
// ─── Silent audio loop for iOS WebKit audio session keep-alive ───────────────
// A nearly-silent looping audio element prevents iOS from suspending Web Audio
// when the page is backgrounded or the screen locks.
function createSilentLoop(){
  try{
    // 1-second silent MP3 as data URI — minimal size, real audio format
    // iOS requires actual audio playback (not just Web Audio) to maintain session
    const SILENT_MP3='data:audio/mpeg;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU2LjM2LjEwMAAAAAAAAAAAAAAA//OEAAAAAAAAAAAAAAAAAAAAAAAASW5mbwAAAA8AAAAEAAABIADAwMDAwMDAwMDAwMDAwMDAwMDAwMDAwMDV1dXV1dXV1dXV1dXV1dXV1dXV1dXV1dXV6urq6urq6urq6urq6urq6urq6urq6urq6ur///////////////////////////////////////////////8AAAAATGF2YzU2LjQxAAAAAAAAAAAAAAAAJAAAAAAAAAAAASDs90hvAAAAAAAAAAAAAAAAAAAA//MUZAAAAAGkAAAAAAAAA0gAAAAATEFN//MUZAMAAAGkAAAAAAAAA0gAAAAARTMu//MUZAYAAAGkAAAAAAAAA0gAAAAAOTku//MUZAkAAAGkAAAAAAAAA0gAAAAANVVV';
    const audio=new Audio(SILENT_MP3);
    audio.loop=true;
    audio.volume=0.001;
    return audio;
  }catch(e){return null;}
}

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
    const fltDev  = sp ? (((sp.flt??50)-50)/50) : 0; // -1..+1
    const cutOff   = fltDev * 0.3 * 40;               // 30% → ±12 semitone cutoff offset
    const envScale = 1 + fltDev * 0.7;                // 70% → scale filter env amount
    const stepDly  = sp ? sp.dly/100 : 0;
    const globalDly= (globalSend!=null) ? globalSend/100 : 0;
    // dly=0 means "use global send"; any other value overrides it entirely
    const dlyMul   = (sp && sp.dly > 0) ? stepDly : globalDly;
    const octShift = sp ? (sp.oct-2) : 0;
    const playFreq = freq * Math.pow(2, octShift);
    const durMod   = (sp && sp.dur!=null) ? sp.dur/100 : 0;
    const atk=ms(p.attack),dec=ms(p.decay),sus=Math.max(0.001,p.sustain/100),rel=ms(p.decay);
    const rawDur=noteDur!=null ? noteDur : this.stepDur;
    const modDur=rawDur*(1+durMod);
    const dur=Math.max(atk+0.015, modDur);
    const end=dur+rel;
    const decayFraction = dur>=atk+dec ? 1 : Math.max(0,(dur-atk)/Math.max(0.001,dec));

    const vcf=this.ctx.createBiquadFilter();
    vcf.type="lowpass";
    const rawCut=Math.max(0,Math.min(100,p.vcfCutoff+cutOff));
    const baseHz=vcfHz(rawCut);
    vcf.Q.value=Math.max(0.01, p.vcfRes*0.28);
    const envAmt=(p.filterEnvAmt/100)*velMul*Math.max(0,envScale);
    const peakHz=envAmt>0.001?baseHz*Math.pow(20000/Math.max(20,baseHz),envAmt):baseHz;
    const susHz=Math.max(20,baseHz+(peakHz-baseHz)*sus);
    const freqAtGate = decayFraction>=1 ? susHz : Math.max(20, peakHz*Math.pow(Math.max(20,susHz)/Math.max(20,peakHz), decayFraction));
    if(envAmt>0.01){
      vcf.frequency.setValueAtTime(baseHz,t);
      vcf.frequency.linearRampToValueAtTime(peakHz,t+atk);
      if(dur>=atk+dec){
        vcf.frequency.exponentialRampToValueAtTime(Math.max(20,susHz),t+atk+dec);
        vcf.frequency.setValueAtTime(Math.max(20,susHz),t+dur);
      } else {
        vcf.frequency.exponentialRampToValueAtTime(Math.max(20,freqAtGate),t+dur);
      }
      vcf.frequency.exponentialRampToValueAtTime(Math.max(20,baseHz),t+end);
    } else {
      vcf.frequency.value=baseHz;
    }

    const vca=this.ctx.createGain();
    const peak=(p.detune>2?0.28:0.42)*velMul;
    // gainAtGate must be computed AFTER peak is defined
    const gainAtGate = decayFraction>=1 ? sus*peak : Math.max(0.001, peak*Math.pow(Math.max(0.001,sus), decayFraction));
    vca.gain.setValueAtTime(0,t);
    vca.gain.linearRampToValueAtTime(peak,t+atk);
    if(dur>=atk+dec){
      vca.gain.exponentialRampToValueAtTime(Math.max(0.001,sus*peak),t+atk+dec);
      vca.gain.setValueAtTime(Math.max(0.001,sus*peak),t+dur);
    } else {
      vca.gain.exponentialRampToValueAtTime(Math.max(0.001,gainAtGate),t+dur);
    }
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


// ─── Drum Engine (808-style synthesis) ───────────────────────────────────────
class DrumEngine{
  constructor(){this.ctx=null;this.master=null;this.ready=false;}
  async init(masterNode){
    if(this.ready)return;
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    this.ctx=masterNode.context||new AudioContext();
    this.master=masterNode;
    this.ready=true;
  }
  async resume(){if(this.ctx&&this.ctx.state==="suspended")await this.ctx.resume();}

  // Exponential envelope — no linear-to-zero artifacts
  _env(g,t,pk,atk,dec,sus,rel){
    g.setValueAtTime(0.0001,t);
    g.exponentialRampToValueAtTime(pk,t+atk);
    g.exponentialRampToValueAtTime(Math.max(0.0001,pk*sus),t+atk+dec);
    g.exponentialRampToValueAtTime(0.0001,t+atk+dec+rel);
  }

  // Soft-clip waveshaper for analog warmth
  _shaper(ctx,amt){
    const ws=ctx.createWaveShaper();
    const n=256;const c=new Float32Array(n);
    for(let i=0;i<n;i++){const x=i/128-1;c[i]=Math.tanh(x*amt)/Math.tanh(amt);}
    ws.curve=c;ws.oversample="2x";return ws;
  }

  // White noise buffer source
  _noise(ctx,dur){
    const len=Math.ceil(ctx.sampleRate*dur);
    const b=ctx.createBuffer(1,len,ctx.sampleRate);
    const d=b.getChannelData(0);for(let i=0;i<len;i++)d[i]=Math.random()*2-1;
    const s=ctx.createBufferSource();s.buffer=b;return s;
  }

  play(voice,t,vel,level=100,pan=0){
    if(!this.ready)return;
    const ctx=this.ctx;
    const v=Math.max(0.001,vel/127);
    // Level + pan routing
    const lvlGain=ctx.createGain();lvlGain.gain.value=Math.max(0,level/100);
    const panner=ctx.createStereoPanner?ctx.createStereoPanner():null;
    if(panner){panner.pan.value=Math.max(-1,Math.min(1,pan/100));lvlGain.connect(panner);panner.connect(this.master);}
    else{lvlGain.connect(this.master);}
    const out=lvlGain;

    if(voice==="BD"){
      // Tonal body: deep sine sweep
      const osc=ctx.createOscillator();
      const ws=this._shaper(ctx,3);
      const g=ctx.createGain();
      const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=200;lp.Q.value=0.7;
      osc.frequency.setValueAtTime(220,t);
      osc.frequency.exponentialRampToValueAtTime(28,t+0.25);
      this._env(g.gain,t,1.1*v,0.002,0.18,0.001,0.45);
      osc.connect(ws);ws.connect(lp);lp.connect(g);g.connect(out);
      osc.start(t);osc.stop(t+0.7);
      // Punch transient: short high sine burst
      const punch=ctx.createOscillator();const pg=ctx.createGain();
      punch.frequency.setValueAtTime(400,t);punch.frequency.exponentialRampToValueAtTime(60,t+0.012);
      this._env(pg.gain,t,0.7*v,0.001,0.01,0.001,0.005);
      punch.connect(pg);pg.connect(out);punch.start(t);punch.stop(t+0.02);
      // Sub thump noise click
      const nc=this._noise(ctx,0.015);const ncg=ctx.createGain();
      const nclp=ctx.createBiquadFilter();nclp.type="lowpass";nclp.frequency.value=300;
      this._env(ncg.gain,t,0.5*v,0.001,0.005,0.001,0.008);
      nc.connect(nclp);nclp.connect(ncg);ncg.connect(out);nc.start(t);
    }

    else if(voice==="SD"){
      // Tonal body
      const osc=ctx.createOscillator();const og=ctx.createGain();
      osc.frequency.setValueAtTime(240,t);osc.frequency.exponentialRampToValueAtTime(160,t+0.025);
      this._env(og.gain,t,0.55*v,0.001,0.025,0.001,0.06);
      osc.connect(og);og.connect(out);osc.start(t);osc.stop(t+0.15);
      // Crack transient
      const crack=this._noise(ctx,0.01);const cg=ctx.createGain();
      const cbp=ctx.createBiquadFilter();cbp.type="bandpass";cbp.frequency.value=5000;cbp.Q.value=0.3;
      this._env(cg.gain,t,0.9*v,0.0005,0.006,0.001,0.004);
      crack.connect(cbp);cbp.connect(cg);cg.connect(out);crack.start(t);
      // Body noise (the "snare wires" rattle)
      const snare=this._noise(ctx,0.35);const sg=ctx.createGain();
      const sbp=ctx.createBiquadFilter();sbp.type="bandpass";sbp.frequency.value=2500;sbp.Q.value=0.6;
      const shp=ctx.createBiquadFilter();shp.type="highpass";shp.frequency.value=800;
      this._env(sg.gain,t,0.65*v,0.002,0.05,0.05,0.18);
      snare.connect(shp);shp.connect(sbp);sbp.connect(sg);sg.connect(out);snare.start(t);
    }

    else if(voice==="LT"||voice==="HT"){
      const freq=voice==="LT"?72:130;
      const osc=ctx.createOscillator();const g=ctx.createGain();
      const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=freq*4;lp.Q.value=1;
      osc.frequency.setValueAtTime(freq*2.8,t);
      osc.frequency.exponentialRampToValueAtTime(freq,t+(voice==="LT"?0.12:0.08));
      this._env(g.gain,t,0.8*v,0.001,voice==="LT"?0.12:0.08,0.001,voice==="LT"?0.22:0.14);
      osc.connect(lp);lp.connect(g);g.connect(out);
      osc.start(t);osc.stop(t+(voice==="LT"?0.5:0.35));
      // Tom crack
      const tc=this._noise(ctx,0.012);const tcg=ctx.createGain();
      const tcbp=ctx.createBiquadFilter();tcbp.type="bandpass";tcbp.frequency.value=freq*6;tcbp.Q.value=1;
      this._env(tcg.gain,t,0.4*v,0.001,0.008,0.001,0.006);
      tc.connect(tcbp);tcbp.connect(tcg);tcg.connect(out);tc.start(t);
    }

    else if(voice==="CH"){
      // Metallic: noise through two tight bandpass filters at inharmonic ratios
      const n=this._noise(ctx,0.12);
      const bp1=ctx.createBiquadFilter();bp1.type="bandpass";bp1.frequency.value=8400;bp1.Q.value=1.5;
      const bp2=ctx.createBiquadFilter();bp2.type="bandpass";bp2.frequency.value=11200;bp2.Q.value=2;
      const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=7000;
      const g=ctx.createGain();
      this._env(g.gain,t,0.55*v,0.001,0.018,0.001,0.022);
      n.connect(bp1);bp1.connect(bp2);bp2.connect(hp);hp.connect(g);g.connect(out);n.start(t);
    }

    else if(voice==="OH"){
      const n=this._noise(ctx,0.9);
      const bp1=ctx.createBiquadFilter();bp1.type="bandpass";bp1.frequency.value=8400;bp1.Q.value=1.2;
      const bp2=ctx.createBiquadFilter();bp2.type="bandpass";bp2.frequency.value=11200;bp2.Q.value=1.5;
      const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=6500;
      const g=ctx.createGain();
      this._env(g.gain,t,0.5*v,0.001,0.06,0.12,0.55);
      n.connect(bp1);bp1.connect(bp2);bp2.connect(hp);hp.connect(g);g.connect(out);n.start(t);
    }

    else if(voice==="CY"){
      const n=this._noise(ctx,1.8);
      const bp1=ctx.createBiquadFilter();bp1.type="bandpass";bp1.frequency.value=7800;bp1.Q.value=0.5;
      const bp2=ctx.createBiquadFilter();bp2.type="bandpass";bp2.frequency.value=12000;bp2.Q.value=0.8;
      const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=5500;
      const g=ctx.createGain();
      // Initial bright shimmer then settle
      this._env(g.gain,t,0.42*v,0.002,0.3,0.25,1.1);
      n.connect(hp);hp.connect(bp1);bp1.connect(bp2);bp2.connect(g);g.connect(out);n.start(t);
    }

    else if(voice==="CP"){
      // 4 noise bursts with increasing delay and slight pitch shift
      const delays=[0,0.010,0.022,0.038];
      delays.forEach((dl,i)=>{
        const n=this._noise(ctx,0.06);
        const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=1800-i*120;bp.Q.value=1.8;
        const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=900;
        const g=ctx.createGain();
        const pk=i===0?0.75*v:i===3?0.9*v:0.55*v;
        this._env(g.gain,t+dl,pk,0.001,0.012+i*0.005,0.001,0.04+i*0.02);
        n.connect(bp);bp.connect(hp);hp.connect(g);g.connect(out);n.start(t+dl);
      });
    }

    else if(voice==="CL"){
      // 808 clave: sharp wooden click — short bandpass noise burst + high sine ping
      const n=this._noise(ctx,0.05);
      const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=2800;bp.Q.value=3;
      const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=1800;
      const g=ctx.createGain();
      this._env(g.gain,t,0.8*v,0.001,0.018,0.001,0.012);
      n.connect(bp);bp.connect(hp);hp.connect(g);g.connect(out);n.start(t);
      // Second click layer — slightly later for wood-on-wood character
      const n2=this._noise(ctx,0.02);
      const bp2=ctx.createBiquadFilter();bp2.type="bandpass";bp2.frequency.value=3800;bp2.Q.value=4;
      const g2=ctx.createGain();
      this._env(g2.gain,t+0.004,0.5*v,0.001,0.008,0.001,0.006);
      n2.connect(bp2);bp2.connect(g2);g2.connect(out);n2.start(t+0.004);
    }

    else if(voice==="CB"){
      // 808 cowbell: two detuned square oscillators through bandpass — classic metallic bong
      const freqs=[562,845]; // characteristic 808 CB frequency pair
      freqs.forEach((f,i)=>{
        const osc=ctx.createOscillator();
        osc.type="square";
        osc.frequency.value=f;
        const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=700;bp.Q.value=0.6;
        const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=300;
        const g=ctx.createGain();
        // Short attack, medium-long metallic decay
        this._env(g.gain,t,0.38*v*(i===0?1:0.8),0.001,0.06,0.08,0.42);
        osc.connect(bp);bp.connect(hp);hp.connect(g);g.connect(out);
        osc.start(t);osc.stop(t+0.65);
      });
      // Initial ping transient
      const ping=ctx.createOscillator();ping.type="square";ping.frequency.value=700;
      const pg=ctx.createGain();
      this._env(pg.gain,t,0.6*v,0.001,0.004,0.001,0.003);
      ping.connect(pg);pg.connect(out);ping.start(t);ping.stop(t+0.01);
    }
  }
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
    const a=mkPat(symPat(0));
    return[a];
  });
  const [activeId,  setActiveId]  = useState(1);
  const [chain,     setChain]     = useState([1]);
  const [page,      setPage]      = useState("edit");
  const [activeLayer, setActiveLayer] = useState("synth"); // "synth" | "lead" | "bass" | "drums"
  const [bpm,       setBpm]       = useState(120);

  // Drum step editing state
  const drumStepR=useRef(-1);
  const [drumStep,setDrumStep]=useState(-1);

  // Track window width to drive responsive left column layout
  // Use ResizeObserver on the layout container — works inside iframes too
  const layoutRef = useRef(null);
  const [winW, setWinW] = useState(1200);
  useEffect(()=>{
    if(!layoutRef.current) return;
    const ro = new ResizeObserver(entries=>setWinW(entries[0].contentRect.width));
    ro.observe(layoutRef.current);
    return ()=>ro.disconnect();
  },[]);
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
  const [confirmAction, setConfirmAction] = useState(null);
  const [activeSheet,   setActiveSheet]   = useState(null); // "tempo"|"pattern"|"sound"|"project"|"vary"
  const [seqDrag,       setSeqDrag]       = useState(null); // {type:"source"|"chain", patId, chainIdx, x, y, overTrack, insertIdx}
  const [sheetDrag,     setSheetDrag]     = useState(null); // mobile sequence drawer drag: {type, id, name, color, x, y}
  const seqDragR=useRef(null);
  const seqTrackRef=useRef(null);
  const [shareFlash,setShareFlash]= useState("");
  const importRef  = useRef(null);
  const [shifting,  setShifting]  = useState(false);
  const [varyMode,  setVaryMode]  = useState(false);
  const [recMode,   setRecMode]   = useState(false);
  const [swing,     setSwing]     = useState(0);  // 0–100, 0=straight, 100=full triplet swing
  const swingR = useRef(0);
  const gridLenR   = useRef(16);
  const [speedMult, setSpeedMult] = useState(1);
  const speedMultR = useRef(1);
  const [showMenu,  setShowMenu]  = useState(false);
  const [topTrayOpen,   setTopTrayOpen]   = useState(false);
  const [bottomTrayOpen,setBottomTrayOpen]= useState(false);
  const [patMenu,   setPatMenu]   = useState(null); // {id, x, y}
  const [drumMenu,  setDrumMenu]  = useState(null); // {id, x, y}
  const [paramPopup,setParamPopup]= useState(null); // {col,x,y,activeArm,values}
  const popupR       = useRef(null); // mirror for handlers: {col,originX,originY,baseValues}
  const longPressR   = useRef(null); // setTimeout id
  const varyLongPressR = useRef(null);
  const patDropRef   = useRef(null); // sequence drawer drop zones
  const phraseDropRef= useRef(null);
  const sectionDropRef=useRef(null);
  const seqDropRef   = useRef(null);
  const pointerCountR= useRef(0);    // active pointers on grid
  const [chainDrag, setChainDrag] = useState(null); // {type,id,fromIdx,x,y}
  const chainStripRef = useRef(null);
  const chainDragR    = useRef(null); // mirror of chainDrag for handlers
  const [patternDrag, setPatternDrag] = useState(null); // {patId, name, accent, x, y, overDrop}
  // Vary params
  const [vDropRate,  setVDropRate]  = useState(13);
  const [vShiftRate, setVShiftRate] = useState(17);
  const [vShiftRange,setVShiftRange]= useState(1);
  const [vPitchRate, setVPitchRate] = useState(0);
  const [vPitchRange,setVPitchRange]= useState(1);
  const [vGhostRate, setVGhostRate] = useState(0);
  const [vVelJitter, setVVelJitter] = useState(0);
  const [vFltJitter, setVFltJitter] = useState(0);
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
  const drumEngine=useRef(new DrumEngine());
  const silentLoopR=useRef(null);
  const wakeLockR=useRef(null);
  // Drum layer — independent pattern list, completely separate from synth patterns
  const initDrum=mkDrumPat("A");
  const [drumPats,    setDrumPats]    = useState([initDrum]);
  const [activeDrumId,setActiveDrumId]= useState(initDrum.id);
  const [drumChain,   setDrumChain]   = useState([initDrum.id]);
  const [drumCpos,    setDrumCpos]    = useState(0);
  const [drumClipboard,setDrumClipboard]=useState(null);
  // ── Phrase & Section architecture ──────────────────────────────────────────
  const [synthPhrases,  setSynthPhrases]  = useState([{id:"SP1",name:symPhr(0),chain:[1]}]);
  const [drumPhrases,   setDrumPhrases]   = useState([{id:"DP1",name:symPhr(0),chain:[initDrum.id]}]);
  const [sections,      setSections]      = useState([{id:"SC1",name:symSec(0),synthPhraseIds:[],drumPhraseIds:[]}]);
  const [activeSynthPhraseId, setActiveSynthPhraseId] = useState("SP1");
  const [activeDrumPhraseId,  setActiveDrumPhraseId]  = useState("DP1");
  const [activeSectionId,     setActiveSectionId]     = useState("SC1");
  const [seqTab,        setSeqTab]        = useState("patterns"); // "patterns"|"phrases"|"sections"
  // ── Multi-voice layer store: lead and bass synth layers held in a ref ─────
  // Synth-type layers (synth, lead, bass) share the editing UI by swapping
  // their data in/out of the live state on layer switch. Each layer has its
  // own pats array, active pattern, phrases, and active phrase.
  const _initLeadPat = mkPat(symPat(0));
  const _initBassPat = mkPat(symPat(0));
  const layerStoreR = useRef({
    synth: null, // synth lives in `pats`/`activeId`/`synthPhrases`/`activeSynthPhraseId` at start
    lead:  { pats:[_initLeadPat], activeId:_initLeadPat.id, phrases:[{id:"LP1",name:symPhr(0),chain:[_initLeadPat.id]}], activePhraseId:"LP1" },
    bass:  { pats:[_initBassPat], activeId:_initBassPat.id, phrases:[{id:"BP1",name:symPhr(0),chain:[_initBassPat.id]}], activePhraseId:"BP1" }
  });
  const activeLayerR = useRef("synth");
  useEffect(()=>{activeLayerR.current=activeLayer;},[activeLayer]);
  const SYNTH_LAYERS = ["synth","lead","bass"];
  const switchLayer = (newLayer)=>{
    if(newLayer===activeLayer)return;
    const oldIsSynth = SYNTH_LAYERS.indexOf(activeLayer)>=0;
    const newIsSynth = SYNTH_LAYERS.indexOf(newLayer)>=0;
    // Save old synth-type layer state
    if(oldIsSynth){
      layerStoreR.current[activeLayer] = {
        pats: pats,
        activeId: activeId,
        phrases: synthPhrases,
        activePhraseId: activeSynthPhraseId
      };
    }
    // Load new synth-type layer state
    if(newIsSynth){
      const data = layerStoreR.current[newLayer];
      if(data){
        setPats(data.pats);
        setActiveId(data.activeId);
        setSynthPhrases(data.phrases);
        setActiveSynthPhraseId(data.activePhraseId);
      }
    }
    setActiveLayer(newLayer);
  };


  const [seqPage,       setSeqPage]       = useState("sequence"); // "sequence"|"step"

  // ── Song matrix (Phase 1: data + view + editing only; not yet wired to playback)
  // 16×16 grid: 4 row-groups of 4 layer-rows each. Bars 1-16 in top group, 17-32 next, etc.
  // Each cell = pattern ID for that layer at that bar, or null = silence.
  const [songMode,     setSongMode]     = useState(false);
  const [songMatrix,   setSongMatrix]   = useState({
    synth: Array(64).fill(null),
    lead:  Array(64).fill(null),
    bass:  Array(64).fill(null),
    drums: Array(64).fill(null)
  });
  const [songBar,      setSongBar]      = useState(-1); // current playback bar in matrix; -1 when stopped
  const songBarR    = useRef(-1);
  const songModeR   = useRef(false);
  const songMatrixR = useRef(songMatrix);
  useEffect(()=>{songBarR.current=songBar;},[songBar]);
  useEffect(()=>{songModeR.current=songMode;},[songMode]);
  useEffect(()=>{songMatrixR.current=songMatrix;},[songMatrix]);
  const drumPatsR   =useRef([initDrum]);
  const activeDrumIdR=useRef(initDrum.id);
  useEffect(()=>{drumPatsR.current=drumPats;},[drumPats]);
  useEffect(()=>{activeDrumIdR.current=activeDrumId;},[activeDrumId]);
  const variedDrumGrids=useRef(new Map());
  const variedDrumVels=useRef(new Map());
  const drumPillLongPressR=useRef(null);
  const drumChainR=useRef([initDrum.id]);
  const drumCposR=useRef(0);
  useEffect(()=>{drumChainR.current=drumChain;},[drumChain]);

  // Sync legacy chain ← active phrase chain so the scheduler plays whatever is in the phrase box.
  // For synth-type layers (synth/lead/bass), `synthPhrases` holds the active layer's phrases.
  useEffect(()=>{
    const ph=synthPhrases.find(p=>p.id===activeSynthPhraseId);
    if(ph&&ph.chain&&ph.chain.length)setChain(ph.chain);
  },[synthPhrases,activeSynthPhraseId]);
  useEffect(()=>{
    const ph=drumPhrases.find(p=>p.id===activeDrumPhraseId);
    if(ph&&ph.chain&&ph.chain.length)setDrumChain(ph.chain);
  },[drumPhrases,activeDrumPhraseId]);
  useEffect(()=>{drumCposR.current=drumCpos;},[drumCpos]);
  const stepR=useRef(0),cposR=useRef(0),tmrR=useRef(null),nextNoteR=useRef(0);
  const patsR=useRef(pats),chainR=useRef(chain);
  const bpmR=useRef(bpm),scaleR=useRef(scale);
  const loopR=useRef(false),activeIdR=useRef(activeId);
  const transpR=useRef(0),varyModeR=useRef(false),recModeR=useRef(false),recSourceIdR=useRef(null);
  const varyParamsR=useRef({dropRate:13,shiftRate:17,shiftRange:1,pitchRate:0,pitchRange:1,ghostRate:0,velJitter:0,fltJitter:0,dlyJitter:0,rhyJitter:0,octJitter:0,glideJitter:0,durJitter:0});
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
  useEffect(()=>{swingR.current=swing;},[swing]);
  useEffect(()=>{speedMultR.current=speedMult;},[speedMult]);
  useEffect(()=>{
    varyParamsR.current={dropRate:vDropRate,shiftRate:vShiftRate,shiftRange:vShiftRange,pitchRate:vPitchRate,pitchRange:vPitchRange,ghostRate:vGhostRate,velJitter:vVelJitter,fltJitter:vFltJitter,dlyJitter:vDlyJitter,rhyJitter:vRhyJitter,octJitter:vOctJitter,glideJitter:vGlideJitter,durJitter:vDurJitter};
  },[vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,vGlideJitter,vDurJitter]);
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

  // ── Undo / Redo history ──────────────────────────────────────────────────
  const historyR = useRef([]);
  const redoR    = useRef([]);
  const MAX_HISTORY = 50;
  // Ref-based — these are reassigned every render with fresh closures so
  // captureSnapshot() always reads the LATEST state, regardless of where
  // pushHistory is called from (including stale useCallback closures).
  const captureSnapshotR = useRef(()=>null);
  captureSnapshotR.current = ()=>{
    // Build layer store snapshot: include current synth-type layer's live data
    const liveLayerStore = {...layerStoreR.current};
    if(SYNTH_LAYERS.indexOf(activeLayer)>=0){
      liveLayerStore[activeLayer]={pats,activeId,phrases:synthPhrases,activePhraseId:activeSynthPhraseId};
    }
    return ({
    pats:JSON.parse(JSON.stringify(pats)),
    drumPats:JSON.parse(JSON.stringify(drumPats)),
    chain:[...chain],drumChain:[...drumChain],
    synthPhrases:JSON.parse(JSON.stringify(synthPhrases)),
    drumPhrases:JSON.parse(JSON.stringify(drumPhrases)),
    sections:JSON.parse(JSON.stringify(sections)),
    songMatrix:JSON.parse(JSON.stringify(songMatrix)),
    activeId,activeDrumId,activeSynthPhraseId,activeDrumPhraseId,activeSectionId,
    activeLayer,
    layerStore:JSON.parse(JSON.stringify(liveLayerStore)),
    bpm,scale,transpose,swing,speedMult,
    waveform,detune,attack,decay,sustain,vcfCutoff,vcfRes,filterEnvAmt,
    dlyIdx,dlyFbPct,dlyWetPct,dlyHpVal,dlyLpVal,
    vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,
    vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter
  });};
  const applySnapshot = s=>{
    if(!s)return;
    if(s.layerStore){
      // Restore non-active layers to the store
      for(const layer of SYNTH_LAYERS){
        if(s.layerStore[layer]&&layer!==(s.activeLayer||activeLayer)){
          layerStoreR.current[layer]=JSON.parse(JSON.stringify(s.layerStore[layer]));
        }
      }
    }
    if(s.activeLayer&&s.activeLayer!==activeLayer)setActiveLayer(s.activeLayer);
    setPats(s.pats);setDrumPats(s.drumPats);setChain(s.chain);setDrumChain(s.drumChain);
    setSynthPhrases(s.synthPhrases);setDrumPhrases(s.drumPhrases);setSections(s.sections);
    if(s.songMatrix)setSongMatrix(s.songMatrix);
    setActiveId(s.activeId);setActiveDrumId(s.activeDrumId);
    setActiveSynthPhraseId(s.activeSynthPhraseId);setActiveDrumPhraseId(s.activeDrumPhraseId);setActiveSectionId(s.activeSectionId);
    setBpm(s.bpm);setScale(s.scale);setTranspose(s.transpose);setSwing(s.swing);setSpeedMult(s.speedMult);
    setWaveform(s.waveform);setDetune(s.detune);setAttack(s.attack);setDecay(s.decay);setSustain(s.sustain);
    setVcfCutoff(s.vcfCutoff);setVcfRes(s.vcfRes);setFilterEnvAmt(s.filterEnvAmt);
    setDlyIdx(s.dlyIdx);setDlyFbPct(s.dlyFbPct);setDlyWetPct(s.dlyWetPct);setDlyHpVal(s.dlyHpVal);setDlyLpVal(s.dlyLpVal);
    setVDropRate(s.vDropRate);setVShiftRate(s.vShiftRate);setVShiftRange(s.vShiftRange);
    setVPitchRate(s.vPitchRate);setVPitchRange(s.vPitchRange);setVGhostRate(s.vGhostRate);
    setVVelJitter(s.vVelJitter);setVFltJitter(s.vFltJitter);setVDlyJitter(s.vDlyJitter);
    setVRhyJitter(s.vRhyJitter);setVOctJitter(s.vOctJitter);setVGlideJitter(s.vGlideJitter);setVDurJitter(s.vDurJitter);
  };
  // Stable function references — read live state via the refs above
  const pushHistoryR = useRef(()=>{});
  pushHistoryR.current = ()=>{
    const snap=captureSnapshotR.current();
    if(!snap)return;
    historyR.current.push(snap);
    if(historyR.current.length>MAX_HISTORY)historyR.current.shift();
    redoR.current=[];
  };
  const pushHistory = ()=>pushHistoryR.current();
  const undo = ()=>{
    if(!historyR.current.length){showFlash("NOTHING TO UNDO");return;}
    redoR.current.push(captureSnapshotR.current());
    if(redoR.current.length>MAX_HISTORY)redoR.current.shift();
    applySnapshot(historyR.current.pop());
    showFlash("UNDO");
  };
  const redo = ()=>{
    if(!redoR.current.length){showFlash("NOTHING TO REDO");return;}
    historyR.current.push(captureSnapshotR.current());
    if(historyR.current.length>MAX_HISTORY)historyR.current.shift();
    applySnapshot(redoR.current.pop());
    showFlash("REDO");
  };


  // ── Undo/Redo keyboard shortcuts ─────────────────────────────────────────
  useEffect(()=>{
    const onKey=(e)=>{
      const isUndo=(e.metaKey||e.ctrlKey)&&!e.shiftKey&&(e.key==="z"||e.key==="Z");
      const isRedo=(e.metaKey||e.ctrlKey)&&((e.shiftKey&&(e.key==="z"||e.key==="Z"))||(e.key==="y"||e.key==="Y"));
      if(isUndo){e.preventDefault();undo();}
      else if(isRedo){e.preventDefault();redo();}
    };
    document.addEventListener("keydown",onKey);
    return()=>document.removeEventListener("keydown",onKey);
  });

  const doSave=async slot=>{
    const liveLayerStore={...layerStoreR.current};
    if(SYNTH_LAYERS.indexOf(activeLayer)>=0){
      liveLayerStore[activeLayer]={pats,activeId,phrases:synthPhrases,activePhraseId:activeSynthPhraseId};
    }
    const snap={pats,chain,bpm,scale,transpose,swing,speedMult,activeId,activeLayer,layerStore:liveLayerStore,waveform,detune,attack,decay,sustain,vcfCutoff,vcfRes,filterEnvAmt,dlyIdx,dlyFbPct,dlyWetPct,dlyHpVal,dlyLpVal,varyMode,loopMode,vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,drumPats,activeDrumId,drumChain,synthPhrases,drumPhrases,sections,activeSynthPhraseId,activeDrumPhraseId,activeSectionId,songMatrix,songMode};
    const next=Object.assign({},slotData,{[slot]:snap});
    setSlotData(next);await storageSet("slots",JSON.stringify(next));showFlash("SAVED "+slot);
  };
  // ── Load-time sanitizers ──────────────────────────────────────────────────
  // Saved projects can contain stale chain entries: legacy name strings ("A","B")
  // from before chains were id-keyed, or ids referencing patterns that no longer
  // exist. Filter to valid ids only, with a name→id migration pass for legacy
  // saves where pats still carry their old name field.
  const sanitizeChain=(chain,pats)=>{
    if(!Array.isArray(chain))return[];
    const idSet=new Set(pats.map(p=>p.id));
    const nameToId=new Map(pats.map(p=>[p.name,p.id]));
    return chain
      .map(e=>idSet.has(e)?e:(typeof e==="string"&&nameToId.has(e)?nameToId.get(e):null))
      .filter(x=>x!=null);
  };
  const sanitizePhrases=(phrases,pats)=>{
    if(!Array.isArray(phrases))return phrases;
    return phrases.map(ph=>Object.assign({},ph,{chain:sanitizeChain(ph.chain||[],pats)}));
  };
  const doLoad=slot=>{
    const s=slotData[slot];if(!s)return;
    if(s.layerStore){
      for(const layer of SYNTH_LAYERS){
        if(s.layerStore[layer]){
          const ld=JSON.parse(JSON.stringify(s.layerStore[layer]));
          if(ld.pats&&ld.phrases)ld.phrases=sanitizePhrases(ld.phrases,ld.pats);
          layerStoreR.current[layer]=ld;
        }
      }
    }
    if(s.activeLayer)setActiveLayer(s.activeLayer);
    const maxId=Math.max(0,...s.pats.map(p=>p.id));if(maxId>=_id)_id=maxId+1;
    const cleanChain=sanitizeChain(s.chain,s.pats);
    setPats(s.pats);setChain(cleanChain.length?cleanChain:[s.activeId||s.pats[0].id]);setBpm(s.bpm);setScale(s.scale);setTranspose(s.transpose||0);if(s.swing!=null)setSwing(s.swing);if(s.speedMult!=null)setSpeedMult(s.speedMult);setActiveId(s.activeId);
    if(s.waveform)setWaveform(s.waveform);
    [["detune",setDetune],["attack",setAttack],["decay",setDecay],["sustain",setSustain],
     ["vcfCutoff",setVcfCutoff],["vcfRes",setVcfRes],["filterEnvAmt",setFilterEnvAmt],
     ["dlyIdx",setDlyIdx],["dlyFbPct",setDlyFbPct],["dlyWetPct",setDlyWetPct],["dlyHpVal",setDlyHpVal],["dlyLpVal",setDlyLpVal],
     ["vDropRate",setVDropRate],["vShiftRate",setVShiftRate],["vShiftRange",setVShiftRange],
     ["vPitchRate",setVPitchRate],["vPitchRange",setVPitchRange],["vGhostRate",setVGhostRate],
     ["vVelJitter",setVVelJitter],["vFltJitter",setVFltJitter],["vDlyJitter",setVDlyJitter],
     ["vRhyJitter",setVRhyJitter],["vOctJitter",setVOctJitter],["vGlideJitter",setVGlideJitter],["vDurJitter",setVDurJitter]
    ].forEach(([k,fn])=>{if(s[k]!=null)fn(s[k]);});
    if(s.loopMode!=null)setLoopMode(s.loopMode);
    if(s.varyMode!=null)setVaryMode(s.varyMode);
    if(s.drumPats)setDrumPats(s.drumPats);
    if(s.activeDrumId!=null)setActiveDrumId(s.activeDrumId);
    if(s.drumChain)setDrumChain(sanitizeChain(s.drumChain,s.drumPats||[]));
    if(s.synthPhrases)setSynthPhrases(sanitizePhrases(s.synthPhrases,s.pats));
    if(s.drumPhrases)setDrumPhrases(sanitizePhrases(s.drumPhrases,s.drumPats||[]));
    if(s.sections)setSections(s.sections);
    if(s.activeSynthPhraseId)setActiveSynthPhraseId(s.activeSynthPhraseId);
    if(s.activeDrumPhraseId)setActiveDrumPhraseId(s.activeDrumPhraseId);
    if(s.activeSectionId)setActiveSectionId(s.activeSectionId);
    if(s.songMatrix){
      // Sanitize each lane against its layer's current pats. Drop entries
      // referencing pat IDs that no longer exist; pad to 64.
      const padTo64=arr=>{const a=Array.isArray(arr)?arr.slice(0,64):[];while(a.length<64)a.push(null);return a;};
      const filterIds=(arr,pats)=>{const ids=new Set((pats||[]).map(p=>p.id));return arr.map(v=>v!=null&&ids.has(v)?v:null);};
      const synthPats=s.pats||[];
      const leadPats=s.layerStore?.lead?.pats||[];
      const bassPats=s.layerStore?.bass?.pats||[];
      const drumPats=s.drumPats||[];
      setSongMatrix({
        synth: filterIds(padTo64(s.songMatrix.synth),synthPats),
        lead:  filterIds(padTo64(s.songMatrix.lead),leadPats),
        bass:  filterIds(padTo64(s.songMatrix.bass),bassPats),
        drums: filterIds(padTo64(s.songMatrix.drums),drumPats)
      });
    }
    if(s.songMode!=null)setSongMode(s.songMode);
    showFlash("LOADED "+slot);
  };
  const saveSlot=slot=>{
    if(slotData[slot]){setConfirmAction({type:"save",slot,label:"OVERWRITE "+slot+"?"});return;}
    doSave(slot);
  };
  const loadSlot=slot=>{
    if(!slotData[slot])return;
    const hasContent=pats.some(p=>p.grid.some(r=>r.some(c=>c)))||drumPats.some(p=>p.grid.some(r=>r.some(c=>c)));
    if(hasContent){setConfirmAction({type:"load",slot,label:"LOAD "+slot+"? UNSAVED WORK LOST"});return;}
    doLoad(slot);
  };
  const confirmYes=()=>{
    if(!confirmAction)return;
    if(confirmAction.type==="save")doSave(confirmAction.slot);
    else doLoad(confirmAction.slot);
    setConfirmAction(null);
  };
  const confirmNo=()=>setConfirmAction(null);

  const activePat=pats.find(p=>p.id===activeId);
  const gridLen=activePat?.gridLen??16;
  useEffect(()=>{gridLenR.current=gridLen;},[gridLen]);

  // Measure edit area for square grid — callback ref re-runs when element mounts/unmounts
  const [gridPx, setGridPx] = useState(null);
  const [editOuter, setEditOuter] = useState(null);
  const editOuterRef = useCallback(node => setEditOuter(node), []);
  useEffect(()=>{
    if(!editOuter) return;
    const ro = new ResizeObserver(entries=>{
      const {width,height} = entries[0].contentRect;
      setGridPx(Math.floor(Math.min(width,height)) - 16);
    });
    ro.observe(editOuter);
    return ()=>ro.disconnect();
  },[editOuter]);

  // ── Share / Export / Import ──────────────────────────────────────────────
  const getShareState=()=>({
    pats,chain,bpm,scale,transpose,swing,speedMult,activeId,
    waveform,detune,attack,decay,sustain,vcfCutoff,vcfRes,filterEnvAmt,
    dlyIdx,dlyFbPct,dlyWetPct,dlyHpVal,dlyLpVal,
    vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,
    vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,
    loopMode,varyMode,drumPats,activeDrumId,drumChain,
    synthPhrases,drumPhrases,sections,activeSynthPhraseId,activeDrumPhraseId,activeSectionId,
    songMatrix,songMode,layerStore:layerStoreR.current
  });

  const applyShareState=s=>{
    if(!s)return;
    const maxId=Math.max(0,...(s.pats||[]).map(p=>p.id));if(maxId>=_id)_id=maxId+1;
    if(s.pats)setPats(s.pats);
    if(s.chain){const cc=sanitizeChain(s.chain,s.pats||[]);setChain(cc.length?cc:[s.activeId||(s.pats&&s.pats[0]&&s.pats[0].id)||1]);}
    if(s.bpm)setBpm(s.bpm);
    if(s.scale)setScale(s.scale);
    if(s.transpose!=null)setTranspose(s.transpose);
    if(s.swing!=null)setSwing(s.swing);
    if(s.gridLen!=null)setGridLen(s.gridLen);
    if(s.speedMult!=null)setSpeedMult(s.speedMult);
    if(s.activeId)setActiveId(s.activeId);
    if(s.waveform)setWaveform(s.waveform);
    if(s.loopMode!=null)setLoopMode(s.loopMode);
    if(s.varyMode!=null)setVaryMode(s.varyMode);
    if(s.drumPats)setDrumPats(s.drumPats);
    if(s.activeDrumId!=null)setActiveDrumId(s.activeDrumId);
    if(s.drumChain)setDrumChain(sanitizeChain(s.drumChain,s.drumPats||[]));
    if(s.synthPhrases)setSynthPhrases(sanitizePhrases(s.synthPhrases,s.pats||[]));
    if(s.drumPhrases)setDrumPhrases(sanitizePhrases(s.drumPhrases,s.drumPats||[]));
    if(s.sections)setSections(s.sections);
    if(s.activeSynthPhraseId)setActiveSynthPhraseId(s.activeSynthPhraseId);
    if(s.activeDrumPhraseId)setActiveDrumPhraseId(s.activeDrumPhraseId);
    if(s.activeSectionId)setActiveSectionId(s.activeSectionId);
    [["detune",setDetune],["attack",setAttack],["decay",setDecay],["sustain",setSustain],
     ["vcfCutoff",setVcfCutoff],["vcfRes",setVcfRes],["filterEnvAmt",setFilterEnvAmt],
     ["dlyIdx",setDlyIdx],["dlyFbPct",setDlyFbPct],["dlyWetPct",setDlyWetPct],["dlyHpVal",setDlyHpVal],["dlyLpVal",setDlyLpVal],
     ["vDropRate",setVDropRate],["vShiftRate",setVShiftRate],["vShiftRange",setVShiftRange],
     ["vPitchRate",setVPitchRate],["vPitchRange",setVPitchRange],["vGhostRate",setVGhostRate],
     ["vVelJitter",setVVelJitter],["vFltJitter",setVFltJitter],["vDlyJitter",setVDlyJitter],
     ["vRhyJitter",setVRhyJitter],["vOctJitter",setVOctJitter],["vGlideJitter",setVGlideJitter],["vDurJitter",setVDurJitter],
    ].forEach(([k,fn])=>{if(s[k]!=null)fn(s[k]);});
    if(s.songMatrix){
      const padTo64=arr=>{const a=Array.isArray(arr)?arr.slice(0,64):[];while(a.length<64)a.push(null);return a;};
      const filterIds=(arr,pats)=>{const ids=new Set((pats||[]).map(p=>p.id));return arr.map(v=>v!=null&&ids.has(v)?v:null);};
      setSongMatrix({
        synth: filterIds(padTo64(s.songMatrix.synth),s.pats||[]),
        lead:  filterIds(padTo64(s.songMatrix.lead),s.layerStore?.lead?.pats||[]),
        bass:  filterIds(padTo64(s.songMatrix.bass),s.layerStore?.bass?.pats||[]),
        drums: filterIds(padTo64(s.songMatrix.drums),s.drumPats||[])
      });
    }
    if(s.songMode!=null)setSongMode(s.songMode);
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

      // ── Song-mode pat resolution ─────────────────────────────────────────
      // When songMode is on, all four layers advance together through songMatrix.
      // Bar duration = min(gridLen) of populated pats this bar, default 16.
      // Loops between firstPopulatedBar..lastPopulatedBar (option B).
      // Empty matrix → falls back to looping the active synth pattern at bar 0.
      const inSong = songModeR.current;
      let songSyn=null, songLead=null, songBass=null, songDrum=null;
      let songBarLen=16, songFirstBar=0, songLastBar=0, songCurBar=0;
      if(inSong){
        const sm=songMatrixR.current;
        let firstBar=-1, lastBar=-1;
        for(let i=0;i<64;i++){
          if(sm.synth[i]!=null||sm.lead[i]!=null||sm.bass[i]!=null||sm.drums[i]!=null){
            if(firstBar===-1)firstBar=i;
            lastBar=i;
          }
        }
        const empty=firstBar===-1;
        if(empty){firstBar=0;lastBar=0;}
        let bar=songBarR.current;
        if(bar<firstBar||bar>lastBar)bar=firstBar;
        songFirstBar=firstBar; songLastBar=lastBar; songCurBar=bar;
        const sId=sm.synth[bar], lId=sm.lead[bar], bId=sm.bass[bar], dId=sm.drums[bar];
        const sIdEff = sId!=null ? sId : (empty ? activeIdR.current : null);
        songSyn = sIdEff!=null ? patsR.current.find(x=>x.id===sIdEff) : null;
        const leadData = activeLayerR.current==="lead" ? {pats:patsR.current,activeId:activeIdR.current} : layerStoreR.current.lead;
        const bassData = activeLayerR.current==="bass" ? {pats:patsR.current,activeId:activeIdR.current} : layerStoreR.current.bass;
        songLead = lId!=null && leadData ? leadData.pats.find(x=>x.id===lId) : null;
        songBass = bId!=null && bassData ? bassData.pats.find(x=>x.id===bId) : null;
        songDrum = dId!=null ? drumPatsR.current.find(x=>x.id===dId) : null;
        const lens=[];
        if(songSyn) lens.push(songSyn.gridLen??16);
        if(songLead) lens.push(songLead.gridLen??16);
        if(songBass) lens.push(songBass.gridLen??16);
        if(songDrum) lens.push(songDrum.gridLen??16);
        songBarLen = lens.length ? Math.min(...lens) : 16;
        if(songCurBar!==songBarR.current){songBarR.current=songCurBar;setSongBar(songCurBar);}
      }

      const ch=loopR.current?[activeIdR.current]:chainR.current;
      if(ch.length||inSong){
        const cp=cposR.current,s=s_;
        let pid, p, activeLen;
        if(inSong){
          p = songSyn; pid = p?p.id:-1; activeLen = songBarLen;
        } else {
          pid=ch[cp]; p=patsR.current.find(x=>x.id===pid); activeLen=p?(p.gridLen??16):16;
        }
        if(s===0&&varyModeR.current&&p){
          let vg=genVariation(p.grid,varyParamsR.current);
          variedGrids.current.set(pid,vg);
          // Self-record: always vary the original source pattern, not the current playing one
          if(recModeR.current&&patsR.current.length<8){
            const vp=varyParamsR.current;
            const src=patsR.current.find(x=>x.id===recSourceIdR.current)||p;
            let rvg=genVariation(src.grid,vp);
            const newParams=(src.params||defaultStepParams()).map(sp=>jitterStepParam(sp,vp));
            const newPat={id:++_id,name:symPat(patsR.current.length),grid:rvg,params:newParams,gridLen:src.gridLen??16};
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
        // Lead & Bass — play their currently-active pattern through the same Bell
        for(const layer of ["lead","bass"]){
          let lp, lLen;
          if(inSong){
            lp = layer==="lead" ? songLead : songBass;
            if(!lp||!lp.grid)continue;
            lLen = songBarLen;
          } else {
            const lData=activeLayerR.current===layer
              ?{pats:patsR.current,activeId:activeIdR.current}
              :layerStoreR.current[layer];
            if(!lData)continue;
            lp=lData.pats.find(x=>x.id===lData.activeId);
            if(!lp||!lp.grid)continue;
            lLen=lp.gridLen??16;
          }
          const ls=s%lLen;
          const lRawSp=(lp.params&&lp.params[ls])?lp.params[ls]:null;
          const lSp=varyModeR.current&&lRawSp?jitterStepParam(lRawSp,varyParamsR.current):lRawSp;
          const lRhy=lSp?Math.max(1,Math.round(lSp.rhy??1)):1;
          if(lRhy===0)continue; // tied step
          const lSubDur=stepDur/lRhy;
          let lNoteDur=stepDur;
          if(lp.params){
            let ts=(ls+1)%COLS,count=0;
            while(count<COLS-1&&lp.params[ts]&&Math.round(lp.params[ts].rhy??1)===0){
              lNoteDur+=stepDur;ts=(ts+1)%COLS;count++;
            }
          }
          for(let r=0;r<ROWS;r++){
            if(!lp.grid[r][ls])continue;
            const lOctShift=lSp?(lSp.oct-2):0;
            // Bass auto-octave: -1 octave default to differentiate
            const layerOct=layer==="bass"?-1:0;
            const lF=freqs[r]*ratio*Math.pow(2,layerOct);
            if(lRhy>1){
              for(let ri=0;ri<lRhy;ri++)bell.current.play(lF*Math.pow(2,lOctShift),at+ri*lSubDur,lSp,lSubDur*0.9,dlyWetPctR.current,null,0);
            } else {
              bell.current.play(lF*Math.pow(2,lOctShift),at,lSp,lNoteDur,dlyWetPctR.current,null,0);
            }
          }
        }
        // Drum layer — uses drumChain for sequencing (or song matrix in song mode)
        if(drumEngine.current.ready){
          let dPat, dLen, ds, dChain=null, dcp=0;
          if(inSong){
            dPat = songDrum;
            if(dPat){ dLen=songBarLen; ds=s%dLen; }
          } else {
            dChain=drumChainR.current;
            dcp=drumCposR.current;
            const dPatId=dChain.length?dChain[dcp%dChain.length]:activeDrumIdR.current;
            dPat=drumPatsR.current.find(x=>x.id===dPatId)||drumPatsR.current[0];
            if(dPat){ dLen=dPat.gridLen??16; ds=s%dLen; }
          }
          if(dPat){
            // Advance drum chain position at loop boundary (skip in song mode)
            if(!inSong && ds===dLen-1 && dChain && dChain.length>1){
              const next=(dcp+1)%dChain.length;
              drumCposR.current=next;setDrumCpos(next);
            }
            // Generate drum variation at loop start (step 0)
            if(ds===0&&varyModeR.current){
              const vRhythm=(dPat.vRhythm||0)/100;
              const vVelocity=(dPat.vVelocity||0)/100;
              // Varied grid: drop hits (rate=vRhythm*0.5) and ghost new ones (rate=vRhythm*0.25)
              const vGrid=dPat.grid.map(row=>row.map((on,ci)=>{
                if(ci>=dLen)return false;
                if(on&&Math.random()<vRhythm*0.45)return false; // drop
                if(!on&&Math.random()<vRhythm*0.18)return true;  // ghost
                return on;
              }));
              // Varied vel: jitter each step's velocity within ±50% of vVelocity range
              const vVel=dPat.vel.map(v=>Math.max(1,Math.min(127,
                Math.round(v+(Math.random()*2-1)*vVelocity*50)
              )));
              variedDrumGrids.current.set(dPat.id,vGrid);
              variedDrumVels.current.set(dPat.id,vVel);
            }
            const useGrid=varyModeR.current?(variedDrumGrids.current.get(dPat.id)||dPat.grid):dPat.grid;
            const useVel=varyModeR.current?(variedDrumVels.current.get(dPat.id)||dPat.vel):dPat.vel;
            for(let r=0;r<DRUM_ROWS;r++){
              if(useGrid[r]&&useGrid[r][ds]){
                const dVel=useVel?.[ds]??100;
                const dMix=(dPat.mix||defaultDrumMix())[r]||{level:100,pan:0};
                drumEngine.current.play(DRUM_VOICES[r].key,at,dVel,dMix.level,dMix.pan);
              }
            }
            setDrumStep(ds);
          }
        }
        setStep(s);setCpos(cp);setPlayId(pid);
        const ns=(s+1)%activeLen;stepR.current=ns;
        if(ns===0){
          if(inSong){
            let nextBar=songCurBar+1;
            if(nextBar>songLastBar)nextBar=songFirstBar;
            songBarR.current=nextBar;setSongBar(nextBar);
          } else {
            cposR.current=(cp+1)%ch.length;
          }
        }
      }
      nextNoteR.current+=stepDur;
    }
  },[]);

  const startStop=async()=>{
    if(playing){
      clearInterval(tmrR.current);
      setPlaying(false);setStep(-1);setPlayId(null);setDrumStep(-1);
      setSongBar(-1);songBarR.current=-1;
      prevFreqByRowR.current={};lastPlayedFreqR.current=null;lastGlideEnabledR.current=false;
      setRecMode(false);recModeR.current=false;
      if(silentLoopR.current){try{silentLoopR.current.pause();}catch(e){}}
      releaseWakeLock();
      if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused";
      return;
    }
    const dlyT=(60/bpm)*DLY_NOTES[dlyIdx].mult;
    if(!bell.current.ready)await bell.current.init(dlyT,dlyFbPct/100,dlyWetPct,dlyHpVal,dlyLpVal);
    else await bell.current.resume();
    bell.current.stepDur=60/bpm/4*speedMult;
    await drumEngine.current.init(bell.current.master);
    if(!loopR.current&&!chainR.current.length){chainR.current=[activeId];setChain([activeId]);}
    // Silent loop — keeps iOS WebKit audio session alive through screen lock/bg
    if(!silentLoopR.current)silentLoopR.current=createSilentLoop();
    if(silentLoopR.current){try{await silentLoopR.current.play();}catch(e){}}
    // Wake lock — prevent auto screen-off while playing
    await requestWakeLock();
    // MediaSession — lock screen transport controls + registers as audio app
    if("mediaSession" in navigator){
      try{
        navigator.mediaSession.metadata=new MediaMetadata({
          title:"Tabula",artist:"Sequencer",album:"",
          artwork:[{src:"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 96 96'%3E%3Crect width='96' height='96' fill='%231a1814'/%3E%3Ctext x='48' y='64' text-anchor='middle' font-size='44' fill='%23c4a882' font-family='Georgia%2Cserif' font-weight='bold'%3ET%3C/text%3E%3C/svg%3E",sizes:"96x96",type:"image/svg+xml"}]
        });
        navigator.mediaSession.playbackState="playing";
        navigator.mediaSession.setActionHandler("play",()=>{if(!playingR.current)startStop();});
        navigator.mediaSession.setActionHandler("pause",()=>{if(playingR.current)startStop();});
        navigator.mediaSession.setActionHandler("stop",()=>{if(playingR.current)startStop();});
      }catch(e){}
    }
    stepR.current=0;cposR.current=0;
    if(songMode){
      const sm=songMatrix;
      let firstBar=-1;
      for(let i=0;i<64;i++){
        if(sm.synth[i]!=null||sm.lead[i]!=null||sm.bass[i]!=null||sm.drums[i]!=null){firstBar=i;break;}
      }
      if(firstBar===-1)firstBar=0;
      songBarR.current=firstBar;setSongBar(firstBar);
    }
    nextNoteR.current=bell.current.ctx.currentTime+0.05; // small initial offset
    tmrR.current=setInterval(scheduler,25);setPlaying(true);
  };
  useEffect(()=>()=>clearInterval(tmrR.current),[]);

  // ── iOS audio session + wake lock management ──────────────────────────────
  useEffect(()=>{
    // Resume AudioContext and silent loop when page becomes visible
    const onVisible=async()=>{
      if(document.visibilityState==="visible"){
        if(bell.current.ctx&&bell.current.ctx.state==="suspended"){
          try{await bell.current.ctx.resume();}catch(e){}
        }
        if(drumEngine.current.ctx&&drumEngine.current.ctx.state==="suspended"){
          try{await drumEngine.current.ctx.resume();}catch(e){}
        }
        // Re-play silent loop (iOS may have paused it)
        if(silentLoopR.current&&silentLoopR.current.paused){
          try{await silentLoopR.current.play();}catch(e){}
        }
        // Re-request wake lock if playing
        if(playingR.current)requestWakeLock();
      }
    };
    // iOS pageshow fires when returning from bfcache (app switch)
    const onPageShow=async(e)=>{
      if(e.persisted){
        if(bell.current.ctx&&bell.current.ctx.state==="suspended"){
          try{await bell.current.ctx.resume();}catch(e2){}
        }
        if(silentLoopR.current&&silentLoopR.current.paused){
          try{await silentLoopR.current.play();}catch(e2){}
        }
      }
    };
    document.addEventListener("visibilitychange",onVisible);
    window.addEventListener("pageshow",onPageShow);
    return()=>{
      document.removeEventListener("visibilitychange",onVisible);
      window.removeEventListener("pageshow",onPageShow);
    };
  },[]);

  // Keep a ref to playing state for use in event handlers
  const playingR=useRef(false);
  useEffect(()=>{playingR.current=playing;},[playing]);

  const requestWakeLock=async()=>{
    if(!("wakeLock" in navigator))return;
    try{
      if(wakeLockR.current)return; // already held
      wakeLockR.current=await navigator.wakeLock.request("screen");
      wakeLockR.current.addEventListener("release",()=>{wakeLockR.current=null;});
    }catch(e){}
  };
  const releaseWakeLock=()=>{
    if(wakeLockR.current){try{wakeLockR.current.release();}catch(e){}wakeLockR.current=null;}
  };

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

  const mutatePat1=()=>{pushHistory();return mutatePat(g=>{
    const varied=genVariation(g,varyParamsR.current);
    return varied;
  });};

  // ── Octave Rectify ──────────────────────────────────────────────────────
  // Collapse oct step-param mods onto the grid where possible.
  // Each scale has 7 rows/octave (SCALE_SPAN). Shifting a note by 7 grid rows
  // is musically equivalent to shifting its oct param by ±1. This tries to
  // maximize the number of columns where oct=0 (unmodified), optionally
  // applying a global octave offset that benefits the whole pattern.
  const rectifyOctaves=()=>{
    pushHistory();
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeId)return p;
      const OCT=SCALE_SPAN; // 7 rows per octave
      const cols=[];
      for(let c=0;c<COLS;c++){
        const rows=[];
        for(let r=0;r<ROWS;r++)if(p.grid[r][c])rows.push(r);
        const oct=((p.params&&p.params[c])?p.params[c].oct:2)-2;
        cols.push({c,rows,oct});
      }
      const colsAbs=cols.map(col=>({...col,abs:col.rows.map(r=>r+col.oct*OCT)}));
      let bestShift=0,bestUnmodified=-1;
      for(let go=-2;go<=2;go++){
        const gs=go*OCT;
        let unmodified=0;
        for(const col of colsAbs){
          if(col.abs.length===0){unmodified++;continue;}
          const shifted=col.abs.map(a=>a+gs);
          if(shifted.every(s=>s>=0&&s<ROWS))unmodified++;
        }
        if(unmodified>bestUnmodified){bestUnmodified=unmodified;bestShift=gs;}
      }
      const newGrid=Array.from({length:ROWS},()=>new Array(COLS).fill(false));
      const baseParams=p.params||defaultStepParams();
      const newParams=baseParams.map(sp=>({...sp}));
      for(const col of colsAbs){
        if(col.abs.length===0){
          newParams[col.c]={...newParams[col.c],oct:2};
          continue;
        }
        const shifted=col.abs.map(a=>a+bestShift);
        if(shifted.every(s=>s>=0&&s<ROWS)){
          for(const r of shifted)newGrid[r][col.c]=true;
          newParams[col.c]={...newParams[col.c],oct:2};
          continue;
        }
        let chosenOct=null;
        for(let o=-2;o<=2;o++){
          const adj=shifted.map(s=>s-o*OCT);
          if(adj.every(a=>a>=0&&a<ROWS)){chosenOct=o;break;}
        }
        if(chosenOct==null){
          chosenOct=0;
          for(const s of shifted){
            const r=Math.max(0,Math.min(ROWS-1,s));
            newGrid[r][col.c]=true;
          }
        } else {
          for(const s of shifted){
            const r=s-chosenOct*OCT;
            newGrid[r][col.c]=true;
          }
        }
        newParams[col.c]={...newParams[col.c],oct:chosenOct+2};
      }
      return Object.assign({},p,{grid:newGrid,params:newParams});
    }));
  };

  const handleGridDown=useCallback(e=>{
    pushHistory();
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
      if(gridRef.current){gridRef.current.setPointerCapture(e.pointerId);gesture.current.capturedId=e.pointerId;}
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
        if(gridRef.current){gridRef.current.setPointerCapture(e.pointerId);gesture.current.capturedId=e.pointerId;}
        const pat=patsR.current.find(p=>p.id===activeIdR.current);
        g.baseGrid=pat?pat.grid.map(r=>[...r]):null;
        g.baseParams=pat?(pat.params||defaultStepParams()).map(s=>({...s})):null;
      }
      return;
    }

    // Compute cell from physical coordinates — most reliable on mobile
    // (elementFromPoint and e.target both fail when note rects intercept)
    const gridEl=gridRef.current;
    let r=null,c=null,hasCell=false,cellFracX=0.5;
    if(gridEl){
      const rect=gridEl.getBoundingClientRect();
      const relY=e.clientY-rect.top, relX=e.clientX-rect.left;
      const ri=Math.floor(relY/(rect.height/ROWS));
      const ci=Math.floor(relX/(rect.width/COLS));
      if(ri>=0&&ri<ROWS&&ci>=0&&ci<COLS){
        r=ri;c=ci;hasCell=true;
        cellFracX=(relX-ci*(rect.width/COLS))/(rect.width/COLS);
      }
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
        if(gridRef.current){gridRef.current.setPointerCapture(e.pointerId);gesture.current.capturedId=e.pointerId;}
        return;
      }
      g.state="popup";
      if(gridRef.current){gridRef.current.setPointerCapture(e.pointerId);gesture.current.capturedId=e.pointerId;}
      return;
    }

    g.state="pending";g.startX=e.clientX;g.startY=e.clientY;g.appliedDX=0;g.appliedDY=0;
    g.baseGrid=pat?pat.grid.map(r=>[...r]):null;
    // Record initial cell and whether it had a note (for paint mode)
    g.paintStartCell=hasCell&&!isNaN(r)&&!isNaN(c)?{r,c,wasOn:!!(pat&&pat.grid[r]&&pat.grid[r][c])}:null;

    // Tie gesture: press on left portion (<40%) of an existing note with a note to its left
    if(hasCell&&isOnNote&&c>0&&cellFracX<0.4){
      const leftHasNote=pat&&pat.grid[r]&&pat.grid[r][c-1];
      if(leftHasNote){
        clearTimeout(longPressR.current);longPressR.current=null;
        g.paintStartCell=null; // cancel normal tap
        const alreadyTied=(pat.params?.[c]?.rhy??1)===0;
        if(alreadyTied){
          setPats(ps=>ps.map(p=>p.id!==activeIdR.current?p:Object.assign({},p,{params:(p.params||defaultStepParams()).map((sp,i)=>i===c?Object.assign({},sp,{rhy:1}):sp)})));
        } else {
          setPats(ps=>ps.map(p=>p.id!==activeIdR.current?p:Object.assign({},p,{params:(p.params||defaultStepParams()).map((sp,i)=>i===c?Object.assign({},sp,{rhy:0}):sp)})));
        }
        g.state="idle";
        try{if(gridRef.current)gridRef.current.releasePointerCapture(e.pointerId);}catch(_){}
        return;
      }
    }
    if(gridRef.current){
      const c0=gridRef.current.querySelector('[data-col="0"]'),c1=gridRef.current.querySelector('[data-col="1"]');
      if(c0&&c1){const px=c1.getBoundingClientRect().left-c0.getBoundingClientRect().left;if(px>2)g.cellPx=px;}
    }
    if(gridRef.current){gridRef.current.setPointerCapture(e.pointerId);gesture.current.capturedId=e.pointerId;}

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
    clearTimeout(longPressR.current);longPressR.current=null;
    // Release pointer capture so grid accepts new touches immediately
    try{if(gridRef.current)gridRef.current.releasePointerCapture(gesture.current.capturedId);}catch(e){}
  },[]);

  const openParamPopup=useCallback((c,ox,oy,baseVals)=>{
    const g=gesture.current;
    g.state="popup";
    popupR.current={col:c,originX:ox,originY:oy,baseValues:baseVals,lockedArm:null};
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
      if(dist<14){
        pr.lockedArm=null; // return to deadzone — unlock so user can re-select arm
        setParamPopup(p=>p?{...p,activeArm:null}:p);
        return;
      }
      // Use the locked arm if already engaged, otherwise pick by angle and lock it
      let bestArm=pr.lockedArm||null;
      if(!bestArm){
        const fingerAngle=Math.atan2(-fdy,fdx)*180/Math.PI;
        let best=null,bestDiff=180;
        ((pr.adaptedArms)||PARAM_ARMS).forEach(arm=>{
          const diff=Math.abs(((fingerAngle-arm.angle)+540)%360-180);
          if(diff<bestDiff){bestDiff=diff;best=arm;}
        });
        if(best){bestArm=best;pr.lockedArm=best;}
      }
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
                const isMono=activeLayerR.current==="lead"||activeLayerR.current==="bass";
                const ng=isMono&&!isExisting?p.grid.map((row,ri)=>row.map((v,ci)=>ci===sc.c?(ri===sc.r):v)):p.grid.map(r=>[...r]);
                const np=(p.params||defaultStepParams()).map(s=>({...s}));
                const colWasEmpty=!p.grid.some(row=>row[sc.c]);
                if(!isMono||isExisting)ng[sc.r][sc.c]=true;
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
            const isMono=activeLayerR.current==="lead"||activeLayerR.current==="bass";
            const ng=isMono?p.grid.map((row,ri)=>row.map((v,ci)=>ci===cc?(ri===cr):v)):p.grid.map(r=>[...r]);
            const np=(p.params||defaultStepParams()).map(s=>({...s}));
            const colWasEmpty=!p.grid.some(row=>row[cc]);
            if(!isMono)ng[cr][cc]=true;
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
      if(popupR.current)popupR.current.lockedArm=null;
      g.state="idle";
      return;
    }

    if(g.state==="pending"){
      // Tap: use paintStartCell which was recorded before pointer capture was set
      const sc=g.paintStartCell;
      if(sc&&!isNaN(sc.r)&&!isNaN(sc.c)){
        const isMono=activeLayerR.current==="lead"||activeLayerR.current==="bass";
        setPats(ps=>ps.map(p=>{
          if(p.id!==activeIdR.current)return p;
          const r=sc.r,c=sc.c;
          // Check if column was empty before this tap
          const colWasEmpty=!p.grid.some(row=>row[c]);
          const wasOn=p.grid[r][c];
          const newGrid=p.grid.map((row,ri)=>{
            if(isMono&&!wasOn){
              // Mono layer: tapping on cell adds it and clears all others in this column
              return row.map((v,ci)=>ci===c?(ri===r):v);
            }
            return ri!==r?row:row.map((v,ci)=>ci===c?!v:v);
          });
          // Reset column params to defaults if we just added the first note
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
  const addPat=()=>{pushHistory();if(pats.length>=8)return;const p=mkPat(symPat(pats.length));setPats(ps=>[...ps,p]);setActiveId(p.id);};
  const dupPat=()=>{if(pats.length>=8)return;const src=pats.find(p=>p.id===activeId);if(!src)return;const p=Object.assign({},mkPat(symPat(pats.length)),{grid:src.grid.map(r=>[...r]),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s)),gridLen:src.gridLen??16});setPats(ps=>[...ps,p]);setActiveId(p.id);};
  const delPat=()=>{if(pats.length<=1)return;const rem=pats.filter(p=>p.id!==activeId);setPats(rem);setChain(c=>c.filter(pid=>pid!==activeId));setActiveId(rem[0].id);};
  const copyPat=()=>{const src=pats.find(p=>p.id===activeId);if(src)setClipboard({grid:src.grid.map(r=>[...r]),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s))});};
  const pastePat=()=>{if(!clipboard)return;setPats(ps=>ps.map(p=>p.id!==activeId?p:Object.assign({},p,{grid:clipboard.grid.map(r=>[...r]),params:clipboard.params.map(s=>Object.assign({},s))})));};
  const clearPat=()=>mutatePat(()=>mkGrid());

  // ID-targeted versions — used by pill context menu so activeId is never involved
  const dupPatId=(id)=>{pushHistory();if(pats.length>=8)return;const src=pats.find(p=>p.id===id);if(!src)return;const p=Object.assign({},mkPat(symPat(pats.length)),{grid:src.grid.map(r=>[...r]),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s)),gridLen:src.gridLen??16});setPats(ps=>[...ps,p]);setActiveId(p.id);};
  const delPatId=(id)=>{pushHistory();if(pats.length<=1)return;const rem=pats.filter(p=>p.id!==id);setPats(rem);setChain(c=>c.filter(pid=>pid!==id));setActiveId(a=>a===id?rem[0].id:a);};
  const copyPatId=(id)=>{const src=pats.find(p=>p.id===id);if(src)setClipboard({grid:src.grid.map(r=>[...r]),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s))});};
  const pastePatId=(id)=>{pushHistory();if(!clipboard)return;setPats(ps=>ps.map(p=>p.id!==id?p:Object.assign({},p,{grid:clipboard.grid.map(r=>[...r]),params:clipboard.params.map(s=>Object.assign({},s))})));};
  const clearPatId=(id)=>{pushHistory();setPats(ps=>ps.map(p=>p.id!==id?p:Object.assign({},p,{grid:mkGrid()})));};
  const randPatId=(id)=>{pushHistory();setPats(ps=>ps.map(p=>{
    if(p.id!==id)return p;
    const isMono=activeLayerR.current==="lead"||activeLayerR.current==="bass";
    let grid;
    if(isMono){
      // One note per column at most, ~50% column-fill density
      grid=Array.from({length:ROWS},()=>new Array(COLS).fill(false));
      for(let c=0;c<COLS;c++){
        if(Math.random()<0.5){
          const r=Math.floor(Math.random()*ROWS);
          grid[r][c]=true;
        }
      }
    } else {
      grid=Array.from({length:ROWS},()=>Array.from({length:COLS},()=>Math.random()<.12));
    }
    return Object.assign({},p,{grid});
  }));};
  const randPat=()=>mutatePat(()=>{
    return Array.from({length:ROWS},()=>Array.from({length:COLS},()=>Math.random()<.12));
  });
  const setDrumCell=(row,col,val)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const grid=p.grid.map((r,ri)=>ri===row?r.map((c,ci)=>ci===col?val:c):r);
    return Object.assign({},p,{grid});
  }));
  const setDrumVel=(col,val)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const vel=p.vel.map((v,i)=>i===col?val:v);
    return Object.assign({},p,{vel});
  }));
  const setDrumLen=(len)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    return Object.assign({},p,{gridLen:len});
  }));
  const clearDrums=()=>{pushHistory();return setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    return Object.assign({},p,{grid:Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(false)),vel:Array.from({length:COLS},()=>100)});
  }));}
  const setDrumMix=(row,key,val)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const mix=(p.mix||defaultDrumMix()).map((m,i)=>i===row?Object.assign({},m,{[key]:val}):m);
    return Object.assign({},p,{mix});
  }));
  const randDrumVel=()=>{pushHistory();return setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const vel=p.vel.map(()=>Math.round(80+Math.random()*Math.random()*47));
    return Object.assign({},p,{vel});
  }));}
  const dupDrumPat=()=>{
    if(drumPats.length>=8)return;
    const src=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
    const d=Object.assign({},mkDrumPat(symPat(drumPats.length)),{
      grid:src.grid.map(r=>[...r]),vel:[...src.vel],gridLen:src.gridLen,
      mix:(src.mix||defaultDrumMix()).map(m=>({...m})),
      vRhythm:src.vRhythm,vVelocity:src.vVelocity
    });
    setDrumPats(ps=>[...ps,d]);setActiveDrumId(d.id);
    setDrumChain(c=>[...c,d.id]);
  };
  const delDrumPat=()=>{
    if(drumPats.length<=1)return;
    const rem=drumPats.filter(p=>p.id!==activeDrumId);
    setDrumPats(rem);setDrumChain(c=>c.filter(id=>id!==activeDrumId));
    setActiveDrumId(rem[0].id);
  };
  const copyDrumPatFn=()=>{
    const src=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
    setDrumClipboard(JSON.parse(JSON.stringify(src)));
  };
  const pasteDrumPatFn=()=>{
    if(!drumClipboard)return;
    setDrumPats(ps=>ps.map(p=>{
      if(p.id!==activeDrumId)return p;
      return Object.assign({},p,{
        grid:drumClipboard.grid.map(r=>[...r]),
        vel:[...drumClipboard.vel],gridLen:drumClipboard.gridLen,
        mix:(drumClipboard.mix||defaultDrumMix()).map(m=>({...m}))
      });
    }));
  };
  const setDrumVary=(key,val)=>setDrumPats(ps=>ps.map(p=>p.id!==activeDrumId?p:Object.assign({},p,{[key]:val})));
  const addDrumPat=()=>{pushHistory();
    if(drumPats.length>=8)return;
    const d=mkDrumPat(symPat(drumPats.length));
    setDrumPats(ps=>[...ps,d]);
    setActiveDrumId(d.id);
  };
    const setStepParam=(col,key,val)=>setPats(ps=>ps.map(p=>{
    if(p.id!==activeId)return p;
    const params=(p.params||defaultStepParams()).map((sp,i)=>i===col?Object.assign({},sp,{[key]:val}):sp);
    return Object.assign({},p,{params});
  }));
  const randStepLane=(key)=>{pushHistory();
    const lane=LANES.find(l=>l.key===key);if(!lane)return;
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeId)return p;
      const params=(p.params||defaultStepParams()).map(sp=>Object.assign({},sp,{[key]:Math.round(lane.min+Math.random()*(lane.max-lane.min))}));
      return Object.assign({},p,{params});
    }));
  };
  const randStepAll=()=>LANES.forEach(l=>randStepLane(l.key));
  const resetStepLane=(key)=>{pushHistory();
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
                      e.currentTarget.setPointerCapture(e.pointerId);
                      const rect=e.currentTarget.getBoundingClientRect();
                      const newPct=Math.max(0,Math.min(1,(e.clientX-rect.left-8)/(rect.width-16)));
                      const newVal=Math.round(newPct*(arm.max-arm.min)+arm.min);
                      setParamPopup(p=>p?{...p,activeArm:arm.key,values:{...p.values,[arm.key]:newVal}}:p);
                    }}
                    onPointerMove={e=>{
                      if(!(e.buttons&1))return;
                      const rect=e.currentTarget.getBoundingClientRect();
                      const newPct=Math.max(0,Math.min(1,(e.clientX-rect.left-8)/(rect.width-16)));
                      const newVal=Math.round(newPct*(arm.max-arm.min)+arm.min);
                      setParamPopup(p=>p?{...p,activeArm:arm.key,values:{...p.values,[arm.key]:newVal}}:p);
                    }}
                    onPointerUp={e=>e.currentTarget.releasePointerCapture(e.pointerId)}>
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
                  ["MUT8",  ()=>act(mutatePat1)],
                  ["OCT⇄",  ()=>act(rectifyOctaves)],
                  ["",      null, true],
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
      <div ref={layoutRef} style={{display:"flex",gap:20,height:"calc(100dvh - 52px)",alignItems:"stretch"}}>

        {/* ── LEFT COLUMN ── */}
        <div className="left-col" style={{width:Math.max(65,winW>900?220:winW>650?120:winW>450?85:60),flexShrink:0,minHeight:0,display:"flex",flexDirection:"column",gap:0,overflow:"hidden"}}>
          {/* Brand + widgets */}
          {!IS_MOBILE&&(
            <>
              <div style={{...S.brand,marginBottom:6,fontSize:winW>900?undefined:winW>650?11:9,letterSpacing:winW>650?4:2}}>TABULA</div>
              <div style={{display:"flex",flexDirection:"column",gap:winW>750?4:3,marginBottom:winW>750?8:4}}>
                <select style={{...S.sel,width:"100%",fontSize:winW>1000?13:winW>550?11:9}} value={scale} onChange={e=>setScale(e.target.value)}>
                  {Object.entries(SCALES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              {/* Speed — CSS grid forces equal cell width regardless of content */}
              <div style={{display:"grid",gridTemplateColumns:winW>900?"repeat(5,1fr)":"repeat(auto-fill,minmax(30px,1fr))",gap:3,marginBottom:winW>900?8:4}}>
                {SPEED_OPTS.map(({label,mult})=>(
                  <button key={label} style={Object.assign({},S.speedBtn,{padding:winW>900?"6px 2px":"4px 1px",fontSize:winW>900?10:8,minWidth:0},speedMult===mult?S.speedBtnOn:{})}
                    onClick={()=>setSpeedMult(mult)}>{label}</button>
                ))}
              </div>
            </>
          )}

          {/* Layer boxes — select layer + pattern, replaces old pills + layer selector */}
          {!IS_MOBILE&&(
            <div style={{flexShrink:0,borderTop:"1px solid rgba(200,185,165,0.08)",paddingTop:6,marginBottom:6,display:"flex",flexDirection:"column",gap:4}}>
              {/* SYNTH layer box */}
              <div style={{border:"1px solid "+(activeLayer==="synth"?"rgba(168,197,160,0.55)":"rgba(200,185,165,0.1)"),borderRadius:8,padding:"5px 6px",cursor:"pointer",background:activeLayer==="synth"?"rgba(168,197,160,0.06)":"transparent",transition:"all .1s"}}
                onClick={()=>setActiveLayer("synth")}>
                <div style={{fontSize:7,letterSpacing:2,color:activeLayer==="synth"?"rgba(168,197,160,0.6)":"rgba(210,195,175,0.25)",fontWeight:500,marginBottom:4}}>SYNTH</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,alignItems:"center"}}>
                  {pats.map((p)=>{
                    const isA=p.id===activeId&&activeLayer==="synth";
                    const isP=playing&&playId===p.id;
                    return(
                      <div key={p.id} style={{padding:"3px 9px",borderRadius:20,border:"1.5px solid #a8c5a0",background:isA?"#a8c5a0":"transparent",color:isA?"#1a1814":"#a8c5a0",fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",gap:3,boxShadow:isP&&!isA?"0 0 10px #a8c5a088":"none"}}
                        onClick={e=>{e.stopPropagation();setActiveId(p.id);setActiveLayer("synth");}}>
                        {isP&&<span style={{fontSize:6,opacity:0.7}}>●</span>}{p.name}
                      </div>
                    );
                  })}
                  {pats.length<8&&<button style={{padding:"3px 7px",borderRadius:20,border:"1px dashed rgba(168,197,160,0.3)",background:"transparent",color:"rgba(168,197,160,0.4)",fontSize:12,lineHeight:1,cursor:"pointer",fontFamily:"inherit"}} onClick={e=>{e.stopPropagation();addPat();}}>＋</button>}
                </div>
              </div>
              {/* DRUMS layer box */}
              <div style={{border:"1px solid "+(activeLayer==="drums"?"rgba(196,150,122,0.55)":"rgba(200,185,165,0.1)"),borderRadius:8,padding:"5px 6px",cursor:"pointer",background:activeLayer==="drums"?"rgba(196,150,122,0.06)":"transparent",transition:"all .1s"}}
                onClick={()=>setActiveLayer("drums")}>
                <div style={{fontSize:7,letterSpacing:2,color:activeLayer==="drums"?"rgba(196,150,122,0.6)":"rgba(210,195,175,0.25)",fontWeight:500,marginBottom:4}}>DRUMS</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,alignItems:"center"}}>
                  {drumPats.map((dp)=>{
                    const isA=dp.id===activeDrumId&&activeLayer==="drums";
                    const isP=playing&&drumCpos>=0&&drumChain[drumCpos]===dp.id;
                    return(
                      <div key={dp.id} style={{padding:"3px 9px",borderRadius:20,border:"1.5px solid #c4967a",background:isA?"#c4967a":"transparent",color:isA?"#1a1814":"#c4967a",fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",gap:3,boxShadow:isP&&!isA?"0 0 10px #c4967a88":"none"}}
                        onClick={e=>{e.stopPropagation();setActiveDrumId(dp.id);setActiveLayer("drums");}} onContextMenu={e=>{e.stopPropagation();setActiveDrumId(dp.id);handleDrumPillCtx(e,dp.id);}}>
                        {isP&&<span style={{fontSize:6,opacity:0.7}}>●</span>}{dp.name}
                      </div>
                    );
                  })}
                  {drumPats.length<8&&<button style={{padding:"3px 7px",borderRadius:20,border:"1px dashed rgba(196,150,122,0.3)",background:"transparent",color:"rgba(196,150,122,0.4)",fontSize:12,lineHeight:1,cursor:"pointer",fontFamily:"inherit"}} onClick={e=>{e.stopPropagation();addDrumPat();}}>＋</button>}
                </div>
              </div>
              {/* Action buttons — context-sensitive to active layer */}
              {activeLayer==="synth"&&(()=>{
                const targetId=activeId;const isOnlyPat=pats.length<=1;
                return(
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:2}}>
                      {[["RAND",()=>randPatId(targetId),false,false],["CLR",()=>clearPatId(targetId),false,false],["OCT⇄",rectifyOctaves,false,false]].map(([l,f,d])=>(
                        <button key={l} style={{padding:"4px 0",border:"1px solid rgba(200,185,165,0.13)",borderRadius:5,background:"transparent",color:"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:"pointer",fontFamily:"inherit"}} onClick={f}>{l}</button>
                      ))}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2}}>
                      {[["CPY",()=>copyPatId(targetId),false,false],["PST",()=>pastePatId(targetId),!clipboard,false],["DUP",()=>dupPatId(targetId),pats.length>=8,false],["DEL",()=>delPatId(targetId),isOnlyPat,true]].map(([l,f,d,danger])=>(
                        <button key={l} disabled={!!d} style={{padding:"4px 0",border:"1px solid rgba(200,185,165,"+(d?"0.06":"0.13")+")",borderRadius:5,background:"transparent",color:d?"rgba(200,185,165,0.18)":danger?"#c47a7a":"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit"}} onClick={d?undefined:f}>{l}</button>
                      ))}
                    </div>
                  </div>
                );
              })()}
              {activeLayer==="drums"&&(()=>{
                const isOnlyDrum=drumPats.length<=1;
                return(
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:2}}>
                      {[["RAND",randDrumVel,false,false],["CLR",clearDrums,false,false],["─",null,true,false]].map(([l,f,d])=>(
                        <button key={l} disabled={!!d} style={{padding:"4px 0",border:"1px solid rgba(200,185,165,"+(d?"0.04":"0.13")+")",borderRadius:5,background:"transparent",color:d?"rgba(200,185,165,0.15)":"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit"}} onClick={d?undefined:f}>{l}</button>
                      ))}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2}}>
                      {[["CPY",copyDrumPatFn,false,false],["PST",pasteDrumPatFn,!drumClipboard,false],["DUP",dupDrumPat,drumPats.length>=8,false],["DEL",delDrumPat,isOnlyDrum,true]].map(([l,f,d,danger])=>(
                        <button key={l} disabled={!!d} style={{padding:"4px 0",border:"1px solid rgba(200,185,165,"+(d?"0.06":"0.13")+")",borderRadius:5,background:"transparent",color:d?"rgba(200,185,165,0.18)":danger?"#c47a7a":"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit"}} onClick={d?undefined:f}>{l}</button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Chain strip + FOLLOW — layer-aware */}
          {!IS_MOBILE&&(
            <div style={{flex:1,minHeight:0,overflowY:"auto",scrollbarWidth:"none"}}>
              {activeLayer==="synth"&&(()=>{
                const overStrip = chainDrag && isOverStrip(chainDrag.y);
                const insertIdx = chainDrag ? getChainInsertIdx(chainDrag.x) : -1;
                return (
                  <div>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                      <span style={{fontSize:10,letterSpacing:1,color:"rgba(200,185,165,0.25)",fontWeight:500}}>SEQ</span>
                      <button style={Object.assign({},S.loopBtnBottom,{height:22,padding:"0 8px",fontSize:9},followSeq?{border:"1px solid #7aaa96",color:"#7aaa96",background:"rgba(122,170,150,0.12)"}:{})} onClick={()=>setFollowSeq(f=>!f)}>FOLLOW</button>
                    </div>
                    <div ref={chainStripRef} style={Object.assign({},S.chainStrip,{marginTop:0},overStrip?S.chainStripHot:{})}>
                      {chain.length===0&&!chainDrag&&<span style={S.chainStripEmpty}>drag patterns here</span>}
                      {chain.map((pid,i)=>{
                        const p=pats.find(p=>p.id===pid);
                        const here=playing&&!loopMode&&i===cpos;
                        const isDragging=chainDrag&&chainDrag.type==='chain'&&chainDrag.fromIdx===i;
                        const showInsert=overStrip&&insertIdx===i;
                        return (
                          <React.Fragment key={i}>
                            {showInsert&&<div style={S.chainInsertLine}/>}
                            <div data-chainslot={i}
                              style={Object.assign({},S.chainChip,{borderColor:"#a8c5a0",background:here?"#a8c5a0":"rgba(168,197,160,0.1)",color:here?"#1a1814":"#a8c5a0",opacity:isDragging?0.3:1,touchAction:"none"})}
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
              {activeLayer==="drums"&&(
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                    <span style={{fontSize:10,letterSpacing:1,color:"rgba(200,185,165,0.25)",fontWeight:500}}>SEQ</span>
                  </div>
                  <div style={Object.assign({},S.chainStrip,{marginTop:0})}>
                    {drumChain.length===0&&<span style={S.chainStripEmpty}>no patterns in chain</span>}
                    {drumChain.map((pid,i)=>{
                      const dp=drumPats.find(p=>p.id===pid);
                      const here=playing&&i===drumCpos;
                      return(
                        <div key={i}
                          style={Object.assign({},S.chainChip,{borderColor:"#c4967a",background:here?"#c4967a":"rgba(196,150,122,0.1)",color:here?"#1a1814":"#c4967a",cursor:"pointer"})}
                          onClick={()=>setDrumChain(c=>c.filter((_,idx)=>idx!==i))}>
                          {dp?dp.name:"?"}<span style={{fontSize:7,opacity:0.5,marginLeft:3}}>×</span>
                        </div>
                      );
                    })}
                  </div>
                  <div style={{marginTop:4,display:"flex",flexWrap:"wrap",gap:3}}>
                    {drumPats.map(dp=>(
                      <div key={dp.id}
                        style={{padding:"3px 8px",borderRadius:20,border:"1px dashed rgba(196,150,122,0.4)",color:"rgba(196,150,122,0.6)",fontSize:9,cursor:"pointer",userSelect:"none"}}
                        onClick={()=>setDrumChain(c=>[...c,dp.id])}>
                        +{dp.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Save/load + share — pinned to bottom of left column */}
          {!IS_MOBILE&&(
            <div style={{flexShrink:0,borderTop:"1px solid rgba(200,185,165,0.08)",paddingTop:10,marginTop:4}}>
              <div style={{marginBottom:6}}>
                <div style={{...S.menuSaveLabel,marginBottom:4}}>SAVE / LOAD</div>
                {flash&&<div style={S.menuFlash}>{flash}</div>}
              {confirmAction&&(
                <div style={{display:"flex",alignItems:"center",gap:4,padding:"5px 6px",background:"rgba(196,150,80,0.1)",border:"1px solid rgba(196,150,80,0.3)",borderRadius:6,marginBottom:5}}>
                  <span style={{flex:1,fontSize:8,letterSpacing:1,color:"rgba(210,190,140,0.9)",fontWeight:500}}>{confirmAction.label}</span>
                  <button style={{padding:"3px 8px",border:"1px solid rgba(210,190,140,0.5)",borderRadius:4,background:"rgba(196,150,80,0.2)",color:"rgba(220,200,150,0.95)",fontSize:8,letterSpacing:1,cursor:"pointer",fontFamily:"inherit",fontWeight:600}} onClick={confirmYes}>YES</button>
                  <button style={{padding:"3px 8px",border:"1px solid rgba(200,185,165,0.2)",borderRadius:4,background:"transparent",color:"rgba(200,185,165,0.5)",fontSize:8,letterSpacing:1,cursor:"pointer",fontFamily:"inherit"}} onClick={confirmNo}>NO</button>
                </div>
              )}

                <div style={{display:"grid",gridTemplateColumns:winW>900?"repeat(4,1fr)":"repeat(auto-fill,minmax(22px,1fr))",gap:3,marginBottom:3}}>
                  {SLOTS.map(slot=>{const has=!!slotData[slot];return(
                    <button key={slot+"sv"} style={{...S.menuSlotBtn,padding:"4px 0",fontSize:8,position:"relative"}}
                      onClick={()=>saveSlot(slot)}>{slot}{has&&<span style={{...S.menuSlotDot,position:"absolute",top:2,right:3}}>●</span>}</button>
                  );})}
                </div>
                <div style={{display:"grid",gridTemplateColumns:winW>900?"repeat(4,1fr)":"repeat(auto-fill,minmax(22px,1fr))",gap:3}}>
                  {SLOTS.map(slot=>{const has=!!slotData[slot];return(
                    <button key={slot+"ld"} style={Object.assign({},S.menuSlotBtn,{padding:"4px 0",fontSize:8},has?S.menuSlotBtnLit:{})}
                      onClick={()=>loadSlot(slot)} disabled={!has}>{slot}</button>
                  );})}
                </div>
              </div>
              <div style={{marginBottom:6}}>
                <div style={S.menuSaveLabel}>SHARE</div>
                {shareFlash&&<div style={S.menuFlash}>{shareFlash}</div>}
                <div style={{display:"grid",gridTemplateColumns:winW>900?"repeat(3,1fr)":"repeat(auto-fill,minmax(36px,1fr))",gap:3}}>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:winW>900?"8px 0":"4px 0",fontSize:winW>900?9:7,minWidth:0})} onClick={copyShareLink}>{winW>650?"LINK":"LNK"}</button>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:winW>900?"8px 0":"4px 0",fontSize:winW>900?9:7,minWidth:0})} onClick={exportJSON}>{winW>650?"EXPORT":"EXP"}</button>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:winW>900?"8px 0":"4px 0",fontSize:winW>900?9:7,minWidth:0})} onClick={()=>importRef.current?.click()}>{winW>650?"IMPORT":"IMP"}</button>
                </div>
                <input ref={importRef} type="file" accept=".json" style={{display:"none"}} onChange={handleImport}/>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT COLUMN ── */}
        <div style={{flex:1,minWidth:0,minHeight:0,display:"grid",gridTemplateRows:"1fr auto auto",overflow:"hidden"}}>
          {/* Page content — always present, fills 1fr */}
          <div ref={editOuterRef} style={{minHeight:0,overflow:"hidden",position:"relative"}}>
            {activeLayer!=="drums"&&page==="edit"&&(
              <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{width:gridPx||"80%",height:gridPx||"80%",display:"flex",flexDirection:"column",flexShrink:0}}>
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
                              pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:"2px",padding:"0 2px"}}>
                              {!inactive&&rhy===2&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}
                              {!inactive&&rhy===3&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}
                              {!inactive&&rhy>=4&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px",width:"100%",height:"86%"}}>
                                {[0,1,2,3].map(i=><div key={i} style={{borderRadius:1,background:"rgba(0,0,0,0.25)"}}/>)}
                              </div>}
                              {!inactive&&(()=>{const octV=p?(p.oct??2):2,sh=octV-2;if(sh===0)return null;const n=Math.abs(sh),up=sh>0;const cols=rhy>=4?2:rhy>=2?rhy:1;return(<div style={{position:'absolute',left:0,right:0,[up?'top':'bottom']:0,display:'flex',flexDirection:up?'column':'column-reverse',gap:3,pointerEvents:'none',zIndex:1}}>{Array.from({length:n},(_,i)=>(<div key={i} style={{height:3,display:'flex',gap:rhy>=4?3:2,padding:'0 2px'}}>{Array.from({length:cols},(_,j)=>(<div key={j} style={{flex:1,background:'#6a5088'}}/>))}</div>))}</div>);})()}
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
                <div style={{position:"absolute",top:IS_MOBILE?-3:-3,bottom:IS_MOBILE?-3:-3,width:IS_MOBILE?3:12,left:`calc(${(gridLen/COLS)*100}% - ${IS_MOBILE?1:6}px)`,background:"rgba(255,255,255,0.8)",borderRadius:3,boxShadow:"0 0 6px rgba(255,255,255,0.4)"}}/>
                <span style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",fontSize:7,color:"rgba(210,195,175,0.3)",letterSpacing:1,pointerEvents:"none"}}>{gridLen}</span>
              </div>
              </div>
              </div>
            )}
            {activeLayer==="drums"&&page==="edit"&&(()=>{
              const dPat=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
              const dLen=(dPat?.gridLen)??16;
              const dw=gridPx||null;
              const dh=dw?Math.floor(dw*DRUM_ROWS/COLS):null;
              return(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
                {/* Drum header: active pattern name + RAND/CLR */}
                <div style={{width:dw||"80%",display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
                  <span style={{fontSize:9,letterSpacing:2,color:"#c4967a",fontWeight:700,opacity:0.7}}>{drumPats.find(p=>p.id===activeDrumId)?.name||"A"}</span>
                  <div style={{flex:1}}/>
                  <button style={{padding:"3px 10px",border:"1px solid rgba(200,185,165,0.15)",borderRadius:5,background:"transparent",color:"rgba(200,185,165,0.5)",fontSize:8,letterSpacing:1,cursor:"pointer",fontFamily:"inherit",marginRight:4}} onClick={randDrumVel}>RAND</button>
                  <button style={{padding:"3px 10px",border:"1px solid rgba(200,185,165,0.15)",borderRadius:5,background:"transparent",color:"rgba(200,185,165,0.5)",fontSize:8,letterSpacing:1,cursor:"pointer",fontFamily:"inherit"}} onClick={clearDrums}>CLR</button>
                </div>
                {/* Grid — labels sit outside dw via position:absolute on wrapper */}
                <div style={{position:"relative",width:dw||"80%",height:dh||"auto",flexShrink:0}}>
                  {/* Label column — positioned left of grid, zero impact on dw */}
                  <div style={{position:"absolute",right:"100%",top:0,bottom:0,width:26,display:"flex",flexDirection:"column",gap:2,paddingRight:4,boxSizing:"border-box"}}>
                    {DRUM_VOICES.map(v=>(<div key={v.key} style={{flex:1,display:"flex",alignItems:"center",justifyContent:"flex-end",fontSize:8,fontWeight:700,letterSpacing:1,color:v.color+"99"}}>{v.label}</div>))}
                  </div>
                  {/* Step cells — fill full dw, no label children */}
                  <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",gap:2}}>
                  {DRUM_VOICES.map((voice,r)=>(
                    <div key={voice.key} style={{flex:1,display:"flex",alignItems:"stretch",gap:2}}>
                      <div style={{flex:1,display:"flex",gap:2}}>
                        {Array.from({length:COLS},(_,c)=>{
                          const on=dPat?.grid[r]?.[c]||false;
                          const isActive=playing&&c===drumStep;
                          const inactive=c>=dLen;
                          const isQ=c%4===0;
                          return(
                            <div key={c} style={{flex:1,borderRadius:2,cursor:inactive?"default":"pointer",background:inactive?"rgba(220,200,180,0.02)":on?(isActive?"rgba(255,255,255,0.9)":voice.color):isActive?"rgba(220,200,180,0.15)":isQ?"rgba(220,200,180,0.06)":"rgba(220,200,180,0.03)",border:"1px solid "+(inactive?"rgba(220,200,180,0.04)":on?voice.color:isQ?"rgba(220,200,180,0.12)":"rgba(220,200,180,0.06)"),boxShadow:on&&isActive?"0 0 6px "+voice.color:"none",transition:"background .06s"}}
                              onPointerDown={e=>{e.stopPropagation();if(!inactive){pushHistory();setDrumCell(r,c,!on);}}}/>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  </div>
                </div>
                {/* Velocity lane */}
                <div style={{width:dw||"80%",height:28,flexShrink:0,display:"flex",gap:2,alignItems:"flex-end",position:"relative"}}>
                  <div style={{position:"absolute",right:"100%",bottom:0,height:"100%",width:26,display:"flex",alignItems:"center",justifyContent:"flex-end",paddingRight:4,fontSize:7,color:"rgba(210,195,175,0.3)",letterSpacing:1}}>VEL</div>
                  <div style={{flex:1,display:"flex",gap:2,alignItems:"flex-end",height:"100%"}}>
                    {Array.from({length:COLS},(_,c)=>{
                      const vel=dPat?.vel?.[c]??100;
                      const inactive=c>=dLen;
                      return(
                        <div key={c} style={{flex:1,height:"100%",display:"flex",alignItems:"flex-end",cursor:inactive?"default":"ns-resize",opacity:inactive?0.2:1}}
                          onPointerDown={e=>{
                            if(inactive)return; e.stopPropagation();
                            const startY=e.clientY,startV=vel;
                            const onMove=ev=>{if(!ev.buttons)return;setDrumVel(c,Math.max(1,Math.min(127,Math.round(startV+(startY-ev.clientY)*1.5))));};
                            const onUp=()=>{document.removeEventListener("pointermove",onMove);document.removeEventListener("pointerup",onUp);};
                            document.addEventListener("pointermove",onMove);document.addEventListener("pointerup",onUp);
                          }}>
                          <div style={{width:"100%",height:((vel/127)*100)+"%",background:"rgba(210,195,175,0.35)",borderRadius:"1px 1px 0 0",minHeight:1}}/>
                        </div>
                      );
                    })}
                  </div>
                </div>
                {/* Length slider */}
                <div style={{...S.lenSlider,flexShrink:0,width:dw||"80%"}}
                  onPointerDown={e=>{e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setDrumLen(Math.max(1,Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*COLS)));}}
                  onPointerMove={e=>{if(!e.buttons)return;e.stopPropagation();const r=e.currentTarget.getBoundingClientRect();setDrumLen(Math.max(1,Math.round(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*COLS)));}}>
                  <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${(dLen/COLS)*100}%`,background:"rgba(210,195,175,0.15)",borderRadius:"3px 0 0 3px"}}/>
                  <div style={{position:"absolute",right:0,top:0,bottom:0,width:`${((COLS-dLen)/COLS)*100}%`,background:"rgba(220,200,180,0.035)",borderRadius:"0 3px 3px 0"}}/>
                  <div style={{position:"absolute",top:-3,bottom:-3,width:12,left:`calc(${(dLen/COLS)*100}% - 6px)`,background:"rgba(255,255,255,0.8)",borderRadius:3,boxShadow:"0 0 6px rgba(255,255,255,0.4)"}}/>
                  <span style={{position:"absolute",right:4,top:"50%",transform:"translateY(-50%)",fontSize:7,color:"rgba(210,195,175,0.3)",letterSpacing:1,pointerEvents:"none"}}>{dLen}</span>
                </div>
              </div>
              );
            })()}
            {activeLayer==="drums"&&page==="step"&&(
              <div style={{height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
                <span style={{fontSize:11,color:"rgba(210,195,175,0.2)",letterSpacing:2}}>DRUMS / STEP</span>
              </div>
            )}
            {activeLayer==="drums"&&page==="sound"&&(()=>{
              const dPat=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
              const mix=dPat?.mix||defaultDrumMix();
              return(
              <div style={{width:"100%",height:"100%",overflowY:"auto",padding:"12px 16px",boxSizing:"border-box"}}>
                <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:12}}>MIXER</div>
                {DRUM_VOICES.map((voice,r)=>{
                  const m=mix[r]||{level:100,pan:0};
                  return(
                  <div key={voice.key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                    {/* Voice label */}
                    <div style={{width:24,flexShrink:0,fontSize:9,fontWeight:700,letterSpacing:1,color:voice.color,textAlign:"right"}}>{voice.label}</div>
                    {/* Level */}
                    <div style={{flex:2,display:"flex",flexDirection:"column",gap:2}}>
                      <div style={{fontSize:7,letterSpacing:1,color:"rgba(210,195,175,0.3)",marginBottom:1}}>LVL <span style={{color:"rgba(210,195,175,0.6)"}}>{m.level}</span></div>
                      <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer"}}
                        onPointerDown={e=>{
                          e.stopPropagation();
                          const rect=e.currentTarget.getBoundingClientRect();
                          const update=ev=>{const pct=Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width));setDrumMix(r,"level",Math.round(pct*100));};
                          update(e);
                          const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};
                          document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);
                        }}>
                        <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${m.level}%`,background:voice.color+"99",borderRadius:3,transition:"width .04s"}}/>
                        <div style={{position:"absolute",top:-3,bottom:-3,width:10,left:`calc(${m.level}% - 5px)`,background:"rgba(255,255,255,0.85)",borderRadius:2,boxShadow:"0 0 4px "+voice.color+"88"}}/>
                      </div>
                    </div>
                    {/* Pan */}
                    <div style={{flex:2,display:"flex",flexDirection:"column",gap:2}}>
                      <div style={{fontSize:7,letterSpacing:1,color:"rgba(210,195,175,0.3)",marginBottom:1}}>PAN <span style={{color:"rgba(210,195,175,0.6)"}}>{m.pan>0?"+"+m.pan:m.pan}</span></div>
                      <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer"}}
                        onPointerDown={e=>{
                          e.stopPropagation();
                          const rect=e.currentTarget.getBoundingClientRect();
                          const update=ev=>{const pct=Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width));setDrumMix(r,"pan",Math.round((pct*2-1)*100));};
                          update(e);
                          const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};
                          document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);
                        }}
                        onDoubleClick={()=>setDrumMix(r,"pan",0)}>
                        {/* Center tick */}
                        <div style={{position:"absolute",left:"50%",top:-1,bottom:-1,width:1,background:"rgba(220,200,180,0.2)"}}/>
                        {/* Pan fill — from center */}
                        <div style={{position:"absolute",top:0,bottom:0,
                          left:m.pan<=0?`${50+m.pan/2}%`:"50%",
                          width:`${Math.abs(m.pan)/2}%`,
                          background:voice.color+"99",borderRadius:3}}/>
                        <div style={{position:"absolute",top:-3,bottom:-3,width:10,left:`calc(${50+m.pan/2}% - 5px)`,background:"rgba(255,255,255,0.85)",borderRadius:2,boxShadow:"0 0 4px "+voice.color+"88"}}/>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
              );
            })()}

            {activeLayer==="drums"&&page==="set"&&(()=>{
              const dPat=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
              const vRhythm=dPat?.vRhythm||0;
              const vVelocity=dPat?.vVelocity||0;
              const SliderRow=({label,value,onChange,accent})=>(
                <div style={{marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:5}}>
                    <span style={{fontSize:9,letterSpacing:2,color:accent||"rgba(210,195,175,0.5)",fontWeight:500}}>{label}</span>
                    <span style={{fontSize:11,color:"rgba(210,195,175,0.7)",fontWeight:300,marginLeft:"auto"}}>{value}<span style={{fontSize:8,color:"rgba(210,195,175,0.35)",marginLeft:2}}>%</span></span>
                  </div>
                  <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer"}}
                    onPointerDown={e=>{
                      e.stopPropagation();
                      const rect=e.currentTarget.getBoundingClientRect();
                      const upd=ev=>{onChange(Math.round(Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width))*100));};
                      upd(e);
                      const up=()=>{document.removeEventListener("pointermove",upd);document.removeEventListener("pointerup",up);};
                      document.addEventListener("pointermove",upd);document.addEventListener("pointerup",up);
                    }}>
                    <div style={{position:"absolute",left:0,top:0,bottom:0,width:value+"%",background:(accent||"rgba(210,195,175,0.4)")+"99",borderRadius:3}}/>
                    <div style={{position:"absolute",top:-4,bottom:-4,width:12,left:`calc(${value}% - 6px)`,background:"rgba(255,255,255,0.85)",borderRadius:2,boxShadow:"0 0 5px "+(accent||"rgba(210,195,175,0.5)")}}/> 
                  </div>
                </div>
              );
              return(
              <div style={{width:"100%",height:"100%",overflowY:"auto",padding:"16px 20px",boxSizing:"border-box"}}>
                <div style={{maxWidth:420}}>
                  <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:16}}>DRUM VARY</div>
                  <div style={{padding:"14px 16px",background:"rgba(220,200,180,0.04)",borderRadius:8,border:"1px solid rgba(220,200,180,0.08)",marginBottom:8}}>
                    <div style={{fontSize:8,letterSpacing:1,color:"rgba(210,195,175,0.25)",marginBottom:12}}>Active when VARY is on. Re-generates each loop.</div>
                    <SliderRow label="RHYTHM" value={vRhythm} onChange={v=>setDrumVary("vRhythm",v)} accent="#c8a840"/>
                    <SliderRow label="VELOCITY" value={vVelocity} onChange={v=>setDrumVary("vVelocity",v)} accent="#7888d0"/>
                  </div>
                  <div style={{fontSize:7,letterSpacing:1,color:"rgba(210,195,175,0.2)",lineHeight:1.6,marginTop:10}}>
                    RHYTHM randomly drops existing hits and adds ghosts each loop cycle. VELOCITY jitters hit strengths around their set values.
                  </div>
                </div>
              </div>
              );
            })()}

            {activeLayer!=="drums"&&page==="step"&&(
              <div style={{...S.stepPage, height:"100%", minHeight:0, overflowY:"scroll", paddingBottom:40, paddingLeft:4, paddingRight:4}}>
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
                          onChange={(col,val)=>setStepParam(col,lane.key,val)} onDragStart={pushHistory}
                          tall/>
                      </div>
                    );
                  })}
                </div>
              )}
            {/* SETTINGS page */}
            {activeLayer!=="drums"&&page==="set"&&(
              <div style={{height:"100%",minHeight:0,overflowY:"auto",padding:"8px 12px 40px"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8,alignItems:"start"}}>
                    <SynthSection title="RHYTHM VARY / MUT8" accent="#c4967a">
                      <div style={{display:"flex",gap:12,padding:"8px 16px 10px",height:160,alignItems:"stretch"}}>
                        <KnobSlider vertical label="DROP"  value={vDropRate}  min={0} max={60} onChange={setVDropRate}  display={vDropRate+"%"}    accent="#c4967a"/>
                        <KnobSlider vertical label="SHIFT" value={vShiftRate} min={0} max={60} onChange={setVShiftRate} display={vShiftRate+"%"}   accent="#c4967a"/>
                        <KnobSlider vertical label="RANGE" value={vShiftRange}min={1} max={8}  onChange={setVShiftRange}display={vShiftRange+"st"} accent="#c4967a"/>
                      </div>
                    </SynthSection>
                    <SynthSection title="MELODY VARY / MUT8" accent="#b5a0c4">
                      <div style={{display:"flex",gap:12,padding:"8px 16px 10px",height:160,alignItems:"stretch"}}>
                        <KnobSlider vertical label="PITCH" value={vPitchRate} min={0} max={60} onChange={setVPitchRate} display={vPitchRate+"%"}   accent="#b5a0c4"/>
                        <KnobSlider vertical label="RANGE" value={vPitchRange}min={1} max={12} onChange={setVPitchRange}display={vPitchRange+"st"} accent="#b5a0c4"/>
                        <KnobSlider vertical label="GHOST" value={vGhostRate} min={0} max={60} onChange={setVGhostRate} display={vGhostRate+"%"}   accent="#b5a0c4"/>
                      </div>
                    </SynthSection>
                    <SynthSection title="STEP VARY / MUT8" accent="#9fb4c7">
                      <div style={{padding:"4px 12px 10px",display:"flex",flexDirection:"column",gap:6}}>
                        <KnobSlider label="VEL"   value={vVelJitter}   min={0} max={100} onChange={setVVelJitter}   display={vVelJitter+"%"}   accent="#9fb4c7"/>
                        <KnobSlider label="FLT"   value={vFltJitter}   min={0} max={100} onChange={setVFltJitter}   display={vFltJitter+"%"}   accent="#9fb4c7"/>
                        <KnobSlider label="DLY"   value={vDlyJitter}   min={0} max={100} onChange={setVDlyJitter}   display={vDlyJitter+"%"}   accent="#9fb4c7"/>
                        <KnobSlider label="RHY"   value={vRhyJitter}   min={0} max={100} onChange={setVRhyJitter}   display={vRhyJitter+"%"}   accent="#9fb4c7"/>
                        <KnobSlider label="OCT"   value={vOctJitter}   min={0} max={100} onChange={setVOctJitter}   display={vOctJitter+"%"}   accent="#9fb4c7"/>
                        <KnobSlider label="GLIDE" value={vGlideJitter} min={0} max={100} onChange={setVGlideJitter} display={vGlideJitter+"%"} accent="#9fb4c7"/>
                        <KnobSlider label="DUR"   value={vDurJitter}   min={0} max={100} onChange={setVDurJitter}   display={vDurJitter+"%"}   accent="#9fb4c7"/>
                      </div>
                    </SynthSection>
                </div>
              </div>
            )}
            {activeLayer!=="drums"&&page==="sound"&&(
              <div style={{height:"100%",minHeight:0,overflowY:"auto",padding:"8px 12px 40px"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8,alignItems:"start"}}>
                    <SynthSection title="OSCILLATOR" accent={C_OSC}>
                      <div style={{display:"flex",gap:16,padding:"8px 16px 10px",height:160,alignItems:"stretch",justifyContent:"center"}}>
                        <KnobSlider vertical label="DETUNE" value={detune} min={0} max={50} onChange={setDetune} display={detune+"¢"} accent={C_OSC}/>
                        {/* Waveform buttons stacked vertically — centered, scale with card */}
                        <div style={{display:"flex",flexDirection:"column",gap:4,flex:"0 1 40%",minWidth:50,maxWidth:90}}>
                          {WAVEFORMS.map((w,i)=>(
                            <button key={w} style={Object.assign({},S.wfBtn,{flex:1,padding:"0",borderColor:C_OSC+(waveform===w?"":"22"),color:waveform===w?C_OSC:"rgba(210,195,175,0.35)",background:waveform===w?C_OSC+"14":"transparent"})} onClick={()=>setWaveform(w)}>
                              {WF_LABELS[i]}
                            </button>
                          ))}
                        </div>
                      </div>
                    </SynthSection>
                    <SynthSection title="ENV" accent={C_ENV}>
                      <div style={{display:"flex",gap:12,padding:"8px 16px 10px",height:160,alignItems:"stretch"}}>
                        <KnobSlider vertical label="ATK" value={attack}  min={1}  max={2000} onChange={setAttack}  display={attack+"ms"}  accent={C_ENV}/>
                        <KnobSlider vertical label="DEC" value={decay}   min={10} max={4000} onChange={setDecay}   display={decay+"ms"}   accent={C_ENV}/>
                        <KnobSlider vertical label="SUS" value={sustain} min={0}  max={100}  onChange={setSustain} display={sustain+"%"}  accent={C_ENV}/>
                      </div>
                    </SynthSection>
                    <SynthSection title="FILTER" accent={C_FILT}>
                      <div style={{display:"flex",gap:12,padding:"8px 16px 10px",height:160,alignItems:"stretch"}}>
                        <KnobSlider vertical label="CUT" value={vcfCutoff}    min={0} max={100} onChange={setVcfCutoff}    display={vcfLbl(vcfCutoff)} accent={C_FILT}/>
                        <KnobSlider vertical label="RES" value={vcfRes}       min={0} max={100} onChange={setVcfRes}       display={vcfRes+"%"}        accent={C_FILT}/>
                        <KnobSlider vertical label="ENV" value={filterEnvAmt} min={0} max={100} onChange={setFilterEnvAmt} display={filterEnvAmt+"%"}  accent={C_FILT}/>
                      </div>
                    </SynthSection>
                    <SynthSection title="DELAY" accent={C_DLY}>
                      <div style={{padding:"4px 12px 10px",display:"flex",flexDirection:"column",gap:6}}>
                        <KnobSlider label="TIME" value={dlyIdx}    min={0} max={DLY_NOTES.length-1} onChange={setDlyIdx}    display={DLY_NOTES[dlyIdx].label} accent={C_DLY}/>
                        <KnobSlider label="SEND" value={dlyWetPct} min={0} max={100}                onChange={setDlyWetPct} display={dlyWetPct+"%"}            accent={C_DLY}/>
                        <KnobSlider label="FDBK" value={dlyFbPct}  min={0} max={95}                 onChange={setDlyFbPct}  display={dlyFbPct+"%"}             accent={C_DLY}/>
                        <KnobSlider label="HP"   value={dlyHpVal}  min={0} max={100}                onChange={setDlyHpVal}  display={hpLbl(dlyHpVal)}          accent={C_DLY}/>
                        <KnobSlider label="LP"   value={dlyLpVal}  min={0} max={100}                onChange={setDlyLpVal}  display={lpLbl(dlyLpVal)}          accent={C_DLY}/>
                      </div>
                    </SynthSection>
                </div>
              </div>
            )}
          </div>

          {/* Tabs — always visible */}
          <div style={{...S.tabs, flexShrink:0, paddingTop:8}}>
            {[["edit","EDIT"],["step","STEP"],["sound","SOUND"],["set","SET"]].map(([p,lbl])=>(
              <button key={p} style={Object.assign({},S.tab,page===p?S.tabOn:{})} onClick={()=>setPage(p)}>{lbl}</button>
            ))}
          </div>
          {/* Transport — always visible, centered */}
          <div style={{flexShrink:0,display:"flex",gap:6,alignItems:"center",justifyContent:"center",paddingTop:8,borderTop:"1px solid rgba(200,185,165,0.08)"}}>
            <button style={Object.assign({},S.loopBtnBottom,varyMode?{border:"1px solid #c9a96e",color:"#c9a96e",background:"rgba(201,169,110,0.12)"}:{})} onClick={()=>setVaryMode(v=>!v)}>VARY</button>
            <button style={Object.assign({},S.loopBtnBottom,{opacity:historyR.current.length?1:0.35})} onClick={undo} disabled={!historyR.current.length}>↶ UNDO</button>
            <button style={Object.assign({},S.loopBtnBottom,{opacity:redoR.current.length?1:0.35})} onClick={redo} disabled={!redoR.current.length}>↷ REDO</button>
            <button style={Object.assign({},S.playBtn,{width:44,height:44,fontSize:16},playing?S.playOn:{})} onClick={startStop}>{playing?<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><rect x="1" y="1" width="9" height="9" rx="1.5"/></svg>:<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><polygon points="1.5,0.5 10.5,5.5 1.5,10.5"/></svg>}</button>
            <button style={Object.assign({},S.loopBtnBottom,loopMode?S.loopOn:{})} onClick={()=>setLoopMode(l=>!l)}>LOOP</button>
            <button style={S.loopBtnBottom} onClick={mutatePat1}>MUT8</button>
          </div>
        </div>
      </div>
      )} {/* end !IS_MOBILE desktop layout */}

      {/* ══ MOBILE LAYOUT ══ */}
      {IS_MOBILE&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,display:"flex",flexDirection:"column",background:"#1a1814",overflow:"hidden"}}>

          {/* ── TABULA BRANDING ── */}
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"10px 16px 4px",flexShrink:0}}>
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:18,fontWeight:300,letterSpacing:6,color:"rgba(210,195,175,0.7)",textTransform:"uppercase"}}>Tabula</span>
          </div>

          {/* ── PERSISTENT LAYER BAR — top of screen ── */}
          <div style={{display:"flex",gap:6,padding:"8px 12px 6px",flexShrink:0}}>
            {[["synth","SYNTH","#a8c5a0","rgba(168,197,160,"],["lead","LEAD","#b5a0c4","rgba(181,160,196,"],["bass","BASS","#d4a574","rgba(212,165,116,"],["drums","DRUMS","#c4967a","rgba(196,150,122,"]].map(([lyr,lbl,c,cf])=>(
              <button key={lyr} style={{flex:1,padding:"7px 0",border:"1px solid "+(activeLayer===lyr?c+"99)":cf+"0.15)"),borderRadius:8,background:activeLayer===lyr?cf+"0.1)":"transparent",color:activeLayer===lyr?c:cf+"0.4)",fontSize:8,letterSpacing:1.2,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>{
                  if(activeLayer===lyr){
                    // already on this layer — step into its sound page
                    setActiveSheet(s=>s==="sound"?null:"sound");
                  }else{
                    switchLayer(lyr);
                    if(page==="step"&&lyr==="drums")setPage("edit");
                  }
                }}>
                {lbl}
              </button>
            ))}
          </div>
          {/* ── PERSISTENT PATTERN PILLS — tap to select, drag to phrase or song-matrix cell ── */}
          <div style={{display:"flex",gap:5,flexWrap:"wrap",flexShrink:0,padding:"4px 12px 6px",alignItems:"center",touchAction:"none"}}>
            {(activeLayer==="drums"?drumPats:pats).map(p=>{
              const isDrums=activeLayer==="drums";
              const isSynth=!isDrums; // any synth-type layer
              const isA=isDrums?p.id===activeDrumId:p.id===activeId;
              const isP=playing&&(isSynth&&activeLayer==="synth"?playId===p.id:false);
              const accent=activeLayer==="synth"?"#a8c5a0":activeLayer==="lead"?"#b5a0c4":activeLayer==="bass"?"#d4a574":"#c4967a";
              const isDragging=patternDrag&&patternDrag.patId===p.id;
              return(
                <div key={p.id} style={{padding:"6px 14px",borderRadius:20,border:"1.5px solid "+accent,background:isA?accent:"transparent",color:isA?"#1a1814":accent,fontSize:14,fontWeight:700,letterSpacing:1,cursor:"pointer",flexShrink:0,userSelect:"none",WebkitUserSelect:"none",touchAction:"none",display:"flex",alignItems:"center",gap:2,opacity:isDragging?0.4:1,lineHeight:1}}
                  onPointerDown={e=>{
                    e.stopPropagation();
                    const startX=e.clientX,startY=e.clientY;
                    const pointerId=e.pointerId;
                    const target=e.currentTarget;
                    let dragging=false;
                    const dragLayer = activeLayer; // captured at drag start; song cell must match this layer
                    const onMove=(ev)=>{
                      if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                      if(!dragging){
                        if(Math.abs(ev.clientX-startX)<4&&Math.abs(ev.clientY-startY)<4)return;
                        dragging=true;
                        try{target.setPointerCapture(pointerId);}catch(_){}
                        setPatternDrag({patId:p.id,name:p.name,accent,x:ev.clientX,y:ev.clientY,overDrop:false,overSongCell:null});
                      }
                      let overDrop=false;
                      if(phraseDropRef.current){
                        const rect=phraseDropRef.current.getBoundingClientRect();
                        overDrop=ev.clientY>=rect.top&&ev.clientY<=rect.bottom&&ev.clientX>=rect.left&&ev.clientX<=rect.right;
                      }
                      // hit-test song-matrix cells (only valid if cell.layer === dragLayer)
                      let overSongCell=null;
                      if(songMode){
                        const el=document.elementFromPoint(ev.clientX,ev.clientY);
                        const cell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                        if(cell&&cell.dataset.songLayer===dragLayer){
                          overSongCell={layer:cell.dataset.songLayer,barIdx:parseInt(cell.dataset.songBar,10)};
                        }
                      }
                      setPatternDrag(d=>d?{...d,x:ev.clientX,y:ev.clientY,overDrop,overSongCell}:null);
                    };
                    const onUp=(ev)=>{
                      if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                      document.removeEventListener("pointermove",onMove);
                      document.removeEventListener("pointerup",onUp);
                      document.removeEventListener("pointercancel",onUp);
                      try{target.releasePointerCapture(pointerId);}catch(_){}
                      if(!dragging){
                        // Tap behavior: if pattern is already active, step into its drawer (pattern editing).
                        // Otherwise just make it active.
                        const wasActive = isSynth ? activeId===p.id : activeDrumId===p.id;
                        if(wasActive){
                          setSeqPage("step");
                          setActiveSheet(s=>s==="pattern"?null:"pattern");
                        }else{
                          isSynth?setActiveId(p.id):setActiveDrumId(p.id);
                        }
                        return;
                      }
                      // Drop on song-matrix cell — same-layer only
                      if(songMode){
                        const el=document.elementFromPoint(ev.clientX,ev.clientY);
                        const cell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                        if(cell&&cell.dataset.songLayer===dragLayer){
                          const barIdx=parseInt(cell.dataset.songBar,10);
                          pushHistory();
                          setSongMatrix(m=>{const r=[...m[dragLayer]];r[barIdx]=p.id;return{...m,[dragLayer]:r};});
                          setPatternDrag(null);
                          return;
                        }
                      }
                      if(phraseDropRef.current){
                        const rect=phraseDropRef.current.getBoundingClientRect();
                        if(ev.clientY>=rect.top&&ev.clientY<=rect.bottom&&ev.clientX>=rect.left&&ev.clientX<=rect.right){
                          pushHistory();
                          if(isSynth)setSynthPhrases(ps=>ps.map(ph=>ph.id===activeSynthPhraseId?{...ph,chain:[...ph.chain,p.id]}:ph));
                          else setDrumPhrases(ps=>ps.map(ph=>ph.id===activeDrumPhraseId?{...ph,chain:[...ph.chain,p.id]}:ph));
                        }
                      }
                      setPatternDrag(null);
                    };
                    document.addEventListener("pointermove",onMove);
                    document.addEventListener("pointerup",onUp);
                    document.addEventListener("pointercancel",onUp);
                  }}>
                  {isP&&!isA&&<span style={{fontSize:6,opacity:0.7}}>●</span>}{p.name}
                </div>);
            })}
            {(activeLayer==="drums"?drumPats:pats).length<8&&<div style={{padding:"4px 10px",borderRadius:20,border:"1px dashed "+(activeLayer==="synth"?"rgba(168,197,160,0.35)":activeLayer==="lead"?"rgba(181,160,196,0.35)":activeLayer==="bass"?"rgba(212,165,116,0.35)":"rgba(196,150,122,0.35)"),color:activeLayer==="synth"?"rgba(168,197,160,0.45)":activeLayer==="lead"?"rgba(181,160,196,0.45)":activeLayer==="bass"?"rgba(212,165,116,0.45)":"rgba(196,150,122,0.45)",fontSize:12,cursor:"pointer",flexShrink:0,userSelect:"none"}} onPointerDown={e=>{e.stopPropagation();activeLayer==="drums"?addDrumPat():addPat();}}>＋</div>}
          </div>
          {/* ── DRAG GHOST — floating pill that follows pointer ── */}
          {patternDrag&&(
            <div style={{position:"fixed",left:patternDrag.x-24,top:patternDrag.y-14,zIndex:9999,pointerEvents:"none",padding:"4px 12px",borderRadius:20,border:"1.5px solid "+patternDrag.accent,background:patternDrag.accent,color:"#1a1814",fontSize:14,fontWeight:700,letterSpacing:1,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",lineHeight:1,opacity:patternDrag.overDrop?1:0.85,transform:patternDrag.overDrop?"scale(1.1)":"scale(1)",transition:"transform 0.1s, opacity 0.1s"}}>
              {patternDrag.name}
            </div>
          )}
          {/* ── SEQUENCE-SHEET DRAG GHOST — phrases / sections being dragged within drawer ── */}
          {sheetDrag&&(
            <div style={{position:"fixed",left:sheetDrag.x-24,top:sheetDrag.y-14,zIndex:10000,pointerEvents:"none",padding:"4px 12px",borderRadius:20,border:"1.5px solid "+sheetDrag.color,background:sheetDrag.willDelete?"transparent":sheetDrag.color,color:sheetDrag.willDelete?sheetDrag.color:"#1a1814",fontSize:14,fontWeight:700,letterSpacing:1,lineHeight:1,boxShadow:sheetDrag.willDelete?"0 0 12px rgba(196,122,122,0.4)":"0 4px 20px rgba(0,0,0,0.5)",transform:sheetDrag.willDelete?"scale(0.92)":"scale(1.1)",transition:"transform 0.1s",opacity:sheetDrag.willDelete?0.7:1,textDecoration:sheetDrag.willDelete?"line-through":"none"}}>
              {sheetDrag.willDelete?"× ":""}{sheetDrag.name}
            </div>
          )}
          {/* ── CONTENT AREA — full height grid ── */}
          <div style={{flex:1,minHeight:0,overflow:"hidden",position:"relative"}}>

            {/* SONG matrix — 16×16, 4 row-groups × 4 layers (synth/lead/bass/drums) × 16 bars */}
            {songMode&&(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"6px 10px",boxSizing:"border-box"}}>
                <div style={{width:"min(100%,calc(100dvh - 150px))",aspectRatio:"1",display:"flex",flexDirection:"column",flexShrink:0,gap:3}}>
                  {Array.from({length:4},(_,group)=>(
                    <div key={group} style={{flex:1,display:"flex",flexDirection:"column",gap:1}}>
                      {["synth","lead","bass","drums"].map(layer=>{
                        const accent = layer==="synth"?"#a8c5a0":layer==="lead"?"#b5a0c4":layer==="bass"?"#d4a574":"#c4967a";
                        const accentRgb = layer==="synth"?"168,197,160":layer==="lead"?"181,160,196":layer==="bass"?"212,165,116":"196,150,122";
                        const patSet = layer==="drums"
                          ? drumPats
                          : layer===activeLayer
                            ? pats
                            : (layerStoreR.current[layer]?.pats || (layer==="synth"?pats:[]));
                        return (
                          <div key={layer} style={{flex:1,display:"flex",gap:1}}>
                            {Array.from({length:16},(_,col)=>{
                              const barIdx = group*16+col;
                              const patId = songMatrix[layer][barIdx];
                              const pat = patId!=null ? patSet.find(p=>p.id===patId) : null;
                              const isQ = col%4===0;
                              const isHoverTarget = patternDrag?.overSongCell&&patternDrag.overSongCell.layer===layer&&patternDrag.overSongCell.barIdx===barIdx;
                              const isDragSource = patternDrag?.sourceCell&&patternDrag.sourceCell.layer===layer&&patternDrag.sourceCell.barIdx===barIdx;
                              const isCursor = playing&&songMode&&songBar===barIdx;
                              return (
                                <div key={col}
                                     data-song-cell="1"
                                     data-song-layer={layer}
                                     data-song-bar={barIdx}
                                     style={{flex:1,aspectRatio:"1",
                                             background: pat ? accent : (isCursor ? `rgba(${accentRgb},0.35)` : `rgba(${accentRgb},0.06)`),
                                             outline: isHoverTarget ? `2px solid ${accent}` : (isCursor ? `2.5px solid #ffffff` : "none"),
                                             outlineOffset:"-1px",
                                             borderRadius:2,
                                             display:"flex",alignItems:"center",justifyContent:"center",
                                             color: pat ? "#1a1814" : "transparent",
                                             fontSize:11,fontWeight:700,
                                             opacity: isDragSource ? 0.3 : 1,
                                             boxShadow: isCursor ? `0 0 8px rgba(255,255,255,0.55)${pat?", 0 0 0 2px rgba(255,255,255,0.95) inset":""}` : "none",
                                             zIndex: isCursor ? 2 : 1,
                                             transform: isHoverTarget ? "scale(1.08)" : (isCursor ? "scale(1.04)" : "scale(1)"),
                                             transition:"transform 0.08s, outline 0.08s, opacity 0.08s",
                                             touchAction:"none",cursor:"pointer",userSelect:"none"}}
                                     onPointerDown={(e)=>{
                                       e.stopPropagation();
                                       // Empty cell — no action. (Filling happens via drag from the
                                       // persistent pattern row above.)
                                       if(patId==null) return;
                                       const pointerId=e.pointerId;
                                       const startX=e.clientX, startY=e.clientY;
                                       const draggedPat=pat;
                                       let dragging=false;
                                       const onMove=(ev)=>{
                                         if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                                         if(!dragging){
                                           if(Math.abs(ev.clientX-startX)<6&&Math.abs(ev.clientY-startY)<6)return;
                                           dragging=true;
                                           setPatternDrag({patId,name:draggedPat.name,accent,x:ev.clientX,y:ev.clientY,overDrop:false,overSongCell:null,sourceCell:{layer,barIdx}});
                                         }
                                         // hit-test other cells, exclude source
                                         let overSongCell=null;
                                         const el=document.elementFromPoint(ev.clientX,ev.clientY);
                                         const targetCell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                                         if(targetCell&&targetCell.dataset.songLayer===layer){
                                           const tBar=parseInt(targetCell.dataset.songBar,10);
                                           if(tBar!==barIdx) overSongCell={layer,barIdx:tBar};
                                         }
                                         setPatternDrag(d=>d?{...d,x:ev.clientX,y:ev.clientY,overSongCell}:null);
                                       };
                                       const onUp=(ev)=>{
                                         if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                                         document.removeEventListener("pointerup",onUp);
                                         document.removeEventListener("pointercancel",onUp);
                                         document.removeEventListener("pointermove",onMove);
                                         if(!dragging){
                                           // tap on filled cell → clear
                                           pushHistory();
                                           setSongMatrix(m=>{const r=[...m[layer]];r[barIdx]=null;return{...m,[layer]:r};});
                                           return;
                                         }
                                         // drop logic — same-layer cell only; outside or wrong layer = no-op (revert)
                                         const el=document.elementFromPoint(ev.clientX,ev.clientY);
                                         const targetCell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                                         if(targetCell&&targetCell.dataset.songLayer===layer){
                                           const tBar=parseInt(targetCell.dataset.songBar,10);
                                           if(tBar!==barIdx){
                                             pushHistory();
                                             setSongMatrix(m=>{const r=[...m[layer]];r[tBar]=patId;r[barIdx]=null;return{...m,[layer]:r};});
                                           }
                                         }
                                         setPatternDrag(null);
                                       };
                                       document.addEventListener("pointermove",onMove);
                                       document.addEventListener("pointerup",onUp);
                                       document.addEventListener("pointercancel",onUp);
                                     }}>
                                  {pat?pat.name:""}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SYNTH EDIT grid */}
            {!songMode&&activeLayer!=="drums"&&(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"6px 10px",boxSizing:"border-box"}}>
              <div style={{width:"min(100%,calc(100dvh - 150px))",aspectRatio:"1",display:"flex",flexDirection:"column",flexShrink:0}}>
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
                        {(()=>{const rects=[];let ci=0;while(ci<COLS){const on=activePat?activePat.grid[r][ci]:false;if(on){const p=activePat?.params?.[ci];const rhy=p?Math.round(p.rhy??1):1;if(rhy===0){ci++;continue;}let span=1,nc=ci+1;while(nc<COLS&&activePat?.grid[r][nc]){const np2=activePat?.params?.[nc];if(np2&&Math.round(np2.rhy??1)===0){span++;nc++;}else break;}const vel=p?(p.vel??100):100;const b=0.35+(vel/127)*0.65;const inactive=ci>=gridLen;const bright=inactive?`rgba(220,200,180,0.12)`:`rgba(230,215,195,${b})`;const glow=inactive?"none":`0 0 4px rgba(230,215,195,${b*0.5}),0 0 10px rgba(230,215,195,${b*0.22})`;const isActive=!inactive&&playing&&playId===activeId&&step>=ci&&step<ci+span;const L=`calc(${ci/COLS}*(100% + 2px))`;const W=`calc(${span/COLS}*(100% + 2px) - 2px)`;rects.push(<div key={ci} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:span>1?3:2,background:isActive?bright:inactive?bright:`rgba(230,215,195,${b*0.75})`,boxShadow:isActive?glow:"none",pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:"2px",padding:"0 2px"}}>{!inactive&&rhy===2&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}{!inactive&&rhy===3&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}{!inactive&&rhy>=4&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px",width:"100%",height:"86%"}}>{[0,1,2,3].map(i=><div key={i} style={{borderRadius:1,background:"rgba(0,0,0,0.25)"}}/>)}</div>}{!inactive&&(()=>{const octV=p?(p.oct??2):2,sh=octV-2;if(sh===0)return null;const n=Math.abs(sh),up=sh>0;const cols=rhy>=4?2:rhy>=2?rhy:1;return(<div style={{position:'absolute',left:0,right:0,[up?'top':'bottom']:0,display:'flex',flexDirection:up?'column':'column-reverse',gap:3,pointerEvents:'none',zIndex:1}}>{Array.from({length:n},(_,i)=>(<div key={i} style={{height:3,display:'flex',gap:rhy>=4?3:2,padding:'0 2px'}}>{Array.from({length:cols},(_,j)=>(<div key={j} style={{flex:1,background:'#6a5088'}}/>))}</div>))}</div>);})()}</div>);ci+=span;}else{ci++;}}return rects;})()}
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

            {/* DRUMS EDIT grid */}
            {!songMode&&activeLayer==="drums"&&(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"6px 10px",boxSizing:"border-box",overflow:"hidden"}}>
                {(()=>{
                  const dPat=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
                  const dLen=dPat?.gridLen??16;
                  const GAP=2;
                  const HEADER=14;
                  // Match synth grid TOTAL size. Labels go inside the same area as synth cells —
                  // not added on top of it. So drum cells absorb the header overhead and end up
                  // slightly smaller than synth cells. Also use DRUM_ROWS (10) for column count.
                  const SIZE=`min(calc(100vw - 20px), calc(100dvh - 150px))`;
                  const cell=`calc((${SIZE} - ${HEADER}px - ${16*GAP}px) / 16)`;
                  const gridW=`calc(${cell} * ${DRUM_ROWS} + ${(DRUM_ROWS-1)*GAP}px)`;
                  const gridH=SIZE;
                  return(
                    <div style={{display:"flex",gap:6,alignItems:"flex-start",flexShrink:0}}>
                      {/* Portrait grid — same cell size as synth grid, 8 cols × 16 rows */}
                      <div style={{width:gridW,height:gridH,display:"flex",flexDirection:"column",gap:GAP,flexShrink:0,touchAction:"none"}}>
                        <div style={{display:"flex",gap:GAP,flexShrink:0,height:HEADER,alignItems:"center"}}>
                          {DRUM_VOICES.map(v=>(<div key={v.key} style={{flex:1,textAlign:"center",fontSize:7,fontWeight:700,color:v.color+"cc",letterSpacing:0.3,lineHeight:1}}>{v.label}</div>))}
                        </div>
                        <div style={{display:"flex",flexDirection:"column",gap:GAP,minHeight:0}}>
                          {Array.from({length:COLS},(_,step)=>{
                            const isActive=playing&&step===drumStep;
                            const inactive=step>=dLen;
                            const isQ=step%4===0;
                            return(
                              <div key={step} style={{height:cell,display:"flex",gap:GAP,background:isActive?"rgba(220,200,180,0.06)":"transparent",borderRadius:2,borderTop:isQ&&step>0?"1px solid rgba(220,200,180,0.08)":"none"}}>
                                {DRUM_VOICES.map((voice,r)=>{
                                  const on=dPat?.grid[r]?.[step]||false;
                                  return(<div key={r} style={{width:cell,height:cell,aspectRatio:"1",borderRadius:2,cursor:inactive?"default":"pointer",flexShrink:0,
                                    background:inactive?"rgba(220,200,180,0.015)":on?(isActive?"rgba(255,255,255,0.88)":voice.color):isActive?"rgba(220,200,180,0.1)":"rgba(220,200,180,0.03)",
                                    border:"1px solid "+(inactive?"rgba(220,200,180,0.03)":on?voice.color:"rgba(220,200,180,0.07)"),
                                    boxShadow:on&&isActive?"0 0 4px "+voice.color:"none",
                                    boxSizing:"border-box",
                                  }} onPointerDown={e=>{e.preventDefault();e.stopPropagation();if(!inactive){pushHistory();setDrumCell(r,step,!on);}}}/> );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      {/* Vertical length slider */}
                      <div style={{width:10,height:gridH,background:"rgba(220,200,180,0.06)",borderRadius:5,position:"relative",cursor:"ns-resize",flexShrink:0,touchAction:"none"}}
                        onPointerDown={e=>{
                          e.stopPropagation();
                          const rect=e.currentTarget.getBoundingClientRect();
                          const update=ev=>{const pct=Math.max(0,Math.min(1,(ev.clientY-rect.top)/rect.height));setDrumLen(Math.max(1,Math.round(pct*COLS)));};
                          update(e);
                          const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};
                          document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);
                        }}>
                        <div style={{position:"absolute",top:0,left:0,right:0,height:`${(dLen/COLS)*100}%`,background:"rgba(210,195,175,0.18)",borderRadius:"5px 5px 0 0"}}/>
                        <div style={{position:"absolute",left:-2,right:-2,height:6,top:`calc(${(dLen/COLS)*100}% - 3px)`,background:"rgba(255,255,255,0.85)",borderRadius:3,boxShadow:"0 0 5px rgba(255,255,255,0.3)"}}/>
                        <span style={{position:"absolute",bottom:3,left:"50%",transform:"translateX(-50%)",fontSize:6,color:"rgba(210,195,175,0.4)",pointerEvents:"none"}}>{dLen}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* Param popup */}
            {paramPopup&&(()=>{
              const pp=paramPopup;const arms=(pp.adaptedArms||PARAM_ARMS);
              return(<div style={{position:"absolute",inset:0,zIndex:100,touchAction:"none"}} onPointerMove={handleGridMove} onPointerUp={handleGridUp} onPointerCancel={handleGridUp}>
                <div style={{position:"absolute",left:pp.x-60,top:pp.y-60,width:120,height:120,borderRadius:"50%",background:"rgba(20,18,15,0.92)",border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 4px 24px rgba(0,0,0,0.7)",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  <div style={{fontSize:8,color:"rgba(210,195,175,0.4)",letterSpacing:1}}>{pp.activeArm?pp.values[pp.activeArm]:""}</div>
                  {arms.map(arm=>{const rad=arm.angle*Math.PI/180;const x=50+Math.cos(rad)*38;const y=50-Math.sin(rad)*38;const isActive=pp.activeArm===arm.key;return(<div key={arm.key} style={{position:"absolute",left:`${x}%`,top:`${y}%`,transform:"translate(-50%,-50%)",fontSize:7,fontWeight:700,letterSpacing:1,color:isActive?"rgba(255,255,255,0.95)":arm.color||"rgba(210,195,175,0.5)",textShadow:isActive?"0 0 8px currentColor":"none",transition:"color .08s"}}>{arm.label}</div>);})}
                </div>
              </div>);
            })()}
          </div>

          {/* ── BOTTOM CHROME: chips row + persistent transport ── */}
          <div style={{flexShrink:0,borderTop:"1px solid rgba(255,255,255,0.07)",background:"rgba(24,22,18,0.98)"}}>
            {/* Row 1: expandable chips */}
            <div style={{display:"flex",alignItems:"center",padding:"7px 10px 4px",gap:5}}>
              {/* TEMPO chip */}
              <button style={{flex:1,height:34,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"1px solid "+(activeSheet==="tempo"?"rgba(200,185,165,0.45)":"rgba(200,185,165,0.1)"),borderRadius:8,background:activeSheet==="tempo"?"rgba(200,185,165,0.08)":"transparent",cursor:"pointer",gap:0,fontFamily:"inherit",padding:0}}
                onClick={()=>setActiveSheet(s=>s==="tempo"?null:"tempo")}>
                <span style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.8)",lineHeight:1.1}}>{bpm}</span>
                <span style={{fontSize:5,letterSpacing:1.5,color:"rgba(210,195,175,0.35)"}}>TEMPO</span>
              </button>
              {/* SONG chip — toggles song matrix view */}
              <button style={{flex:1,height:34,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"1px solid "+(songMode?"rgba(210,195,175,0.5)":"rgba(200,185,165,0.1)"),borderRadius:8,background:songMode?"rgba(210,195,175,0.06)":"transparent",cursor:"pointer",gap:0,fontFamily:"inherit",padding:0}}
                onClick={()=>{setSongMode(s=>!s);setActiveSheet(null);}}>
                <span style={{fontSize:14,fontWeight:700,color:songMode?"rgba(210,195,175,0.9)":"rgba(210,195,175,0.5)",lineHeight:1.1}}>▦</span>
                <span style={{fontSize:5,letterSpacing:1.5,color:"rgba(210,195,175,0.35)"}}>SONG</span>
              </button>
              {/* VARY chip */}
              <button style={{flex:1,height:34,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"1px solid "+(activeSheet==="vary"||varyMode?"rgba(201,169,110,0.55)":"rgba(200,185,165,0.1)"),borderRadius:8,background:activeSheet==="vary"||varyMode?"rgba(201,169,110,0.1)":"transparent",cursor:"pointer",gap:0,fontFamily:"inherit",padding:0}}
                onClick={()=>setActiveSheet(s=>s==="vary"?null:"vary")}>
                <span style={{fontSize:12,lineHeight:1.1,color:activeSheet==="vary"||varyMode?"#c9a96e":"rgba(210,195,175,0.5)"}}>～</span>
                <span style={{fontSize:5,letterSpacing:1.5,color:activeSheet==="vary"||varyMode?"rgba(201,169,110,0.7)":"rgba(210,195,175,0.35)"}}>VARY</span>
              </button>
              {/* PROJECT chip */}
              <button style={{flex:1,height:34,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"1px solid "+(activeSheet==="project"?"rgba(200,185,165,0.45)":"rgba(200,185,165,0.1)"),borderRadius:8,background:activeSheet==="project"?"rgba(200,185,165,0.07)":"transparent",cursor:"pointer",gap:0,fontFamily:"inherit",padding:0}}
                onClick={()=>setActiveSheet(s=>s==="project"?null:"project")}>
                <span style={{fontSize:12,lineHeight:1.1,color:"rgba(210,195,175,0.45)"}}>⋯</span>
                <span style={{fontSize:5,letterSpacing:1.5,color:"rgba(210,195,175,0.35)"}}>PROJECT</span>
              </button>
            </div>
            {/* Row 2: persistent transport */}
            <div style={{display:"flex",alignItems:"center",padding:"0 10px 10px",gap:5}}>
              <button style={Object.assign({},S.loopBtnBottom,{flex:1,height:36,opacity:historyR.current.length?1:0.35})} onClick={undo} disabled={!historyR.current.length}>↶ UNDO</button>
              <button style={Object.assign({},S.loopBtnBottom,{flex:1,height:36,opacity:redoR.current.length?1:0.35})} onClick={redo} disabled={!redoR.current.length}>↷ REDO</button>
              <button style={Object.assign({},S.playBtn,{width:44,height:44,flexShrink:0},playing?S.playOn:{})} onClick={startStop}>
                {playing?<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><rect x="1" y="1" width="9" height="9" rx="1.5"/></svg>:<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><polygon points="1.5,0.5 10.5,5.5 1.5,10.5"/></svg>}
              </button>
              <button style={Object.assign({},S.loopBtnBottom,{flex:1,height:36},loopMode?S.loopOn:{})} onClick={()=>setLoopMode(l=>!l)}>LOOP</button>
              <button style={Object.assign({},S.loopBtnBottom,{flex:1,height:36},followSeq?{border:"1px solid #7aaa96",color:"#7aaa96",background:"rgba(122,170,150,0.12)"}:{})} onClick={()=>setFollowSeq(f=>!f)}>FOLLOW</button>
            </div>
          </div>

          {/* ── BOTTOM SHEET — slides up, one per chip ── */}
          {activeSheet&&(
            <>
              {/* Backdrop */}
              <div style={{position:"fixed",top:120,left:0,right:0,bottom:60,zIndex:199,background:"rgba(0,0,0,0.4)"}} onClick={()=>setActiveSheet(null)}/>
              <div style={{position:"fixed",bottom:60,left:0,right:0,zIndex:200,background:"rgba(24,22,18,0.98)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.1)",borderRadius:"16px 16px 0 0",maxHeight:"65vh",overflowY:"auto",padding:"16px 16px 24px"}}>

                {/* TEMPO sheet */}
                {activeSheet==="tempo"&&(
                  <div>
                    <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:14}}>TEMPO</div>
                    <select style={{...S.sel,width:"100%",marginBottom:12,fontSize:13}} value={scale} onChange={e=>setScale(e.target.value)}>
                      {Object.entries(SCALES).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <div style={{display:"flex",gap:8,marginBottom:14}}>
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
                )}

                {/* SEQUENCE sheet — single page, all four levels */}
                {activeSheet==="pattern"&&(
                  <div style={{paddingBottom:8}}>
                    {/* Pattern ops — operate on the active pattern of the active layer */}
                    {(()=>{
                      const isDrum=activeLayer==="drums";
                      const accent=activeLayer==="synth"?"#a8c5a0":activeLayer==="lead"?"#b5a0c4":activeLayer==="bass"?"#d4a574":"#c4967a";
                      const accentF=activeLayer==="synth"?"rgba(168,197,160,":activeLayer==="lead"?"rgba(181,160,196,":activeLayer==="bass"?"rgba(212,165,116,":"rgba(196,150,122,";
                      const ops=isDrum
                        ?[["RAND",randDrumVel,false,false],["CLR",clearDrums,false,false],["DUP",dupDrumPat,drumPats.length>=8,false],["DEL",delDrumPat,drumPats.length<=1,true],["CPY",copyDrumPatFn,false,false],["PST",pasteDrumPatFn,!drumClipboard,false],["MUT8",null,true,false]]
                        :[["RAND",()=>randPatId(activeId),false,false],["CLR",()=>clearPatId(activeId),false,false],["DUP",()=>dupPatId(activeId),pats.length>=8,false],["DEL",()=>delPatId(activeId),pats.length<=1,true],["CPY",()=>copyPatId(activeId),false,false],["PST",()=>pastePatId(activeId),!clipboard,false],["MUT8",mutatePat1,false,false]];
                      return(
                        <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:12}}>
                          {ops.map(([l,f,d,danger])=>(
                            <button key={l} disabled={!!d} style={{padding:"7px 0",border:"1px solid "+(d?"rgba(200,185,165,0.06)":accentF+"0.3)"),borderRadius:7,background:"transparent",color:d?"rgba(200,185,165,0.2)":danger?"#c47a7a":accent,fontSize:8,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit",fontWeight:600}} onClick={d?undefined:f}>{l}</button>
                          ))}
                        </div>
                      );
                    })()}
                    {/* STEP page (only page now — sequence/phrase chains are replaced by SONG matrix) */}
                    {activeLayer!=="drums"&&(
                      <div style={{...S.stepPage,minHeight:0,overflowY:"scroll",paddingBottom:20,paddingLeft:4,paddingRight:4}}>
                        {/* Playback speed */}
                        <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:12,flexShrink:0}}>
                          <div style={{fontSize:8,letterSpacing:2,color:"rgba(210,195,175,0.5)",fontWeight:600,marginRight:4}}>SPEED</div>
                          {SPEED_OPTS.map(opt=>{
                            const sel=Math.abs(speedMult-opt.mult)<0.001;
                            return(
                              <div key={opt.label} onPointerDown={e=>{e.stopPropagation();setSpeedMult(opt.mult);}}
                                style={{padding:"5px 10px",borderRadius:6,border:"1px solid "+(sel?"rgba(168,197,160,0.7)":"rgba(168,197,160,0.18)"),background:sel?"rgba(168,197,160,0.15)":"transparent",color:sel?"#a8c5a0":"rgba(210,195,175,0.5)",fontSize:11,fontWeight:600,cursor:"pointer",userSelect:"none",lineHeight:1,flexShrink:0}}>
                                {opt.label}
                              </div>
                            );
                          })}
                        </div>
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
                                onChange={(col,val)=>setStepParam(col,lane.key,val)} onDragStart={pushHistory}
                                tall/>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {activeSheet==="sound"&&(
                  <div>
                    <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:12}}>SOUND</div>
                    {activeLayer!=="drums"&&(
                      <div style={{overflowY:"auto"}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                          <SynthSection title="OSCILLATOR" accent={C_OSC}>
                            <div style={{display:"flex",gap:10,padding:"6px 12px 8px",height:120,alignItems:"stretch",justifyContent:"center"}}>
                              <KnobSlider vertical label="DETUNE" value={detune} min={0} max={50} onChange={setDetune} display={detune+"¢"} accent={C_OSC}/>
                              <div style={{display:"flex",flexDirection:"column",gap:3,flex:"0 1 40%",minWidth:44}}>
                                {WAVEFORMS.map((w,i)=>(
                                  <button key={w} style={Object.assign({},S.wfBtn,{flex:1,padding:"0",borderColor:C_OSC+(waveform===w?"":"22"),color:waveform===w?C_OSC:"rgba(210,195,175,0.35)",background:waveform===w?C_OSC+"14":"transparent"})} onClick={()=>setWaveform(w)}>{WF_LABELS[i]}</button>
                                ))}
                              </div>
                            </div>
                          </SynthSection>
                          <SynthSection title="ENV" accent={C_ENV}>
                            <div style={{display:"flex",gap:8,padding:"6px 10px 8px",height:120,alignItems:"stretch"}}>
                              <KnobSlider vertical label="ATK" value={attack}  min={1}  max={2000} onChange={setAttack}  display={attack+"ms"}  accent={C_ENV}/>
                              <KnobSlider vertical label="DEC" value={decay}   min={10} max={4000} onChange={setDecay}   display={decay+"ms"}   accent={C_ENV}/>
                              <KnobSlider vertical label="SUS" value={sustain} min={0}  max={100}  onChange={setSustain} display={sustain+"%"}  accent={C_ENV}/>
                            </div>
                          </SynthSection>
                          <SynthSection title="FILTER" accent={C_FILT}>
                            <div style={{display:"flex",gap:8,padding:"6px 10px 8px",height:120,alignItems:"stretch"}}>
                              <KnobSlider vertical label="CUT" value={vcfCutoff}    min={0} max={100} onChange={setVcfCutoff}    display={vcfLbl(vcfCutoff)} accent={C_FILT}/>
                              <KnobSlider vertical label="RES" value={vcfRes}       min={0} max={100} onChange={setVcfRes}       display={vcfRes+"%"}        accent={C_FILT}/>
                              <KnobSlider vertical label="ENV" value={filterEnvAmt} min={0} max={100} onChange={setFilterEnvAmt} display={filterEnvAmt+"%"}  accent={C_FILT}/>
                            </div>
                          </SynthSection>
                          <SynthSection title="DELAY" accent={C_DLY}>
                            <div style={{padding:"4px 8px 8px",display:"flex",flexDirection:"column",gap:5}}>
                              <KnobSlider label="TIME" value={dlyIdx}    min={0} max={DLY_NOTES.length-1} onChange={setDlyIdx}    display={DLY_NOTES[dlyIdx].label} accent={C_DLY}/>
                              <KnobSlider label="SEND" value={dlyWetPct} min={0} max={100}                onChange={setDlyWetPct} display={dlyWetPct+"%"}            accent={C_DLY}/>
                              <KnobSlider label="FDBK" value={dlyFbPct}  min={0} max={95}                 onChange={setDlyFbPct}  display={dlyFbPct+"%"}             accent={C_DLY}/>
                              <KnobSlider label="HP"   value={dlyHpVal}  min={0} max={100}                onChange={setDlyHpVal}  display={hpLbl(dlyHpVal)}          accent={C_DLY}/>
                              <KnobSlider label="LP"   value={dlyLpVal}  min={0} max={100}                onChange={setDlyLpVal}  display={lpLbl(dlyLpVal)}          accent={C_DLY}/>
                            </div>
                          </SynthSection>
                        </div>
                      </div>
                    )}
                    {activeLayer==="drums"&&(()=>{
                      const dPat=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
                      const mix=dPat?.mix||defaultDrumMix();
                      return(<div style={{overflowY:"auto"}}>
                        {DRUM_VOICES.map((voice,r)=>{
                          const m=mix[r]||{level:100,pan:0};
                          return(<div key={voice.key} style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
                            <div style={{width:24,flexShrink:0,fontSize:9,fontWeight:700,letterSpacing:1,color:voice.color,textAlign:"right"}}>{voice.label}</div>
                            <div style={{flex:2,display:"flex",flexDirection:"column",gap:2}}>
                              <div style={{fontSize:7,letterSpacing:1,color:"rgba(210,195,175,0.3)",marginBottom:1}}>LVL <span style={{color:"rgba(210,195,175,0.6)"}}>{m.level}</span></div>
                              <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer"}}
                                onPointerDown={e=>{e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();const u=ev=>{setDrumMix(r,"level",Math.round(Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width))*100));};u(e);const up=()=>{document.removeEventListener("pointermove",u);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",u);document.addEventListener("pointerup",up);}}>
                                <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${m.level}%`,background:voice.color+"99",borderRadius:3}}/>
                                <div style={{position:"absolute",top:-3,bottom:-3,width:10,left:`calc(${m.level}% - 5px)`,background:"rgba(255,255,255,0.85)",borderRadius:2}}/>
                              </div>
                            </div>
                            <div style={{flex:2,display:"flex",flexDirection:"column",gap:2}}>
                              <div style={{fontSize:7,letterSpacing:1,color:"rgba(210,195,175,0.3)",marginBottom:1}}>PAN <span style={{color:"rgba(210,195,175,0.6)"}}>{m.pan>0?"+"+m.pan:m.pan}</span></div>
                              <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer"}}
                                onPointerDown={e=>{e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();const u=ev=>{setDrumMix(r,"pan",Math.round((Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width))*2-1)*100));};u(e);const up=()=>{document.removeEventListener("pointermove",u);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",u);document.addEventListener("pointerup",up);}}
                                onDoubleClick={()=>setDrumMix(r,"pan",0)}>
                                <div style={{position:"absolute",left:"50%",top:-1,bottom:-1,width:1,background:"rgba(220,200,180,0.2)"}}/>
                                <div style={{position:"absolute",top:0,bottom:0,left:m.pan<=0?`${50+m.pan/2}%`:"50%",width:`${Math.abs(m.pan)/2}%`,background:voice.color+"99",borderRadius:3}}/>
                                <div style={{position:"absolute",top:-3,bottom:-3,width:10,left:`calc(${50+m.pan/2}% - 5px)`,background:"rgba(255,255,255,0.85)",borderRadius:2}}/>
                              </div>
                            </div>
                          </div>);
                        })}
                      </div>);
                    })()}
                  </div>
                )}
                {/* PROJECT sheet */}
                {activeSheet==="project"&&(
                  <div>
                    <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:14}}>PROJECT</div>
                    {flash&&<div style={S.menuFlash}>{flash}</div>}
                    {confirmAction&&(
                      <div style={{display:"flex",alignItems:"center",gap:4,padding:"5px 6px",background:"rgba(196,150,80,0.1)",border:"1px solid rgba(196,150,80,0.3)",borderRadius:6,marginBottom:8}}>
                        <span style={{flex:1,fontSize:8,letterSpacing:1,color:"rgba(210,190,140,0.9)",fontWeight:500}}>{confirmAction.label}</span>
                        <button style={{padding:"3px 8px",border:"1px solid rgba(210,190,140,0.5)",borderRadius:4,background:"rgba(196,150,80,0.2)",color:"rgba(220,200,150,0.95)",fontSize:8,letterSpacing:1,cursor:"pointer",fontFamily:"inherit",fontWeight:600}} onClick={confirmYes}>YES</button>
                        <button style={{padding:"3px 8px",border:"1px solid rgba(200,185,165,0.2)",borderRadius:4,background:"transparent",color:"rgba(200,185,165,0.5)",fontSize:8,letterSpacing:1,cursor:"pointer",fontFamily:"inherit"}} onClick={confirmNo}>NO</button>
                      </div>
                    )}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:16}}>
                      {SLOTS.map(slot=>{const has=!!slotData[slot];return(
                        <div key={slot} style={{display:"flex",flexDirection:"column",gap:3,alignItems:"center"}}>
                          <span style={S.menuSlotName}>{slot}{has&&<span style={S.menuSlotDot}>●</span>}</span>
                          <button style={S.menuSlotBtn} onClick={()=>saveSlot(slot)}>SAVE</button>
                          <button style={Object.assign({},S.menuSlotBtn,has?S.menuSlotBtnLit:{})} onClick={()=>loadSlot(slot)} disabled={!has}>LOAD</button>
                        </div>
                      );})}
                    </div>
                    <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:8}}>SHARE</div>
                    {shareFlash&&<div style={S.menuFlash}>{shareFlash}</div>}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                      <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={copyShareLink}>LINK</button>
                      <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={exportJSON}>EXPORT</button>
                      <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={()=>importRef.current?.click()}>IMPORT</button>
                    </div>
                    <input ref={importRef} type="file" accept=".json" style={{display:"none"}} onChange={handleImport}/>
                  </div>
                )}
                {/* VARY sheet */}
                {activeSheet==="vary"&&(
                  <div>
                    <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:14}}>VARY</div>
                    {activeLayer!=="drums"&&(
                      <div>
                        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                          <button style={{padding:"4px 14px",borderRadius:20,border:"1px solid "+(varyMode?"rgba(201,169,110,0.6)":"rgba(200,185,165,0.2)"),background:varyMode?"rgba(201,169,110,0.12)":"transparent",color:varyMode?"#c9a96e":"rgba(200,185,165,0.4)",fontSize:10,letterSpacing:1,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setVaryMode(v=>!v)}>{varyMode?"VARY ON":"VARY OFF"}</button>
                        </div>
                        <div style={{fontSize:8,letterSpacing:1.5,color:"#c4967a",fontWeight:600,marginBottom:8}}>RHYTHM</div>
                        {[["DROP",vDropRate,setVDropRate,60],["SHIFT",vShiftRate,setVShiftRate,60],["RANGE",vShiftRange,setVShiftRange,8,"st"]].map(([label,val,setter,max,unit])=>(
                          <div key={label} style={{marginBottom:10}}>
                            <div style={{display:"flex",alignItems:"baseline",marginBottom:4}}>
                              <span style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.5)",fontWeight:500,width:52}}>{label}</span>
                              <span style={{fontSize:10,color:"rgba(210,195,175,0.7)",marginLeft:"auto"}}>{val}<span style={{fontSize:7,color:"rgba(210,195,175,0.35)",marginLeft:2}}>{unit||"%"}</span></span>
                            </div>
                            <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer",touchAction:"none"}}
                              onPointerDown={e=>{e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();const update=ev=>{setter(Math.round(Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width))*max));};update(e);const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);}}>
                              <div style={{position:"absolute",left:0,top:0,bottom:0,width:(val/max*100)+"%",background:"rgba(196,150,122,0.45)",borderRadius:3}}/>
                              <div style={{position:"absolute",top:-4,bottom:-4,width:12,left:`calc(${val/max*100}% - 6px)`,background:"rgba(255,255,255,0.85)",borderRadius:3}}/>
                            </div>
                          </div>
                        ))}
                        <div style={{fontSize:8,letterSpacing:1.5,color:"#b5a0c4",fontWeight:600,marginBottom:8,marginTop:14}}>MELODY</div>
                        {[["PITCH",vPitchRate,setVPitchRate,60],["RANGE",vPitchRange,setVPitchRange,12,"st"],["GHOST",vGhostRate,setVGhostRate,60]].map(([label,val,setter,max,unit])=>(
                          <div key={label} style={{marginBottom:10}}>
                            <div style={{display:"flex",alignItems:"baseline",marginBottom:4}}>
                              <span style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.5)",fontWeight:500,width:52}}>{label}</span>
                              <span style={{fontSize:10,color:"rgba(210,195,175,0.7)",marginLeft:"auto"}}>{val}<span style={{fontSize:7,color:"rgba(210,195,175,0.35)",marginLeft:2}}>{unit||"%"}</span></span>
                            </div>
                            <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer",touchAction:"none"}}
                              onPointerDown={e=>{e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();const update=ev=>{setter(Math.round(Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width))*max));};update(e);const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);}}>
                              <div style={{position:"absolute",left:0,top:0,bottom:0,width:(val/max*100)+"%",background:"rgba(181,160,196,0.45)",borderRadius:3}}/>
                              <div style={{position:"absolute",top:-4,bottom:-4,width:12,left:`calc(${val/max*100}% - 6px)`,background:"rgba(255,255,255,0.85)",borderRadius:3}}/>
                            </div>
                          </div>
                        ))}
                        <div style={{fontSize:8,letterSpacing:1.5,color:"#9fb4c7",fontWeight:600,marginBottom:8,marginTop:14}}>STEP</div>
                        {[["VEL",vVelJitter,setVVelJitter],["FLT",vFltJitter,setVFltJitter],["DLY",vDlyJitter,setVDlyJitter],["RHY",vRhyJitter,setVRhyJitter],["OCT",vOctJitter,setVOctJitter],["GLIDE",vGlideJitter,setVGlideJitter],["DUR",vDurJitter,setVDurJitter]].map(([label,val,setter])=>(
                          <div key={label} style={{marginBottom:10}}>
                            <div style={{display:"flex",alignItems:"baseline",marginBottom:4}}>
                              <span style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.5)",fontWeight:500,width:52}}>{label}</span>
                              <span style={{fontSize:10,color:"rgba(210,195,175,0.7)",marginLeft:"auto"}}>{val}<span style={{fontSize:7,color:"rgba(210,195,175,0.35)",marginLeft:2}}>%</span></span>
                            </div>
                            <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer",touchAction:"none"}}
                              onPointerDown={e=>{e.stopPropagation();const rect=e.currentTarget.getBoundingClientRect();const update=ev=>{setter(Math.round(Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width))*100));};update(e);const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);}}>
                              <div style={{position:"absolute",left:0,top:0,bottom:0,width:val+"%",background:"rgba(159,180,199,0.45)",borderRadius:3}}/>
                              <div style={{position:"absolute",top:-4,bottom:-4,width:12,left:`calc(${val}% - 6px)`,background:"rgba(255,255,255,0.85)",borderRadius:3}}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            </>
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
                      onClick={disabled?undefined:fn}>{label}</button>
                  ))}
                </div>
              </div>
            </div>);
          })()}

          {/* Drum context menu (mobile) */}
          {drumMenu&&(()=>{
            const dm=drumMenu;const vw=window.innerWidth,vh=window.innerHeight;const W=180,H=120;
            const px=Math.max(8,Math.min(vw-W-8,dm.x-W/2));const py=Math.max(8,Math.min(vh-H-8,dm.y+12));
            const close=()=>setDrumMenu(null);const act=(fn)=>{fn();close();};const isOnly=drumPats.length<=1;
            return(<div style={{position:"fixed",top:0,left:0,right:0,bottom:0,zIndex:500}} onPointerDown={close} onClick={close}>
              <div style={{position:"absolute",left:px,top:py,width:W,background:"rgba(12,12,12,0.92)",backdropFilter:"blur(14px)",WebkitBackdropFilter:"blur(14px)",borderRadius:12,border:"1px solid rgba(255,255,255,0.1)",boxShadow:"0 8px 32px rgba(0,0,0,0.7)",overflow:"hidden",pointerEvents:"all"}} onPointerDown={e=>e.stopPropagation()} onClick={e=>e.stopPropagation()}>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:1,background:"rgba(220,200,180,0.06)"}}>
                  {[["RAND",()=>act(randDrumVel)],["CLR",()=>act(clearDrums)],["CPY",()=>act(copyDrumPatFn)],["PST",()=>act(pasteDrumPatFn),!drumClipboard],["DUP",()=>act(dupDrumPat),drumPats.length>=8],["DEL",()=>act(delDrumPat),isOnly,true]].map(([label,fn,disabled,danger])=>(
                    <button key={label} disabled={!!disabled} style={{padding:"10px 0",background:"rgba(10,10,10,0.9)",border:"none",color:disabled?"rgba(255,255,255,0.2)":danger?"rgba(196,122,122,0.9)":"rgba(255,255,255,0.8)",fontSize:11,fontWeight:700,letterSpacing:1.5,cursor:disabled?"default":"pointer"}}
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
  .left-col button{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}
  .left-col select{min-width:0;}
  .grid-outer{container-type:size;width:100%;height:100%;display:flex;align-items:center;justify-content:center;}
  .grid-square{width:min(100cqw,100cqh);height:min(100cqw,100cqh);display:flex;flex-direction:column;flex-shrink:0;padding:8px;box-sizing:border-box;}
`;

const S={
  root:      {fontFamily:"'DM Sans',sans-serif",background:"#1a1814",color:"#e8e0d5",height:"100dvh",overflowY:IS_MOBILE?"hidden":"hidden",overscrollBehavior:"contain",maxWidth:"none",margin:"0 auto",padding:IS_MOBILE?0:"16px 20px 20px",userSelect:"none",WebkitUserSelect:"none",WebkitTouchCallout:"none"},
  hdr:       {display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:IS_MOBILE?14:20,gap:4},
  brand:     {fontFamily:"'DM Sans',sans-serif",fontSize:IS_MOBILE?22:28,fontWeight:300,letterSpacing:6,background:"linear-gradient(135deg,#c4a882,#9bbfaa)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",flexShrink:0},
  hdrR:      {display:"flex",alignItems:"center",gap:IS_MOBILE?6:10},
  sel:       {background:"rgba(200,185,165,0.05)",border:"1px solid rgba(255,255,255,0.14)",color:"rgba(255,255,255,0.7)",fontSize:IS_MOBILE?10:13,padding:"7px 8px",borderRadius:6,cursor:"pointer",flexShrink:1,minWidth:0},
  hdrWidget: {display:"flex",alignItems:"center",gap:2,flexShrink:0},
  widgetBox: {textAlign:"center",minWidth:26},
  widgetN:   {fontSize:IS_MOBILE?20:22,fontWeight:700,display:"block",lineHeight:1.1},
  widgetU:   {fontSize:IS_MOBILE?8:11,color:"rgba(210,195,175,0.3)",letterSpacing:1,display:"block"},
  bpmDragTarget: {display:"flex",flexDirection:"column",alignItems:"center",cursor:"ns-resize",padding:IS_MOBILE?"8px 14px":"8px 10px",borderRadius:10,border:"1px solid rgba(200,185,165,0.15)",background:"rgba(200,185,165,0.04)",minWidth:IS_MOBILE?52:40,touchAction:"none",userSelect:"none",flexShrink:1},
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
  speedRow:  {display:"flex",flexWrap:"wrap",gap:4,marginBottom:IS_MOBILE?10:14},
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
  lenSlider:   {position:"relative",height:IS_MOBILE?10:20,marginTop:IS_MOBILE?4:8,borderRadius:IS_MOBILE?3:5,background:"rgba(220,200,180,0.06)",touchAction:"none",cursor:"ew-resize",overflow:"visible"},
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
  knobLabel:      {fontSize:IS_MOBILE?8:10,letterSpacing:1,fontWeight:500},
  knobTrackWrap:  {position:"relative",height:26,display:"flex",alignItems:"center",cursor:"ew-resize",touchAction:"none",marginBottom:2},
  knobTrackBg:    {position:"absolute",left:0,right:0,height:4,borderRadius:3,background:"rgba(255,255,255,0.08)"},
  knobTrackFill:  {position:"absolute",left:0,height:4,borderRadius:3,pointerEvents:"none"},
  knobThumb:      {position:"absolute",top:"50%",transform:"translate(-50%,-50%)",width:18,height:18,borderRadius:"50%",pointerEvents:"none"},
  knobValue:      {fontSize:IS_MOBILE?10:11,fontWeight:500,letterSpacing:0},

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
