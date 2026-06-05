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
// Pick a RANDOM glyph not already used among `usedNames` (uniqueness within a
// layer). Replaces the old index-based ordering, which both looked prescribed
// and could collide after a pattern was deleted and another added. Falls back
// to the full pool only if every glyph is taken (never happens at ≤8 patterns).
const pickSym=(usedNames)=>{
  const used=new Set(usedNames||[]);
  const avail=SYM_POOL.filter(s=>!used.has(s));
  const pool=avail.length?avail:SYM_POOL;
  return pool[Math.floor(Math.random()*pool.length)];
};
// Device detection — multiple signals for reliability across browsers and iframe contexts
const IS_MOBILE = (()=>{
  try {
    return navigator.maxTouchPoints > 0
      || window.matchMedia('(pointer: coarse)').matches
      || window.screen.width < 768
      || /Android|iPhone|iPad|iPod|Mobile|CriOS/i.test(navigator.userAgent);
  } catch(e) { return false; }
})();
const PAT_COLORS=["#a8c5a0","#c4727a","#9fb4c7","#c9a96e","#6c9ad6","#7aaa96","#c4b07a","#a09ec4"];
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
const C_OSC="#7ecfb3", C_ENV="#d4956a", C_FILT="#c97b8a", C_DLY="#8bbf9f", C_REV="#a8b8d0";
const C_SAT="#d8a050"; // FX-page accent color (reverb / delay)
// VARY page accent — a single neutral gold used across all VARY sections so
// the page doesn't borrow (and visually conflict with) the layer colors.
const C_VARY="#c9a96e";

const rowHue=r=>Math.round(195-(r/(ROWS-1))*135);
const rowCol=r=>"hsl("+rowHue(r)+",100%,62%)";
const patCol=i=>PAT_COLORS[i%PAT_COLORS.length];
let _id=0;
const mkGrid=()=>Array.from({length:ROWS},()=>new Array(COLS).fill(false));
// durs[r][c] = how many cols this note extends to the right (1 = single cell). Only
// meaningful where grid[r][c] is true. Per-row durations enable true polyphony —
// extending one note's duration doesn't affect notes in other rows. Within a row,
// only one note plays at any moment (per-row monophony).
const mkDurs=()=>Array.from({length:ROWS},()=>new Array(COLS).fill(1));
const defaultStepParams=()=>Array.from({length:COLS},()=>({vel:100,flt:50,dly:0,rev:0,rhy:1,dur:0,oct:2,glide:0}));
const mkPat=name=>({id:++_id,name,grid:mkGrid(),durs:mkDurs(),params:defaultStepParams(),gridLen:16,speedMult:1});
// Cull a pattern down to monophonic — at most one active note per column.
// Used when copying a POLY (multi-row-per-col) pattern onto the MONO layer:
// without this, dragging a chord onto MONO would still try to play every
// note. Keeps the TOP-MOST note (lowest row index = highest pitch — that's
// usually the melody line in a chord). Returns new grid+durs arrays; doesn't
// mutate inputs.
const cullPatToMono=(grid,durs)=>{
  const g=grid.map(row=>[...row]);
  const d=durs?durs.map(row=>[...row]):mkDurs();
  for(let c=0;c<COLS;c++){
    let kept=false;
    for(let r=0;r<ROWS;r++){
      if(!g[r][c])continue;
      if(kept){g[r][c]=false; if(d[r])d[r][c]=1;}
      else kept=true;
    }
  }
  return{grid:g,durs:d};
};
// ─── Drum layer ───────────────────────────────────────────────────────────────
// Lane order top→bottom. Reordered 2026-05: kick, snare, rim, clap, toms
// (hi→lo), hats, cymbal, clave, shaker, cowbell. Save data is positional, so
// changing this order requires migrating old saves by voice KEY — see
// DRUM_ORDER_* + migrateDrumPatRows. Bump DRUM_ORDER_V on any future reorder.
const DRUM_VOICES=[
  {key:"BD",label:"BD",full:"KICK",   color:"#e07060"},
  {key:"SD",label:"SD",full:"SNARE",  color:"#e09050"},
  {key:"RM",label:"RM",full:"RIM",    color:"#cf8f6a"},
  {key:"CP",label:"CP",full:"CLAP",   color:"#c070c0"},
  {key:"HT",label:"HT",full:"HI TOM", color:"#a0b840"},
  {key:"MT",label:"MT",full:"MID TOM",color:"#b8b040"},
  {key:"LT",label:"LT",full:"LO TOM", color:"#c8a840"},
  {key:"CH",label:"CH",full:"CL HAT", color:"#60b878"},
  {key:"OH",label:"OH",full:"OP HAT", color:"#50a8c0"},
  {key:"CY",label:"CY",full:"CYMBAL", color:"#7888d0"},
  {key:"CL",label:"CL",full:"CLAVES", color:"#d4956a"},
  {key:"SH",label:"SH",full:"SHAKER", color:"#8fb0c0"},
  {key:"CB",label:"CB",full:"COWBELL",color:"#9bbfaa"},
];
const DRUM_ROWS=DRUM_VOICES.length;
// When a drum group is linked (linkHat / linkTom), its member channels collapse
// to one shared color in BOTH the mixer and the sequencer — so e.g. closed+open
// hat read as a single hi-hat, and the three toms read as one. Defeating a link
// restores each voice's own color. The shared colors are the blend of the group.
const HAT_LINK_VOICES=["CH","OH"], TOM_LINK_VOICES=["LT","MT","HT"];
const HAT_LINK_COLOR="#58b09c"; // blend of CH green + OH cyan
const TOM_LINK_COLOR="#b8b040"; // blend of LT/MT/HT golds
const drumColor=(r,linkHat,linkTom)=>{
  const v=DRUM_VOICES[r]; if(!v)return "#888";
  if(linkHat&&HAT_LINK_VOICES.includes(v.key))return HAT_LINK_COLOR;
  if(linkTom&&TOM_LINK_VOICES.includes(v.key))return TOM_LINK_COLOR;
  return v.color;
};
// Voice-order schema version. Saves tag their pats with `vo`; anything not
// matching the current version is remapped by key on load.
const DRUM_ORDER_V=2;
// Historical row orders (by voice key) for migrating positional save data.
const DRUM_ORDER_10=["BD","SD","LT","HT","CH","OH","CY","CP","CL","CB"];               // pre-MT, pre-RM/SH
const DRUM_ORDER_11=["BD","SD","LT","MT","HT","CH","OH","CY","CP","CL","CB"];           // pre-RM/SH
const DRUM_ORDER_13_OLD=["BD","SD","LT","MT","HT","CH","OH","CY","CP","CL","CB","RM","SH"]; // v1 (pre-reorder)
// Drum velocity is PER-CELL: vel[row][col]. (Was per-column vel[col].) This
// lets two voices on the same step play at different velocities.
const mkDrumVel=()=>Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(100));
// Normalize any saved vel into the per-cell 2D shape. Legacy saves stored a
// 1D per-column array — broadcast each column value across all rows. A 2D
// array (current shape) is copied cell-by-cell into a fresh full-size grid.
const toDrumVel2D=(vel)=>{
  const out=mkDrumVel();
  if(!Array.isArray(vel))return out;
  if(Array.isArray(vel[0])){ // already per-cell
    for(let r=0;r<DRUM_ROWS;r++)for(let c=0;c<COLS;c++)
      if(vel[r]&&vel[r][c]!=null)out[r][c]=vel[r][c];
  } else { // legacy per-column → broadcast down each column
    for(let r=0;r<DRUM_ROWS;r++)for(let c=0;c<COLS;c++)
      if(vel[c]!=null)out[r][c]=vel[c];
  }
  return out;
};
// Per-cell ratchet: rat[row][col] = how many evenly-spaced retriggers fire
// within that step (1 = a single normal hit). Ctrl/Cmd+click a cell cycles it.
const mkDrumRat=()=>Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(1));
// Normalize a saved ratchet grid into the 2D shape. No legacy 1D form exists
// (the field is new), so anything non-2D just yields all-1s.
const toDrumRat2D=(rat)=>{
  const out=mkDrumRat();
  if(!Array.isArray(rat)||!Array.isArray(rat[0]))return out;
  for(let r=0;r<DRUM_ROWS;r++)for(let c=0;c<COLS;c++)
    if(rat[r]&&rat[r][c]!=null)out[r][c]=Math.max(1,Math.min(8,rat[r][c]));
  return out;
};
const mkDrumPat=name=>({id:++_id,name,grid:Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(false)),vel:mkDrumVel(),rat:mkDrumRat(),gridLen:16,mix:defaultDrumMix(),vRhythm:0,vVelocity:0,speedMult:1,vo:DRUM_ORDER_V});
// Continuous drum-mix params that support motion automation (the slider ones;
// the FILT mode chip is excluded). pat.motion[param] is a lazily-created
// ROWS×COLS grid of number|null — null = "use the base mix value at this step".
// Drum-mix params that MOTION can automate per step. level/pan/rvSend/dlySend/
// filtCut are AudioParams scheduled at the note onset; pitch/env are read
// per-hit from the passed mix inside DrumEngine.play. `sat` is intentionally
// excluded — it's a WaveShaper curve swap on a shared strip node, which can't
// be scheduled per-step under the look-ahead, so it stays a static control.
const MOTION_PARAMS=["level","pan","rvSend","dlySend","pitch","env","filtCut"];
const motionValAt=(pat,param,r,s)=>{
  const m=pat&&pat.motion&&pat.motion[param];
  return (m&&m[r]&&m[r][s]!=null)?m[r][s]:null;
};
// Default drum voice level — 60% sits well below the "unity" mark so users
// have plenty of headroom to push voices up rather than only being able to
// pull them down. Earlier 75% still felt too hot in stacks of voices.
// rvSend/dlySend default to 0 — per-channel FX sends are opt-in.
const DRUM_DEFAULT_LEVEL = 60;

// ─── Curated drum kits ───────────────────────────────────────────────────────
// Each non-"synth" kit maps every DRUM_VOICES key to a relative URL that will
// be fetched and decoded when the kit is selected. Add new kits here; paths
// are relative to the deployed root so samples/kit-name/file.wav will resolve
// correctly on GitHub Pages. Missing keys fall back to the synth voice.
//
// File layout convention:
//   samples/<kit-id>/<voice-key>.wav   e.g. samples/707/BD.wav
//
// To add a kit: copy the template, fill in the id/label/samples map, and put
// your audio files at the listed paths in the repo.
const DRUM_KITS = [
  {
    id:    "808-kit",
    label: "808",
    // Only the voices with files listed here load samples; every other voice
    // falls through to the built-in synth per-voice. Add keys as more samples
    // land.
    samples: {
      BD: "samples/808-kit/BD.wav",
      SD: "samples/808-kit/SD.wav",
      CP: "samples/808-kit/CP.wav",
      CL: "samples/808-kit/CL.wav",
      CB: "samples/808-kit/CB.wav",
      LT: "samples/808-kit/LT.wav",
      MT: "samples/808-kit/MT.wav",
      HT: "samples/808-kit/HT.wav",
      CH: "samples/808-kit/CH.wav",
      OH: "samples/808-kit/OH.wav",
      CY: "samples/808-kit/CY.wav",
      RM: "samples/808-kit/RM.wav",
      SH: "samples/808-kit/SH.wav",
    },
  },
  {
    id:    "vp-kit",
    label: "VP",
    // Mixed sample types per voice:
    //   string      → single one-shot
    //   {rr:[...]}  → round-robin (random pick each hit)
    //   {vel:[...]} → velocity layers, ordered soft→hard
    samples: {
      BD: {vel:["samples/vp-kit/BDv1.wav","samples/vp-kit/BDv2.wav"]},
      SD: {vel:["samples/vp-kit/SDv1.wav","samples/vp-kit/SDv2.wav","samples/vp-kit/SDv3.wav"]},
      RM: "samples/vp-kit/RM.wav",
      CP: "samples/vp-kit/CP.wav",
      HT: "samples/vp-kit/HT.wav",
      MT: "samples/vp-kit/MT.wav",
      LT: "samples/vp-kit/LT.wav",
      CH: {rr:["samples/vp-kit/CH1.wav","samples/vp-kit/CH2.wav","samples/vp-kit/CH3.wav","samples/vp-kit/CH4.wav","samples/vp-kit/CH5.wav","samples/vp-kit/CH6.wav"]},
      OH: "samples/vp-kit/OH.wav",
      CY: "samples/vp-kit/CY.wav",
      CL: "samples/vp-kit/CL.wav",
      SH: {rr:["samples/vp-kit/SH1.wav","samples/vp-kit/SH2.wav","samples/vp-kit/SH3.wav"]},
      CB: "samples/vp-kit/CB.aiff",
    },
  },
  {
    // USER kit — no bundled samples (every voice starts on the synth engine),
    // but it's the only kit that exposes the per-voice REC/sampling interface.
    // As the user records a voice, that recording replaces its synth sound.
    id:    "user",
    label: "USER",
    user:  true,
  },
];
// The kit selected on a fresh load / NEW project. Points at the curated kit
// so the bundled samples are the out-of-the-box sound.
const DEFAULT_KIT = "808-kit";
// Filter modes: "off" disables the filter (passes everything through unity),
// "lp"/"hp"/"bp" route through the corresponding biquad type. filtCut 0..100
// maps log-scaled to 20..20000 Hz at runtime. pitch is in semitones, ±24.
// env: 0..100 sample playback length. 100 = whole sample plays; lower values
// gate the sample shorter with a short release fade, down to a ~12ms transient
// at 0. Only affects sample voices, not the synthesizer.
const defaultDrumMix=()=>Array.from({length:DRUM_ROWS},()=>({
  level:DRUM_DEFAULT_LEVEL,pan:0,rvSend:0,dlySend:0,
  pitch:0,filt:"off",filtCut:100,env:100,sat:0,
}));
// Waveshaper curve for per-voice saturation. amt 0..1. At 0 the curve is the
// identity (clean bypass); as amt rises it becomes a soft-clip that's identity
// at the origin and compresses toward ±1, adding harmonics. (1+k) numerator
// keeps loud transients present rather than just squashing them.
const makeSatCurve=(amt)=>{
  const n=1024,c=new Float32Array(n);
  const k=Math.max(0,Math.min(1,amt))**2*16; // 0..16 drive, eased
  for(let i=0;i<n;i++){
    const x=(i/(n-1))*2-1;
    c[i]=k>0.0001 ? ((1+k)*x)/(1+k*Math.abs(x)) : x;
  }
  return c;
};
// Backfill any missing fields on loaded drum mix arrays — older saves only had
// {level,pan}, so we need to pad new fields with their defaults.
const fillDrumMix=(mix)=>{
  const out=defaultDrumMix();
  if(!Array.isArray(mix))return out;
  return out.map((d,i)=>Object.assign({},d,mix[i]||{}));
};
// Migrate a loaded drum pat to the current voice layout + row count. Save data
// is positional, so we remap by voice KEY: figure out which historical order
// the save used (by its `vo` tag, else by row count), then rebuild each
// per-row array in the current DRUM_VOICES order. Voices absent from the
// source order get defaults. Idempotent for current-version pats.
const _drumDefMix=()=>({level:DRUM_DEFAULT_LEVEL,pan:0,rvSend:0,dlySend:0,pitch:0,filt:"off",filtCut:100,env:100,sat:0});
const migrateDrumPatRows=(pat)=>{
  if(!pat||!Array.isArray(pat.grid))return pat;
  // Already current order + current row count → just ensure vel + rat are 2D.
  if(pat.vo===DRUM_ORDER_V&&pat.grid.length===DRUM_ROWS){
    const v=(Array.isArray(pat.vel)&&Array.isArray(pat.vel[0]))?pat.vel:toDrumVel2D(pat.vel);
    return Object.assign({},pat,{vel:v,rat:toDrumRat2D(pat.rat)});
  }
  // Determine the source order. vo===1 (or any 13-len untagged) is the
  // pre-reorder 13 order; 10/11 lengths are the older layouts.
  const len=pat.grid.length;
  const fromKeys = len<=10?DRUM_ORDER_10 : len===11?DRUM_ORDER_11 : DRUM_ORDER_13_OLD;
  // Remap a per-row array (indexed by fromKeys) into the new DRUM_VOICES order.
  const remap=(arr,fill)=>DRUM_VOICES.map(v=>{
    const fi=fromKeys.indexOf(v.key);
    return (fi>=0&&arr&&arr[fi]!==undefined)?arr[fi]:fill();
  });
  const grid=remap(pat.grid.map(r=>Array.isArray(r)?[...r]:new Array(COLS).fill(false)),()=>new Array(COLS).fill(false));
  const out={...pat,grid,vo:DRUM_ORDER_V};
  if(Array.isArray(pat.mix))out.mix=remap(pat.mix.map(m=>({...m})),_drumDefMix);
  // vel: normalize to 2D in the SOURCE order first, then remap rows by key.
  const vel2=toDrumVel2D(pat.vel); // full DRUM_ROWS in *current* order if 2D, else broadcast
  // toDrumVel2D assumes current row count; for legacy 1D it broadcasts columns
  // (row-order-independent), so remap is a no-op there. For an old 2D vel we
  // remap by key from fromKeys.
  if(Array.isArray(pat.vel)&&Array.isArray(pat.vel[0])){
    out.vel=remap(pat.vel.map(r=>[...r]),()=>new Array(COLS).fill(100));
  } else {
    out.vel=vel2; // broadcast (per-column) — order doesn't matter
  }
  // rat: new field; only a 2D form exists, remap it by key (else all-1s).
  out.rat=(Array.isArray(pat.rat)&&Array.isArray(pat.rat[0]))
    ? remap(pat.rat.map(r=>[...r]),()=>new Array(COLS).fill(1))
    : mkDrumRat();
  // motion lanes (param → ROWS×COLS) remap by key too.
  if(pat.motion&&typeof pat.motion==="object"){
    const m={};
    for(const k of Object.keys(pat.motion)){
      const lane=pat.motion[k];
      if(Array.isArray(lane))m[k]=remap(lane.map(r=>Array.isArray(r)?[...r]:new Array(COLS).fill(null)),()=>new Array(COLS).fill(null));
    }
    out.motion=m;
  }
  return out;
};
// Normalize a saved varyMode into the per-layer object shape. Legacy saves
// stored a single boolean (global VARY) — upgrade it by applying to all
// layers. Missing → all off.
const normVary=(v)=>{
  if(v&&typeof v==="object")return {synth:!!v.synth,lead:!!v.lead,drums:!!v.drums};
  const b=!!v; return {synth:b,lead:b,drums:b};
};
// Legacy saves named patterns/phrases/sections with letters ("A","B",…). The
// app now uses abstract glyphs assigned by index. On load, any name that isn't
// already one of the glyph symbols gets reassigned to its index-based glyph so
// old projects show the new icons. Glyph names pass through untouched (so
// current saves are unaffected). IDs are preserved — chains are id-based.
const relabelByIndex=(arr,symFn)=>Array.isArray(arr)
  ? arr.map((p,i)=>(p&&SYM_POOL.includes(p.name))?p:{...p,name:symFn(i)})
  : arr;
// Current project schema version. Bump when a forward-migration on load should
// refresh older projects to the latest conventions (icons, etc.).
const PROJ_VER=2;
// Re-assign per-layer pattern icons. For an OLD/un-versioned project (reroll)
// every icon is re-rolled to the current random-unique scheme — so old projects
// stop showing the prescribed-order/duplicate glyphs. For a current project,
// only invalid or duplicate icons are replaced, keeping the user's icons stable
// across loads. IDs are untouched (chains/matrix are id-based).
const reIconize=(arr,reroll)=>{
  if(!Array.isArray(arr))return arr;
  const used=new Set();
  return arr.map(p=>{
    const nm=p&&p.name;
    if(!reroll&&nm&&SYM_POOL.includes(nm)&&!used.has(nm)){used.add(nm);return p;}
    const g=pickSym([...used]);used.add(g);return {...p,name:g};
  });
};
const FILT_MODES=["off","lp","hp","bp"];
// Map filtCut 0..100 → 20..20000 Hz logarithmically (10 octaves).
const filtCutHz=(v)=>20*Math.pow(1000,Math.max(0,Math.min(100,v))/100);
// Reverb damping expressed as a shelf CORNER frequency so it can read in Hz.
// HF: a high-shelf whose corner sweeps 20kHz (open, 0%) → 1.2kHz (dark, 100%).
// LF: a low-shelf whose corner sweeps 20Hz (open) → 800Hz (heavy low-cut).
// A fixed shelf cut (compounding in the comb feedback) does the actual damping;
// the corner is what moves. NOTE: this is a behaviour change from the old
// amount-at-fixed-corner damp — the readout is now the corner, in Hz.
const RV_DAMP_DB=-12;
const rvHfHz=pct=>20000*Math.pow(1200/20000,Math.max(0,Math.min(100,pct))/100);
const rvLfHz=pct=>20*Math.pow(800/20,Math.max(0,Math.min(100,pct))/100);
const fmtHz=f=>f>=1000?(f/1000).toFixed(f>=10000?0:1)+"k":Math.round(f)+"";
const defaultDrums=()=>({
  grid:Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(false)),
  vel:mkDrumVel(),
  rat:mkDrumRat(),
  gridLen:16,
  mix:defaultDrumMix()
});

// ─── Session defaults ────────────────────────────────────────────────────────
// Single source of truth for every loadable top-level param. Used by:
//   doLoad / applyShareState / applySnapshot — fall back to default when a
//   saved project is missing a field. Without this, loading a project that
//   predates a new param leaves the previous session's value in place, which
//   feels broken (e.g. one project's reverb tail carries over to another).
// Keep this in sync with the defaults set in `doNew`.
const SESSION_DEFAULTS = Object.freeze({
  bpm:120, scale:"major", transpose:0, swing:0, speedMult:1,
  dlyIdx:3, dlyFbPct:45, dlyHpVal:8, dlyLpVal:78,
  rvSize:50, rvDamp:40, rvLfDamp:0, rvPreDelay:0, dlyToRev:0,
  drumLevel:85, drumMix:defaultDrumMix(), activeKit:DEFAULT_KIT,
  vDropRate:13, vShiftRate:17, vShiftRange:1,
  vPitchRate:0, vPitchRange:1, vGhostRate:0,
  vVelJitter:0, vFltJitter:0, vDlyJitter:0,
  vRhyJitter:0, vOctJitter:0, vGlideJitter:0, vDurJitter:0,
  loopMode:false, varyMode:{synth:false,lead:false,drums:false},
  songMode:false, songView:false, songSyncMode:"sync", songRandom:false,
});


const vcfHz=v=>Math.round(20*Math.pow(1000,v/100)); // 20Hz–20kHz
const vcfLbl=v=>{const f=vcfHz(v);return f>=1000?(f/1000).toFixed(1)+"k":String(f);};
const hpHz=v=>Math.round(20*Math.pow(100,v/100));
const hpLbl=v=>{const f=hpHz(v);return f>=1000?(f/1000).toFixed(1)+"k":String(f);};
const lpHz=v=>Math.round(400*Math.pow(50,v/100));
const lpLbl=v=>{const f=lpHz(v);return f>=1000?(f/1000).toFixed(1)+"k":String(f);};
const stR=st=>Math.pow(2,st/12);
const ms=v=>Math.max(0.001,v/1000);

// ── Ballistic, size-proportional drag ───────────────────────────────────────
// Returns the value change for ONE pointermove of `pixelDelta` px, on a control
// `dim` px long that spans `range`. Slow drags are finest (~DRAG_SLOW : 1); fast
// drags scale up toward a cap that itself grows with the control's pixel size —
// a tiny control floors at ~DRAG_MINCAP : 1, a big one can exceed 1:1 (up to
// DRAG_MAXCAP) on a fast flick. So a small on-screen control stays fine, a large
// one can fly. (Tune these to taste — wide range: very fine at slow, very fast
// at speed.)
const DRAG_SLOW   = 0.10;  // ratio at slow speed — the finest you can get
const DRAG_FASTPX = 14;    // px in one move that counts as a "fast" flick
const DRAG_REFPX  = 120;   // control length (px) at which a fast drag reaches 1:1
const DRAG_MINCAP = 0.55;  // fast-speed cap floor for tiny controls
const DRAG_MAXCAP = 2.2;   // fast-speed cap ceiling for large controls (>1:1 = flies)
const ballisticDelta=(pixelDelta,dim,range)=>{
  const d=Math.max(1,dim);
  const speed=Math.min(1,Math.abs(pixelDelta)/DRAG_FASTPX);
  const cap=Math.max(DRAG_MINCAP,Math.min(DRAG_MAXCAP,d/DRAG_REFPX));
  const ratio=DRAG_SLOW+(cap-DRAG_SLOW)*speed;
  return pixelDelta*(range/d)*ratio;
};
// Velocity-aware nudge for *trackless* scrubbers (bpm / transpose / swing) — a
// number readout you drag vertically with no on-screen extent to scale against.
// `base` is the units-per-pixel gearing at medium speed; slow drags get ~0.5×
// that (finer), fast flicks ~2.5× (coarser). Same ballistic spirit as the
// sliders, geared to each scrubber's own range instead of a pixel length.
const ballisticNudge=(pixelDelta,base)=>{
  const speed=Math.min(1,Math.abs(pixelDelta)/DRAG_FASTPX);
  return pixelDelta*base*(0.5+2.0*speed);
};
// Double-tap / double-click → reset to default. The dblclick DOM event is
// unreliable on touch — especially on controls that capture the pointer and set
// touch-action:none — so detect it ourselves: two quick pointerdowns near the
// same spot. Works identically for mouse and touch. Call at the top of a
// control's onPointerDown; if it returns true, run the reset and bail out of the
// drag. Shared singleton (only one finger/cursor taps at a time).
const _lastTap={t:-1e9,x:0,y:0};
const isDoubleTap=e=>{
  const t=e.timeStamp;
  const dbl=(t-_lastTap.t)<350 && Math.abs(e.clientX-_lastTap.x)<30 && Math.abs(e.clientY-_lastTap.y)<30;
  if(dbl){_lastTap.t=-1e9;return true;}        // consume so a 3rd tap starts fresh
  _lastTap.t=t;_lastTap.x=e.clientX;_lastTap.y=e.clientY;return false;
};

const storageSet=async(k,v)=>{try{await window.storage.set(k,v);return true;}catch(e){}try{localStorage.setItem("tnori-"+k,v);return true;}catch(e){}return false;};
const storageGet=async k=>{try{const r=await window.storage.get(k);if(r&&r.value)return r.value;}catch(e){}try{const v=localStorage.getItem("tnori-"+k);if(v)return v;}catch(e){}return null;};

// ── User-sample (de)serialization ────────────────────────────────────────────
// Recorded drum samples are AudioBuffers (binary). To save/export them with a
// project they're encoded to 16-bit PCM WAV → base64. Short one-shots, so the
// size is acceptable in a file/slot save (excluded from the URL share).
const audioBufToWav=(buf)=>{
  const nCh=buf.numberOfChannels||1, len=buf.length, sr=buf.sampleRate||44100;
  const blockAlign=nCh*2, dataLen=len*blockAlign;
  const ab=new ArrayBuffer(44+dataLen), dv=new DataView(ab); let o=0;
  const ws=s=>{for(let i=0;i<s.length;i++)dv.setUint8(o++,s.charCodeAt(i));};
  const w16=v=>{dv.setUint16(o,v,true);o+=2;}; const w32=v=>{dv.setUint32(o,v,true);o+=4;};
  ws("RIFF");w32(36+dataLen);ws("WAVE");ws("fmt ");w32(16);w16(1);w16(nCh);w32(sr);w32(sr*blockAlign);w16(blockAlign);w16(16);ws("data");w32(dataLen);
  const chans=[]; for(let c=0;c<nCh;c++)chans.push(buf.getChannelData(c));
  for(let i=0;i<len;i++)for(let c=0;c<nCh;c++){const s=Math.max(-1,Math.min(1,chans[c][i]));dv.setInt16(o,s<0?s*0x8000:s*0x7FFF,true);o+=2;}
  return ab;
};
const abToBase64=(ab)=>{let bin="";const b=new Uint8Array(ab),CH=0x8000;for(let i=0;i<b.length;i+=CH)bin+=String.fromCharCode.apply(null,b.subarray(i,i+CH));return btoa(bin);};
const base64ToAb=(b64)=>{const bin=atob(b64),b=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)b[i]=bin.charCodeAt(i);return b.buffer;};
// Encode a {voiceKey:AudioBuffer} map to {voiceKey:base64wav}. Skips non-buffers.
const serializeSamples=(map)=>{
  const out={}; if(!map)return out;
  for(const k of Object.keys(map)){const b=map[k];if(b&&b.numberOfChannels!=null){try{out[k]=abToBase64(audioBufToWav(b));}catch(e){}}}
  return out;
};

// ── MIDI (Standard MIDI File) export ─────────────────────────────────────────
// General-MIDI note number per drum voice (channel 10). Best-fit GM percussion.
const GM_DRUM={BD:36,SD:38,RM:37,CP:39,HT:50,MT:47,LT:43,CH:42,OH:46,CY:49,CL:75,SH:70,CB:56};
const PPQ=480; // ticks per quarter note
const TICKS_16=PPQ/4; // one 16th-note step
// Hz → nearest MIDI note number (A4=440=69), clamped to valid range.
const freqToMidi=(f)=>Math.max(0,Math.min(127,Math.round(69+12*Math.log2(f/440))));
// Variable-length quantity (MIDI delta-times).
const _vlq=(n)=>{n=Math.max(0,Math.round(n));let b=[n&0x7f];n=Math.floor(n/128);while(n>0){b.unshift((n&0x7f)|0x80);n=Math.floor(n/128);}return b;};
const _str=(s)=>Array.from(s).map(c=>c.charCodeAt(0));
const _u32=(n)=>[(n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255];
// events: [{tick, data:[status,...]}] — built into an MTrk chunk (sorted, delta-encoded).
const _midiTrack=(events)=>{
  events.sort((a,b)=>a.tick-b.tick||(a.order||0)-(b.order||0));
  const body=[];let last=0;
  for(const e of events){body.push(..._vlq(e.tick-last),...e.data);last=e.tick;}
  body.push(0x00,0xFF,0x2F,0x00); // End of Track
  return [..._str("MTrk"),..._u32(body.length),...body];
};
// tracks: array of event-arrays. Returns a Blob (format-1 SMF).
const buildSMF=(tracks)=>{
  const head=[..._str("MThd"),..._u32(6),0x00,0x01,(tracks.length>>8)&255,tracks.length&255,(PPQ>>8)&255,PPQ&255];
  let bytes=[...head];
  for(const t of tracks)bytes.push(..._midiTrack(t));
  return new Uint8Array(bytes);
};
const downloadBlob=(data,filename,type)=>{
  const blob=(data instanceof Blob)?data:new Blob([data],{type:type||"application/octet-stream"});
  const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=filename;a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),2000);
};

const genVariation=(grid,vp={})=>{
  const g=grid.map(r=>[...r]);
  const drop=(vp.dropRate??13)/100;
  const shift=(vp.shiftRate??17)/100;
  const sRange=vp.shiftRange??1;
  const pitch=(vp.pitchRate??0)/100;
  const pRange=vp.pitchRange??1;
  const ghost=(vp.ghostRate??0)/100;
  const on=[];
  let droppedCount=0;
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(!grid[r][c])continue;
    const roll=Math.random();
    if(roll<drop){ g[r][c]=false; droppedCount++; }
    else if(roll<drop+shift){
      const nc=(c+(Math.floor(Math.random()*sRange*2+1)-sRange)+COLS)%COLS;
      if(!g[r][nc]){g[r][c]=false;g[r][nc]=true;}
    } else if(Math.random()<pitch){
      const nr=Math.max(0,Math.min(ROWS-1,r+(Math.floor(Math.random()*pRange*2+1)-pRange)));
      if(!g[nr][c]){g[r][c]=false;g[nr][c]=true;}
    }
    if(g[r][c])on.push([r,c]);
  }
  // Balance drops with adds: collect every empty cell, then sample without
  // replacement up to `droppedCount` times. Avoids the under-add failure mode
  // a fixed-tries random-pick had on dense grids; over many MUT8 calls the
  // note count stays roughly stable rather than drifting toward empty.
  if(droppedCount>0){
    const empties=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      if(!g[r][c])empties.push([r,c]);
    }
    const adds=Math.min(droppedCount,empties.length);
    for(let i=0;i<adds;i++){
      const j=i+Math.floor(Math.random()*(empties.length-i));
      const tmp=empties[i];empties[i]=empties[j];empties[j]=tmp;
      const[er,ec]=empties[i];
      g[er][ec]=true;
    }
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
  // Safety guard: if the input grid had notes but the varied output is now
  // empty (extreme slider combinations can land here — e.g. heavy drop with
  // adds happening to land on row/cols outside the active gridLen), restore
  // one note from the input so the pattern doesn't go fully silent on the
  // user. They can still toggle VARY off if they want the original.
  let hadInput=false,hasOut=false;
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    if(grid[r][c])hadInput=true;
    if(g[r][c])hasOut=true;
    if(hadInput&&hasOut)break;
  }
  if(hadInput&&!hasOut){
    outer:for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
      if(grid[r][c]){g[r][c]=true;break outer;}
    }
  }
  return g;
};

// Generate a variation that is guaranteed not to silence a pattern that had
// audible notes. genVariation can shift/drop notes such that nothing lands
// within the active gridLen (the playable window) — when that happens we
// fall back to the original grid for this cycle rather than play silence.
// This is the fix for the "VARY on kills sound" bug.
const safeVaryGrid=(grid,vp,gridLen)=>{
  const len=Math.max(1,Math.min(COLS,gridLen||COLS));
  const hasInWindow=(g)=>{
    for(let r=0;r<ROWS;r++)for(let c=0;c<len;c++)if(g[r]&&g[r][c])return true;
    return false;
  };
  const origHas=hasInWindow(grid);
  const varied=genVariation(grid,vp);
  if(origHas&&!hasInWindow(varied))return grid.map(r=>[...r]);
  return varied;
};

// Jitter a step's params by vary settings
const jitterStepParam=(sp,vp)=>{
  if(!sp)return sp;
  const jit=(v,amt,lo,hi)=>Math.max(lo,Math.min(hi,v+Math.round((Math.random()*2-1)*amt)));
  return{
    vel: vp.velJitter>0   ? jit(sp.vel, vp.velJitter*0.4, 0,127) : sp.vel,
    flt: vp.fltJitter>0   ? jit(sp.flt, vp.fltJitter*0.25,0,100) : sp.flt,
    dly: vp.dlyJitter>0   ? jit(sp.dly, vp.dlyJitter*0.4, 0,100) : sp.dly,
    rev: sp.rev??0, // preserve through vary; no rev-specific jitter knob yet
    rhy: vp.rhyJitter>0&&Math.random()<vp.rhyJitter/100 ? [1,1,2,3,4][Math.floor(Math.random()*5)] : sp.rhy,
    oct: vp.octJitter>0   &&Math.random()<vp.octJitter/100 ? Math.max(0,Math.min(4,sp.oct+(Math.random()<.5?1:-1))) : sp.oct,
    glide: vp.glideJitter>0 ? (Math.random()<vp.glideJitter/100?1:sp.glide) : sp.glide,
    dur:   vp.durJitter>0   ? jit(sp.dur??0, vp.durJitter*0.8, -100, 100) : (sp.dur??0),
  };
};

// ─── KnobSlider with accent color ─────────────────────────────────────────────
function KnobSlider({label,value,min,max,onChange,display,accent,vertical,def}){
  const ref=useRef(null);
  const drag=useRef(null);
  const col=accent||"rgba(255,255,255,0.6)";
  const pct=((value-min)/(max-min))*100;
  // Drag is RELATIVE at ~0.5x by default: dragging the full length of the control
  // moves the value half its range — finer than tracking the pointer 1:1, and no
  // jump-to-position. Ctrl/Cmd held = extra-fine relative (Pro Tools style).
  // Double-click resets.
  const onDown=useCallback(e=>{
    e.stopPropagation();
    if(isDoubleTap(e)){onChange(def!=null?def:((min<0&&max>0)?0:min));return;}
    try{ref.current.setPointerCapture(e.pointerId);}catch(_){}
    drag.current={fine:e.ctrlKey||e.metaKey,lx:e.clientX,ly:e.clientY,v:value};
  },[value,def,min,max,onChange]);
  const onMove=useCallback(e=>{
    if(!e.buttons||!drag.current)return;e.stopPropagation();
    const d=drag.current,rect=ref.current.getBoundingClientRect();
    const dim=Math.max(40,vertical?rect.height:rect.width);
    const pd=vertical?(d.ly-e.clientY):(e.clientX-d.lx);
    d.lx=e.clientX;d.ly=e.clientY;
    // Ballistic by default; Ctrl/Cmd = a fixed ultra-fine (1200px = full range).
    const inc=d.fine?pd*((max-min)/1200):ballisticDelta(pd,dim,max-min);
    d.v=Math.max(min,Math.min(max,d.v+inc));
    onChange(Math.round(d.v));
  },[min,max,onChange,vertical]);
  // Double-click resets: to `def` if given, else 0 for bipolar tracks (center)
  // or the minimum otherwise.
  const onReset=useCallback(()=>{onChange(def!=null?def:((min<0&&max>0)?0:min));},[def,min,max,onChange]);
  if(vertical){
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,userSelect:"none",width:52}}>
        <div style={{fontSize:10,letterSpacing:1,fontWeight:500,color:col+"bb",textAlign:"center",lineHeight:1.4}}>
          <div>{label}</div>
          <div style={{color:col,letterSpacing:0}}>{display}</div>
        </div>
        <div ref={ref} style={{position:"relative",width:28,flex:1,minHeight:80,cursor:"ns-resize",touchAction:"none",display:"flex",justifyContent:"center"}}
          onPointerDown={onDown} onPointerMove={onMove} onDoubleClick={onReset}>
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
        onPointerDown={onDown} onPointerMove={onMove} onDoubleClick={onReset}>
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
// (OutputMeter removed — the master limiter prevents clipping, so the app no
// longer needs the user to watch output levels.)

// ─── Step param lane definitions ─────────────────────────────────────────────
const LANES=[
  {key:"vel",  label:"VEL",  color:"#c8bfb0",min:0,   max:127, def:100, center:null, bool:false},
  {key:"flt",  label:"FLT",  color:"#c97b8a",min:0,   max:100, def:50,  center:50,   bool:false},
  {key:"dly",  label:"DLY",  color:"#7aaa96",min:0,   max:100, def:0,   center:null, bool:false},
  {key:"rev",  label:"REV",  color:"#a8b8d0",min:0,   max:100, def:0,   center:null, bool:false},
  {key:"rhy",  label:"RTCH", color:"#c9a96e",min:1,   max:4,   def:1,   center:null, bool:false},
  {key:"dur",  label:"DUR",  color:"#9fb4c7",min:-100,max:100, def:0,   center:0,    bool:false},
  {key:"oct",  label:"OCT",  color:"#6c9ad6",min:0,   max:4,   def:2,   center:2,    bool:false},
  {key:"glide",label:"GLIDE",color:"#00bcd4",min:0,   max:1,   def:0,   center:null, bool:true},
];
// rhy: 1=×1 (normal), 2=×2, 3=×3, 4=×4 ratchet. Tie done via grid only.
// dur: -100 to +100 — percentage modifier on note gate length (0=default)
// oct: 0=−2, 1=−1, 2=0, 3=+1, 4=+2

const PARAM_ARMS=[
  {key:"rhy", label:"RTCH", color:"#c9a96e", angle:150, min:1,    max:4,   discrete:true,  def:1},
  {key:"dly", label:"DLY",  color:"#7aaa96", angle:120, min:0,    max:100, discrete:false, def:0},
  {key:"vel", label:"VEL",  color:"#c8bfb0", angle:90,  min:0,    max:127, discrete:false, def:100},
  {key:"dur", label:"DUR",  color:"#9fb4c7", angle:60,  min:-100, max:100, discrete:false, def:0},
  {key:"flt", label:"FLT",  color:"#c97b8a", angle:30,  min:0,    max:100, discrete:false, def:50},
  {key:"oct", label:"OCT",  color:"#6c9ad6", angle:10,  min:0,    max:4,   discrete:true,  def:2},
];
// Defaults for the mobile VARY sliders (by label) so double-tap returns each to
// its session default; anything not listed (the STEP jitters) defaults to 0.
const VDEF={DROP:13,SHIFT:17,RANGE:1,PITCH:0,GHOST:0};

function StepLane({lane,values,activeStep,onChange,onDragStart,tall,colHasNote,onResetCol}){
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
                onPointerDown={e=>{e.stopPropagation();if(locked)return;onDragStart&&onDragStart();onChange(c,on?0:1);}}
                onDoubleClick={e=>{e.stopPropagation();if(locked)return;onResetCol&&onResetCol(c);}}>
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

  const getCol=useCallback(e=>{
    const rect=ref.current.getBoundingClientRect();
    return Math.max(0,Math.min(COLS-1,Math.floor((e.clientX-rect.left)/rect.width*COLS)));
  },[]);
  const getCV=useCallback(e=>{
    const rect=ref.current.getBoundingClientRect();
    const col=Math.max(0,Math.min(COLS-1,Math.floor((e.clientX-rect.left)/rect.width*COLS)));
    const pct=1-Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height));
    return{col,val:Math.round(lane.min+pct*(lane.max-lane.min))};
  },[lane]);
  // Gesture-split (mirrors the drum grid): horizontal-dominant drag = draw values
  // across steps (absolute Y → value, X → which step); vertical-dominant drag =
  // fine BALLISTIC adjust of the step you started on; a pure tap sets that step
  // to the tapped height. So you keep the draw-a-curve gesture AND get fine
  // per-step control. `cur` is seeded with the start step's value for relative work.
  const onDown=useCallback(e=>{
    e.stopPropagation();try{ref.current.setPointerCapture(e.pointerId);}catch(_){}
    const col=getCol(e);
    if(colHasNote&&!colHasNote[col]){drag.current={active:false};return;} // locked step
    if(isDoubleTap(e)){drag.current={active:false};onDragStart&&onDragStart();onChange(col,lane.def);return;}
    drag.current={active:true,mode:null,col,cur:(values[col]??lane.def),ly:e.clientY,sx:e.clientX,sy:e.clientY,didStart:false};
  },[getCol,colHasNote,values,lane,onChange,onDragStart]);
  const onMove=useCallback(e=>{
    const d=drag.current; if(!d||!d.active)return; e.stopPropagation();
    if(d.mode===null){
      const dx=e.clientX-d.sx, dy=e.clientY-d.sy;
      if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>6) d.mode="draw";
      else if(Math.abs(dy)>4) d.mode="fine";
      else return;
      if(!d.didStart){onDragStart&&onDragStart();d.didStart=true;}
    }
    if(d.mode==="draw"){
      const{col,val}=getCV(e);
      if(colHasNote&&!colHasNote[col])return; // locked
      onChange(col,val);
    }else{
      const pd=d.ly-e.clientY; d.ly=e.clientY; // drag up = increase
      const h=ref.current.getBoundingClientRect().height;
      d.cur=Math.max(lane.min,Math.min(lane.max,d.cur+ballisticDelta(pd,h,lane.max-lane.min)));
      onChange(d.col,Math.round(d.cur));
    }
  },[getCV,onChange,colHasNote,lane,onDragStart]);
  const onUp=useCallback(e=>{
    const d=drag.current;
    if(d&&d.active&&d.mode===null&&e&&e.type==="pointerup"){
      // Pure tap → set the tapped step to the tapped height (familiar bar-graph set).
      const{col,val}=getCV(e);
      if(!(colHasNote&&!colHasNote[col])){onDragStart&&onDragStart();onChange(col,val);}
    }
    drag.current={active:false};
  },[getCV,onChange,colHasNote,onDragStart]);
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
            <div key={c} style={Object.assign({},S.laneBarWrap,{opacity:locked?0.15:1,borderLeft:isQ?"1px solid rgba(200,185,165,0.15)":"none"})}
              onDoubleClick={e=>{e.stopPropagation();if(locked)return;onResetCol&&onResetCol(c);}}>
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
    // Last-played voice for the MONO layer — choked when a new MONO note
    // triggers, so notes don't ring out on top of each other (true mono
    // behaviour). Holds {vca, oscs:[]}. Single slot is fine while there's
    // one MONO layer; future-proof to a Map keyed by layer name if more
    // mono-style layers get added.
    this.monoActiveVoice=null;
  }
  async init(dlyT,fbv,sendPct,dlyHpV,dlyLpV){
    this.ctx=new(window.AudioContext||window.webkitAudioContext)();
    await this.ctx.resume();
    const m=this.ctx.createGain();m.gain.value=0.55;this.master=m;
    // Master limiter — a fast compressor configured brick-wall-ish so the summed
    // layers can never reach digital clipping. Everything routes voices → m →
    // limiter → destination, and the MP3 bounce taps the limiter OUTPUT, so the
    // exported file is protected too. (This replaces the output meters: rather
    // than asking the user to watch levels, the chain just can't clip.)
    const lim=this.ctx.createDynamicsCompressor();
    lim.threshold.value=-1.0; lim.knee.value=0; lim.ratio.value=20;
    lim.attack.value=0.002; lim.release.value=0.1;
    m.connect(lim); lim.connect(this.ctx.destination); this.limiter=lim;
    // Per-layer mute buses. POLY and MONO voices route their DRY through their
    // own gain (→ master) so mute/solo can cut a layer instantly in the audio
    // domain (ramped, click-free) — not just by gating note scheduling. Reverb/
    // delay sends still go direct (the scheduler stops feeding a muted layer, so
    // its FX tail just rings out naturally, like a real mixer's reverb return).
    this.synthBus=this.ctx.createGain(); this.synthBus.connect(m);
    this.monoBus=this.ctx.createGain();  this.monoBus.connect(m);

    // Reverb — Schroeder-style 8-comb feedback split into stereo L/R groups
    // (Freeverb-ish: 4 combs per channel with slightly offset delay times for
    // L/R image). Per-layer send and optional delay-to-reverb feed both land
    // on rvIn (mono input bus). Signal flow per comb:
    //
    //   rvIn → preDelay → cd ─→ rvMerger (raw output tap)
    //                       ↓
    //                       hsh → lsh → cfb → cd  (feedback only — shelf cuts
    //                                              accumulate over recirculations)
    //
    // CRITICAL: the tap is from cd directly, BEFORE the shelves. The shelves
    // live only in the feedback path. Each circulation applies the shelf cut
    // one more time — so the 1st reflection is unfiltered, the 2nd has one
    // shelf-cut applied, the Nth has N cuts. That's true frequency-dependent
    // decay (HF dies faster than LF, naturally). Tapping post-shelves (which
    // an earlier version did) just put a static EQ on the wet bus — sounded
    // like a low-pass coloration, not like a real reverb.
    const rvIn = this.ctx.createGain(); rvIn.gain.value = 1.0;
    const rvPreDelay = this.ctx.createDelay(0.5); rvPreDelay.delayTime.value = 0;
    rvIn.connect(rvPreDelay);
    const rvOut = this.ctx.createGain(); rvOut.gain.value = 0.6;
    const rvMerger = this.ctx.createChannelMerger(2);
    rvMerger.connect(rvOut); rvOut.connect(m);
    this.rev = rvIn;
    this.rvOut = rvOut;
    this.rvPreDelay = rvPreDelay;
    const rvCombs = [];
    const mkComb = (delaySec, channel) => {
      const cd = this.ctx.createDelay(1); cd.delayTime.value = delaySec;
      const cfb = this.ctx.createGain(); cfb.gain.value = 0.78;
      const hsh = this.ctx.createBiquadFilter();
      // HF damp shelf: corner at 6 kHz so only the brightest air dies faster —
      // mids and lower-highs decay normally. Earlier 3500Hz was too aggressive.
      hsh.type="highshelf"; hsh.frequency.value = 6000; hsh.gain.value = 0;
      const lsh = this.ctx.createBiquadFilter();
      // LF damp shelf: corner at 200 Hz — kills sub-rumble buildup without
      // hollowing out the body of the tail.
      lsh.type="lowshelf";  lsh.frequency.value = 200;  lsh.gain.value = 0;
      rvPreDelay.connect(cd);
      // Output tap: raw delay (before shelves). First reflection is clean.
      cd.connect(rvMerger, 0, channel);
      // Feedback chain: delay → shelves → gain → back to delay input. Each
      // recirculation applies the shelf cut once, accumulating over time.
      cd.connect(hsh); hsh.connect(lsh); lsh.connect(cfb); cfb.connect(cd);
      rvCombs.push({delay:cd, fb:cfb, hsh, lsh});
    };
    [0.0297, 0.0371, 0.0411, 0.0437].forEach(ct=>mkComb(ct, 0)); // left
    [0.0306, 0.0383, 0.0421, 0.0451].forEach(ct=>mkComb(ct, 1)); // right (offset)
    this.rvCombs = rvCombs;

    // Delay line with filters in both the feedback loop and the output tap.
    // dl → dHp → dLp branches to: fb (recirculation) and ret (output).
    // Without dLp→ret, the first echo would be unfiltered (bug); routing the
    // output through the same filter chain means every tap is filtered.
    const dl=this.ctx.createDelay(4);dl.delayTime.value=dlyT;
    const dHp=this.ctx.createBiquadFilter();dHp.type="highpass";dHp.frequency.value=hpHz(dlyHpV);dHp.Q.value=.5;
    const dLp=this.ctx.createBiquadFilter();dLp.type="lowpass";dLp.frequency.value=lpHz(dlyLpV);dLp.Q.value=.5;
    const fb=this.ctx.createGain();fb.gain.value=fbv;
    dl.connect(dHp);dHp.connect(dLp);dLp.connect(fb);fb.connect(dl);

    // Fixed return — always at unity, no wet/dry scaling. Reads filtered tap.
    const ret=this.ctx.createGain();ret.gain.value=0.9;
    dLp.connect(ret);ret.connect(m);
    this.dlyReturn=ret;

    // Delay → reverb send. Tap from the filtered delay output so the same
    // dampening that affects the audible delay also colors the reverb feed.
    const dlyToRev=this.ctx.createGain();dlyToRev.gain.value=0; // off by default
    dLp.connect(dlyToRev);dlyToRev.connect(rvIn);
    this.dlyToRev=dlyToRev;

    // Global send gain — this is what the SEND knob controls
    const sg=this.ctx.createGain();sg.gain.value=sendPct/100;
    sg.connect(dl);
    this.dlySend=sg;

    this.dly=dl;this.dlyFb=fb;this.dlyHp=dHp;this.dlyLp=dLp;
    this.ready=true;
  }
  // Reverb param setters — analogous to setDly* helpers above
  setRvSize(pct){if(!this.ready||!this.rvCombs)return;
    // Feedback gain → exponential decay rate. fb=0.96 roughly doubles the
    // max tail length vs the old 0.92 cap. Damping prevents HF runaway even
    // at the top of the range — shelf cuts accumulate per pass, so nothing
    // builds up unbounded.
    const fb=0.40+(Math.max(0,Math.min(100,pct))/100)*0.56; // 0.40..0.96
    for(const c of this.rvCombs)c.fb.gain.setTargetAtTime(fb,this.ctx.currentTime,0.02);
  }
  // HF damping — high-shelf gain (dB cut) in the feedback path. 0 pct = no
  // damp (0 dB), 100 pct = max damp (~-12 dB). The cut compounds: each comb
  // recirculation applies it once more, so the cumulative HF attenuation
  // over a tail with N reflections is N × shelfGain. -12 dB per pass over
  // ~5 reflections is enough to make highs visibly die before mids and lows.
  // Pure shelf — no resonance, no Q peak. Natural freq-dependent decay.
  setRvDamp(pct){if(!this.ready||!this.rvCombs)return;
    // Sweep the high-shelf CORNER (20kHz open → 1.2kHz dark) at a fixed cut, so
    // the control reads as a frequency. The compounding feedback does the rest.
    const f=rvHfHz(pct),t=this.ctx.currentTime;
    for(const c of this.rvCombs)if(c.hsh){c.hsh.frequency.setTargetAtTime(f,t,0.02);c.hsh.gain.setTargetAtTime(RV_DAMP_DB,t,0.02);}
  }
  // LF damping — low-shelf whose corner sweeps 20Hz (open) → 800Hz (heavy
  // low-cut). Same fixed compounding cut; the corner is the control.
  setRvLfDamp(pct){if(!this.ready||!this.rvCombs)return;
    const f=rvLfHz(pct),t=this.ctx.currentTime;
    for(const c of this.rvCombs)if(c.lsh){c.lsh.frequency.setTargetAtTime(f,t,0.02);c.lsh.gain.setTargetAtTime(RV_DAMP_DB,t,0.02);}
  }
  // Instantly kill ringing tails — zero every reverb comb's feedback and the
  // delay feedback so circulating energy dies. Used to take the engine to true
  // silence before an MP3 bounce. Re-arm afterward with setRvSize()/setDlyFb().
  flushTail(){if(!this.ready)return;const t=this.ctx.currentTime;
    if(this.rvCombs)for(const c of this.rvCombs)if(c.fb)c.fb.gain.setValueAtTime(0,t);
    if(this.dlyFb)this.dlyFb.gain.setValueAtTime(0,t);
  }
  // Pre-delay — delay between input and reverb combs (initial reflection time).
  // 0..500 ms.
  setRvPreDelay(ms){if(!this.ready||!this.rvPreDelay)return;
    const s=Math.max(0,Math.min(500,ms))/1000;
    this.rvPreDelay.delayTime.setTargetAtTime(s,this.ctx.currentTime,0.02);
  }
  setDlyToRev(pct){if(!this.ready||!this.dlyToRev)return;
    this.dlyToRev.gain.setTargetAtTime(Math.max(0,Math.min(100,pct))/100,this.ctx.currentTime,0.02);
  }
  // mods (optional 9th arg): array of {at, sp} entries for mid-note modulation.
  // Each entry schedules a smooth filter cutoff transition at that time using
  // the entry's flt/vel/oct/glide. Used by the scheduler for tied notes — sub-
  // steps within the held note's duration animate the filter without
  // re-triggering the envelope.
  play(freq,at,sp,noteDur,globalSend,prevFreq,glideTime,layerP,layer,mods){
    if(!this.ready||this.ctx.state!=="running")return;
    const t=(at!=null)?at:this.ctx.currentTime,p=layerP||this.p;
    const hasMods=!!(mods&&mods.length);
    // Choke the previous MONO voice before scheduling this one — true mono
    // behaviour, otherwise notes ring out over each other. Fast-fade the
    // previous vca to silence at this note's start time and stop its oscs
    // shortly after. 5ms TC + 30ms stop lag is enough to avoid clicks while
    // staying inaudible against the new note's attack.
    if(p&&p.monoSingle&&this.monoActiveVoice){
      const prev=this.monoActiveVoice;
      const ct=Math.max(t,this.ctx.currentTime);
      try{
        const g=prev.vca.gain;
        // cancelAndHoldAtTime locks the curve's value at ct so the fade starts
        // from exactly where the note is — no jump. Fall back to plain cancel
        // on older engines. Then a short LINEAR ramp to true zero: linear can
        // reach 0 (exponential can't), so the oscillators stop on silence and
        // there's no residual-amplitude click. setTargetAtTime (the old way)
        // only approached zero asymptotically, leaving ~0.25% at stop time.
        if(g.cancelAndHoldAtTime)g.cancelAndHoldAtTime(ct);
        else g.cancelScheduledValues(ct);
        // 9ms linear fade to true zero — long enough that the fast amplitude
        // change isn't itself an audible transient, short enough to still feel
        // monophonic.
        g.linearRampToValueAtTime(0,ct+0.009);
      }catch(e){}
      // Stop the oscs just after the fade completes — gain is already 0 by
      // ct+0.009, so stopping is silent.
      for(const osc of (prev.oscs||[])){
        try{osc.stop(ct+0.012);}catch(e){}
      }
      this.monoActiveVoice=null;
    }
    const velRaw   = sp ? (sp.vel/127) : 1;
    // Per-section velocity scaling — no hard-coded velocity→amp / velocity→
    // filter coupling. Each section has its own velSensitivity (0..100) and
    // invert flag in the layer params, dialed by the user in the sound panel.
    //
    //   velMix(val, inv) = 1 - (val/100) * (1 - velFactor)
    //
    //   where velFactor = inv ? (1 - velRaw) : velRaw.
    //
    // At val=0: result is 1 regardless of velocity (no effect).
    // At val=100, normal: result = velRaw → low-vel scales down to 0.
    // At val=100, inverted: result = 1 - velRaw → high-vel scales down to 0.
    const velMix = (val, inv)=>{
      const k = Math.max(0,Math.min(100,val??0))/100;
      const vf = inv ? (1 - velRaw) : velRaw;
      return 1 - k * (1 - vf);
    };
    const velMulAmp = velMix(p.velAmp??100, p.velAmpInv);
    const velMulFlt = velMix(p.velFlt??100, p.velFltInv);
    // Decay scaling: at velEnv=100, low-vel notes shrink dec/rel down to 30%
    // of nominal (clamp so things don't reach zero). Invert → high-vel notes
    // become the short ones, low-vel notes become long.
    const decayK = Math.max(0,Math.min(100,p.velEnv??0))/100;
    const decayVF = (p.velEnvInv) ? velRaw : (1 - velRaw);
    const decayScale = 1 - decayK * decayVF * 0.7; // 0.7 = max 70% shorter
    const fltDev  = sp ? (((sp.flt??50)-50)/50) : 0; // -1..+1
    const cutOff   = fltDev * 0.3 * 40;               // 30% → ±12 semitone cutoff offset
    const envScale = 1 + fltDev * 0.7;                // 70% → scale filter env amount
    const stepDly  = sp ? sp.dly/100 : 0;
    const globalDly= (globalSend!=null) ? globalSend/100 : 0;
    // dly=0 means "use layer send"; any other value overrides it entirely
    const dlyMul   = (sp && sp.dly > 0) ? stepDly : globalDly;
    const stepOct  = sp ? (sp.oct-2) : 0;
    const layerOct = (p && p.octave!=null) ? p.octave : 0;
    const playFreq = freq * Math.pow(2, stepOct + layerOct);
    const durMod   = (sp && sp.dur!=null) ? sp.dur/100 : 0;
    // Apply decay velocity scaling to both decay (dec) and release (rel) so
    // the whole back half of the envelope shortens together — matches the
    // "low-vel notes feel shorter" mental model the user described.
    const atk=ms(p.attack),dec=ms(p.decay)*decayScale,sus=Math.max(0.001,p.sustain/100),rel=ms(p.decay)*decayScale;
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
    const envAmt=(p.filterEnvAmt/100)*velMulFlt*Math.max(0,envScale);
    const peakHz=envAmt>0.001?baseHz*Math.pow(20000/Math.max(20,baseHz),envAmt):baseHz;
    const susHz=Math.max(20,baseHz+(peakHz-baseHz)*sus);
    const freqAtGate = decayFraction>=1 ? susHz : Math.max(20, peakHz*Math.pow(Math.max(20,susHz)/Math.max(20,peakHz), decayFraction));
    if(envAmt>0.01){
      vcf.frequency.setValueAtTime(baseHz,t);
      vcf.frequency.linearRampToValueAtTime(peakHz,t+atk);
      if(dur>=atk+dec){
        vcf.frequency.exponentialRampToValueAtTime(Math.max(20,susHz),t+atk+dec);
        // Skip the sustain "lock" point if mid-note mods are scheduled —
        // a setValueAtTime here would cancel the upcoming setTargetAtTime
        // approach. Release ramp picks up from whatever value mods leave.
        if(!hasMods)vcf.frequency.setValueAtTime(Math.max(20,susHz),t+dur);
      } else {
        vcf.frequency.exponentialRampToValueAtTime(Math.max(20,freqAtGate),t+dur);
      }
      vcf.frequency.exponentialRampToValueAtTime(Math.max(20,baseHz),t+end);
    } else {
      vcf.frequency.value=baseHz;
    }
    // Mid-note FLT modulation — for tied notes, schedule cutoff approaches at
    // each sub-step time so the filter "animates" through the held note. Each
    // entry's flt produces a target sustain cutoff; setTargetAtTime smooths it.
    if(hasMods&&envAmt>0.01){
      for(const m of mods){
        if(m.at<=t+atk+dec||m.at>=t+dur)continue; // only inside the sustain window
        const mFltDev=m.sp?(((m.sp.flt??50)-50)/50):0;
        const mCutOff=mFltDev*0.3*40;
        const mEnvScale=1+mFltDev*0.7;
        const mRawCut=Math.max(0,Math.min(100,p.vcfCutoff+mCutOff));
        const mBaseHz=vcfHz(mRawCut);
        const mEnvAmt=(p.filterEnvAmt/100)*velMulFlt*Math.max(0,mEnvScale);
        const mPeakHz=mEnvAmt>0.001?mBaseHz*Math.pow(20000/Math.max(20,mBaseHz),mEnvAmt):mBaseHz;
        const mSusHz=Math.max(20,mBaseHz+(mPeakHz-mBaseHz)*sus);
        vcf.frequency.setTargetAtTime(mSusHz,m.at,0.015);
      }
    }

    const vca=this.ctx.createGain();
    // Per-layer mixer multiplier (0..100 from layerParams.mix); default 0.85
    // if missing for backward-compat with legacy saves.
    const mixMul=(p&&p.mix!=null)?(p.mix/100):0.85;
    // monoSingle short-circuits the dual-osc check below — peak gain follows the
    // single-osc curve (0.42 vs 0.28) so a culled MONO note doesn't sound thin.
    const peak=((p.detune>2&&!(p&&p.monoSingle))?0.28:0.42)*velMulAmp*mixMul;
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

    // Stereo spread of the detune stack — pan o1 left and o2 right, AND widen
    // the detune as spread increases so the L/R signals become more distinct.
    //
    // Two things had to be solved together to make this knob actually feel like
    // "spread" rather than "attenuate":
    //
    //   1. Loudness: at spread=0 both oscillators sum on each channel
    //      (~+3 dB incoherent sum). At full spread each channel only carries
    //      one oscillator — net -3 dB per channel. Fixed with a power-preserving
    //      compensation gain on the merger output.
    //
    //   2. Audible width: at the default 8-cent detune, hard-panning two near-
    //      identical signals doesn't produce a dramatic stereo image — both
    //      ears just hear "almost the same thing, slightly quieter." Fixed by
    //      scaling the detune amount with spread: 1× at spread=0, 2.5× at
    //      spread=1. The user dials a base detune; SPREAD then widens AND pans.
    //
    // Topology: o1 → gL, gR → merger (ch0+ch1) → comp → vcf. Same for o2.
    // monoSingle: skip the o2 detune stack and any spread/pan plumbing entirely
    // — MONO is a single oscillator regardless of saved detune. Tested below
    // wherever the dual-osc / spread path is gated.
    const isMonoSingle = !!(p && p.monoSingle);
    const spreadAmt=(!isMonoSingle&&p&&p.spread!=null&&p.detune>2)?Math.max(0,Math.min(100,p.spread))/100:0;
    let spreadMerger=null;
    if(spreadAmt>0){
      spreadMerger=this.ctx.createChannelMerger(2);
      const spreadComp=this.ctx.createGain();
      // Compensation gain — linear from 1.0 at s=0 to 2.0 at s=1 (+6 dB max).
      // Sized for the coherent case: at small detunes (default 8 cents) the
      // two oscillators ride mostly in-phase during the beat cycle, so the
      // unspread sum peaks at ~2× single. Splitting them to separate channels
      // costs that 6 dB unless we boost back. For highly-detuned (incoherent)
      // oscillators this slightly overshoots, which we prefer to undershoot.
      // Earlier attempt used sqrt(2/(1+(1-s)²)) which assumed incoherence and
      // only delivered +3 dB at full spread — user heard that as attenuation.
      spreadComp.gain.value=1+spreadAmt;
      spreadMerger.connect(spreadComp);
      spreadComp.connect(vcf);
    }
    // Linear pan, center-preserved: pan=-1 → L=1, R=0; pan=0 → L=R=1; pan=+1
    // → L=0, R=1. Saturating at 1 keeps the center full rather than collapsing
    // it like a constant-power law would.
    const panOsc=(osc,panVal)=>{
      if(!spreadMerger){osc.connect(vcf);return;}
      const gL=this.ctx.createGain();gL.gain.value=Math.min(1,1-panVal);
      const gR=this.ctx.createGain();gR.gain.value=Math.min(1,1+panVal);
      osc.connect(gL);gL.connect(spreadMerger,0,0);
      osc.connect(gR);gR.connect(spreadMerger,0,1);
    };
    const o1=this.ctx.createOscillator();
    o1.type=p.waveform;
    if(prevFreq&&glideTime>0){
      // prevFreq is the actual played frequency from previous step (oct already applied)
      o1.frequency.setValueAtTime(Math.max(1,prevFreq),t);
      o1.frequency.exponentialRampToValueAtTime(Math.max(1,playFreq),t+glideTime);
    } else {
      o1.frequency.value=playFreq;
    }
    panOsc(o1,-spreadAmt);
    o1.start(t);o1.stop(t+end+.05);
    let o2=null;
    if(p.detune>2&&!isMonoSingle){
      o2=this.ctx.createOscillator();
      o2.type=p.waveform;
      if(prevFreq&&glideTime>0){
        o2.frequency.setValueAtTime(Math.max(1,prevFreq),t);
        o2.frequency.exponentialRampToValueAtTime(Math.max(1,playFreq),t+glideTime);
      } else {
        o2.frequency.value=playFreq;
      }
      // No automatic detune widening — SPREAD is purely a pan operation on
      // the existing dual-osc stack. The user controls the detune cents on
      // its own knob; SPREAD just decides how L/R-distributed the stack is.
      o2.detune.value=p.detune;
      panOsc(o2,+spreadAmt);
      o2.start(t);o2.stop(t+end+.05);
    }
    // Sub-oscillator — 1 octave below playFreq, sine for clean low end. Used
    // primarily on MONO; POLY panel doesn't expose this knob but the field
    // is honored if present.
    //
    // Routes the sub directly to vca (post-filter) instead of vcf. The lead's
    // default cutoff is high so it usually doesn't matter, but if the user
    // closes the filter the sub would disappear with it — bypassing vcf lets
    // the sub keep punching through. It still goes through vca so the note
    // envelope still shapes it.
    //
    // Gain: linear 0..1 with the knob. Earlier cap of 0.55 was too low — at
    // 50% knob the sub was only ~13% of the main osc level after vca, so
    // users couldn't tell it was on.
    const subLvl=(p&&p.subLevel!=null)?Math.max(0,Math.min(100,p.subLevel))/100:0;
    let subOsc=null;
    if(subLvl>0){
      subOsc=this.ctx.createOscillator();
      subOsc.type="sine";
      if(prevFreq&&glideTime>0){
        subOsc.frequency.setValueAtTime(Math.max(1,prevFreq/2),t);
        subOsc.frequency.exponentialRampToValueAtTime(Math.max(1,playFreq/2),t+glideTime);
      } else {
        subOsc.frequency.value=playFreq/2;
      }
      const subG=this.ctx.createGain();
      subG.gain.value=subLvl; // 0..1 linear, no extra attenuation
      subOsc.connect(subG);subG.connect(vca);
      subOsc.start(t);subOsc.stop(t+end+.05);
    }
    // Register this voice as the active MONO voice so the next MONO trigger
    // can choke it. Done after osc creation so the oscs array is complete.
    if(p&&p.monoSingle){
      const oscs=[o1];
      if(o2)oscs.push(o2);
      if(subOsc)oscs.push(subOsc);
      this.monoActiveVoice={vca,oscs};
    }
    // Mid-note OCT/GLIDE pitch automation. For tied notes, each sub-step's
    // oct (relative to row) is scheduled on the oscillators while the single
    // envelope keeps holding — giving mono-legato behavior. GLIDE on a sub-
    // step makes the transition INTO the next sub-step a smooth slide;
    // otherwise it jumps. The initial step's glide flag governs the
    // transition INTO the first mod.
    if(hasMods){
      let prevModFreq=playFreq;
      let prevModGlide=!!(sp&&sp.glide);
      for(const m of mods){
        if(m.at<=t||m.at>=t+dur)continue;
        const mStepOct=m.sp?(m.sp.oct-2):0;
        const mPlayFreq=freq*Math.pow(2,mStepOct+layerOct);
        if(Math.abs(mPlayFreq-prevModFreq)>0.5){
          if(prevModGlide){
            o1.frequency.exponentialRampToValueAtTime(Math.max(1,mPlayFreq),m.at);
            if(o2)o2.frequency.exponentialRampToValueAtTime(Math.max(1,mPlayFreq),m.at);
            if(subOsc)subOsc.frequency.exponentialRampToValueAtTime(Math.max(1,mPlayFreq/2),m.at);
          } else {
            o1.frequency.setValueAtTime(Math.max(1,mPlayFreq),m.at);
            if(o2)o2.frequency.setValueAtTime(Math.max(1,mPlayFreq),m.at);
            if(subOsc)subOsc.frequency.setValueAtTime(Math.max(1,mPlayFreq/2),m.at);
          }
        }
        prevModFreq=mPlayFreq;
        prevModGlide=!!(m.sp&&m.sp.glide);
      }
    }
    vcf.connect(vca);
    // Dry → the layer's mute bus (→ master). MONO uses monoBus, everything else
    // (POLY) uses synthBus; falls back to master if buses aren't built yet.
    vca.connect((layer==="lead"?this.monoBus:this.synthBus)||this.master);
    // Reverb: per-note variable send. Layer's rvSend is the default; per-step
    // sp.rev > 0 overrides it (matching the dly-send convention).
    const stepRev = sp ? (sp.rev??0)/100 : 0;
    const layerRev = (p && p.rvSend!=null) ? p.rvSend/100 : 0;
    const revMul = (sp && (sp.rev??0) > 0) ? stepRev : layerRev;
    if(revMul>0){
      const revG=this.ctx.createGain();revG.gain.value=revMul;
      vca.connect(revG);revG.connect(this.rev);
    }
    // Delay send: additive (global + step), capped at 1 — computed in dlyMul
    if(dlyMul>0){
      const stepSend=this.ctx.createGain();stepSend.gain.value=dlyMul;
      vca.connect(stepSend);stepSend.connect(this.dly);
    }
  }
  setDlyTime(s){if(!this.ready)return;if(this.dly){this.dly.delayTime.cancelScheduledValues(this.ctx.currentTime);this.dly.delayTime.setValueAtTime(s,this.ctx.currentTime);}}
  // Audio-domain layer mute — ramp the POLY/MONO dry bus 0↔1 (click-free).
  setLayerGain(layer,v){if(!this.ready)return;const bus=layer==="lead"?this.monoBus:this.synthBus;if(bus)bus.gain.setTargetAtTime(Math.max(0,Math.min(1,v)),this.ctx.currentTime,0.012);}
  setDlyFb(v){if(!this.ready)return;if(this.dlyFb)this.dlyFb.gain.setTargetAtTime(v,this.ctx.currentTime,.02);}
  setDlyHp(v){if(!this.ready)return;if(this.dlyHp)this.dlyHp.frequency.setTargetAtTime(hpHz(v),this.ctx.currentTime,.02);}
  setDlyLp(v){if(!this.ready)return;if(this.dlyLp)this.dlyLp.frequency.setTargetAtTime(lpHz(v),this.ctx.currentTime,.02);}
  setDelaySend(pct){if(!this.ready)return;if(this.dlySend)this.dlySend.gain.setTargetAtTime(pct/100,this.ctx.currentTime,.02);}
  async resume(){if(this.ctx&&this.ctx.state==="suspended")await this.ctx.resume();}
}


// ─── Drum Engine (808-style synthesis) ───────────────────────────────────────
class DrumEngine{
  constructor(){
    this.ctx=null;this.master=null;this.masterIn=null;this.ready=false;
    // Bell FX inputs (set in init) — per-voice rvSend/dlySend tap into these.
    this.revNode=null;this.dlyNode=null;
    // Active open-hat gain ref for CH choke. Cleared when CH cuts it or the
    // sample ends naturally. Holds {g, endT}.
    this.activeOH=null;
    // Persistent per-voice mixer strips. Each entry: {lvlGain, panner,
    // revSend, dlySend}. Built in init and reused for every hit so that
    // live slider drags update the AudioParams of in-flight audio instead
    // of being captured per-hit at scheduling time. Without this the
    // 100 ms scheduler lookahead would freeze the slider value of each
    // queued hit and the user would hear their drag as a sequence of
    // discrete pans across the next few hits.
    this.voiceStrips={};
  }
  async init(masterNode, revNode, dlyNode){
    if(this.ready)return;
    const AudioContext=window.AudioContext||window.webkitAudioContext;
    this.ctx=masterNode.context||new AudioContext();
    // Internal master-input gain — voices connect here, then through to the
    // shared Bell master. Lets the mixer scale the entire drum bus.
    this.masterIn=this.ctx.createGain();this.masterIn.gain.value=0.85;
    // Mute bus — distinct from the level gain above so audio-domain mute/solo
    // cuts the whole drum layer instantly without touching the DRUMS level fader.
    this.muteGain=this.ctx.createGain();
    this.masterIn.connect(this.muteGain);this.muteGain.connect(masterNode);
    this.master=this.masterIn;
    this.revNode=revNode||null;
    this.dlyNode=dlyNode||null;
    // Build a persistent strip per voice. Voice keys are read off DRUM_VOICES
    // which is in module scope. lvlGain starts at the mixer default (0.6) so
    // hits sound right even before any setVoiceMix call comes in.
    for(const v of DRUM_VOICES){
      const lvlGain=this.ctx.createGain();lvlGain.gain.value=DRUM_DEFAULT_LEVEL/100;
      const panner=this.ctx.createStereoPanner?this.ctx.createStereoPanner():null;
      const revSend=this.ctx.createGain();revSend.gain.value=0;
      const dlySend=this.ctx.createGain();dlySend.gain.value=0;
      // Per-voice multimode filter. Default is lowpass at 20kHz which is
      // effectively bypass; setVoiceMix updates type + cutoff based on the
      // mix's filt/filtCut. Sits between voice output and lvlGain so the
      // filter responds to drag-updates without clicking on hits.
      const filter=this.ctx.createBiquadFilter();
      filter.type="lowpass";
      filter.frequency.value=20000;
      filter.Q.value=0.7;
      // Per-voice saturation waveshaper between filter and level. Identity
      // curve at sat=0 (clean bypass); setVoiceMix swaps the curve on change.
      const shaper=this.ctx.createWaveShaper();
      shaper.curve=makeSatCurve(0);
      shaper.oversample="2x";
      filter.connect(shaper);
      shaper.connect(lvlGain);
      if(panner){
        panner.pan.value=0;
        lvlGain.connect(panner);
        panner.connect(this.masterIn);
      } else {
        lvlGain.connect(this.masterIn);
      }
      // Sends tap post-pan when there's a panner so the wet signal inherits
      // the same stereo placement as the dry.
      const sendTap=panner||lvlGain;
      if(this.revNode){sendTap.connect(revSend);revSend.connect(this.revNode);}
      if(this.dlyNode){sendTap.connect(dlySend);dlySend.connect(this.dlyNode);}
      // pitch is in semitones; cached on the strip so play() can read it
      // without traversing React state. Filter type is stored separately so
      // setVoiceMix only re-assigns when it actually changes.
      this.voiceStrips[v.key]={lvlGain,panner,revSend,dlySend,filter,shaper,pitch:0,filtMode:"off",env:100,sat:0};
    }
    this.ready=true;
  }
  // Update the persistent strip for a voice. Uses setTargetAtTime with a tight
  // time constant so live drags fold smoothly into audio without clicks, and
  // pat-switches in song mode crossfade rather than snap.
  // `when` (optional) = the audio time the values should land. Live drags /
  // pat-switches omit it (apply now, smoothed). The per-step motion path passes
  // the note's onset time so each scheduled note locks its OWN param values at
  // its own time — otherwise several look-ahead-scheduled steps all write to the
  // shared AudioParam at currentTime and only the last sticks (notes then play
  // the wrong step's value: "see new, hear old").
  setVoiceMix(voice,mix,when){
    if(!this.ready)return;
    const strip=this.voiceStrips[voice];if(!strip)return;
    const t=this.ctx.currentTime;
    const TAU=0.008;
    // setParam: at `when` lock the value exactly (setValueAtTime a hair early so
    // it's settled by the onset); otherwise smooth from now.
    const at=when!=null?Math.max(t,when-0.004):null;
    const setP=(p,v)=>{ if(at!=null){try{p.setValueAtTime(v,at);}catch(e){p.value=v;}} else p.setTargetAtTime(v,t,TAU); };
    if(mix.level!=null)setP(strip.lvlGain.gain,Math.max(0,Math.min(2,mix.level/100)));
    if(mix.pan!=null&&strip.panner)setP(strip.panner.pan,Math.max(-1,Math.min(1,mix.pan/100)));
    if(mix.rvSend!=null)setP(strip.revSend.gain,Math.max(0,Math.min(1,mix.rvSend/100)));
    if(mix.dlySend!=null)setP(strip.dlySend.gain,Math.max(0,Math.min(1,mix.dlySend/100)));
    if(mix.pitch!=null)strip.pitch=Math.max(-12,Math.min(12,mix.pitch));
    if(mix.env!=null)strip.env=Math.max(0,Math.min(100,mix.env));
    // Saturation — regenerate the shaper curve only when the amount changes.
    // A curve swap is click-free here because the curves agree near the origin
    // and drum hits are short transients.
    if(mix.sat!=null&&strip.shaper){
      const s2=Math.max(0,Math.min(100,mix.sat));
      if(s2!==strip.sat){strip.sat=s2;strip.shaper.curve=makeSatCurve(s2/100);}
    }
    // Filter — store mode on the strip and switch the biquad type only when
    // the mode actually changes. Cut is smoothed; mode change is immediate
    // but inaudible since the new type's frequency response starts fresh.
    if(mix.filt!=null&&mix.filt!==strip.filtMode){
      strip.filtMode=mix.filt;
      if(mix.filt==="off"){strip.filter.type="lowpass";}
      else if(mix.filt==="lp"){strip.filter.type="lowpass";}
      else if(mix.filt==="hp"){strip.filter.type="highpass";}
      else if(mix.filt==="bp"){strip.filter.type="bandpass";}
    }
    if(mix.filt!=null||mix.filtCut!=null){
      const cut=mix.filtCut!=null?mix.filtCut:100;
      // "off" pins the cutoff at the top so the biquad is effectively bypass.
      const targetHz=(strip.filtMode==="off")?20000:filtCutHz(cut);
      setP(strip.filter.frequency,targetHz);
    }
  }
  setMasterLevel(pct){
    if(this.ready&&this.masterIn)this.masterIn.gain.setTargetAtTime(Math.max(0,Math.min(150,pct))/100,this.ctx.currentTime,0.02);
  }
  // Audio-domain mute for the whole drum layer — ramp the mute bus 0↔1.
  setMute(v){if(this.ready&&this.muteGain)this.muteGain.gain.setTargetAtTime(Math.max(0,Math.min(1,v)),this.ctx.currentTime,0.012);}
  // Fast-fade whatever open-hat is currently sustaining. Used when CH fires so
  // a closed hat properly cuts the open hat (classic choke-group behavior).
  // 8ms time constant keeps the kill audible-but-not-clicky.
  chokeOH(t){
    if(!this.activeOH||!this.activeOH.g)return;
    const g=this.activeOH.g;const at=Math.max(t,this.ctx.currentTime);
    try{g.gain.cancelScheduledValues(at);g.gain.setTargetAtTime(0.0001,at,0.008);}catch(e){}
    this.activeOH=null;
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

  play(voice,t,vel,mix={},sample=null,patId=null){
    if(!this.ready)return;
    const ctx=this.ctx;
    const v=Math.max(0.001,vel/127);
    // Hi-hat choke group: a closed hat OR a new open hat cuts any currently-
    // sounding open hat — so only ONE open hat ever rings (a real hi-hat is one
    // object). Single-slot activeOH then can't miss an overlapping earlier OH,
    // which was the cause of the choke firing only intermittently with long
    // open-hat samples (e.g. the VP kit).
    if(voice==="CH"||voice==="OH")this.chokeOH(t);
    // The drum mix is GLOBAL/static now — the React effect pushes it to the
    // strips whenever it changes, and MOTION automation (when on) is scheduled
    // per-step in playDrumStep. So play() no longer applies any base mix here;
    // the strip is already configured. (mix/patId args kept for compatibility.)
    const strip=this.voiceStrips[voice];if(!strip)return;
    // out feeds the strip's filter (and then lvlGain → panner → master).
    const out=strip.filter;
    // Pitch ratio applied to every osc frequency in the synth voice paths
    // below. Samples use playbackRate. Read per-hit from the passed mix when
    // present (so MOTION pitch automation is correct per step — the shared
    // strip.pitch would be stomped by look-ahead steps); else the strip value.
    const pitchSemi=(mix&&mix.pitch!=null)?mix.pitch:(strip.pitch||0);
    const pr=Math.pow(2,pitchSemi/12);
    // Resolve the sample: a plain AudioBuffer (single one-shot / user
    // recording), {rr:[buffers]} (round-robin — random pick, avoiding an
    // immediate repeat), or {vel:[buffers]} (velocity layers, soft→hard —
    // pick by this hit's velocity).
    let buf=sample;
    if(sample&&!(sample.numberOfChannels!=null)){
      if(sample.rr&&sample.rr.length){
        const a=sample.rr;let i=Math.floor(Math.random()*a.length);
        if(a.length>1&&this._lastRR&&this._lastRR[voice]===i)i=(i+1)%a.length;
        if(!this._lastRR)this._lastRR={};this._lastRR[voice]=i;
        buf=a[i];
      } else if(sample.vel&&sample.vel.length){
        const n=sample.vel.length;
        const idx=Math.max(0,Math.min(n-1,Math.floor((vel/128)*n)));
        buf=sample.vel[idx];
      } else buf=null;
    }
    // User-recorded sample / kit sample takes precedence over the synth voice.
    if(buf){
      const src=ctx.createBufferSource();src.buffer=buf;
      const g=ctx.createGain();g.gain.value=v;
      src.playbackRate.value=pr; // pitch ratio applies to samples
      src.connect(g);g.connect(out);
      // Sample envelope — strip.env (0..100) controls how much of the sample
      // plays. 100 = whole sample (no gate). Below that, gate the sample to a
      // shorter length with a brief release fade so it doesn't click; at 0 it's
      // a ~12ms transient. Squared curve gives finer control at the short end.
      const env01=((mix&&mix.env!=null)?mix.env:(strip.env!=null?strip.env:100))/100;
      const sampleDur=(buf.duration||0.5)/pr; // pitch stretches duration
      let endAt=t+sampleDur;
      if(env01<0.999){
        const MIN_GATE=0.012;
        const gateDur=Math.max(MIN_GATE,MIN_GATE+(sampleDur-MIN_GATE)*env01*env01);
        const rel=Math.min(0.05,Math.max(0.004,gateDur*0.35));
        const relStart=Math.max(t+0.0005,t+gateDur-rel);
        try{
          g.gain.setValueAtTime(v,t);
          g.gain.setValueAtTime(v,relStart);
          g.gain.linearRampToValueAtTime(0.0001,t+gateDur);
        }catch(e){}
        endAt=t+gateDur+0.01;
      }
      try{src.start(t);}catch(e){src.start();}
      try{src.stop(endAt);}catch(e){}
      // Track sample-based OH for choke too — gate-aware end time.
      if(voice==="OH")this.activeOH={g,endT:endAt};
      return;
    }

    if(voice==="BD"){
      // Tonal body: deep sine sweep — pr scales all osc freqs (filters too,
      // so the timbre tracks the pitch rather than the filter clipping the
      // pitched sweep).
      const osc=ctx.createOscillator();
      const ws=this._shaper(ctx,3);
      const g=ctx.createGain();
      const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=200*pr;lp.Q.value=0.7;
      osc.frequency.setValueAtTime(220*pr,t);
      osc.frequency.exponentialRampToValueAtTime(28*pr,t+0.25);
      this._env(g.gain,t,1.1*v,0.002,0.18,0.001,0.45);
      osc.connect(ws);ws.connect(lp);lp.connect(g);g.connect(out);
      osc.start(t);osc.stop(t+0.7);
      // Punch transient: short high sine burst
      const punch=ctx.createOscillator();const pg=ctx.createGain();
      punch.frequency.setValueAtTime(400*pr,t);punch.frequency.exponentialRampToValueAtTime(60*pr,t+0.012);
      this._env(pg.gain,t,0.7*v,0.001,0.01,0.001,0.005);
      punch.connect(pg);pg.connect(out);punch.start(t);punch.stop(t+0.02);
      // Sub thump noise click
      const nc=this._noise(ctx,0.015);const ncg=ctx.createGain();
      const nclp=ctx.createBiquadFilter();nclp.type="lowpass";nclp.frequency.value=300*pr;
      this._env(ncg.gain,t,0.5*v,0.001,0.005,0.001,0.008);
      nc.connect(nclp);nclp.connect(ncg);ncg.connect(out);nc.start(t);
    }

    else if(voice==="SD"){
      // Tonal body
      const osc=ctx.createOscillator();const og=ctx.createGain();
      osc.frequency.setValueAtTime(240*pr,t);osc.frequency.exponentialRampToValueAtTime(160*pr,t+0.025);
      this._env(og.gain,t,0.55*v,0.001,0.025,0.001,0.06);
      osc.connect(og);og.connect(out);osc.start(t);osc.stop(t+0.15);
      // Crack transient
      const crack=this._noise(ctx,0.01);const cg=ctx.createGain();
      const cbp=ctx.createBiquadFilter();cbp.type="bandpass";cbp.frequency.value=5000*pr;cbp.Q.value=0.3;
      this._env(cg.gain,t,0.9*v,0.0005,0.006,0.001,0.004);
      crack.connect(cbp);cbp.connect(cg);cg.connect(out);crack.start(t);
      // Body noise (the "snare wires" rattle)
      const snare=this._noise(ctx,0.35);const sg=ctx.createGain();
      const sbp=ctx.createBiquadFilter();sbp.type="bandpass";sbp.frequency.value=2500*pr;sbp.Q.value=0.6;
      const shp=ctx.createBiquadFilter();shp.type="highpass";shp.frequency.value=800*pr;
      this._env(sg.gain,t,0.65*v,0.002,0.05,0.05,0.18);
      snare.connect(shp);shp.connect(sbp);sbp.connect(sg);sg.connect(out);snare.start(t);
    }

    else if(voice==="LT"||voice==="MT"||voice==="HT"){
      // Three toms — base pitch + decay scale lo→hi. MT sits between LT and HT.
      const base = voice==="LT"?72 : voice==="MT"?98 : 130;
      const dec  = voice==="LT"?0.12 : voice==="MT"?0.10 : 0.08;
      const stp  = voice==="LT"?0.5 : voice==="MT"?0.42 : 0.35;
      const rel  = voice==="LT"?0.22 : voice==="MT"?0.18 : 0.14;
      const freq=base*pr;
      const osc=ctx.createOscillator();const g=ctx.createGain();
      const lp=ctx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=freq*4;lp.Q.value=1;
      osc.frequency.setValueAtTime(freq*2.8,t);
      osc.frequency.exponentialRampToValueAtTime(freq,t+dec);
      this._env(g.gain,t,0.8*v,0.001,dec,0.001,rel);
      osc.connect(lp);lp.connect(g);g.connect(out);
      osc.start(t);osc.stop(t+stp);
      // Tom crack
      const tc=this._noise(ctx,0.012);const tcg=ctx.createGain();
      const tcbp=ctx.createBiquadFilter();tcbp.type="bandpass";tcbp.frequency.value=freq*6;tcbp.Q.value=1;
      this._env(tcg.gain,t,0.4*v,0.001,0.008,0.001,0.006);
      tc.connect(tcbp);tcbp.connect(tcg);tcg.connect(out);tc.start(t);
    }

    else if(voice==="CH"){
      // Metallic: noise through two tight bandpass filters at inharmonic ratios
      const n=this._noise(ctx,0.12);
      const bp1=ctx.createBiquadFilter();bp1.type="bandpass";bp1.frequency.value=8400*pr;bp1.Q.value=1.5;
      const bp2=ctx.createBiquadFilter();bp2.type="bandpass";bp2.frequency.value=11200*pr;bp2.Q.value=2;
      const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=7000*pr;
      const g=ctx.createGain();
      this._env(g.gain,t,0.55*v,0.001,0.018,0.001,0.022);
      n.connect(bp1);bp1.connect(bp2);bp2.connect(hp);hp.connect(g);g.connect(out);n.start(t);
    }

    else if(voice==="OH"){
      const n=this._noise(ctx,0.9);
      const bp1=ctx.createBiquadFilter();bp1.type="bandpass";bp1.frequency.value=8400*pr;bp1.Q.value=1.2;
      const bp2=ctx.createBiquadFilter();bp2.type="bandpass";bp2.frequency.value=11200*pr;bp2.Q.value=1.5;
      const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=6500*pr;
      const g=ctx.createGain();
      this._env(g.gain,t,0.5*v,0.001,0.06,0.12,0.55);
      n.connect(bp1);bp1.connect(bp2);bp2.connect(hp);hp.connect(g);g.connect(out);n.start(t);
      // Track for CH choke. End time ≈ atk+dec+rel from _env params.
      this.activeOH={g,endT:t+0.001+0.06+0.12+0.55};
    }

    else if(voice==="CY"){
      const n=this._noise(ctx,1.8);
      const bp1=ctx.createBiquadFilter();bp1.type="bandpass";bp1.frequency.value=7800*pr;bp1.Q.value=0.5;
      const bp2=ctx.createBiquadFilter();bp2.type="bandpass";bp2.frequency.value=12000*pr;bp2.Q.value=0.8;
      const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=5500*pr;
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
        const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=(1800-i*120)*pr;bp.Q.value=1.8;
        const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=900*pr;
        const g=ctx.createGain();
        const pk=i===0?0.75*v:i===3?0.9*v:0.55*v;
        this._env(g.gain,t+dl,pk,0.001,0.012+i*0.005,0.001,0.04+i*0.02);
        n.connect(bp);bp.connect(hp);hp.connect(g);g.connect(out);n.start(t+dl);
      });
    }

    else if(voice==="CL"){
      // 808 clave: sharp wooden click — short bandpass noise burst + high sine ping
      const n=this._noise(ctx,0.05);
      const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=2800*pr;bp.Q.value=3;
      const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=1800*pr;
      const g=ctx.createGain();
      this._env(g.gain,t,0.8*v,0.001,0.018,0.001,0.012);
      n.connect(bp);bp.connect(hp);hp.connect(g);g.connect(out);n.start(t);
      // Second click layer — slightly later for wood-on-wood character
      const n2=this._noise(ctx,0.02);
      const bp2=ctx.createBiquadFilter();bp2.type="bandpass";bp2.frequency.value=3800*pr;bp2.Q.value=4;
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
        osc.frequency.value=f*pr;
        const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=700*pr;bp.Q.value=0.6;
        const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=300*pr;
        const g=ctx.createGain();
        // Short attack, medium-long metallic decay
        this._env(g.gain,t,0.38*v*(i===0?1:0.8),0.001,0.06,0.08,0.42);
        osc.connect(bp);bp.connect(hp);hp.connect(g);g.connect(out);
        osc.start(t);osc.stop(t+0.65);
      });
      // Initial ping transient
      const ping=ctx.createOscillator();ping.type="square";ping.frequency.value=700*pr;
      const pg=ctx.createGain();
      this._env(pg.gain,t,0.6*v,0.001,0.004,0.001,0.003);
      ping.connect(pg);pg.connect(out);ping.start(t);ping.stop(t+0.01);
    }

    else if(voice==="RM"){
      // Rimshot — sharp, short. A high triangle ping + tight bandpassed noise
      // click for the "wood + shell" snap.
      const osc=ctx.createOscillator();osc.type="triangle";
      osc.frequency.setValueAtTime(1700*pr,t);
      osc.frequency.exponentialRampToValueAtTime(400*pr,t+0.01);
      const og=ctx.createGain();
      this._env(og.gain,t,0.7*v,0.0005,0.012,0.001,0.01);
      osc.connect(og);og.connect(out);osc.start(t);osc.stop(t+0.04);
      const n=this._noise(ctx,0.02);
      const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=2600*pr;bp.Q.value=2.5;
      const ng=ctx.createGain();
      this._env(ng.gain,t,0.6*v,0.0005,0.008,0.001,0.006);
      n.connect(bp);bp.connect(ng);ng.connect(out);n.start(t);
    }

    else if(voice==="SH"){
      // Shaker — short burst of high-passed noise with a soft attack so it
      // sounds like beads rather than a click.
      const n=this._noise(ctx,0.14);
      const hp=ctx.createBiquadFilter();hp.type="highpass";hp.frequency.value=5000;
      const bp=ctx.createBiquadFilter();bp.type="bandpass";bp.frequency.value=9000;bp.Q.value=0.6;
      const g=ctx.createGain();
      this._env(g.gain,t,0.4*v,0.005,0.04,0.001,0.05);
      n.connect(hp);hp.connect(bp);bp.connect(g);g.connect(out);n.start(t);
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
  const [activeLayer, setActiveLayer] = useState("synth"); // "synth" (POLY) | "lead" (MONO) | "drums"
  // Drums have no per-step page — never leave the drums layer parked on STEP
  // (its tab is hidden); fall back to the grid editor.
  useEffect(()=>{if(activeLayer==="drums"&&page==="step")setPage("edit");},[activeLayer,page]);
  const [bpm,       setBpm]       = useState(120);

  // Drum step editing state
  const drumStepR=useRef(-1);
  const [drumStep,setDrumStep]=useState(-1);
  useEffect(()=>{drumStepR.current=drumStep;},[drumStep]);
  // (Drum-mixer hit flashes are now fired from playDrumStep at each hit's actual
  // audio-onset time — see `flashes` there — so they match what you hear instead
  // of leading by the look-ahead. This effect just clears them on stop.)
  // Clear all channel flashes when playback stops so none linger lit.
  useEffect(()=>{if(!playing)setDrumFlash({});},[playing]);

  // ── Motion mixer (drum mix automation) ───────────────────────────────────
  // motionEnabled: performance mode — the drum mixer is driven by the
  //   sequence (base mix + any recorded per-step automation). Dragging a
  //   slider live-overrides the audio without persisting.
  // motionRec: while on (and playing), holding a slider WRITES its value onto
  //   the step(s) that play during the hold — per-step automation.
  const [motionEnabled,setMotionEnabled]=useState(false);
  const [motionRec,setMotionRec]=useState(false);
  const motionEnabledR=useRef(false); useEffect(()=>{motionEnabledR.current=motionEnabled;},[motionEnabled]);
  const motionRecR=useRef(false); useEffect(()=>{motionRecR.current=motionRec;},[motionRec]);
  // Transient performance overrides during an active slider drag (motion mode).
  // Shape {[row]:{[param]:val}}. Drives the slider position + live audio; not
  // persisted. Cleared on release.
  const [perfMix,setPerfMix]=useState({});
  // The currently-held record drag: {row,param,val} or null. The drumStep
  // effect below writes it onto each step as playback advances.
  const recDragR=useRef(null);
  // Per-voice hit flash for the drum mixer: {[row]:{vel,n}}. n is a nonce that
  // bumps each hit so the flash overlay remounts and replays its fade. Driven
  // off the drum playhead (drumStep) so a channel pulses when its voice sounds.
  const [drumFlash,setDrumFlash]=useState({});
  // ── Global drum mixer ─────────────────────────────────────────────────────
  // A SINGLE static mix shared by every drum pattern. The mixer is NOT
  // per-pattern — switching patterns never changes it (it's a console, not a
  // pattern property). Per-pattern MOTION automation (pat.motion) only overlays
  // this base while MOTION mode is on; with MOTION off the mix is fully static.
  const [drumMix,setDrumMixArr]=useState(defaultDrumMix());
  // Mixer group linking — defeatable per group. Both default ON.
  const [linkHat,setLinkHat]=useState(true);  // CH+OH move together
  const [linkTom,setLinkTom]=useState(true);  // LT+MT+HT move together (all but pan)
  // Mobile drum-mixer horizontal scroll — a dedicated drag-scrollbar, since the
  // strips' own sliders capture touch and block native swipe-scroll.
  const mixScrollRef=useRef(null);
  const [mixScrollPct,setMixScrollPct]=useState(0);
  const mixScrollSync=()=>{const c=mixScrollRef.current;if(!c)return;const mx=c.scrollWidth-c.clientWidth;setMixScrollPct(mx>0?c.scrollLeft/mx:0);};
  const mixScrollTo=(clientX,track)=>{const c=mixScrollRef.current;if(!c)return;const r=track.getBoundingClientRect();const pct=Math.max(0,Math.min(1,(clientX-r.left)/r.width));c.scrollLeft=pct*(c.scrollWidth-c.clientWidth);};
  const drumMixR=useRef(drumMix); useEffect(()=>{drumMixR.current=drumMix;},[drumMix]);

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
  const [playId,    setPlayId]    = useState(null);
  // Playing pattern id of whichever layer is ACTIVE (synth/lead/drums) — drives
  // FOLLOW for every layer (playId above stays synth-only for pill highlights).
  const [actPlayId, setActPlayId] = useState(null);
  const actPlayIdR = useRef(null);
  const [loopMode,  setLoopMode]  = useState(false);
  const [followSeq, setFollowSeq] = useState(false);
  const [transpose, setTranspose] = useState(0);
  const [clipboard, setClipboard] = useState(null);
  const [slotData,  setSlotData]  = useState({S1:null,S2:null,S3:null,S4:null});
  // Most recently loaded/saved slot — shown highlighted so the user can see
  // which slot's project is currently in memory and avoid overwriting the
  // wrong one. Resets to null on page reload (not persisted).
  const [activeSlot, setActiveSlot] = useState(null);
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
  // VARY is per-layer now — each layer toggles independently. Normalizer
  // upgrades legacy boolean saves (apply to all layers) to the object shape.
  const [varyMode,  setVaryMode]  = useState({synth:false,lead:false,drums:false});
  const [recMode,   setRecMode]   = useState(false);
  // Internal sampler — per-drum-voice user-recorded AudioBuffer. Stored in
  // state so the UI can show "loaded" indicators; mirrored to voiceSamplesR
  // for the scheduler to read without stale-closure issues. Session-only —
  // not persisted to save slots (would bloat them with binary audio data).
  const [voiceSamples, setVoiceSamples] = useState({});
  const voiceSamplesR = useRef({});
  // The USER kit's recorded buffers, kept SEPARATE from voiceSamples so they
  // survive switching to a bundled kit and back (voiceSamples gets overwritten
  // by the bundled buffers; userSamples does not). Restored into voiceSamples
  // whenever the USER kit is selected. Persisted with the project (#user-samples).
  const [userSamples, setUserSamples] = useState({});
  const userSamplesR = useRef({});
  useEffect(()=>{userSamplesR.current=userSamples;},[userSamples]);
  const [recordingVoice, setRecordingVoice] = useState(null);
  // Active kit id ("synth" = no samples, use synthesizer; any other id loads
  // from DRUM_KITS. "user" is the implicit id for individual mic recordings
  // that don't come from a kit — loading a kit replaces them all.
  const [activeKit, setActiveKit] = useState(DEFAULT_KIT);
  const [kitLoading, setKitLoading] = useState(false);
  const [exporting, setExporting] = useState(false); // MP3 bounce in progress
  const [exportPhase, setExportPhase] = useState(""); // "Preparing"/"Bouncing"/"Encoding" — shown in the lock overlay
  const [exportProgress, setExportProgress] = useState(0); // 0..1 realtime-capture progress
  const [exportLoops, setExportLoops] = useState(1); // # of song passes per MP3 bounce
  // A bounced MP3 File waiting to be shared via the native share sheet (mobile).
  // navigator.share needs a fresh user gesture, and the bounce is async, so we
  // stash the file and surface a SHARE button for the user to tap.
  const [shareFile, setShareFile] = useState(null);
  // One-time "Add to Home Screen for fullscreen" nudge — iOS, in-browser only
  // (hidden once launched as a standalone home-screen app, or once dismissed).
  const [installHint, setInstallHint] = useState(()=>{
    try{
      if(!IS_MOBILE)return false;
      const iOS=/iphone|ipad|ipod/i.test(navigator.userAgent||"");
      const standalone=(navigator.standalone===true)||(window.matchMedia&&window.matchMedia('(display-mode: standalone)').matches);
      return iOS&&!standalone&&!localStorage.getItem("tabula-nohint");
    }catch(e){return false;}
  });
  // Mobile orientation — drives the landscape rail layout. Recomputed on
  // resize / orientationchange. Desktop is always treated as "portrait" (the
  // landscape branch is mobile-only).
  const [isLandscape, setIsLandscape] = useState(()=>{
    try{ return IS_MOBILE && window.innerWidth > window.innerHeight; }catch(e){ return false; }
  });
  useEffect(()=>{
    if(!IS_MOBILE) return;
    const onR=()=>{ try{ setIsLandscape(window.innerWidth>window.innerHeight); }catch(e){} };
    window.addEventListener("resize",onR);
    window.addEventListener("orientationchange",onR);
    return ()=>{ window.removeEventListener("resize",onR); window.removeEventListener("orientationchange",onR); };
  },[]);
  const recorderRef = useRef(null);
  const recordStreamRef = useRef(null);
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
  const activePtrsR  = useRef(new Set()); // active pointer IDs on grid — stateless multi-touch via isPrimary, this set just tracks "all up". Self-heals (cleared on every primary-down) so a missed up/cancel can't permanently lock editing.
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

  // Per-layer synth design params. One slot per synth-type layer.
  // Drums has its own engine + per-voice mix (in pat.mix), independent of this.
  const DEFAULT_LP = (octave)=>({
    waveform:"sawtooth", detune:8, attack:8, decay:400, sustain:40,
    vcfCutoff:80, vcfRes:15, filterEnvAmt:0,
    octave: octave,    // -2..+2; lead defaults +1, bass -1, synth 0
    dlySend: 50,       // 0..100; per-layer send into the global delay bus
    rvSend: 30,        // 0..100; per-layer send into the global reverb bus
    mix: 85,           // 0..100; mixer level multiplier on this layer's voices
    subLevel: 0,       // 0..100; MONO-only sub-oscillator (1 octave down)
    spread: 50,        // 0..100; POLY-only stereo spread of detune stack
    // Per-section velocity tracking. 0 = velocity has no effect on that
    // section; 100 = full sensitivity (low-vel notes fully attenuated /
    // shortened / un-filtered, depending on which section). Each section
    // has its own invert flag so users can flip the polarity.
    velAmp: 100,   velAmpInv: false,   // VCA peak responds to velocity (matches old behaviour)
    velFlt: 100,   velFltInv: false,   // Filter env amount responds to velocity (matches old behaviour)
    velEnv: 0,     velEnvInv: false,   // Decay time responds to velocity (NEW — off by default)
  });
  // Default for the MONO layer — single-oscillator engine. monoSingle: true
  // tells Bell.play to skip the o2 stack even if a saved project had detune
  // on this layer. Keeps MONO sounding lean and pure.
  // glide: 0..100; per-layer portamento amount. At 0, glide only happens
  // when a step's glide flag is on (the step-level behaviour). At >0, every
  // mono note glides into the next over a knob-scaled time.
  const DEFAULT_LP_MONO = (octave)=>({
    ...DEFAULT_LP(octave),
    detune:0,
    subLevel:50,   // MONO sub-oscillator on by default (1 octave down)
    monoSingle:true,
    glide:0,
  });
  // Backfill missing fields when loading legacy layerParams. Returns a new
  // layerParams object with all fields populated. Three-layer pare-down:
  // legacy "bass" slot is dropped from the output (bass params discarded;
  // bass pats are merged into lead pats by the load paths separately).
  // Lead always gets monoSingle:true forced — older saves predate the rule.
  const fillLayerParams=(lp)=>({
    synth:{...DEFAULT_LP(0), ...(lp&&lp.synth?lp.synth:{})},
    lead: {...DEFAULT_LP_MONO(0), ...(lp&&lp.lead ?lp.lead :{}), monoSingle:true}
  });
  const [layerParams, setLayerParams] = useState({
    synth: DEFAULT_LP(0),
    lead:  DEFAULT_LP_MONO(0)   // mono layer; user adjusts octave to taste
  });

  // Active-layer accessor. For the drums layer we fall back to synth — the sound drawer's
  // drum branch never reads these so the fallback is harmless and keeps render code simple.
  const _lpKey = activeLayer==="drums" ? "synth" : activeLayer;
  const _lp = layerParams[_lpKey];
  const _setLP = (key)=>(val)=>setLayerParams(lps=>({...lps,[_lpKey]:{...lps[_lpKey],[key]:val}}));

  // Existing UI references {waveform, setWaveform, ...} continue to work; they now
  // read/write the active layer's slot in layerParams.
  const waveform = _lp.waveform,         setWaveform = _setLP("waveform");
  const detune = _lp.detune,             setDetune = _setLP("detune");
  const attack = _lp.attack,             setAttack = _setLP("attack");
  const decay = _lp.decay,               setDecay = _setLP("decay");
  const sustain = _lp.sustain,           setSustain = _setLP("sustain");
  const vcfCutoff = _lp.vcfCutoff,       setVcfCutoff = _setLP("vcfCutoff");
  const vcfRes = _lp.vcfRes,             setVcfRes = _setLP("vcfRes");
  const filterEnvAmt = _lp.filterEnvAmt, setFilterEnvAmt = _setLP("filterEnvAmt");
  const octaveLP = _lp.octave,           setOctaveLP = _setLP("octave");
  const dlySend = _lp.dlySend,           setDlySend = _setLP("dlySend");
  const rvSend  = _lp.rvSend??0,         setRvSend  = _setLP("rvSend");
  const mixLvl  = _lp.mix??85,           setMixLvl  = _setLP("mix");
  const subLvl  = _lp.subLevel??0,       setSubLvl  = _setLP("subLevel");
  const spread  = _lp.spread??0,         setSpread  = _setLP("spread");
  const velAmp     = _lp.velAmp??100,    setVelAmp    = _setLP("velAmp");
  const velAmpInv  = !!_lp.velAmpInv,    setVelAmpInv = _setLP("velAmpInv");
  const velFlt     = _lp.velFlt??100,    setVelFlt    = _setLP("velFlt");
  const velFltInv  = !!_lp.velFltInv,    setVelFltInv = _setLP("velFltInv");
  const velEnv     = _lp.velEnv??0,      setVelEnv    = _setLP("velEnv");
  const velEnvInv  = !!_lp.velEnvInv,    setVelEnvInv = _setLP("velEnvInv");
  const glideLP    = _lp.glide??0,       setGlideLP   = _setLP("glide");

  // Delay graph design — global, shared across layers. (User: "global delay design".)
  const [dlyIdx,    setDlyIdx]    = useState(3);
  const [dlyFbPct,  setDlyFbPct]  = useState(45);
  const [dlyHpVal,  setDlyHpVal]  = useState(8);
  const [dlyLpVal,  setDlyLpVal]  = useState(78);
  // Global reverb knobs — per-layer rvSend lives in layerParams[*].rvSend.
  // No "wet" master — per-layer SEND already covers wet level cleanly;
  // having both was confusing and made it too easy to drench the mix.
  const [rvSize,     setRvSize]     = useState(50); // comb feedback (0..100)
  const [rvDamp,     setRvDamp]     = useState(40); // HF damp shelf cut (0=none, 100=full)
  const [rvLfDamp,   setRvLfDamp]   = useState(0);  // LF damp shelf cut (0=none, 100=full)
  const [rvPreDelay, setRvPreDelay] = useState(0);  // pre-delay (ms, 0..500)
  const [dlyToRev,   setDlyToRev]   = useState(0);  // delay output → reverb input send
  // Mixer: per-layer levels (poly/mono mix lives in layerParams[*].mix, drum
  // bus is global because all drum voices share one engine).
  const [drumLevel, setDrumLevel] = useState(85);
  // Per-layer mute / solo. Solo wins over mute the usual way: any solo'd
  // layer silences non-solo'd ones, even if they aren't muted. Stored as
  // {synth,lead,drums} maps so the scheduler can do a cheap lookup.
  const [trackMute, setTrackMute] = useState({synth:false,lead:false,drums:false});
  const [trackSolo, setTrackSolo] = useState({synth:false,lead:false,drums:false});
  const trackMuteR = useRef(trackMute);
  const trackSoloR = useRef(trackSolo);
  useEffect(()=>{trackMuteR.current=trackMute;},[trackMute]);
  useEffect(()=>{trackSoloR.current=trackSolo;},[trackSolo]);
  // Effective-audible test — true if the layer should be heard right now.
  // Reads refs so the scheduler can call this without re-binding every tick.
  const isLayerAudibleR = useRef(()=>true);
  isLayerAudibleR.current = (layer)=>{
    const m=trackMuteR.current, s=trackSoloR.current;
    if(m[layer])return false;
    const anySolo=s.synth||s.lead||s.drums;
    if(anySolo&&!s[layer])return false;
    return true;
  };

  const bell=useRef(new Bell());
  const drumEngine=useRef(new DrumEngine());
  // Push mute/solo into the audio domain: ramp each layer's bus gain so a muted
  // (or soloed-out) layer is cut instantly and any ringing note dies — in
  // addition to the scheduler no longer feeding it. Runs whenever mute/solo
  // changes; the setters no-op until the engine is built.
  useEffect(()=>{
    const anySolo=trackSolo.synth||trackSolo.lead||trackSolo.drums;
    const aud=(l)=>!trackMute[l]&&(!anySolo||trackSolo[l]);
    if(bell.current.setLayerGain){bell.current.setLayerGain("synth",aud("synth")?1:0);bell.current.setLayerGain("lead",aud("lead")?1:0);}
    if(drumEngine.current.setMute)drumEngine.current.setMute(aud("drums")?1:0);
  },[trackMute,trackSolo]);
  const silentLoopR=useRef(null);
  const wakeLockR=useRef(null);
  // Drum layer — independent pattern list, completely separate from synth patterns
  const initDrum=mkDrumPat(symPat(0));
  const [drumPats,    setDrumPats]    = useState([initDrum]);
  const [activeDrumId,setActiveDrumId]= useState(initDrum.id);
  const [drumChain,   setDrumChain]   = useState([initDrum.id]);
  const [drumClipboard,setDrumClipboard]=useState(null);
  // ── Phrase & Section architecture ──────────────────────────────────────────
  const [synthPhrases,  setSynthPhrases]  = useState([{id:"SP1",name:symPhr(0),chain:[1]}]);
  const [drumPhrases,   setDrumPhrases]   = useState([{id:"DP1",name:symPhr(0),chain:[initDrum.id]}]);
  const [sections,      setSections]      = useState([{id:"SC1",name:symSec(0),synthPhraseIds:[],drumPhraseIds:[]}]);
  const [activeSynthPhraseId, setActiveSynthPhraseId] = useState("SP1");
  const [activeDrumPhraseId,  setActiveDrumPhraseId]  = useState("DP1");
  const [activeSectionId,     setActiveSectionId]     = useState("SC1");
  const [seqTab,        setSeqTab]        = useState("patterns"); // "patterns"|"phrases"|"sections"
  // ── Synth-type layer store ─────────────────────────────────────────────
  // The app now exposes TWO synth-type layers: POLY (polyphonic, internal key
  // "synth") and MONO (monophonic lead/bass, internal key "lead"). Internal
  // string keys remain "synth"/"lead" to minimize refactor scope; the UI
  // labels are POLY / MONO. The legacy "bass" layer was removed in the
  // 3-layer pare-down — bass pats from legacy saves migrate into the mono
  // layer (see fillLayerParams + load paths).
  const _initLeadPat = mkPat(symPat(0));
  const layerStoreR = useRef({
    synth: null, // synth lives in `pats`/`activeId`/`synthPhrases`/`activeSynthPhraseId` at start
    lead:  { pats:[_initLeadPat], activeId:_initLeadPat.id, phrases:[{id:"LP1",name:symPhr(0),chain:[_initLeadPat.id]}], activePhraseId:"LP1" }
  });
  const activeLayerR = useRef("synth");
  useEffect(()=>{activeLayerR.current=activeLayer;},[activeLayer]);
  const SYNTH_LAYERS = ["synth","lead"];
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
  // songMode is the persistent playback intent: when true, the song matrix drives
  // playback. Toggled only by the SONG chip. Loop mode in transport overrides it.
  const [songMode,     setSongMode]     = useState(false);
  // songView is the UI gate: when true, the matrix is shown; when false, the
  // pattern grid is shown. Decoupled from songMode so tapping a pill in song
  // view leaves the view without changing the playback source.
  const [songView,     setSongView]     = useState(false);
  // Song playback mode: "sync" = single shared cursor across all four layers,
  // "free" = each layer has its own cursor and advances independently,
  // "random" = at each bar boundary, jump to a random populated bar (sync-style timing).
  // Stored as a string; legacy saves had booleans (true=sync, false=free) — load
  // paths migrate via _normalizeSongSyncMode below.
  // Base advance mode — "sync" or "free" (mutually exclusive). RANDOM is a
  // separate additive flag (songRandom) that layers on top of either:
  //   sync   + random → all layers play the SAME randomly-chosen column each bar
  //   free   + random → each layer independently jumps to a random populated bar
  const [songSyncMode, setSongSyncMode] = useState("sync");
  const [songRandom,   setSongRandom]   = useState(false);
  const songRandomR    = useRef(false);
  const [songMatrix,   setSongMatrix]   = useState({
    synth: Array(64).fill(null),
    lead:  Array(64).fill(null),
    drums: Array(64).fill(null)
  });
  const [songBar,      setSongBar]      = useState(-1); // sync mode current bar; -1 when stopped
  // Per-layer cursor for free mode. In sync mode, kept equal to songBar via the scheduler.
  const [songBarLayer, setSongBarLayer] = useState({synth:-1,lead:-1,drums:-1});
  const songBarR    = useRef(-1);
  const songModeR   = useRef(false);
  const songSyncR   = useRef("sync");
  // Legacy saves stored songSyncMode as boolean (true=sync, false=free), and
  // later as "sync"/"free"/"random". RANDOM is now a separate flag, so the base
  // coerces "random" → "sync" (its old behaviour was random over the shared
  // column). _songRandomFromSave derives the additive flag.
  const _normalizeSongSyncMode=(v)=>typeof v==="boolean"?(v?"sync":"free"):(v==="random"?"sync":(v||"sync"));
  const _songRandomFromSave=(s)=>s.songRandom!=null?!!s.songRandom:(s.songSyncMode==="random");
  const songMatrixR = useRef(songMatrix);
  // Free-mode per-layer scheduler state. Each layer has its own (step, nextNoteTime, bar)
  // so layers can drift apart by gridLen. In sync mode these are unused.
  const freeR = useRef({
    synth:{step:0,nextAt:0,bar:0},
    lead: {step:0,nextAt:0,bar:0},
    drums:{step:0,nextAt:0,bar:0},
  });
  useEffect(()=>{songBarR.current=songBar;},[songBar]);
  useEffect(()=>{songModeR.current=songMode;},[songMode]);
  useEffect(()=>{songSyncR.current=songSyncMode;},[songSyncMode]);
  useEffect(()=>{songRandomR.current=songRandom;},[songRandom]);
  useEffect(()=>{songMatrixR.current=songMatrix;},[songMatrix]);
  const drumPatsR   =useRef([initDrum]);
  const activeDrumIdR=useRef(initDrum.id);
  useEffect(()=>{drumPatsR.current=drumPats;},[drumPats]);
  useEffect(()=>{activeDrumIdR.current=activeDrumId;},[activeDrumId]);
  const variedDrumGrids=useRef(new Map());
  const variedDrumVels=useRef(new Map());
  const drumPillLongPressR=useRef(null);
  const drumChainR=useRef([initDrum.id]);
  useEffect(()=>{drumChainR.current=drumChain;},[drumChain]);
  // Note: the legacy `chain` (synth-track) and `drumChain` are vestigial in
  // non-song mode. The song matrix is the arrangement primitive now.
  const stepR=useRef(0),tmrR=useRef(null),nextNoteR=useRef(0);
  const patsR=useRef(pats),chainR=useRef(chain);
  const bpmR=useRef(bpm),scaleR=useRef(scale);
  const loopR=useRef(false),activeIdR=useRef(activeId);
  const transpR=useRef(0),varyModeR=useRef({synth:false,lead:false,drums:false}),recModeR=useRef(false),recSourceIdR=useRef(null);
  const varyParamsR=useRef({dropRate:13,shiftRate:17,shiftRange:1,pitchRate:0,pitchRange:1,ghostRate:0,velJitter:0,fltJitter:0,dlyJitter:0,rhyJitter:0,octJitter:0,glideJitter:0,durJitter:0});
  const variedGrids=useRef(new Map());
  // (prevFreqByRowR and cposR were used by the legacy unified scheduler;
  //  per-layer scheduling tracks last freq via layerLastFreqR instead.)
  // Per-layer glide tracking. Each layer's prev played freq + glide flag are
  // independent so glide works correctly when layers play at different rates
  // (per-pat speedMult). Synth-track's old single-layer refs were merged in.
  const layerLastFreqR=useRef({synth:null,lead:null});
  const layerLastGlideR=useRef({synth:false,lead:false});
  const flashTmr=useRef(null),gridRef=useRef(null);
  const gesture=useRef({state:"idle",startX:0,startY:0,baseGrid:null,cellPx:24,appliedDX:0,appliedDY:0});

  // Helper: apply dur-edit gesture state to the active pat. Targets the head row
  // only (per-row monophony). Cannibalizes same-row notes within the span — they
  // remain in the snapshot (g.preTieGrid) for walk-back.
  const applyDurEditR = useRef(()=>null);
  applyDurEditR.current = (targetCol)=>{
    const g=gesture.current;
    if(!g.preTieGrid||!g.preTieDurs)return;
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeIdR.current)return p;
      // Restore from snapshot, then apply head's new duration on its row.
      const newGrid = g.preTieGrid.map(row=>[...row]);
      const newDurs = g.preTieDurs.map(row=>[...row]);
      // Cannibalize: clear any same-row notes between startCol+1 and targetCol.
      // Their dur values are reset to 1 (no longer relevant once cleared).
      for(let i=g.durStartCol+1;i<=targetCol;i++){
        if(newGrid[g.durStartRow][i]){
          newGrid[g.durStartRow][i]=false;
          newDurs[g.durStartRow][i]=1;
        }
      }
      // Set head's dur = how many cells it covers (1 + extension).
      newDurs[g.durStartRow][g.durStartCol] = (targetCol - g.durStartCol) + 1;
      return Object.assign({},p,{grid:newGrid,durs:newDurs});
    }));
  };

  // Apply note-move gesture: rebuild from the pre-move snapshot and re-place
  // the dragged note at newRow. Duration travels with the note; column params
  // are unchanged. Idempotent — every move recomputes from the snapshot so
  // dragging through intermediate rows doesn't accumulate stale state.
  const applyNoteMoveR = useRef(()=>null);
  applyNoteMoveR.current = (newRow)=>{
    const g=gesture.current;
    if(!g.preMoveGrid||g.moveStartCol==null)return;
    const startR=g.moveStartRow, startC=g.moveStartCol;
    const span=(g.preMoveDurs&&g.preMoveDurs[startR])?g.preMoveDurs[startR][startC]:1;
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeIdR.current)return p;
      const grid=g.preMoveGrid.map(row=>[...row]);
      const durs=(g.preMoveDurs||mkDurs()).map(row=>[...row]);
      // Clear the original cell + reset its duration.
      grid[startR][startC]=false;
      if(durs[startR])durs[startR][startC]=1;
      // Place the note at the new row, preserving the duration span.
      grid[newRow][startC]=true;
      if(durs[newRow])durs[newRow][startC]=span;
      return Object.assign({},p,{grid,durs});
    }));
    g.moveCurrentRow=newRow;
  };

  useEffect(()=>{patsR.current=pats;},[pats]);
  useEffect(()=>{chainR.current=chain;},[chain]);
  useEffect(()=>{bpmR.current=bpm;bell.current.stepDur=60/bpm/4*speedMultR.current;},[bpm]);
  useEffect(()=>{speedMultR.current=speedMult;bell.current.stepDur=60/bpmR.current/4*speedMult;},[speedMult]);
  useEffect(()=>{scaleR.current=scale;},[scale]);
  useEffect(()=>{loopR.current=loopMode;},[loopMode]);
  // FOLLOW only meaningfully applies to the synth track — that's where
  // playId comes from (synth chain or song-mode synth pat). On bass/lead,
  // setting activeId to a synth pat id leaves activePat undefined and
  // freezes the playhead animation.
  // FOLLOW: keep the active pattern locked to whatever is playing, for the
  // active layer — synth, lead OR drums. Guard membership so a layer-switch
  // transient (actPlayId still from the old layer) can't set a bad id.
  useEffect(()=>{
    if(!followSeq||!playing||actPlayId==null)return;
    if(activeLayer==="drums"){if(drumPats.some(p=>p.id===actPlayId))setActiveDrumId(actPlayId);}
    else if(pats.some(p=>p.id===actPlayId))setActiveId(actPlayId);
  },[actPlayId,followSeq,playing,activeLayer]);
  useEffect(()=>{activeIdR.current=activeId;},[activeId]);
  useEffect(()=>{transpR.current=transpose;},[transpose]);
  useEffect(()=>{
    varyModeR.current=varyMode;
    // Per-layer VARY. Wipe all cached variations on every toggle, then
    // synchronously regenerate only the layers that are ON so the next
    // scheduler tick already has a populated cache (avoids the cache-miss
    // window that read as a playback break). safeVaryGrid guarantees a
    // variation never silences a pat that had audible notes — the fix for
    // "VARY on kills sound."
    if(variedGrids.current&&variedGrids.current.clear)variedGrids.current.clear();
    if(variedDrumGrids.current&&variedDrumGrids.current.clear)variedDrumGrids.current.clear();
    if(variedDrumVels.current&&variedDrumVels.current.clear)variedDrumVels.current.clear();
    try{
      const vp=varyParamsR.current;
      const regenSynth=(pats)=>{
        for(const p of (pats||[])){
          if(!p||!p.grid)continue;
          variedGrids.current.set(p.id,safeVaryGrid(p.grid,vp,p.gridLen));
        }
      };
      if(varyMode.synth)regenSynth(activeLayer==="synth"?patsR.current:(layerStoreR.current?.synth?.pats));
      if(varyMode.lead) regenSynth(activeLayer==="lead" ?patsR.current:(layerStoreR.current?.lead?.pats));
      if(varyMode.drums){
        for(const dp of (drumPatsR.current||[])){
          if(!dp||!dp.grid)continue;
          const vRhythm=(dp.vRhythm||0)/100;
          const vVelocity=(dp.vVelocity||0)/100;
          const len=Math.max(1,Math.min(COLS,dp.gridLen||COLS));
          let vGrid=dp.grid.map(row=>row.map(on=>{
            if(on&&Math.random()<vRhythm*0.45)return false;
            if(!on&&Math.random()<vRhythm*0.18)return true;
            return on;
          }));
          // Same anti-silence guard as synth — if the variation cleared every
          // hit inside the playable window but the original had hits, keep the
          // original this cycle.
          const had=dp.grid.some((row,ri)=>row.some((on,ci)=>on&&ci<len));
          const got=vGrid.some((row,ri)=>row.some((on,ci)=>on&&ci<len));
          if(had&&!got)vGrid=dp.grid.map(row=>[...row]);
          // Per-cell velocity jitter (vel is 2D now).
          const baseVel=toDrumVel2D(dp.vel);
          const vVel=baseVel.map(row=>row.map(vv=>Math.max(1,Math.min(127,Math.round(vv+(Math.random()*2-1)*vVelocity*50)))));
          variedDrumGrids.current.set(dp.id,vGrid);
          variedDrumVels.current.set(dp.id,vVel);
        }
      }
    }catch(e){
      console.warn("VARY: cache regen failed",e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[varyMode]);
  useEffect(()=>{
    recModeR.current=recMode;
    if(recMode) recSourceIdR.current=activeId; // lock source to active pattern at record start
    else recSourceIdR.current=null;
  },[recMode]);
  useEffect(()=>{swingR.current=swing;},[swing]);
  // Sync voiceSamples state → ref so the scheduler reads the latest map
  // without a stale closure dependency.
  useEffect(()=>{voiceSamplesR.current=voiceSamples;},[voiceSamples]);
  useEffect(()=>{
    varyParamsR.current={dropRate:vDropRate,shiftRate:vShiftRate,shiftRange:vShiftRange,pitchRate:vPitchRate,pitchRange:vPitchRange,ghostRate:vGhostRate,velJitter:vVelJitter,fltJitter:vFltJitter,dlyJitter:vDlyJitter,rhyJitter:vRhyJitter,octJitter:vOctJitter,glideJitter:vGlideJitter,durJitter:vDurJitter};
  },[vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter]);
  // Per-layer params snapshot for the scheduler. Bell.play() now takes the layerP per call.
  const layerParamsR = useRef(layerParams);
  useEffect(()=>{layerParamsR.current=layerParams;},[layerParams]);

  useEffect(()=>{bell.current.setDlyTime((60/bpm)*DLY_NOTES[dlyIdx].mult);},[bpm,dlyIdx]);
  useEffect(()=>{bell.current.setDlyFb(dlyFbPct/100);},[dlyFbPct]);
  useEffect(()=>{bell.current.setDlyHp(dlyHpVal);},[dlyHpVal]);
  useEffect(()=>{bell.current.setDlyLp(dlyLpVal);},[dlyLpVal]);
  useEffect(()=>{bell.current.setRvSize(rvSize);},[rvSize]);
  useEffect(()=>{bell.current.setRvDamp(rvDamp);},[rvDamp]);
  useEffect(()=>{bell.current.setRvLfDamp&&bell.current.setRvLfDamp(rvLfDamp);},[rvLfDamp]);
  useEffect(()=>{bell.current.setRvPreDelay&&bell.current.setRvPreDelay(rvPreDelay);},[rvPreDelay]);
  useEffect(()=>{bell.current.setDlyToRev(dlyToRev);},[dlyToRev]);
  useEffect(()=>{drumEngine.current.setMasterLevel&&drumEngine.current.setMasterLevel(drumLevel);},[drumLevel]);
  // Push the GLOBAL mix to the engine whenever it changes. The mix is static
  // and shared across patterns, so this is the single source of truth for the
  // strips. (MOTION automation, when on, overlays per-step in playDrumStep.)
  useEffect(()=>{
    if(!drumEngine.current.ready)return;
    const mix=fillDrumMix(drumMix);
    for(let r=0;r<DRUM_ROWS;r++){
      drumEngine.current.setVoiceMix(DRUM_VOICES[r].key,mix[r]);
    }
  },[drumMix]);

  useEffect(()=>{
    (async()=>{const v=await storageGet("slots");if(v)try{setSlotData(JSON.parse(v));}catch(e){}})();
  },[]);

  // Pre-load the default kit's samples on first mount so the bundled sound is
  // ready before the user presses play. loadKit falls back to an
  // OfflineAudioContext when the live audio context isn't up yet.
  useEffect(()=>{
    if(DEFAULT_KIT!=="synth")loadKit(DEFAULT_KIT).catch(()=>{});
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
    songMode,songView,songSyncMode,songRandom,
    activeId,activeDrumId,activeSynthPhraseId,activeDrumPhraseId,activeSectionId,
    activeLayer,
    layerStore:JSON.parse(JSON.stringify(liveLayerStore)),
    bpm,scale,transpose,swing,speedMult,
    layerParams:JSON.parse(JSON.stringify(layerParams)),
    dlyIdx,dlyFbPct,dlyHpVal,dlyLpVal,rvSize,rvDamp,rvLfDamp,rvPreDelay,dlyToRev,drumLevel,
    drumMix:JSON.parse(JSON.stringify(drumMix)),
    trackMute:{...trackMute},trackSolo:{...trackSolo},
    varyMode,loopMode,
    vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,
    vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter
  });};
  const applySnapshot = s=>{
    if(!s)return;
    // Reset layerStoreR to fresh defaults BEFORE restoring — undo/redo
    // snapshots from previous projects shouldn't bleed through stale lead/
    // synth data if the new snapshot doesn't define them.
    const _freshLead=mkPat(symPat(0));
    layerStoreR.current={
      synth:null,
      lead:{pats:[_freshLead],activeId:_freshLead.id,phrases:[{id:"LP1",name:symPhr(0),chain:[_freshLead.id]}],activePhraseId:"LP1"}
    };
    if(s.layerStore){
      // Restore non-active layers to the store
      for(const layer of SYNTH_LAYERS){
        if(s.layerStore[layer]&&layer!==(s.activeLayer||activeLayer)){
          layerStoreR.current[layer]=JSON.parse(JSON.stringify(s.layerStore[layer]));
        }
      }
    }
    // See doLoad note: legacy shares lack activeLayer; their `s.pats` is synth.
    {const t=s.activeLayer||"synth";if(t!==activeLayer)setActiveLayer(t);}
    setPats(migratePats(s.pats,s.speedMult));setDrumPats(s.drumPats);setChain(s.chain);setDrumChain(s.drumChain);
    setDrumMixArr(s.drumMix?fillDrumMix(s.drumMix):defaultDrumMix()); // global mix (snapshots always carry it)
    setSynthPhrases(s.synthPhrases);setDrumPhrases(s.drumPhrases);setSections(s.sections);
    if(s.songMatrix)setSongMatrix(s.songMatrix);
    if(s.songMode!=null)setSongMode(s.songMode);
    if(s.songView!=null)setSongView(s.songView);
    if(s.songSyncMode!=null)setSongSyncMode(_normalizeSongSyncMode(s.songSyncMode));
    setSongRandom(_songRandomFromSave(s));
    setActiveId(s.activeId);setActiveDrumId(s.activeDrumId);
    setActiveSynthPhraseId(s.activeSynthPhraseId);setActiveDrumPhraseId(s.activeDrumPhraseId);setActiveSectionId(s.activeSectionId);
    // Undo/redo snapshots — fall back to defaults for any field a previous
    // snapshot didn't carry (so undo across a feature-add boundary doesn't
    // leave new params at stale values from outside the snapshot's lifetime).
    setBpm(s.bpm!=null?s.bpm:SESSION_DEFAULTS.bpm);
    setScale(s.scale!=null?s.scale:SESSION_DEFAULTS.scale);
    setTranspose(s.transpose!=null?s.transpose:SESSION_DEFAULTS.transpose);
    setSwing(s.swing!=null?s.swing:SESSION_DEFAULTS.swing);
    setSpeedMult(s.speedMult!=null?s.speedMult:SESSION_DEFAULTS.speedMult);
    setLayerParams(s.layerParams?fillLayerParams(s.layerParams):{synth:DEFAULT_LP(0),lead:DEFAULT_LP_MONO(0)});
    [["dlyIdx",setDlyIdx],["dlyFbPct",setDlyFbPct],["dlyHpVal",setDlyHpVal],["dlyLpVal",setDlyLpVal],
     ["rvSize",setRvSize],["rvDamp",setRvDamp],["rvLfDamp",setRvLfDamp],["rvPreDelay",setRvPreDelay],
     ["dlyToRev",setDlyToRev],["drumLevel",setDrumLevel],
     ["vDropRate",setVDropRate],["vShiftRate",setVShiftRate],["vShiftRange",setVShiftRange],
     ["vPitchRate",setVPitchRate],["vPitchRange",setVPitchRange],["vGhostRate",setVGhostRate],
     ["vVelJitter",setVVelJitter],["vFltJitter",setVFltJitter],["vDlyJitter",setVDlyJitter],
     ["vRhyJitter",setVRhyJitter],["vOctJitter",setVOctJitter],["vGlideJitter",setVGlideJitter],["vDurJitter",setVDurJitter]
    ].forEach(([k,fn])=>{fn(s[k]!=null?s[k]:SESSION_DEFAULTS[k]);});
    setTrackMute(s.trackMute&&typeof s.trackMute==="object"?{...{synth:false,lead:false,drums:false},...s.trackMute}:{synth:false,lead:false,drums:false});
    setTrackSolo(s.trackSolo&&typeof s.trackSolo==="object"?{...{synth:false,lead:false,drums:false},...s.trackSolo}:{synth:false,lead:false,drums:false});
    setVaryMode(normVary(s.varyMode));
    setLoopMode(s.loopMode!=null?s.loopMode:SESSION_DEFAULTS.loopMode);
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
      const tag=(e.target?.tagName||"").toLowerCase();
      const isEditable=tag==="input"||tag==="textarea"||e.target?.isContentEditable;
      // Spacebar toggles play/stop globally (skip when typing in a text field).
      if(!isEditable&&(e.key===" "||e.code==="Space")){
        e.preventDefault();
        startStop();
        return;
      }
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
    // Reverb knobs + drumLevel were previously not in this snap → they never
    // persisted to slot saves (issue surfaced when users noticed their reverb
    // and drum-bus levels never came back on load). Keep this list in sync
    // with captureSnapshotR / getShareState — the 4-site rule.
    const snap={ver:PROJ_VER,pats,chain,bpm,scale,transpose,swing,speedMult,activeId,activeLayer,layerStore:liveLayerStore,layerParams,dlyIdx,dlyFbPct,dlyHpVal,dlyLpVal,rvSize,rvDamp,rvLfDamp,rvPreDelay,dlyToRev,drumMix,drumLevel,activeKit,userSamples:serializeSamples(userSamples),trackMute:{...trackMute},trackSolo:{...trackSolo},varyMode,loopMode,vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,drumPats,activeDrumId,drumChain,synthPhrases,drumPhrases,sections,activeSynthPhraseId,activeDrumPhraseId,activeSectionId,songMatrix,songMode,songView,songSyncMode,songRandom};
    const next=Object.assign({},slotData,{[slot]:snap});
    setSlotData(next);
    const ok=await storageSet("slots",JSON.stringify(next));
    if(ok){setActiveSlot(slot);showFlash("SAVED "+slot);}
    else showFlash("SAVE FAILED — TOO LARGE"); // storage quota (recorded samples can be big)
  };
  // ── Load-time sanitizers ──────────────────────────────────────────────────
  // Saved projects can contain stale chain entries: legacy name strings ("A","B")
  // from before chains were id-keyed, or ids referencing patterns that no longer
  // exist. Filter to valid ids only, with a name→id migration pass for legacy
  // saves where pats still carry their old name field.
  // Forward-migrate legacy pats to the current schema. Keep the original ref
  // when nothing's missing so React reconciles cleanly. Pass the file's
  // global speedMult as `defaultSpeed` so unmigrated pats inherit the session
  // speed they were saved at, not 1×.
  const migratePats = (pats, defaultSpeed=1)=>(pats||[]).map(p=>{
    const updates={};
    if(!p.durs) updates.durs=mkDurs();
    if(p.speedMult==null) updates.speedMult=defaultSpeed!=null?defaultSpeed:1;
    return Object.keys(updates).length ? Object.assign({},p,updates) : p;
  });
  // 3-layer pare-down: collapse legacy "bass" layer into "lead". Active
  // layer "bass" becomes "lead"; bass pats append to lead pats (capped at
  // 8). Bass songMatrix lane is folded by the setSongMatrix calls separately.
  // Returns a normalized save state — non-bass saves pass through unchanged.
  const migrateLegacyBass = (s)=>{
    if(!s) return s;
    const hasBassStore = !!(s.layerStore && s.layerStore.bass);
    const wasBassActive = s.activeLayer==="bass";
    if(!hasBassStore && !wasBassActive) return s;
    const out = {...s};
    if(wasBassActive) out.activeLayer = "lead"; // s.pats (legacy bass) becomes lead live
    const bassPats = (s.layerStore&&s.layerStore.bass?.pats)||[];
    if(bassPats.length){
      if(out.activeLayer==="lead"){
        // Merge bass pats into the soon-to-be lead live pats.
        out.pats = [...(s.pats||[]), ...bassPats].slice(0,8);
      } else {
        // Active is synth or drums — merge bass pats into layerStore.lead.
        const lead = (s.layerStore && s.layerStore.lead)||{pats:[],activeId:null,phrases:[],activePhraseId:null};
        out.layerStore = {...s.layerStore, lead:{...lead, pats:[...(lead.pats||[]),...bassPats].slice(0,8)}};
        delete out.layerStore.bass;
      }
    } else if(hasBassStore){
      out.layerStore = {...s.layerStore};
      delete out.layerStore.bass;
    }
    return out;
  };

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
    let s=slotData[slot];if(!s)return;
    s=migrateLegacyBass(s);
    const reroll=s.ver!==PROJ_VER; // old/un-versioned project → refresh icons to the current scheme
    // Reset layerStoreR to fresh defaults BEFORE loading so absent layer
    // entries in the save don't leave stale data from a previous load. Lead
    // gets a fresh empty pat (matches init shape so switching to MONO post-
    // load doesn't fall through to inheriting POLY's pats).
    const _freshLead=mkPat(symPat(0));
    layerStoreR.current={
      synth:null,
      lead:{pats:[_freshLead],activeId:_freshLead.id,phrases:[{id:"LP1",name:symPhr(0),chain:[_freshLead.id]}],activePhraseId:"LP1"}
    };
    if(s.layerStore){
      for(const layer of SYNTH_LAYERS){
        if(s.layerStore[layer]){
          const ld=JSON.parse(JSON.stringify(s.layerStore[layer]));
          if(ld.pats) ld.pats = reIconize(migratePats(ld.pats, s.speedMult), reroll);
          if(ld.pats&&ld.phrases)ld.phrases=sanitizePhrases(ld.phrases,ld.pats);
          layerStoreR.current[layer]=ld;
        }
      }
    }
    // Legacy saves predate per-layer pats — `s.pats` was always synth pats.
    // Force activeLayer to "synth" when the field is missing so the live pats
    // slot maps to synth on setPats below; otherwise the user's current
    // activeLayer (e.g. bass) would absorb the legacy synth data.
    setActiveLayer(s.activeLayer||"synth");
    const _allIds=[...(s.pats||[]),...(s.drumPats||[]),...Object.values(s.layerStore||{}).flatMap(l=>(l&&l.pats)||[])].map(p=>p&&p.id).filter(x=>typeof x==="number");
    const maxId=Math.max(0,..._allIds);if(maxId>=_id)_id=maxId+1;
    const cleanChain=sanitizeChain(s.chain,s.pats);
    setPats(reIconize(migratePats(s.pats,s.speedMult),reroll));setChain(cleanChain.length?cleanChain:[s.activeId||s.pats[0].id]);
    // Top-level scalar params — always set, fall back to defaults if missing.
    // Old saves predate some fields (e.g. swing, speedMult); without explicit
    // fallback the previous project's value would leak into this load.
    setBpm(s.bpm!=null?s.bpm:SESSION_DEFAULTS.bpm);
    setScale(s.scale!=null?s.scale:SESSION_DEFAULTS.scale);
    setTranspose(s.transpose!=null?s.transpose:SESSION_DEFAULTS.transpose);
    setSwing(s.swing!=null?s.swing:SESSION_DEFAULTS.swing);
    setSpeedMult(s.speedMult!=null?s.speedMult:SESSION_DEFAULTS.speedMult);
    setActiveId(s.activeId);
    // layerParams: prefer new format; migrate old flat fields into synth slot if absent.
    // No-data case still resets to defaults so leftover sound design from the
    // previous load doesn't bleed in.
    if(s.layerParams){
      setLayerParams(fillLayerParams(s.layerParams));
    }else if(s.waveform!=null||s.attack!=null){
      const migrated={
        synth:{...DEFAULT_LP(0),
          ...(s.waveform!=null?{waveform:s.waveform}:{}),
          ...(s.detune!=null?{detune:s.detune}:{}),
          ...(s.attack!=null?{attack:s.attack}:{}),
          ...(s.decay!=null?{decay:s.decay}:{}),
          ...(s.sustain!=null?{sustain:s.sustain}:{}),
          ...(s.vcfCutoff!=null?{vcfCutoff:s.vcfCutoff}:{}),
          ...(s.vcfRes!=null?{vcfRes:s.vcfRes}:{}),
          ...(s.filterEnvAmt!=null?{filterEnvAmt:s.filterEnvAmt}:{}),
          ...(s.dlyWetPct!=null?{dlySend:s.dlyWetPct}:{})},
        lead:DEFAULT_LP_MONO(0)
      };
      setLayerParams(migrated);
    }else{
      setLayerParams({synth:DEFAULT_LP(0),lead:DEFAULT_LP_MONO(0)});
    }
    // Default-fallback on load: every key gets either the saved value or the
    // session default. Older saves that predate a field (e.g. rvLfDamp added
    // later) would otherwise carry the previous project's edited value.
    [["dlyIdx",setDlyIdx],["dlyFbPct",setDlyFbPct],["dlyHpVal",setDlyHpVal],["dlyLpVal",setDlyLpVal],["rvSize",setRvSize],["rvDamp",setRvDamp],["rvLfDamp",setRvLfDamp],["rvPreDelay",setRvPreDelay],["dlyToRev",setDlyToRev],["drumLevel",setDrumLevel],
     ["vDropRate",setVDropRate],["vShiftRate",setVShiftRate],["vShiftRange",setVShiftRange],
     ["vPitchRate",setVPitchRate],["vPitchRange",setVPitchRange],["vGhostRate",setVGhostRate],
     ["vVelJitter",setVVelJitter],["vFltJitter",setVFltJitter],["vDlyJitter",setVDlyJitter],
     ["vRhyJitter",setVRhyJitter],["vOctJitter",setVOctJitter],["vGlideJitter",setVGlideJitter],["vDurJitter",setVDurJitter]
    ].forEach(([k,fn])=>{fn(s[k]!=null?s[k]:SESSION_DEFAULTS[k]);});
    setLoopMode(s.loopMode!=null?s.loopMode:SESSION_DEFAULTS.loopMode);
    setVaryMode(normVary(s.varyMode));
    setTrackMute(s.trackMute&&typeof s.trackMute==="object"?{...{synth:false,lead:false,drums:false},...s.trackMute}:{synth:false,lead:false,drums:false});
    setTrackSolo(s.trackSolo&&typeof s.trackSolo==="object"?{...{synth:false,lead:false,drums:false},...s.trackSolo}:{synth:false,lead:false,drums:false});
    // Backfill missing fields on drum pats — older saves only carried
    // {level,pan} per voice; rvSend/dlySend default to 0.
    if(s.drumPats){
      const _dp=reIconize(s.drumPats.map(p=>{const mp=migrateDrumPatRows(p);return Object.assign({},mp,{mix:fillDrumMix(mp.mix)});}),reroll);
      setDrumPats(_dp);
      // Global mix: use the saved global drumMix; for legacy projects (which
      // stored mix per-pattern) seed it from the first pattern's migrated mix
      // so the old console state isn't lost.
      setDrumMixArr(s.drumMix?fillDrumMix(s.drumMix):fillDrumMix(_dp[0]&&_dp[0].mix));
    }
    if(s.activeDrumId!=null)setActiveDrumId(s.activeDrumId);
    if(s.drumChain)setDrumChain(sanitizeChain(s.drumChain,s.drumPats||[]));
    if(s.synthPhrases)setSynthPhrases(relabelByIndex(sanitizePhrases(s.synthPhrases,s.pats),symPhr));
    if(s.drumPhrases)setDrumPhrases(relabelByIndex(sanitizePhrases(s.drumPhrases,s.drumPats||[]),symPhr));
    if(s.sections)setSections(relabelByIndex(s.sections,symSec));
    if(s.activeSynthPhraseId)setActiveSynthPhraseId(s.activeSynthPhraseId);
    if(s.activeDrumPhraseId)setActiveDrumPhraseId(s.activeDrumPhraseId);
    if(s.activeSectionId)setActiveSectionId(s.activeSectionId);
    if(s.songMatrix){
      // Sanitize each lane against its layer's current pats. Drop entries
      // referencing pat IDs that no longer exist; pad to 64. Legacy "bass"
      // lane is folded into the lead lane where lead is null at that bar
      // (mono playback can only carry one of them per bar).
      const padTo64=arr=>{const a=Array.isArray(arr)?arr.slice(0,64):[];while(a.length<64)a.push(null);return a;};
      const filterIds=(arr,pats)=>{const ids=new Set((pats||[]).map(p=>p.id));return arr.map(v=>v!=null&&ids.has(v)?v:null);};
      // Synth pats live in s.layerStore.synth.pats regardless of which layer
      // was active at save time. Pulling from s.pats only works when active
      // was synth — saves made from MONO or DRUMS had s.pats holding the
      // last-touched synth-type pats (often lead's), so filtering the synth
      // lane against it dropped every valid synth id and the lane came back
      // blank. Fall back to s.pats for very old saves that predate layerStore.
      const synthPats=(s.layerStore?.synth?.pats)||(s.pats||[]);
      // Lead now also covers legacy bass content.
      const leadPats=[...(s.layerStore?.lead?.pats||[]),...(s.layerStore?.bass?.pats||[])].slice(0,8);
      const drumPats=s.drumPats||[];
      const leadLane=padTo64(s.songMatrix.lead);
      const bassLane=padTo64(s.songMatrix.bass);
      const mergedLead=leadLane.map((v,i)=>v!=null?v:bassLane[i]);
      setSongMatrix({
        synth: filterIds(padTo64(s.songMatrix.synth),synthPats),
        lead:  filterIds(mergedLead,leadPats),
        drums: filterIds(padTo64(s.songMatrix.drums),drumPats)
      });
    }
    setSongMode(s.songMode!=null?s.songMode:SESSION_DEFAULTS.songMode);
    setSongView(s.songView!=null?s.songView:(s.songMode?true:SESSION_DEFAULTS.songView));
    setSongSyncMode(s.songSyncMode!=null?_normalizeSongSyncMode(s.songSyncMode):SESSION_DEFAULTS.songSyncMode);
    setSongRandom(_songRandomFromSave(s));
    setActiveSlot(slot);
    showFlash("LOADED "+slot);
    // Load the saved kit — must come after setVoiceSamples({}) earlier in
    // doLoad so the previous kit's samples are cleared before the new fetch.
    // Legacy saves carry activeKit:"synth" (or nothing) which is no longer a
    // valid kit, so resolve any unknown id to DEFAULT_KIT.
    const savedKit=DRUM_KITS.find(k=>k.id===s.activeKit)?s.activeKit:DEFAULT_KIT;
    loadKit(savedKit).catch(()=>{});
    restoreUserSamples(s);
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
  // ── New project ─────────────────────────────────────────────────────────
  // Reset everything to default initial state. Save slots are NOT cleared
  // (that's persistent storage outside the session). Confirms before
  // discarding any in-memory work, mirroring loadSlot's hasContent guard.
  const doNew=()=>{
    // Stop playback if running — discarding work mid-play would otherwise leave
    // the scheduler ticking against fresh state.
    if(playing){
      clearInterval(tmrR.current);
      setPlaying(false);setStep(-1);setPlayId(null);setDrumStep(-1);
      if(silentLoopR.current){try{silentLoopR.current.pause();}catch(e){}}
      releaseWakeLock();
    }
    const p0=mkPat(symPat(0));
    const dp0=mkDrumPat(symPat(0));
    setPats([p0]);setActiveId(p0.id);setChain([p0.id]);
    setDrumPats([dp0]);setActiveDrumId(dp0.id);setDrumChain([dp0.id]);
    // Seed the lead store with a fresh empty pat so switching to MONO after
    // NEW doesn't carry over POLY's live pats (which would look like stale
    // "orphaned" pills on the mono layer).
    const _newLeadPat=mkPat(symPat(0));
    layerStoreR.current={
      synth:null,
      lead:{pats:[_newLeadPat],activeId:_newLeadPat.id,phrases:[{id:"LP1",name:symPhr(0),chain:[_newLeadPat.id]}],activePhraseId:"LP1"}
    };
    setActiveLayer("synth");
    setLoopMode(false);setVaryMode({synth:false,lead:false,drums:false});
    setTrackMute({synth:false,lead:false,drums:false});
    setTrackSolo({synth:false,lead:false,drums:false});
    setSongMode(false);setSongView(false);setSongSyncMode("sync");setSongRandom(false);
    setSongMatrix({synth:Array(64).fill(null),lead:Array(64).fill(null),drums:Array(64).fill(null)});
    setSongBar(-1);songBarR.current=-1;
    setSongBarLayer({synth:-1,lead:-1,drums:-1});
    setBpm(120);setScale("major");setTranspose(0);setSwing(0);setSpeedMult(1);
    setLayerParams({synth:DEFAULT_LP(0),lead:DEFAULT_LP_MONO(0)});
    setDlyIdx(3);setDlyFbPct(45);setDlyHpVal(8);setDlyLpVal(78);
    setRvSize(50);setRvDamp(40);setRvLfDamp(0);setRvPreDelay(0);setDlyToRev(0);setDrumLevel(85);setDrumMixArr(defaultDrumMix());
    setVDropRate(13);setVShiftRate(17);setVShiftRange(1);
    setVPitchRate(0);setVPitchRange(1);setVGhostRate(0);
    setVVelJitter(0);setVFltJitter(0);setVDlyJitter(0);
    setVRhyJitter(0);setVOctJitter(0);setVGlideJitter(0);setVDurJitter(0);
    // Transient scheduler/UI state — clear so the next play starts fresh.
    stepR.current=0;
    if(layerLastFreqR)layerLastFreqR.current={synth:null,lead:null};
    if(layerLastGlideR)layerLastGlideR.current={synth:false,lead:false};
    setRecMode(false);recModeR.current=false;
    if(variedGrids&&variedGrids.current&&variedGrids.current.clear)variedGrids.current.clear();
    if(variedDrumGrids&&variedDrumGrids.current&&variedDrumGrids.current.clear)variedDrumGrids.current.clear();
    if(variedDrumVels&&variedDrumVels.current&&variedDrumVels.current.clear)variedDrumVels.current.clear();
    if(freeR&&freeR.current){
      for(const l of ["synth","lead","drums"]){
        if(freeR.current[l]) freeR.current[l]={step:0,nextAt:0,bar:0};
      }
    }
    setPatternDrag(null);
    setActiveSlot(null);
    setPage("edit");
    // Stop any in-flight sample recording + clear stored samples.
    if(recorderRef.current&&recorderRef.current.state==="recording"){try{recorderRef.current.stop();}catch(e){}}
    if(recordStreamRef.current){recordStreamRef.current.getTracks().forEach(t=>t.stop());recordStreamRef.current=null;}
    recorderRef.current=null;
    setRecordingVoice(null);
    setVoiceSamples({});
    // Reload the default kit's samples rather than dropping to bare synth.
    if(DEFAULT_KIT!=="synth")loadKit(DEFAULT_KIT).catch(()=>{});
    else{setActiveKit("synth");}
    showFlash("NEW PROJECT");
  };
  const newProject=()=>{
    const hasContent=pats.some(p=>p.grid.some(r=>r.some(c=>c)))||drumPats.some(p=>p.grid.some(r=>r.some(c=>c)));
    if(hasContent){setConfirmAction({type:"new",label:"NEW PROJECT? UNSAVED WORK LOST"});return;}
    doNew();
  };
  const confirmYes=()=>{
    if(!confirmAction)return;
    if(confirmAction.type==="save")doSave(confirmAction.slot);
    else if(confirmAction.type==="load")doLoad(confirmAction.slot);
    else if(confirmAction.type==="new")doNew();
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
  // includeSamples: encode recorded USER samples (base64 WAV) into the state.
  // ON for file export / slot save; OFF for the URL share link (samples would
  // blow past practical URL length).
  const getShareState=(includeSamples=true)=>({
    ver:PROJ_VER,
    pats,chain,bpm,scale,transpose,swing,speedMult,activeId,
    layerParams,
    dlyIdx,dlyFbPct,dlyHpVal,dlyLpVal,rvSize,rvDamp,rvLfDamp,rvPreDelay,dlyToRev,drumLevel,
    drumMix:JSON.parse(JSON.stringify(drumMix)),
    trackMute,trackSolo,activeKit,
    ...(includeSamples?{userSamples:serializeSamples(userSamples)}:{}),
    vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,
    vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,
    loopMode,varyMode,drumPats,activeDrumId,drumChain,
    synthPhrases,drumPhrases,sections,activeSynthPhraseId,activeDrumPhraseId,activeSectionId,
    songMatrix,songMode,songView,songSyncMode,songRandom,layerStore:layerStoreR.current,activeLayer
  });

  const applyShareState=rawState=>{
    if(!rawState)return;
    const s=migrateLegacyBass(rawState);
    const reroll=s.ver!==PROJ_VER; // old/un-versioned project → refresh icons to the current scheme
    // Restore the non-active layers + active layer (mirror doLoad). Without
    // this, importing a project authored on a different layer dropped the other
    // layer's patterns and dumped the active-layer pats into the wrong slot.
    const _freshLead=mkPat(symPat(0));
    layerStoreR.current={
      synth:null,
      lead:{pats:[_freshLead],activeId:_freshLead.id,phrases:[{id:"LP1",name:symPhr(0),chain:[_freshLead.id]}],activePhraseId:"LP1"}
    };
    if(s.layerStore){
      for(const layer of SYNTH_LAYERS){
        if(s.layerStore[layer]){
          const ld=JSON.parse(JSON.stringify(s.layerStore[layer]));
          if(ld.pats)ld.pats=reIconize(migratePats(ld.pats,s.speedMult),reroll);
          if(ld.pats&&ld.phrases)ld.phrases=sanitizePhrases(ld.phrases,ld.pats);
          layerStoreR.current[layer]=ld;
        }
      }
    }
    setActiveLayer(s.activeLayer||"synth");
    // Advance _id past EVERY numeric-id collection (synth + lead pats AND drum
    // pats), else a later-created pattern can collide with an existing id.
    const _allIds=[...(s.pats||[]),...(s.drumPats||[]),...Object.values(s.layerStore||{}).flatMap(l=>(l&&l.pats)||[])].map(p=>p&&p.id).filter(x=>typeof x==="number");
    const maxId=Math.max(0,..._allIds);if(maxId>=_id)_id=maxId+1;
    if(s.pats)setPats(reIconize(migratePats(s.pats,s.speedMult),reroll));
    if(s.chain){const cc=sanitizeChain(s.chain,s.pats||[]);setChain(cc.length?cc:[s.activeId||(s.pats&&s.pats[0]&&s.pats[0].id)||1]);}
    // Apply with fallback to defaults — share imports should reset to a clean
    // baseline for anything the link doesn't carry, same rule as doLoad.
    setBpm(s.bpm!=null?s.bpm:SESSION_DEFAULTS.bpm);
    setScale(s.scale!=null?s.scale:SESSION_DEFAULTS.scale);
    setTranspose(s.transpose!=null?s.transpose:SESSION_DEFAULTS.transpose);
    setSwing(s.swing!=null?s.swing:SESSION_DEFAULTS.swing);
    // s.gridLen was per-pattern in legacy shares; new shares carry it on
    // each pat directly. The global setGridLen doesn't exist any more.
    setSpeedMult(s.speedMult!=null?s.speedMult:SESSION_DEFAULTS.speedMult);
    if(s.activeId)setActiveId(s.activeId);
    if(s.layerParams)setLayerParams(fillLayerParams(s.layerParams));
    else if(s.waveform!=null||s.attack!=null){
      // Migrate legacy flat fields into synth slot
      setLayerParams(lps=>({
        ...lps,
        synth:{...lps.synth,
          ...(s.waveform!=null?{waveform:s.waveform}:{}),
          ...(s.detune!=null?{detune:s.detune}:{}),
          ...(s.attack!=null?{attack:s.attack}:{}),
          ...(s.decay!=null?{decay:s.decay}:{}),
          ...(s.sustain!=null?{sustain:s.sustain}:{}),
          ...(s.vcfCutoff!=null?{vcfCutoff:s.vcfCutoff}:{}),
          ...(s.vcfRes!=null?{vcfRes:s.vcfRes}:{}),
          ...(s.filterEnvAmt!=null?{filterEnvAmt:s.filterEnvAmt}:{}),
          ...(s.dlyWetPct!=null?{dlySend:s.dlyWetPct}:{})}
      }));
    }else{
      setLayerParams({synth:DEFAULT_LP(0),lead:DEFAULT_LP_MONO(0)});
    }
    setLoopMode(s.loopMode!=null?s.loopMode:SESSION_DEFAULTS.loopMode);
    setVaryMode(normVary(s.varyMode));
    setTrackMute(s.trackMute&&typeof s.trackMute==="object"?{...{synth:false,lead:false,drums:false},...s.trackMute}:{synth:false,lead:false,drums:false});
    setTrackSolo(s.trackSolo&&typeof s.trackSolo==="object"?{...{synth:false,lead:false,drums:false},...s.trackSolo}:{synth:false,lead:false,drums:false});
    if(s.drumPats){
      const _dp=reIconize(s.drumPats.map(p=>{const mp=migrateDrumPatRows(p);return Object.assign({},mp,{mix:fillDrumMix(mp.mix)});}),reroll);
      setDrumPats(_dp);
      // Global mix: saved global drumMix, else seed from legacy per-pattern mix.
      setDrumMixArr(s.drumMix?fillDrumMix(s.drumMix):fillDrumMix(_dp[0]&&_dp[0].mix));
    }
    if(s.activeDrumId!=null)setActiveDrumId(s.activeDrumId);
    if(s.drumChain)setDrumChain(sanitizeChain(s.drumChain,s.drumPats||[]));
    if(s.synthPhrases)setSynthPhrases(relabelByIndex(sanitizePhrases(s.synthPhrases,s.pats||[]),symPhr));
    if(s.drumPhrases)setDrumPhrases(relabelByIndex(sanitizePhrases(s.drumPhrases,s.drumPats||[]),symPhr));
    if(s.sections)setSections(relabelByIndex(s.sections,symSec));
    if(s.activeSynthPhraseId)setActiveSynthPhraseId(s.activeSynthPhraseId);
    if(s.activeDrumPhraseId)setActiveDrumPhraseId(s.activeDrumPhraseId);
    if(s.activeSectionId)setActiveSectionId(s.activeSectionId);
    [["dlyIdx",setDlyIdx],["dlyFbPct",setDlyFbPct],["dlyHpVal",setDlyHpVal],["dlyLpVal",setDlyLpVal],["rvSize",setRvSize],["rvDamp",setRvDamp],["rvLfDamp",setRvLfDamp],["rvPreDelay",setRvPreDelay],["dlyToRev",setDlyToRev],["drumLevel",setDrumLevel],
     ["vDropRate",setVDropRate],["vShiftRate",setVShiftRate],["vShiftRange",setVShiftRange],
     ["vPitchRate",setVPitchRate],["vPitchRange",setVPitchRange],["vGhostRate",setVGhostRate],
     ["vVelJitter",setVVelJitter],["vFltJitter",setVFltJitter],["vDlyJitter",setVDlyJitter],
     ["vRhyJitter",setVRhyJitter],["vOctJitter",setVOctJitter],["vGlideJitter",setVGlideJitter],["vDurJitter",setVDurJitter],
    ].forEach(([k,fn])=>{fn(s[k]!=null?s[k]:SESSION_DEFAULTS[k]);});
    if(s.songMatrix){
      const padTo64=arr=>{const a=Array.isArray(arr)?arr.slice(0,64):[];while(a.length<64)a.push(null);return a;};
      const filterIds=(arr,pats)=>{const ids=new Set((pats||[]).map(p=>p.id));return arr.map(v=>v!=null&&ids.has(v)?v:null);};
      // Synth pats live in s.layerStore.synth.pats regardless of active layer
      // at save — same fix as doLoad. s.pats only matches synth when active
      // was synth; on MONO or DRUMS saves the synth lane would otherwise come
      // back blank.
      const synthPats=(s.layerStore?.synth?.pats)||(s.pats||[]);
      // Fold legacy bass lane into lead where lead is null.
      const leadPats=[...(s.layerStore?.lead?.pats||[]),...(s.layerStore?.bass?.pats||[])].slice(0,8);
      const leadLane=padTo64(s.songMatrix.lead);
      const bassLane=padTo64(s.songMatrix.bass);
      const mergedLead=leadLane.map((v,i)=>v!=null?v:bassLane[i]);
      setSongMatrix({
        synth: filterIds(padTo64(s.songMatrix.synth),synthPats),
        lead:  filterIds(mergedLead,leadPats),
        drums: filterIds(padTo64(s.songMatrix.drums),s.drumPats||[])
      });
    }
    setSongMode(s.songMode!=null?s.songMode:SESSION_DEFAULTS.songMode);
    setSongView(s.songView!=null?s.songView:(s.songMode?true:SESSION_DEFAULTS.songView));
    setSongSyncMode(s.songSyncMode!=null?_normalizeSongSyncMode(s.songSyncMode):SESSION_DEFAULTS.songSyncMode);
    setSongRandom(_songRandomFromSave(s));
    // Resolve any unknown/legacy kit id ("synth", missing) to DEFAULT_KIT.
    const sharedKit=DRUM_KITS.find(k=>k.id===s.activeKit)?s.activeKit:DEFAULT_KIT;
    loadKit(sharedKit).catch(()=>{});
    restoreUserSamples(s);
  };

  const encodeState=s=>{try{return btoa(unescape(encodeURIComponent(JSON.stringify(s))));}catch(e){return null;}};
  const decodeState=str=>{try{return JSON.parse(decodeURIComponent(escape(atob(str))));}catch(e){return null;}};

  const copyShareLink=()=>{
    const url=window.location.origin+window.location.pathname+'#'+encodeState(getShareState(false)); // no samples in URL
    navigator.clipboard.writeText(url).then(()=>{setShareFlash("LINK COPIED");setTimeout(()=>setShareFlash(""),2000);});
  };

  const exportJSON=()=>{
    const blob=new Blob([JSON.stringify(getShareState(),null,2)],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="tabula-preset.json";a.click();
  };

  // ── Song export helpers (shared by MIDI + MP3) ────────────────────────────
  // Resolve a synth-type layer's patterns (active layer is live in `pats`;
  // others sit in layerStoreR) and its active pattern id.
  const _layerPats=(layer)=> activeLayer===layer ? pats : (layerStoreR.current[layer]?.pats||[]);
  const _activeIdFor=(layer)=> activeLayer===layer ? activeId : (layerStoreR.current[layer]?.activeId);
  // Ordered bars to export: the full populated song matrix, else one bar of the
  // active patterns. Each entry = {synth,lead,drums} pattern ids (or null).
  const _exportBars=()=>{
    const sm=songMatrix;
    let first=-1,last=-1;
    for(let i=0;i<64;i++){ if(sm.synth[i]!=null||sm.lead[i]!=null||sm.drums[i]!=null){ if(first<0)first=i; last=i; } }
    if(songMode&&first>=0){
      const bars=[];
      for(let b=first;b<=last;b++)bars.push({synth:sm.synth[b],lead:sm.lead[b],drums:sm.drums[b]});
      return bars;
    }
    return [{synth:_activeIdFor("synth"),lead:_activeIdFor("lead"),drums:activeDrumId}];
  };

  // Export the song arrangement as a Standard MIDI File. Each bar = 16 sixteenth
  // steps; a pattern shorter than 16 loops within the bar (mirrors playback).
  // POLY/MONO are pitched (row→scale freq→nearest MIDI note, + per-step octave,
  // + layer octave, + transpose); DRUMS map to GM percussion on channel 10.
  // Performance layers (VARY/MOTION/per-pattern speed) are NOT baked in — this
  // is the underlying composition (the MP3 bounce captures the performance).
  const exportMIDI=()=>{
    const bars=_exportBars();
    const freqs=(SCALES[scale]||SCALES.major).freqs;
    const usPerQ=Math.round(60000000/Math.max(1,bpm));
    const meta=[{tick:0,data:[0xFF,0x51,0x03,(usPerQ>>16)&255,(usPerQ>>8)&255,usPerQ&255]},
                {tick:0,data:[0xFF,0x58,0x04,4,2,24,8]}];
    const tName=(n)=>({tick:0,data:[0xFF,0x03,n.length,..._str(n)]});
    const synthEv=[],leadEv=[],drumEv=[];
    bars.forEach((bar,bi)=>{
      const barTick=bi*16*TICKS_16;
      [["synth",synthEv,0],["lead",leadEv,1]].forEach(([layer,ev,ch])=>{
        const pat=_layerPats(layer).find(p=>p.id===bar[layer]);
        if(!pat||!pat.grid)return;
        const len=pat.gridLen||16;
        const layerOct=(layerParams[layer]&&layerParams[layer].octave)||0;
        const mono=!!(layerParams[layer]&&layerParams[layer].monoSingle);
        for(let s=0;s<16;s++){
          const ps=s%len;
          const sp=(pat.params&&pat.params[ps])||null;
          const vel=Math.max(1,Math.min(127,Math.round(sp?(sp.vel??100):100)));
          const stepOct=(sp?(sp.oct??2):2)-2;
          const rhy=Math.max(1,sp?Math.round(sp.rhy??1):1);
          let rows=[];for(let r=0;r<ROWS;r++)if(pat.grid[r]&&pat.grid[r][ps])rows.push(r);
          if(mono&&rows.length>1)rows=[rows[0]];
          for(const r of rows){
            const note=Math.max(0,Math.min(127,freqToMidi(freqs[r])+12*(stepOct+layerOct)+transpose));
            if(rhy>1){
              for(let k=0;k<rhy;k++){
                const on=barTick+s*TICKS_16+Math.round(k*TICKS_16/rhy);
                const off=on+Math.max(6,Math.round(TICKS_16/rhy*0.85));
                ev.push({tick:on,order:1,data:[0x90|ch,note,vel]},{tick:off,order:0,data:[0x80|ch,note,0]});
              }
            }else{
              const lenSteps=Math.max(1,(pat.durs&&pat.durs[r]&&pat.durs[r][ps])||1);
              const on=barTick+s*TICKS_16;
              const off=on+Math.max(6,lenSteps*TICKS_16-6);
              ev.push({tick:on,order:1,data:[0x90|ch,note,vel]},{tick:off,order:0,data:[0x80|ch,note,0]});
            }
          }
        }
      });
      const dp=drumPats.find(p=>p.id===bar.drums);
      if(dp&&dp.grid){
        const len=dp.gridLen||16;
        for(let s=0;s<16;s++){
          const ps=s%len;
          for(let r=0;r<DRUM_ROWS;r++){
            if(!(dp.grid[r]&&dp.grid[r][ps]))continue;
            const note=GM_DRUM[DRUM_VOICES[r].key];if(note==null)continue;
            const vr=dp.vel&&dp.vel[r];
            const vel=Math.max(1,Math.min(127,Math.round((Array.isArray(vr)?vr[ps]:100)??100)));
            const rat=(dp.rat&&dp.rat[r]&&dp.rat[r][ps])||1;
            for(let k=0;k<rat;k++){
              const on=barTick+s*TICKS_16+Math.round(k*TICKS_16/rat);
              const off=on+Math.max(6,Math.round(TICKS_16/rat*0.5));
              drumEv.push({tick:on,order:1,data:[0x99,note,vel]},{tick:off,order:0,data:[0x89,note,0]});
            }
          }
        }
      }
    });
    downloadBlob(buildSMF([[...meta],[tName("POLY"),...synthEv],[tName("MONO"),...leadEv],[tName("DRUMS"),...drumEv]]),"tabula-song.mid","audio/midi");
    showFlash("MIDI EXPORTED");
  };

  // ── MP3 bounce (realtime loopback capture of one song cycle) ──────────────
  // lamejs (MP3 encoder) is loaded on demand from a CDN — only when the user
  // actually bounces, so the bundle stays lean.
  const lameRef=useRef(null);
  const loadLame=()=>new Promise((resolve)=>{
    if(window.lamejs){resolve(window.lamejs);return;}
    if(lameRef.current){resolve(lameRef.current);return;}
    const s=document.createElement("script");
    s.src="https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js";
    s.onload=()=>{lameRef.current=window.lamejs||null;resolve(lameRef.current);};
    s.onerror=()=>resolve(null);
    document.head.appendChild(s);
  });
  const _concatF32=(chunks)=>{let n=0;for(const c of chunks)n+=c.length;const out=new Float32Array(n);let o=0;for(const c of chunks){out.set(c,o);o+=c.length;}return out;};
  const _waitAudio=(ctx,untilSec)=>new Promise(res=>{
    const startWall=performance.now(),cap=(untilSec-ctx.currentTime)*1000+8000; // safety: never hang if the clock stalls
    const id=setInterval(()=>{if(ctx.currentTime>=untilSec||performance.now()-startWall>cap){clearInterval(id);res();}},40);
  });
  const encodeMP3=(lame,left,right,sr)=>{
    const enc=new lame.Mp3Encoder(2,sr,160);
    const toI16=(f)=>{const o=new Int16Array(f.length);for(let i=0;i<f.length;i++){const s=Math.max(-1,Math.min(1,f[i]));o[i]=s<0?s*0x8000:s*0x7FFF;}return o;};
    const li=toI16(left),ri=toI16(right),BLK=1152,data=[];
    for(let i=0;i<li.length;i+=BLK){const buf=enc.encodeBuffer(li.subarray(i,i+BLK),ri.subarray(i,i+BLK));if(buf.length>0)data.push(new Uint8Array(buf));}
    const end=enc.flush();if(end.length>0)data.push(new Uint8Array(end));
    return new Blob(data,{type:"audio/mpeg"});
  };
  const exportingR=useRef(false);
  const exportMP3=async()=>{
    if(exportingR.current)return;
    exportingR.current=true;setExporting(true);setExportPhase("Preparing");setExportProgress(0);
    let cap=null,sink=null,master=null,restore=null,progTmr=null;
    try{
      // Engine must exist for the master tap. Init silently if it never played.
      if(!bell.current.ready){
        const dlyT=(60/bpm)*DLY_NOTES[dlyIdx].mult;
        await bell.current.init(dlyT,dlyFbPct/100,50,dlyHpVal,dlyLpVal);
      } else { await bell.current.resume(); }
      if(!drumEngine.current.ready)await drumEngine.current.init(bell.current.master,bell.current.rev,bell.current.dly);
      if(playingR.current)await startStop(); // ensure stopped, start clean from the top
      // Tap the LIMITER output (post-limiting) so the bounce can't clip.
      const ctx=bell.current.ctx; master=bell.current.limiter||bell.current.master;
      if(!ctx||!master){showFlash("AUDIO NOT READY");return;}
      // The realtime capture needs the audio clock actually running. If the
      // context is still suspended (autoplay not yet unlocked, or a backgrounded
      // tab), capturing would stall on a long timeout — bail out with a hint
      // instead. Playing once unlocks + runs the context.
      try{if(ctx.state!=="running")await ctx.resume();}catch(e){}
      if(ctx.state!=="running"){showFlash("TAP ▶ ONCE, THEN MP3");return;}
      // ── Take the engine to TRUE silence before bouncing. Stopping the
      // scheduler above does NOT silence the ~100ms of already-queued look-ahead
      // voices, nor the reverb/delay tails — that overlap is what doubled up when
      // exporting mid-play. Mute the master, flush the FX feedback, let it all
      // drain, then bring the level + FX feedback back for a clean start.
      const mGain=bell.current.master;
      if(mGain){mGain.gain.cancelScheduledValues(ctx.currentTime);mGain.gain.setValueAtTime(0,ctx.currentTime);}
      bell.current.flushTail&&bell.current.flushTail();
      await _waitAudio(ctx,ctx.currentTime+0.22);
      bell.current.setRvSize&&bell.current.setRvSize(rvSize);     // re-arm reverb feedback
      bell.current.setDlyFb&&bell.current.setDlyFb(dlyFbPct/100); // re-arm delay feedback
      if(mGain)mGain.gain.setValueAtTime(0.55,ctx.currentTime);
      const lame=await loadLame();
      if(!lame||!lame.Mp3Encoder){showFlash("MP3 LIB FAILED");return;}
      const barCount=Math.max(1,_exportBars().length);
      const loops=Math.max(1,Math.min(16,exportLoops||1));
      const cycleSec=barCount*4*60/Math.max(1,bpm); // sync: 16 abs steps = 4 beats/bar
      const totalSec=cycleSec*loops; // bounce `loops` passes of the song (it wraps in sync mode)
      const tailSec=2;
      // Tap the master into a recorder (silent parallel path; no double audio).
      cap=ctx.createScriptProcessor(4096,2,2);
      const Lc=[],Rc=[];let capturing=false;
      cap.onaudioprocess=(e)=>{ if(!capturing)return;
        const ib=e.inputBuffer;
        Lc.push(new Float32Array(ib.getChannelData(0)));
        Rc.push(new Float32Array(ib.numberOfChannels>1?ib.getChannelData(1):ib.getChannelData(0)));
      };
      sink=ctx.createGain();sink.gain.value=0;
      master.connect(cap);cap.connect(sink);sink.connect(ctx.destination);
      // Force a clean linear song pass from the top (restore after).
      const haveSong=(()=>{const sm=songMatrix;for(let i=0;i<64;i++)if(sm.synth[i]!=null||sm.lead[i]!=null||sm.drums[i]!=null)return true;return false;})();
      if(haveSong){
        restore={mode:songModeR.current,sync:songSyncR.current,rand:songRandomR.current,loop:loopR.current};
        songModeR.current=true;setSongMode(true);
        songSyncR.current="sync";setSongSyncMode("sync");
        songRandomR.current=false;setSongRandom(false);
        loopR.current=false;setLoopMode(false); // LOOP would solo one pattern, not play the song
        // Start the song at its first populated bar. startStop only does this
        // when its `songMode` state closure is true; we force it via the ref so
        // the bounce starts from the top even if the user wasn't in song mode.
        let firstBar=0;{const sm=songMatrix;for(let i=0;i<64;i++){if(sm.synth[i]!=null||sm.lead[i]!=null||sm.drums[i]!=null){firstBar=i;break;}}}
        songBarR.current=firstBar;setSongBar(firstBar);
      }
      showFlash("BOUNCING…");setExportPhase("Bouncing");
      capturing=true;
      await startStop();                       // start playback from the song top
      const t0=ctx.currentTime;
      progTmr=setInterval(()=>setExportProgress(Math.min(0.999,(ctx.currentTime-t0)/(totalSec+tailSec))),100);
      await _waitAudio(ctx,t0+totalSec);        // play `loops` passes of the song
      if(playingR.current)await startStop();    // stop notes; FX tail keeps ringing
      await _waitAudio(ctx,t0+totalSec+tailSec);// capture the tail
      capturing=false;
      if(progTmr){clearInterval(progTmr);progTmr=null;}
      const L=_concatF32(Lc),R=_concatF32(Rc);
      if(!L.length){showFlash("NOTHING TO BOUNCE");return;}
      showFlash("ENCODING…");setExportPhase("Encoding");setExportProgress(1);
      await new Promise(r=>setTimeout(r,40)); // let the overlay paint "Encoding" before the synchronous encode blocks
      const blob=encodeMP3(lame,L,R,ctx.sampleRate);
      // On mobile (where the OS share sheet is the point — text/email the
      // sketch), stash the file and surface a SHARE button instead of forcing a
      // download. Desktop, or anywhere file-sharing isn't supported, downloads.
      const file=new File([blob],"tabula-song.mp3",{type:"audio/mpeg"});
      if(IS_MOBILE&&navigator.canShare&&navigator.canShare({files:[file]})){
        setShareFile(file);showFlash("READY — TAP SHARE");
      }else{
        downloadBlob(blob,"tabula-song.mp3","audio/mpeg");showFlash("MP3 EXPORTED");
      }
    }catch(err){console.error("MP3 export failed",err);showFlash("EXPORT FAILED");}
    finally{
      if(progTmr){clearInterval(progTmr);progTmr=null;}
      setExportPhase("");setExportProgress(0);
      try{if(master&&cap)master.disconnect(cap);}catch(e){}
      try{if(cap)cap.disconnect();cap&&(cap.onaudioprocess=null);}catch(e){}
      try{if(sink)sink.disconnect();}catch(e){}
      // Safety: never leave the master muted or the FX feedback flushed if the
      // bounce bailed out between the silence step and its restore.
      try{const c=bell.current.ctx;if(c&&bell.current.master){bell.current.master.gain.setValueAtTime(0.55,c.currentTime);bell.current.setRvSize&&bell.current.setRvSize(rvSize);bell.current.setDlyFb&&bell.current.setDlyFb(dlyFbPct/100);}}catch(e){}
      if(restore){songModeR.current=restore.mode;setSongMode(restore.mode);songSyncR.current=restore.sync;setSongSyncMode(restore.sync);songRandomR.current=restore.rand;setSongRandom(restore.rand);loopR.current=restore.loop;setLoopMode(restore.loop);}
      exportingR.current=false;setExporting(false);
    }
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

  // Auto-save the working project (debounced) and restore it on mount, so an
  // accidental reload or browser close returns you to the most recent state.
  // A shared-link URL hash takes precedence. Two rules keep this off the audio
  // thread: (1) the per-edit save is a LEAN getShareState(false) — recorded USER
  // samples (multi-MB base64) are persisted SEPARATELY and only when they change,
  // not re-encoded on every edit; (2) NOTHING auto-saves while playing, and
  // `playing` is a dependency so starting playback cancels any pending write.
  // (A debounced full+samples stringify firing mid-play was freezing playback.)
  const autosaveTmrR = useRef(null);
  const autosaveReadyR = useRef(false);
  useEffect(()=>{
    const hash=window.location.hash.slice(1);
    if(hash){const s=decodeState(hash);if(s){applyShareState(s);window.location.hash="";}autosaveReadyR.current=true;return;}
    (async()=>{
      try{
        const raw=await storageGet("autosave");
        if(raw){
          const s=JSON.parse(raw);
          if(s){
            // Re-attach the separately-stored samples so the USER kit returns too.
            try{const sr=await storageGet("autosave_smp");if(sr){const smp=JSON.parse(sr);if(smp&&Object.keys(smp).length)s.userSamples=smp;}}catch(e){}
            applyShareState(s);
          }
        }
      }catch(e){}
      autosaveReadyR.current=true;
    })();
  },[]);
  // Debounced LEAN persist (no samples → cheap, never janks). Skipped while
  // playing; the `playing` dep means play-start clears the pending timer and
  // play-stop schedules a catch-up save.
  useEffect(()=>{
    if(!autosaveReadyR.current||playing)return;
    if(autosaveTmrR.current)clearTimeout(autosaveTmrR.current);
    autosaveTmrR.current=setTimeout(()=>{
      try{storageSet("autosave",JSON.stringify(getShareState(false)));}catch(e){}
    },1200);
    return ()=>{if(autosaveTmrR.current)clearTimeout(autosaveTmrR.current);};
  },[playing,pats,chain,drumPats,drumChain,layerParams,bpm,scale,transpose,swing,speedMult,activeId,activeDrumId,activeLayer,drumMix,drumLevel,dlyIdx,dlyFbPct,dlyHpVal,dlyLpVal,rvSize,rvDamp,rvLfDamp,rvPreDelay,dlyToRev,trackMute,trackSolo,activeKit,varyMode,loopMode,vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,synthPhrases,drumPhrases,sections,activeSynthPhraseId,activeDrumPhraseId,activeSectionId,songMatrix,songMode,songView,songSyncMode,songRandom]);
  // Recorded USER samples persist on their own key, only when they actually
  // change (record / clear) and never during playback — keeps the heavy base64
  // encode off the per-edit path and out of the audio thread.
  useEffect(()=>{
    if(!autosaveReadyR.current||playing)return;
    const id=setTimeout(()=>{
      try{const smp=serializeSamples(userSamples);storageSet("autosave_smp",(smp&&Object.keys(smp).length)?JSON.stringify(smp):"");}catch(e){}
    },500);
    return ()=>clearTimeout(id);
  },[userSamples,playing]);

  // Lookahead scheduler — runs every 25ms, schedules notes 100ms ahead.
  // Decouples JS timer jitter from audio precision so delay stays locked to grid.
  // ── Per-layer playback helpers (used by free-mode scheduler) ────────────
  // Plays one step of a single synth-type layer (synth/lead/bass) through Bell.
  // Caller passes the resolved pat, step index, audio-context start time, and stepDur.
  // Per-layer step play. Handles glide tracking, vary jitter, ratchet, and
  // mid-note (FLT/OCT/GLIDE) mods for tied notes — i.e. everything the
  // synth-track main path used to do, but per-layer so each layer's plays
  // are independent (and per-pat speedMult can apply correctly).
  const playSynthLayerStep=(layer,pat,s,at,stepDur)=>{
    if(!pat||!pat.grid)return;
    const layerLP = layerParamsR.current[layer];
    const freqs = SCALES[scaleR.current].freqs;
    const ratio = stR(transpR.current);
    const vary = !!varyModeR.current[layer];
    const useGrid = vary ? (variedGrids.current.get(pat.id)||pat.grid) : pat.grid;
    const rawSp = (pat.params&&pat.params[s])?pat.params[s]:null;
    const sp = vary&&rawSp?jitterStepParam(rawSp,varyParamsR.current):rawSp;
    const rhy = sp ? Math.max(1,Math.round(sp.rhy??1)) : 1;
    const ratch = rhy;
    const subDur = stepDur / ratch;
    // True mono at the source: a monoSingle layer plays at most ONE note per
    // column. Without this, a column with 2+ active rows (VARY pitch-shift,
    // MUT8, legacy edits) calls bell.play() per row and each instantly chokes
    // the previous one at the SAME timestamp — a note is born and killed within
    // the choke fade = an onset click, and it isn't truly mono. Topmost row
    // (lowest index = highest pitch) wins, matching the cross-layer cull rule.
    const monoOne = !!(layerLP && layerLP.monoSingle);
    for(let r=0;r<ROWS;r++){
      if(!useGrid[r][s])continue;
      const dur = (pat.durs&&pat.durs[r]&&pat.durs[r][s])?Math.max(1,pat.durs[r][s]):1;
      const noteDur = stepDur * dur;
      const f = freqs[r]*ratio;
      // Glide tracking — departure glide: glide on step N means slide FROM N INTO N+1.
      // Use actual played frequency (with octaves applied) for comparison so
      // consecutive same-cell-different-octave notes glide correctly.
      const stepOct=sp?(sp.oct-2):0;
      const layerOct=layerLP.octave||0;
      const actualF=f*Math.pow(2,stepOct+layerOct);
      const hasGlide=!!(sp&&sp.glide);
      // Per-layer glide knob (0..100). When >0, every note glides into the
      // next regardless of step-level glide flags. Step glide stacks on top —
      // a step-glide note uses whichever glide time is longer.
      const layerGlide01=Math.max(0,Math.min(100,layerLP.glide||0))/100;
      const stepGlideTime=(60/bpmR.current/8)*(pat?.speedMult??1); // ~1/32 note
      const layerGlideTime=layerGlide01*(60/bpmR.current); // up to ~1 beat
      const usePrev=layerLastGlideR.current[layer]||layerGlide01>0;
      const prevF=usePrev?(layerLastFreqR.current[layer]??null):null;
      const glideTime=(prevF&&prevF!==actualF)
        ?Math.max(stepGlideTime,layerGlideTime)
        :0;
      layerLastFreqR.current[layer]=actualF;
      // Mark the slot as "glide-able" if either step glide was on or the
      // layer glide knob is engaged — so the next note also picks up prevF.
      layerLastGlideR.current[layer]=hasGlide||layerGlide01>0;
      // Tied-note mods (FLT/OCT/GLIDE schedule mid-note).
      let mods=null;
      if(dur>1&&pat.params&&ratch===1){
        mods=[];
        const plen=pat.params.length||COLS;
        for(let i=1;i<dur;i++){
          const subC=(s+i)%plen;
          const subRaw=pat.params[subC];
          if(!subRaw)continue;
          const subSp=vary?jitterStepParam(subRaw,varyParamsR.current):subRaw;
          mods.push({at:at+i*stepDur,sp:subSp});
        }
        if(mods.length===0)mods=null;
      }
      if(ratch>1){
        for(let ri=0;ri<ratch;ri++)bell.current.play(f,at+ri*subDur,sp,subDur*0.9,layerLP.dlySend,ri===0?prevF:null,ri===0?glideTime:0,layerLP,layer);
      } else {
        bell.current.play(f,at,sp,noteDur,layerLP.dlySend,prevF,glideTime,layerLP,layer,mods);
      }
      // Mono layer: stop after the first sounded note this column.
      if(monoOne)break;
    }
  };
  // Plays one step of a drum pat. Voices per row, using the GLOBAL mix
  // (drumMixR) as base + per-pattern MOTION overlay when MOTION is on, and
  // per-cell velocity + ratchet.
  const playDrumStep=(pat,s,at,stepDur)=>{
    if(!pat||!pat.grid||!drumEngine.current.ready)return;
    const dvary = !!varyModeR.current.drums;
    const useGrid = dvary ? (variedDrumGrids.current.get(pat.id)||pat.grid) : pat.grid;
    const useVel  = dvary ? (variedDrumVels.current.get(pat.id)||pat.vel)   : pat.vel;
    // Does this pat carry any recorded motion? If so we apply the per-step
    // effective mix to each hitting voice's strip (sequence playback of the
    // automation); otherwise the per-pat-switch guard in play() handles it.
    // Recorded motion only drives the strip while MOTION mode is ON. With it
    // off the mixer is fully static (base mix) — the recorded automation is
    // retained in the pat but ignored, so output is persistent.
    // Base mix is GLOBAL/static (drumMixR). Motion (per-pattern) overlays it
    // only while MOTION is on — see the motionEnabledR path below.
    const baseMixArr = drumMixR.current||defaultDrumMix();
    // Channel-flash collection — fired at the ACTUAL audio onset (below), so the
    // mixer pulse matches what you hear: the playing pattern (correct in song
    // mode), the swung onset, and past the look-ahead. Only while drums is the
    // visible layer, to avoid needless state churn.
    const flashes = activeLayerR.current==="drums" ? [] : null;
    for(let r=0;r<DRUM_ROWS;r++){
      if(useGrid[r]&&useGrid[r][s]){
        // Per-cell velocity: useVel[r][s]. Tolerate legacy 1D arrays mid-load.
        const velRow=useVel&&useVel[r];
        const dVel=(Array.isArray(velRow)?velRow[s]:useVel?.[s])??100;
        let dMix=baseMixArr[r]||{level:DRUM_DEFAULT_LEVEL,pan:0,rvSend:0,dlySend:0};
        const voiceKey=DRUM_VOICES[r].key;
        if(motionEnabledR.current){
          // MOTION mode on: re-assert the effective mix on EVERY hit — base,
          // overlaid with this step's motion value per automated param (null →
          // keep base), with an active live drag (perfMix) winning over both.
          // Doing this even for patterns WITHOUT motion lanes snaps strips back
          // to base on a pattern/song switch, instead of leaving them stuck at
          // the previous (motion) pattern's last automated value.
          const eff={...dMix};
          const pm=perfMixR.current&&perfMixR.current[r];
          for(const k of MOTION_PARAMS){
            if(pm&&pm[k]!=null){eff[k]=pm[k];continue;}
            const mv=motionValAt(pat,k,r,s);
            if(mv!=null)eff[k]=mv;
          }
          dMix=eff;
          // Per-step application — scheduled at THIS note's onset (`at`) so each
          // note locks its own values, instead of all look-ahead steps stomping
          // the shared param at currentTime. (pitch/env are read per-hit from
          // dMix inside play() so they're correct too; sat isn't motion-able.)
          drumEngine.current.setVoiceMix&&drumEngine.current.setVoiceMix(voiceKey,eff,at);
        }
        // Per-cell ratchet: retrigger the voice `rat` evenly-spaced times across
        // the step. rat===1 (or no stepDur) is a single normal hit.
        const ratRow=pat.rat&&pat.rat[r];
        const rat=(Array.isArray(ratRow)&&ratRow[s]!=null)?ratRow[s]:1;
        if(rat>1&&stepDur>0){
          const sub=stepDur/rat;
          for(let i=0;i<rat;i++)drumEngine.current.play(voiceKey,at+i*sub,dVel,dMix,voiceSamplesR.current[voiceKey],pat.id);
        }else{
          drumEngine.current.play(voiceKey,at,dVel,dMix,voiceSamplesR.current[voiceKey],pat.id);
        }
        if(flashes)flashes.push({r,vel:dVel});
      }
    }
    if(flashes&&flashes.length){
      const ctx=bell.current.ctx;
      const delayMs=ctx?Math.max(0,(at-ctx.currentTime)*1000):0;
      setTimeout(()=>{ setDrumFlash(prev=>{const nx={...prev};flashes.forEach(f=>{nx[f.r]={vel:f.vel,n:((prev[f.r]&&prev[f.r].n)||0)+1};});return nx;}); }, delayMs);
    }
  };

  const scheduler=useCallback(()=>{
    if(!bell.current.ready)return;
    const ctx=bell.current.ctx;
    const LOOKAHEAD=0.1; // seconds ahead to schedule
    // Master clock = absolute, BPM-derived. NO per-pat multiplier here.
    // Each pattern plays at its own speedMult as an independent multiplier
    // on this clock — see playSynthLayerStep / playDrumStep call sites below.
    const absStepDur=60/bpmR.current/4;

    const inLoop=loopR.current;
    const inSong=songModeR.current&&!inLoop;
    const isFree=inSong&&songSyncR.current==="free";
    // RANDOM is additive — it modifies whichever base (sync or free) is active.
    const isRandom=inSong&&songRandomR.current;

    // ── Layer pat resolution. Same data, different mode-dependent source.
    const sm=inSong?songMatrixR.current:null;
    // Find populated bar range (for song modes).
    let songFirstBar=-1,songLastBar=-1,songAllEmpty=true;
    if(inSong){
      for(let i=0;i<64;i++){
        if(sm.synth[i]!=null||sm.lead[i]!=null||sm.drums[i]!=null){
          if(songFirstBar===-1)songFirstBar=i;
          songLastBar=i;songAllEmpty=false;
        }
      }
      if(songFirstBar===-1){songFirstBar=0;songLastBar=0;}
    }
    const layerData=(layer)=>{
      if(layer==="drums")return null;
      return activeLayerR.current===layer?{pats:patsR.current,activeId:activeIdR.current}:layerStoreR.current[layer];
    };
    const resolveLayerPat=(layer,bar)=>{
      if(inLoop){
        if(layer!==activeLayerR.current)return null; // loop = solo of active
        if(layer==="drums")return drumPatsR.current.find(x=>x.id===activeDrumIdR.current);
        return patsR.current.find(x=>x.id===activeIdR.current);
      }
      if(inSong){
        const id=sm[layer]?.[bar];
        if(layer==="drums")return id!=null?drumPatsR.current.find(x=>x.id===id):null;
        const data=layerData(layer);if(!data)return null;
        // Synth fallback: empty matrix → loop synth's active pat at bar 0.
        if(layer==="synth"&&songAllEmpty)return data.pats.find(x=>x.id===data.activeId);
        return id!=null?data.pats.find(x=>x.id===id):null;
      }
      // Pattern mode: each layer plays its own active pat.
      if(layer==="drums")return drumPatsR.current.find(x=>x.id===activeDrumIdR.current);
      const data=layerData(layer);if(!data)return null;
      return data.pats.find(x=>x.id===data.activeId);
    };

    // Free mode per-layer populated ranges (+ the explicit list of populated
    // bars, used when RANDOM is additive over free).
    let ranges=null;
    if(isFree){
      ranges={};
      for(const layer of ["synth","lead","drums"]){
        let first=-1,last=-1;const bars=[];
        for(let i=0;i<64;i++){if(sm[layer][i]!=null){if(first===-1)first=i;last=i;bars.push(i);}}
        ranges[layer]={first,last,empty:first===-1,bars};
      }
    }

    // ── PER-LAYER SCHEDULING — each layer plays at its own pat's speedMult.
    // freeR.current[layer] = {step, nextAt, bar} per layer.
    let cursorChanged=false;
    const newCursor={...songBarLayer};
    for(const layer of ["synth","lead","drums"]){
      const lf=freeR.current[layer];
      // Free mode: skip silent layers, init bar within range.
      if(isFree){
        const r=ranges[layer];
        if(r.empty&&!(layer==="synth"&&songAllEmpty))continue;
        if(lf.bar<r.first||lf.bar>r.last){lf.bar=r.empty?0:r.first;lf.step=0;}
      } else if(inSong){
        // Sync/random: per-layer bar mirrors songBar (kept in sync below).
        lf.bar=Math.max(0,songBarR.current||0);
      } else {
        lf.bar=0;
      }
      while(lf.nextAt<ctx.currentTime+LOOKAHEAD){
        const pat=resolveLayerPat(layer,lf.bar);
        if(!pat){
          // Silent layer at this bar — just advance time so we re-check next tick.
          lf.nextAt+=absStepDur;
          break;
        }
        const len=pat.gridLen??16;
        const layerStepDur=absStepDur*(pat.speedMult??1);
        const s=lf.step%len;
        const at=lf.nextAt;
        // Variation grid generation at this layer's step 0 (pat-keyed, cached).
        if(s===0&&varyModeR.current[layer]){
          if(layer==="drums"){
            const vRhythm=(pat.vRhythm||0)/100;
            const vVelocity=(pat.vVelocity||0)/100;
            let vGrid=pat.grid.map(row=>row.map((on,ci)=>{
              if(ci>=len)return false;
              if(on&&Math.random()<vRhythm*0.45)return false;
              if(!on&&Math.random()<vRhythm*0.18)return true;
              return on;
            }));
            // Anti-silence guard (matches the toggle regen): if the variation
            // cleared every hit inside the playable window, keep the original.
            const had=pat.grid.some(row=>row.some((on,ci)=>on&&ci<len));
            const got=vGrid.some(row=>row.some((on,ci)=>on&&ci<len));
            if(had&&!got)vGrid=pat.grid.map(row=>[...row]);
            const baseVel=toDrumVel2D(pat.vel);
            const vVel=baseVel.map(row=>row.map(v=>Math.max(1,Math.min(127,Math.round(v+(Math.random()*2-1)*vVelocity*50)))));
            variedDrumGrids.current.set(pat.id,vGrid);
            variedDrumVels.current.set(pat.id,vVel);
          } else {
            variedGrids.current.set(pat.id,safeVaryGrid(pat.grid,varyParamsR.current,len));
            // Self-record (synth-only) — vary the source pat and append.
            if(layer==="synth"&&recModeR.current&&patsR.current.length<8){
              const vp=varyParamsR.current;
              const src=patsR.current.find(x=>x.id===recSourceIdR.current)||pat;
              const rvg=genVariation(src.grid,vp);
              const newParams=(src.params||defaultStepParams()).map(p2=>jitterStepParam(p2,vp));
              const newPat={id:++_id,name:pickSym(patsR.current.map(p=>p.name)),grid:rvg,durs:src.durs?src.durs.map(rr=>[...rr]):mkDurs(),params:newParams,gridLen:src.gridLen??16,speedMult:src.speedMult??1};
              setPats(ps=>{if(ps.length>=8){recModeR.current=false;setRecMode(false);return ps;}return [...ps,newPat];});
              setChain(c=>[...c,newPat.id]);
            }
          }
        }
        // Play this layer's step.
        // Mute / solo gate — silence the play call but keep advancing the
        // scheduler clock so the layer stays in sync if it gets un-muted
        // mid-bar.
        // Swing — push the off-beat (odd) steps late toward a triplet feel. We
        // only shift the scheduled ONSET, never lf.nextAt, so the clock stays
        // straight and nothing drifts. swing=100 ⇒ the 2nd of each pair lands
        // 1/3 of a step late (full triplet); swing=0 ⇒ dead straight.
        const sw=swingR.current||0;
        const playAt=(sw>0&&(s%2===1))?at+(sw/100)*(layerStepDur/3):at;
        if(isLayerAudibleR.current(layer)){
          if(layer==="drums")playDrumStep(pat,s,playAt,layerStepDur);
          else playSynthLayerStep(layer,pat,s,playAt,layerStepDur);
        }
        // Update visual playhead for whichever layer is active.
        if(layer===activeLayerR.current){
          if(layer==="drums")setDrumStep(s);else setStep(s);
          // Track the active layer's currently-playing pattern for FOLLOW (only
          // push state when it actually changes, so this isn't a per-step churn).
          if(actPlayIdR.current!==pat.id){actPlayIdR.current=pat.id;setActPlayId(pat.id);}
        }
        // Update playId — used by FOLLOW + pill highlights — synth-track focused.
        if(layer==="synth")setPlayId(pat.id);
        // Advance step.
        const ns=(s+1)%len;
        lf.step=ns;
        lf.nextAt+=layerStepDur;
        // Free mode: per-layer bar advances on layer-step wrap. With RANDOM
        // additive, jump to a random populated bar for this layer instead of
        // stepping linearly — "any cell, no inter-relation between layers".
        if(isFree&&ns===0){
          const r=ranges[layer];
          let nb;
          if(isRandom&&r.bars&&r.bars.length){
            nb=r.bars[Math.floor(Math.random()*r.bars.length)];
          } else {
            nb=lf.bar+1;
            if(nb>r.last)nb=r.empty?0:r.first;
          }
          lf.bar=nb;
          if(newCursor[layer]!==lf.bar){newCursor[layer]=lf.bar;cursorChanged=true;}
        }
      }
      if(isFree && newCursor[layer]!==lf.bar){newCursor[layer]=lf.bar;cursorChanged=true;}
    }
    if(cursorChanged)setSongBarLayer(newCursor);

    // ── MASTER CLOCK — drives songBar (sync/random only) + visual bar position.
    // Master advances at absStepDur regardless of any pat's speedMult, so a
    // shared bar boundary lands at 16 absolute steps. Free mode's bars are
    // per-layer above; sync/random share songBar advanced here.
    while(nextNoteR.current<ctx.currentTime+LOOKAHEAD){
      const masterAt=nextNoteR.current;
      void masterAt;
      const ns=(stepR.current+1)%16;
      if(inSong&&!isFree&&ns===0){
        // Shared bar boundary — advance songBar and snap all per-layer cursors.
        let nextBar;
        if(isRandom){
          const candidates=[];
          for(let i=songFirstBar;i<=songLastBar;i++){
            if(sm.synth[i]!=null||sm.lead[i]!=null||sm.drums[i]!=null)candidates.push(i);
          }
          nextBar=candidates.length?candidates[Math.floor(Math.random()*candidates.length)]:songFirstBar;
        } else {
          let cur=songBarR.current;
          if(cur<songFirstBar||cur>songLastBar)cur=songFirstBar;
          nextBar=cur+1;
          if(nextBar>songLastBar)nextBar=songFirstBar;
        }
        songBarR.current=nextBar;setSongBar(nextBar);
        setSongBarLayer({synth:nextBar,lead:nextBar,drums:nextBar});
        // Reset per-layer step index so each layer starts new bar from step 0.
        for(const l of ["synth","lead","drums"]){
          freeR.current[l].step=0;
          // Realign nextAt to bar boundary so layers re-sync after bar advance.
          freeR.current[l].nextAt=nextNoteR.current+absStepDur;
        }
      }
      stepR.current=ns;
      nextNoteR.current+=absStepDur;
    }
  },[]);

  // ── (legacy unified sync scheduler removed in the per-layer rewrite) ──
  /* legacy unified sync scheduler — body removed in the per-layer rewrite */

  const startStop=async()=>{
    // Read/write the LIVE ref (not the `playing` state closure) so rapid
    // programmatic start→stop calls (the MP3 bounce) resolve correctly within
    // one render. Button clicks are unaffected (state is settled there).
    if(playingR.current){
      clearInterval(tmrR.current);
      playingR.current=false;
      setPlaying(false);setStep(-1);setPlayId(null);setDrumStep(-1);
      setSongBar(-1);songBarR.current=-1;
      setSongBarLayer({synth:-1,lead:-1,drums:-1});
      layerLastFreqR.current={synth:null,lead:null};layerLastGlideR.current={synth:false,lead:false};
      setRecMode(false);recModeR.current=false;
      if(silentLoopR.current){try{silentLoopR.current.pause();}catch(e){}}
      releaseWakeLock();
      if("mediaSession" in navigator)navigator.mediaSession.playbackState="paused";
      return;
    }
    const dlyT=(60/bpm)*DLY_NOTES[dlyIdx].mult;
    if(!bell.current.ready)await bell.current.init(dlyT,dlyFbPct/100,50,dlyHpVal,dlyLpVal);
    else await bell.current.resume();
    bell.current.stepDur=60/bpm/4*speedMult;
    // Pass Bell's reverb + delay inputs so DrumEngine voices can have per-
    // channel sends. Without these refs, send knobs in the drum mixer no-op.
    await drumEngine.current.init(bell.current.master, bell.current.rev, bell.current.dly);
    // Re-apply the engine-side state for anything that wasn't passed into
    // bell.init's arglist. The state useEffects fire before init runs (e.g.
    // on session load) and the engine-side setters no-op while !ready, so
    // a loaded rvSize of 80 would silently stay at the engine's hard-coded
    // default of 0.78 until the user nudged the slider. Re-applying here
    // catches all of them on every play start.
    bell.current.setRvSize&&bell.current.setRvSize(rvSize);
    bell.current.setRvDamp&&bell.current.setRvDamp(rvDamp);
    bell.current.setRvLfDamp&&bell.current.setRvLfDamp(rvLfDamp);
    bell.current.setRvPreDelay&&bell.current.setRvPreDelay(rvPreDelay);
    bell.current.setDlyToRev&&bell.current.setDlyToRev(dlyToRev);
    drumEngine.current.setMasterLevel&&drumEngine.current.setMasterLevel(drumLevel);
    // Push the global drum mix to the strips on play-start (effects fire before
    // the engine is ready on a cold start).
    {const _m=fillDrumMix(drumMix);for(let r=0;r<DRUM_ROWS;r++)drumEngine.current.setVoiceMix&&drumEngine.current.setVoiceMix(DRUM_VOICES[r].key,_m[r]);}
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
    stepR.current=0;
    const t0=bell.current.ctx.currentTime+0.05;
    // Initialize per-layer schedulers — pattern mode starts at step 0 / bar 0;
    // song mode also sets each layer's bar to its first populated cell.
    for(const layer of ["synth","lead","drums"]){
      freeR.current[layer]={step:0,nextAt:t0,bar:0};
    }
    if(songMode){
      const sm=songMatrix;
      const layerFirst={};
      for(const layer of ["synth","lead","drums"]){
        let f=-1;
        for(let i=0;i<64;i++){if(sm[layer][i]!=null){f=i;break;}}
        layerFirst[layer]=f===-1?0:f;
        freeR.current[layer].bar=layerFirst[layer];
      }
      let firstBar=-1;
      for(let i=0;i<64;i++){
        if(sm.synth[i]!=null||sm.lead[i]!=null||sm.drums[i]!=null){firstBar=i;break;}
      }
      if(firstBar===-1)firstBar=0;
      songBarR.current=firstBar;setSongBar(firstBar);
      setSongBarLayer({synth:layerFirst.synth,lead:layerFirst.lead,drums:layerFirst.drums});
    }
    nextNoteR.current=t0; // master clock for visual playhead + bar advance
    playingR.current=true;
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

  // Keep only the topmost active cell per column — enforces monophony on the
  // MONO (lead) layer so grid mutations (MUT8/RAND/variation) can't stack
  // notes into a chord.
  const cullMonoGrid=(grid)=>{
    const g=grid.map(r=>[...r]);
    for(let c=0;c<COLS;c++){let found=false;for(let r=0;r<ROWS;r++){if(g[r][c]){if(found)g[r][c]=false;else found=true;}}}
    return g;
  };
  const mutatePat=fn=>setPats(ps=>ps.map(p=>{
    if(p.id!==activeId)return p;
    let grid=fn(p.grid);
    if(activeLayer==="lead")grid=cullMonoGrid(grid); // MONO never goes polyphonic
    return Object.assign({},p,{grid});
  }));

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

  const handleGridDown=useCallback(e=>{
    if(e.button===2)return; // right-click handled by onContextMenu only — no undo snapshot / follow-cancel
    pushHistory();
    setFollowSeq(false); // any grid edit takes you out of follow mode
    e.preventDefault();
    // A primary pointer is the first finger of a fresh interaction — no other
    // fingers should legitimately be down, so clear any stale IDs left behind
    // by a missed up/cancel. This is what makes the multi-touch state unleakable.
    if(e.isPrimary)activePtrsR.current.clear();
    activePtrsR.current.add(e.pointerId);
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
      if(gridRef.current){try{gridRef.current.setPointerCapture(e.pointerId);}catch(_){}gesture.current.capturedId=e.pointerId;}
      const pat=patsR.current.find(p=>p.id===activeIdR.current);
      g.baseGrid=pat?pat.grid.map(r=>[...r]):null;
      g.baseParams=pat?(pat.params||defaultStepParams()).map(s=>({...s})):null;
      return;
    }

    // Second finger down → shift mode, dismiss popup. isPrimary is false for any
    // finger beyond the first — stateless, so it can never get stuck "on".
    if(!e.isPrimary){
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
        if(gridRef.current){try{gridRef.current.setPointerCapture(e.pointerId);}catch(_){}gesture.current.capturedId=e.pointerId;}
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
        if(gridRef.current){try{gridRef.current.setPointerCapture(e.pointerId);}catch(_){}gesture.current.capturedId=e.pointerId;}
        return;
      }
      g.state="popup";
      if(gridRef.current){try{gridRef.current.setPointerCapture(e.pointerId);}catch(_){}gesture.current.capturedId=e.pointerId;}
      return;
    }

    g.state="pending";g.startX=e.clientX;g.startY=e.clientY;g.appliedDX=0;g.appliedDY=0;
    g.baseGrid=pat?pat.grid.map(r=>[...r]):null;
    // Record initial cell and whether it had a note (for paint mode and dur-edit gesture)
    g.paintStartCell=hasCell&&!isNaN(r)&&!isNaN(c)?{r,c,wasOn:!!(pat&&pat.grid[r]&&pat.grid[r][c])}:null;

    if(gridRef.current){
      const c0=gridRef.current.querySelector('[data-col="0"]'),c1=gridRef.current.querySelector('[data-col="1"]');
      if(c0&&c1){const px=c1.getBoundingClientRect().left-c0.getBoundingClientRect().left;if(px>2)g.cellPx=px;}
    }
    if(gridRef.current){try{gridRef.current.setPointerCapture(e.pointerId);}catch(_){}gesture.current.capturedId=e.pointerId;}

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
        const startCell=g.paintStartCell;

        // Note-move gesture: tap on existing note + drag vertically. Moves
        // that single note up/down the column. Duration travels with the note.
        // Triggered before dur-edit because dy-dominant means "move up/down"
        // — horizontal drag is still dur-edit (rightward) or paint/erase.
        if(startCell&&startCell.wasOn&&Math.abs(dy)>Math.abs(dx)){
          const snapPat=patsR.current.find(p=>p.id===activeIdR.current);
          g.preMoveGrid=snapPat?snapPat.grid.map(row=>[...row]):null;
          g.preMoveDurs=snapPat?(snapPat.durs?snapPat.durs.map(row=>[...row]):mkDurs()):mkDurs();
          g.moveStartRow=startCell.r;
          g.moveStartCol=startCell.c;
          g.moveCurrentRow=startCell.r;
          g.state="note-move";
          const gridEl2=gridRef.current;
          if(gridEl2){
            const rect=gridEl2.getBoundingClientRect();
            const cellH=rect.height/ROWS;
            const newRow=Math.max(0,Math.min(ROWS-1,Math.floor((e.clientY-rect.top)/cellH)));
            applyNoteMoveR.current(newRow);
          }
          return;
        }

        // Duration-edit gesture: tap on existing note + drag horizontally rightward.
        // Per-row monophony: only same-row notes after the head can be cannibalized.
        // The grid + durs snapshot is preserved during the gesture so walking back
        // restores cannibalized notes as long as the user hasn't released yet.
        if(startCell&&startCell.wasOn&&dx>0&&Math.abs(dx)>Math.abs(dy)){
          const snapPat=patsR.current.find(p=>p.id===activeIdR.current);
          // Snapshot grid + durs as the gesture-base. We restore from this every move
          // so the gesture always operates on the original state, never on its own
          // partial output. This prevents ghost extensions accumulating.
          const baseGrid = snapPat ? snapPat.grid.map(row=>[...row]) : null;
          const baseDurs = snapPat
            ? (snapPat.durs?snapPat.durs.map(row=>[...row]):mkDurs())
            : mkDurs();
          // Reset the head's own duration to 1 in the baseline so the gesture starts
          // from a clean head — without this, an existing dur=4 head would mean we'd
          // be operating from "extended" state on every fresh gesture.
          if(baseDurs) baseDurs[startCell.r][startCell.c]=1;
          g.preTieGrid = baseGrid;
          g.preTieDurs = baseDurs;
          g.durStartCol = startCell.c;
          g.durStartRow = startCell.r;
          g.state="dur-edit";
          // Apply initial extent based on current pointer x
          const gridEl2=gridRef.current;
          if(gridEl2){
            const rect=gridEl2.getBoundingClientRect();
            const cellW=rect.width/COLS;
            const targetCol=Math.max(g.durStartCol,Math.min(COLS-1,Math.floor((e.clientX-rect.left)/cellW)));
            g.lastDurTarget=targetCol;
            applyDurEditR.current(targetCol);
          }
          return;
        }

        g.state="paint";
        const sc=g.paintStartCell;
        g.paintedCells=new Set();
        g.tieRuns=new Map();
        // Direction determines mode. Right swipe = create; clear LEFT swipe = erase.
        // Otherwise (vertical or ambiguous), default to create — never erase by accident.
        g.paintMode=(dx<-3&&Math.abs(dx)>Math.abs(dy))?"erase":"create";
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
                const isMono=activeLayerR.current==="lead";
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
            runCols.forEach((col)=>{np[col]={...np[col],rhy:1};});
            return Object.assign({},p,{params:np});
          }));
        } else {
          setPats(ps=>ps.map(p=>{
            if(p.id!==activeIdR.current)return p;
            const isMono=activeLayerR.current==="lead";
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

    if(g.state==="dur-edit"){
      const gridEl=gridRef.current;if(!gridEl)return;
      const rect=gridEl.getBoundingClientRect();
      const cellW=rect.width/COLS;
      // Clamp targetCol to active pat's gridLen-1 (don't extend past the loop end)
      const activePat=patsR.current.find(p=>p.id===activeIdR.current);
      const maxCol = (activePat?.gridLen??COLS) - 1;
      const targetCol=Math.max(g.durStartCol,Math.min(maxCol,Math.floor((e.clientX-rect.left)/cellW)));
      if(g.lastDurTarget===targetCol)return;
      g.lastDurTarget=targetCol;
      applyDurEditR.current(targetCol);
      return;
    }

    if(g.state==="note-move"){
      const gridEl=gridRef.current;if(!gridEl)return;
      const rect=gridEl.getBoundingClientRect();
      const cellH=rect.height/ROWS;
      const newRow=Math.max(0,Math.min(ROWS-1,Math.floor((e.clientY-rect.top)/cellH)));
      if(newRow!==g.moveCurrentRow)applyNoteMoveR.current(newRow);
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
    activePtrsR.current.delete(e.pointerId);
    clearTimeout(longPressR.current);longPressR.current=null;
    const g=gesture.current;

    if(g.state==="paint"){
      g.state="idle";setShifting(false);
      return;
    }

    if(g.state==="dur-edit"){
      g.state="idle";g.lastDurTarget=null;g.preTieGrid=null;g.preTieDurs=null;setShifting(false);
      return;
    }

    if(g.state==="note-move"){
      g.state="idle";
      g.preMoveGrid=null;g.preMoveDurs=null;
      g.moveStartRow=null;g.moveStartCol=null;g.moveCurrentRow=null;
      setShifting(false);
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
        const isMono=activeLayerR.current==="lead";
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
          // Reset dur to 1 for the toggled cell. If we just removed, also clears the
          // stale dur. If we added, ensures it starts at 1.
          const baseDurs=p.durs||mkDurs();
          const newDurs=baseDurs.map((row,ri)=>{
            if(isMono&&!wasOn){
              // Mono add: reset entire column durs to 1
              return row.map((v,ci)=>ci===c?1:v);
            }
            return ri!==r?row:row.map((v,ci)=>ci===c?1:v);
          });
          return Object.assign({},p,{grid:newGrid,durs:newDurs,params:np});
        }));
      }
    }

    if(activePtrsR.current.size===0){g.state="idle";setShifting(false);}
  },[]);

  const paramPopupValuesR = useRef(null);
  useEffect(()=>{
    if(paramPopup) paramPopupValuesR.current=paramPopup.values;
    else paramPopupValuesR.current=null;
  },[paramPopup]);

  const clearRow=r=>setPats(ps=>ps.map(p=>p.id!==activeIdR.current?p:Object.assign({},p,{grid:p.grid.map((row,ri)=>ri===r?new Array(COLS).fill(false):row)})));
  const clearCol=c=>setPats(ps=>ps.map(p=>p.id!==activeIdR.current?p:Object.assign({},p,{grid:p.grid.map(row=>row.map((v,ci)=>ci===c?false:v))})));
  const addPat=()=>{pushHistory();if(pats.length>=8)return;const p=mkPat(pickSym(pats.map(p=>p.name)));setPats(ps=>[...ps,p]);setActiveId(p.id);};
  const dupPat=()=>{if(pats.length>=8)return;const src=pats.find(p=>p.id===activeId);if(!src)return;const p=Object.assign({},mkPat(pickSym(pats.map(p=>p.name))),{grid:src.grid.map(r=>[...r]),durs:src.durs?src.durs.map(r=>[...r]):mkDurs(),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s)),gridLen:src.gridLen??16});setPats(ps=>[...ps,p]);setActiveId(p.id);};
  const delPat=()=>{if(pats.length<=1)return;const rem=pats.filter(p=>p.id!==activeId);setPats(rem);setChain(c=>c.filter(pid=>pid!==activeId));setActiveId(rem[0].id);};
  const copyPat=()=>{const src=pats.find(p=>p.id===activeId);if(src)setClipboard({grid:src.grid.map(r=>[...r]),durs:src.durs?src.durs.map(r=>[...r]):mkDurs(),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s))});};
  const pastePat=()=>{if(!clipboard)return;setPats(ps=>ps.map(p=>p.id!==activeId?p:Object.assign({},p,{grid:clipboard.grid.map(r=>[...r]),durs:clipboard.durs?clipboard.durs.map(r=>[...r]):mkDurs(),params:clipboard.params.map(s=>Object.assign({},s))})));};
  const clearPat=()=>mutatePat(()=>mkGrid());

  // ID-targeted versions — used by pill context menu so activeId is never involved
  const dupPatId=(id)=>{pushHistory();if(pats.length>=8)return;const src=pats.find(p=>p.id===id);if(!src)return;const p=Object.assign({},mkPat(pickSym(pats.map(p=>p.name))),{grid:src.grid.map(r=>[...r]),durs:src.durs?src.durs.map(r=>[...r]):mkDurs(),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s)),gridLen:src.gridLen??16});setPats(ps=>[...ps,p]);setActiveId(p.id);};
  // Strip the id from songMatrix as well — leaving a dangling ref produces
  // silent gaps in the song timeline. Drag-off-layer delete relies on this.
  const delPatId=(id)=>{pushHistory();if(pats.length<=1)return;const rem=pats.filter(p=>p.id!==id);setPats(rem);setChain(c=>c.filter(pid=>pid!==id));setActiveId(a=>a===id?rem[0].id:a);setSongMatrix(m=>({...m,synth:m.synth.map(v=>v===id?null:v),lead:m.lead.map(v=>v===id?null:v)}));};
  // Unified by-layer delete. Used by drag-off-layer-to-delete since dragged
  // pat lives in whichever layer the drag started from, not necessarily the
  // active one. For the active synth layer we go through delPatId (touches
  // live state). For a non-active synth layer we have to mutate layerStoreR
  // directly — refs don't trigger re-render, but the setSongMatrix call we
  // do next will cause one and the layerPats lookup re-reads the ref.
  const delPatInLayer=(layer,id)=>{
    if(layer==="drums"){delDrumPatId(id);return;}
    if(layer===activeLayer){delPatId(id);return;}
    const stored=layerStoreR.current[layer];
    if(!stored||!stored.pats||stored.pats.length<=1)return;
    pushHistory();
    const rem=stored.pats.filter(x=>x.id!==id);
    layerStoreR.current[layer]={
      ...stored,
      pats:rem,
      activeId:stored.activeId===id?rem[0].id:stored.activeId,
      phrases:(stored.phrases||[]).map(ph=>({...ph,chain:(ph.chain||[]).filter(x=>x!==id)})),
    };
    setSongMatrix(m=>({...m,[layer]:m[layer].map(v=>v===id?null:v)}));
  };
  const copyPatId=(id)=>{const src=pats.find(p=>p.id===id);if(src)setClipboard({grid:src.grid.map(r=>[...r]),durs:src.durs?src.durs.map(r=>[...r]):mkDurs(),params:(src.params||defaultStepParams()).map(s=>Object.assign({},s))});};
  const pastePatId=(id)=>{pushHistory();if(!clipboard)return;setPats(ps=>ps.map(p=>p.id!==id?p:Object.assign({},p,{grid:clipboard.grid.map(r=>[...r]),durs:clipboard.durs?clipboard.durs.map(r=>[...r]):mkDurs(),params:clipboard.params.map(s=>Object.assign({},s))})));};
  const clearPatId=(id)=>{pushHistory();setPats(ps=>ps.map(p=>p.id!==id?p:Object.assign({},p,{grid:mkGrid()})));};
  const randPatId=(id)=>{pushHistory();setPats(ps=>ps.map(p=>{
    if(p.id!==id)return p;
    const isMono=activeLayerR.current==="lead";
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
  // Per-cell velocity setter (row, col). vel is normalized to 2D first so
  // legacy 1D saves edited in-session upgrade cleanly.
  const setDrumVelCell=(row,col,val)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const v2=toDrumVel2D(p.vel);
    const vel=v2.map((r,ri)=>ri===row?r.map((c,ci)=>ci===col?val:c):r);
    return Object.assign({},p,{vel});
  }));
  const setDrumLen=(len)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    return Object.assign({},p,{gridLen:len});
  }));
  // Ctrl/Cmd+click a drum cell: cycle its ratchet count. An empty cell turns
  // on at 2 (start ratcheting); a lit cell cycles 1→2→3→4→1 (4 = max, wraps
  // back to a single hit but stays lit). Ratchet retriggers the voice that
  // many evenly-spaced times within the step — see playDrumStep.
  const cycleDrumRat=(row,col)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const rat=toDrumRat2D(p.rat);
    const grid=p.grid.map(r=>[...r]);
    const cur=rat[row][col]||1;
    let nx;
    if(!grid[row][col]){grid[row][col]=true;nx=2;}      // off → on, start at 2
    else nx=cur>=4?1:cur+1;                              // on → 2,3,4,back to 1
    rat[row][col]=nx;
    return Object.assign({},p,{grid,rat});
  }));
  // Shift+drag the whole drum pattern around the grid. Recomputes from a frozen
  // base each move (no accumulation drift). Horizontal rotation wraps within the
  // active length (gridLen); vertical wraps across all voices. Moves grid, vel
  // and rat together so a hit keeps its velocity + ratchet as it travels.
  const shiftDrumActive=(dCols,dRows,base)=>{
    const L=Math.max(1,base.gridLen||16);
    const mod=(n,m)=>((n%m)+m)%m;
    const ng=Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(false));
    const nv=mkDrumVel(),nr=mkDrumRat();
    for(let r=0;r<DRUM_ROWS;r++){
      const sr=mod(r-dRows,DRUM_ROWS);
      for(let c=0;c<COLS;c++){
        const sc=c<L?mod(c-dCols,L):c;
        ng[r][c]=!!(base.grid[sr]&&base.grid[sr][sc]);
        nv[r][c]=(base.vel[sr]&&base.vel[sr][sc]!=null)?base.vel[sr][sc]:100;
        nr[r][c]=(base.rat[sr]&&base.rat[sr][sc]!=null)?base.rat[sr][sc]:1;
      }
    }
    return {grid:ng,vel:nv,rat:nr};
  };
  const applyDrumShift=(dCols,dRows,base)=>{
    const s=shiftDrumActive(dCols,dRows,base);
    setDrumPats(ps=>ps.map(p=>p.id!==activeDrumId?p:Object.assign({},p,{grid:s.grid,vel:s.vel,rat:s.rat})));
  };
  const clearDrums=()=>{pushHistory();return setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    return Object.assign({},p,{grid:Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(false)),vel:mkDrumVel(),rat:mkDrumRat()});
  }));}
  // Mixer link groups.
  //  • Hi-hats (CH+OH): every mix param is linked — they model one physical
  //    hi-hat. Both strips are shown so each can hold its own sample, but
  //    moving any slider on one moves it on the other. Sample slots stay
  //    independent.
  //  • Toms (LT+MT+HT): only LEVEL is linked (balance the kit as a group);
  //    pan and everything else stay per-tom so they can spread across the
  //    field and be tuned individually.
  const _rowOf=k=>DRUM_VOICES.findIndex(v=>v.key===k);
  const _HAT_ROWS=[_rowOf("CH"),_rowOf("OH")];
  const _TOM_ROWS=[_rowOf("LT"),_rowOf("MT"),_rowOf("HT")];
  const _HAT_KEYS=new Set(["pan","level","rvSend","dlySend","pitch","filt","filtCut","env","sat"]);
  // Toms link everything EXCEPT pan, so they can still spread across the field.
  const _TOM_KEYS=new Set(["level","rvSend","dlySend","pitch","filt","filtCut","env","sat"]);
  // Which rows a given (row,key) edit writes to (always includes row). Each
  // group's link is defeatable via its toggle (linkHat / linkTom).
  const _linkedRows=(row,key)=>{
    if(linkHat&&_HAT_ROWS.includes(row)&&_HAT_KEYS.has(key))return _HAT_ROWS;
    if(linkTom&&_TOM_ROWS.includes(row)&&_TOM_KEYS.has(key))return _TOM_ROWS;
    return [row];
  };
  // Edit the GLOBAL mix (not per-pattern). Link groups (hats, tom levels)
  // still apply. fillDrumMix normalizes any partial state before the write.
  const setDrumMix=(row,key,val)=>setDrumMixArr(prev=>{
    const targets=_linkedRows(row,key);
    return fillDrumMix(prev).map((m,i)=>targets.includes(i)?Object.assign({},m,{[key]:val}):m);
  });
  // ── Motion mixer write/route ──────────────────────────────────────────────
  // Write a motion automation value onto a step (and linked voices). Lazily
  // allocates the per-param ROWS×COLS lane. Persisted in the drum pat.
  const writeMotion=(row,key,step,val)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const targets=_linkedRows(row,key);
    const motion={...(p.motion||{})};
    const lane=motion[key]?motion[key].map(r=>r?[...r]:new Array(COLS).fill(null))
                          :Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(null));
    targets.forEach(rr=>{if(lane[rr])lane[rr][step]=val;});
    motion[key]=lane;
    return Object.assign({},p,{motion});
  }));
  // Slider drag in the drum mixer. In motion mode the drag is a live override
  // (audible, transient, shown via perfMix) and — if record-armed during
  // playback — writes onto the current step. Outside motion mode it edits the
  // persistent base mix (the normal mixer behavior).
  const onMixDrag=(row,key,val)=>{
    if(!motionEnabledR.current){setDrumMix(row,key,val);return;}
    const linked=_linkedRows(row,key);
    linked.forEach(rr=>drumEngine.current.setVoiceMix&&drumEngine.current.setVoiceMix(DRUM_VOICES[rr].key,{[key]:val}));
    setPerfMix(pm=>{const n={...pm};linked.forEach(rr=>{n[rr]={...(n[rr]||{}),[key]:val};});return n;});
    if(motionRecR.current&&playingR.current){
      recDragR.current={row,key,val};
      if(drumStepR.current>=0)writeMotion(row,key,drumStepR.current,val);
    }
  };
  const onMixUp=(row,key)=>{
    if(!motionEnabledR.current)return;
    recDragR.current=null;
    const linked=_linkedRows(row,key);
    setPerfMix(pm=>{const n={...pm};linked.forEach(rr=>{if(n[rr]){const c={...n[rr]};delete c[key];Object.keys(c).length?n[rr]=c:delete n[rr];}});return n;});
    // Revert the engine strip to the global static base for these voices; any
    // motion-automated params re-apply per-step on the next hit anyway.
    const mixArr=fillDrumMix(drumMixR.current);
    linked.forEach(rr=>drumEngine.current.setVoiceMix&&drumEngine.current.setVoiceMix(DRUM_VOICES[rr].key,mixArr[rr]));
  };
  // perfMix → ref so the scheduler (playDrumStep) can let a live drag win over
  // recorded motion without re-binding every render.
  const perfMixR=useRef({}); useEffect(()=>{perfMixR.current=perfMix;},[perfMix]);
  // Record drag: as the playhead advances, paint the held value onto each new
  // step. The drag start writes the first step (in onMixDrag); this catches
  // every subsequent step during the hold.
  useEffect(()=>{
    if(!motionRec||!playing)return;
    const rd=recDragR.current;
    if(rd&&drumStep>=0)writeMotion(rd.row,rd.key,drumStep,rd.val);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[drumStep,motionRec,playing]);
  // Leaving motion mode (or disarming record) drops any transient drag state.
  useEffect(()=>{
    if(!motionEnabled){
      setPerfMix({});recDragR.current=null;
      // Snap every strip back to the global static base mix — otherwise a
      // strip could be stuck at the last per-step automated value.
      if(drumEngine.current.ready){
        const mixArr=fillDrumMix(drumMixR.current);
        for(let r=0;r<DRUM_ROWS;r++)drumEngine.current.setVoiceMix&&drumEngine.current.setVoiceMix(DRUM_VOICES[r].key,mixArr[r]);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[motionEnabled]);
  useEffect(()=>{if(!motionRec)recDragR.current=null;},[motionRec]);
  // Clear recorded motion on EVERY drum pattern (CLR-motion button). Old
  // projects can carry stale motion on patterns other than the active one,
  // which keeps the mixer animating; wiping all of them is the cure.
  const clearMotion=()=>setDrumPats(ps=>ps.map(p=>(p.motion?Object.assign({},p,{motion:undefined}):p)));
  // Display overlay for the mixer sliders in motion mode: a live drag (perfMix)
  // wins, else the currently-playing step's recorded motion, else the base.
  // Drives slider thumb animation while the sequence plays back.
  const effDispMix=(dp,r,base)=>{
    if(!motionEnabled)return base;
    const o={...base};
    for(const k of MOTION_PARAMS){
      if(perfMix[r]&&perfMix[r][k]!=null){o[k]=perfMix[r][k];continue;}
      if(playing){const mv=motionValAt(dp,k,r,drumStep);if(mv!=null)o[k]=mv;}
    }
    return o;
  };
  const randDrumVel=()=>{pushHistory();return setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    // Per-cell velocity now.
    const vel=mkDrumVel().map(row=>row.map(()=>Math.round(80+Math.random()*Math.random()*47)));
    // Also randomize the rhythm grid. ~22% density per cell gives a sparse-
    // but-populated rhythm — repeat RAND to keep generating variations.
    const grid=p.grid.map(row=>row.map(()=>Math.random()<0.22));
    return Object.assign({},p,{vel,grid});
  }));}
  // MUT8 for drums — nudge the active pattern: drop some existing hits, sprinkle
  // a few new ones, all within the active length. Anti-silence guard keeps the
  // original if the mutation happened to clear every in-window hit. Repeat for
  // progressive variations (like the synth MUT8).
  const mutateDrumPat1=()=>{pushHistory();return setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const len=Math.max(1,Math.min(COLS,p.gridLen||16));
    let grid=p.grid.map(row=>row.map((on,ci)=>{
      if(ci>=len)return on;
      if(on&&Math.random()<0.30)return false;
      if(!on&&Math.random()<0.10)return true;
      return on;
    }));
    const had=p.grid.some(row=>row.some((on,ci)=>on&&ci<len));
    const got=grid.some(row=>row.some((on,ci)=>on&&ci<len));
    if(had&&!got)grid=p.grid.map(row=>[...row]);
    return Object.assign({},p,{grid});
  }));}

  // ── Internal sampler ─────────────────────────────────────────────────
  // Load a named kit from DRUM_KITS. "synth" clears all samples; any other
  // id fetches + decodes each voice's audio file. Uses OfflineAudioContext so
  // kits can be pre-loaded before the user hits play (the live AudioContext
  // may not exist yet). Individual mic recordings are replaced entirely.
  const loadKit=async(kitId)=>{
    const kit=DRUM_KITS.find(k=>k.id===kitId);
    if(!kit)return;
    setKitLoading(true);
    if(!kit.samples){
      // Sample-less kit (USER). Restore the user's OWN recorded buffers (kept in
      // userSamples across kit switches); voices without a recording fall back
      // to the synth. The sampling interface (only on this kit) records more.
      setVoiceSamples({...userSamplesR.current});
      setActiveKit(kit.id);
      setKitLoading(false);
      showFlash(kit.label);
      return;
    }
    const newSamples={};
    const errors=[];
    // Prefer the live AudioContext so buffers are engine-compatible; fall back
    // to an OfflineAudioContext for pre-loading before play.
    const ctx=bell.current?.ctx||drumEngine.current?.ctx||new OfflineAudioContext(1,1,44100);
    const decode=async(url)=>{
      const res=await fetch(url);
      if(!res.ok)throw new Error(res.statusText);
      return ctx.decodeAudioData(await res.arrayBuffer());
    };
    // A voice spec is a URL string (single one-shot), {rr:[urls]} (round-robin
    // — random pick per hit), or {vel:[urls]} (velocity layers, soft→hard).
    await Promise.all(Object.entries(kit.samples).map(async([voiceKey,spec])=>{
      try{
        if(typeof spec==="string"){ newSamples[voiceKey]=await decode(spec); }
        else if(spec&&spec.rr){ newSamples[voiceKey]={rr:await Promise.all(spec.rr.map(decode))}; }
        else if(spec&&spec.vel){ newSamples[voiceKey]={vel:await Promise.all(spec.vel.map(decode))}; }
      }catch(e){
        errors.push(voiceKey);
        console.warn("Kit sample load failed:",voiceKey,e);
      }
    }));
    setVoiceSamples(newSamples);
    setActiveKit(kitId);
    setKitLoading(false);
    showFlash(errors.length?`${kit.label} (${errors.length} MISSING)`:kit.label);
  };
  // Decode a project's saved user samples (base64 WAV) back into AudioBuffers
  // and restore the persistent userSamples map. If the project's kit is USER,
  // also push them live so they sound immediately. Called by every load path.
  const restoreUserSamples=(s)=>{
    const sj=s&&s.userSamples;
    const kitId=(s&&DRUM_KITS.find(k=>k.id===s.activeKit))?s.activeKit:DEFAULT_KIT;
    if(!sj||typeof sj!=="object"||!Object.keys(sj).length){
      setUserSamples({});userSamplesR.current={};
      if(kitId==="user")setVoiceSamples({}); // clear any prior project's USER samples
      return;
    }
    const ctx=(bell.current&&bell.current.ctx)||(drumEngine.current&&drumEngine.current.ctx)||new OfflineAudioContext(1,1,44100);
    (async()=>{
      const decoded={};
      await Promise.all(Object.entries(sj).map(async([k,b64])=>{
        try{decoded[k]=await ctx.decodeAudioData(base64ToAb(b64));}catch(e){console.warn("user sample decode failed",k,e);}
      }));
      setUserSamples(decoded);userSamplesR.current=decoded;
      if(kitId==="user")setVoiceSamples(decoded); // USER kit → play them now
    })();
  };

  // Capture mic audio via MediaRecorder, decode into an AudioBuffer, and
  // store it per drum voice. Drum playback paths read voiceSamplesR.current
  // and substitute the sample for the synthesized voice when present.
  // Sampler: auto-arm on onset, auto-stop on silence. The recorder doesn't
  // start capturing until the input level crosses ONSET_THRESH — so the
  // resulting sample begins at the first transient, not from a silent lead-in.
  // Silence for SILENCE_HOLD_MS after recording starts ends the capture.
  const startRecord=async(voiceKey)=>{
    if(recordingVoice)return; // serialize — one voice at a time
    if(!navigator.mediaDevices||!navigator.mediaDevices.getUserMedia||typeof MediaRecorder==="undefined"){
      showFlash("MIC UNSUPPORTED");return;
    }
    const ONSET_THRESH=0.08;     // peak deviation from center (0..1)
    const SILENCE_THRESH=0.025;
    const SILENCE_HOLD_MS=300;
    const ARM_TIMEOUT_MS=10000;  // if no onset in 10s, bail out
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      recordStreamRef.current=stream;
      const ctx=(bell.current&&bell.current.ctx)||(drumEngine.current&&drumEngine.current.ctx);
      if(!ctx){
        stream.getTracks().forEach(t=>t.stop());recordStreamRef.current=null;
        showFlash("AUDIO INIT");return;
      }
      const source=ctx.createMediaStreamSource(stream);
      const analyser=ctx.createAnalyser();analyser.fftSize=512;source.connect(analyser);
      const buf=new Uint8Array(analyser.fftSize);
      let recorder=null;let chunks=[];
      let armed=true;let silentSince=null;let stopped=false;
      const armedStart=performance.now();
      const finishWith=async()=>{
        stopped=true;
        try{
          if(chunks.length){
            const blob=new Blob(chunks,{type:(recorder&&recorder.mimeType)||"audio/webm"});
            const ab=await blob.arrayBuffer();
            const audioBuf=await ctx.decodeAudioData(ab);
            // Store in BOTH the live map and the persistent user-kit map so the
            // recording survives kit switches and is saved with the project.
            setVoiceSamples(prev=>({...prev,[voiceKey]:audioBuf}));
            setUserSamples(prev=>({...prev,[voiceKey]:audioBuf}));
            showFlash("REC OK "+voiceKey);
          }
        }catch(err){console.error("Sample decode failed:",err);showFlash("DECODE FAIL");}
        if(recordStreamRef.current){recordStreamRef.current.getTracks().forEach(t=>t.stop());recordStreamRef.current=null;}
        recorderRef.current=null;
        setRecordingVoice(null);
      };
      const tick=()=>{
        if(stopped)return;
        analyser.getByteTimeDomainData(buf);
        let peak=0;
        for(let i=0;i<buf.length;i++){const v=Math.abs(buf[i]-128)/128;if(v>peak)peak=v;}
        const now=performance.now();
        if(armed){
          if(now-armedStart>ARM_TIMEOUT_MS){
            // Timed out waiting for onset
            stopped=true;
            if(recordStreamRef.current){recordStreamRef.current.getTracks().forEach(t=>t.stop());recordStreamRef.current=null;}
            recorderRef.current=null;
            setRecordingVoice(null);
            showFlash("NO INPUT");
            return;
          }
          if(peak>ONSET_THRESH){
            recorder=new MediaRecorder(stream);
            recorder.ondataavailable=e=>{if(e.data&&e.data.size>0)chunks.push(e.data);};
            recorder.onstop=finishWith;
            recorder.start();
            recorderRef.current=recorder;
            armed=false;silentSince=null;
          }
        } else {
          if(peak<SILENCE_THRESH){
            if(silentSince==null)silentSince=now;
            else if(now-silentSince>SILENCE_HOLD_MS){
              if(recorder&&recorder.state==="recording")recorder.stop();
              return;
            }
          } else silentSince=null;
        }
        if(typeof requestAnimationFrame!=="undefined")requestAnimationFrame(tick);
        else setTimeout(tick,30);
      };
      setRecordingVoice(voiceKey);
      if(typeof requestAnimationFrame!=="undefined")requestAnimationFrame(tick);
      else setTimeout(tick,30);
    }catch(err){
      console.error("Mic denied:",err);
      showFlash("MIC DENIED");
      setRecordingVoice(null);
    }
  };
  const stopRecord=()=>{
    const r=recorderRef.current;
    if(r&&r.state==="recording"){r.stop();return;}
    // Armed-but-not-recording (waiting for onset). Tear everything down.
    if(recordStreamRef.current){recordStreamRef.current.getTracks().forEach(t=>t.stop());recordStreamRef.current=null;}
    recorderRef.current=null;
    setRecordingVoice(null);
  };
  const clearVoiceSample=(voiceKey)=>{
    setVoiceSamples(prev=>{const o={...prev};delete o[voiceKey];return o;});
    setUserSamples(prev=>{const o={...prev};delete o[voiceKey];return o;});
  };
  const dupDrumPat=()=>{
    if(drumPats.length>=8)return;
    const src=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
    const d=Object.assign({},mkDrumPat(pickSym(drumPats.map(p=>p.name))),{
      grid:src.grid.map(r=>[...r]),vel:toDrumVel2D(src.vel),rat:toDrumRat2D(src.rat),gridLen:src.gridLen,
      mix:(src.mix||defaultDrumMix()).map(m=>({...m})),
      motion:src.motion?JSON.parse(JSON.stringify(src.motion)):undefined,
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
  // ID-targeted drum delete — needed for drag-off-layer-to-delete since the
  // dragged pat isn't necessarily the active one. Also strips the id from
  // the songMatrix.drums lane so deleted pats don't leave dangling refs.
  const delDrumPatId=(id)=>{
    if(drumPats.length<=1)return;
    pushHistory();
    const rem=drumPats.filter(p=>p.id!==id);
    setDrumPats(rem);
    setDrumChain(c=>c.filter(x=>x!==id));
    setActiveDrumId(a=>a===id?rem[0].id:a);
    setSongMatrix(m=>({...m,drums:m.drums.map(v=>v===id?null:v)}));
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
        vel:toDrumVel2D(drumClipboard.vel),rat:toDrumRat2D(drumClipboard.rat),gridLen:drumClipboard.gridLen,
        mix:(drumClipboard.mix||defaultDrumMix()).map(m=>({...m})),
        motion:drumClipboard.motion?JSON.parse(JSON.stringify(drumClipboard.motion)):undefined
      });
    }));
  };
  const setDrumVary=(key,val)=>setDrumPats(ps=>ps.map(p=>p.id!==activeDrumId?p:Object.assign({},p,{[key]:val})));
  const addDrumPat=()=>{pushHistory();
    if(drumPats.length>=8)return;
    const d=mkDrumPat(pickSym(drumPats.map(p=>p.name)));
    setDrumPats(ps=>[...ps,d]);
    setActiveDrumId(d.id);
  };
    const setStepParam=(col,key,val)=>{setFollowSeq(false);setPats(ps=>ps.map(p=>{
    if(p.id!==activeId)return p;
    const params=(p.params||defaultStepParams()).map((sp,i)=>i===col?Object.assign({},sp,{[key]:val}):sp);
    return Object.assign({},p,{params});
  }));};
  const randStepLane=(key)=>{pushHistory();setFollowSeq(false);
    const lane=LANES.find(l=>l.key===key);if(!lane)return;
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeId)return p;
      const params=(p.params||defaultStepParams()).map(sp=>Object.assign({},sp,{[key]:Math.round(lane.min+Math.random()*(lane.max-lane.min))}));
      return Object.assign({},p,{params});
    }));
  };
  const randStepAll=()=>LANES.forEach(l=>randStepLane(l.key));
  const resetStepLane=(key)=>{pushHistory();setFollowSeq(false);
    const lane=LANES.find(l=>l.key===key);if(!lane)return;
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeId)return p;
      const params=(p.params||defaultStepParams()).map(sp=>Object.assign({},sp,{[key]:lane.def}));
      return Object.assign({},p,{params});
    }));
  };
  const resetStepAll=()=>setPats(ps=>ps.map(p=>p.id!==activeId?p:Object.assign({},p,{params:defaultStepParams()})));
  // Double-click on any lane cell at column c resets ALL lane values for that
  // step back to their defaults (one row of defaultStepParams). Faster than
  // pulling each lane down individually when a step has accumulated edits.
  const resetStepCol=(col)=>{
    pushHistory();setFollowSeq(false);
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeId)return p;
      const dflt=defaultStepParams()[0];
      const params=(p.params||defaultStepParams()).map((sp,i)=>i===col?Object.assign({},dflt):sp);
      return Object.assign({},p,{params});
    }));
  };
  const removeFromChain=i=>setChain(c=>c.filter((_,idx)=>idx!==i));
  const moveSlot=(i,dir)=>{const j=i+dir;if(j<0||j>=chain.length)return;setChain(c=>{const n=[...c];[n[i],n[j]]=[n[j],n[i]];return n;});};

  // BPM drag scrubber
  const [bpmDragging, setBpmDragging] = useState(false);
  const bpmDragRef  = useRef(null);
  const bpmDragData = useRef({lastY:0, val:120});

  const bpmDraggingR = useRef(false);
  const handleBpmDown = useCallback(e=>{
    e.preventDefault();e.stopPropagation();
    if(isDoubleTap(e)){setBpm(120);return;}
    bpmDragData.current = {lastY: e.clientY, val: bpmR.current};
    bpmDraggingR.current=true;setBpmDragging(true);
    bpmDragRef.current.setPointerCapture(e.pointerId);
  },[]);
  const handleBpmMove = useCallback(e=>{
    if(!bpmDraggingR.current)return;
    e.preventDefault();e.stopPropagation();
    const d=bpmDragData.current;
    const dy = e.clientY - d.lastY; d.lastY=e.clientY;
    d.val = Math.max(40, Math.min(300, d.val - ballisticNudge(dy,0.5)));
    setBpm(Math.round(d.val));
  },[]);
  const handleBpmUp = useCallback(()=>{bpmDraggingR.current=false;setBpmDragging(false);},[]);

  const [stDragging, setStDragging] = useState(false);
  const stDragRef  = useRef(null);
  const stDragData = useRef({lastY:0, val:0});
  const stDraggingR = useRef(false);

  const handleStDown = useCallback(e=>{
    e.preventDefault();e.stopPropagation();
    if(isDoubleTap(e)){setTranspose(0);return;}
    stDragData.current = {lastY: e.clientY, val: transpR.current};
    stDraggingR.current=true;setStDragging(true);
    stDragRef.current.setPointerCapture(e.pointerId);
  },[]);
  const handleStMove = useCallback(e=>{
    if(!stDraggingR.current)return;
    e.preventDefault();e.stopPropagation();
    const d=stDragData.current;
    const dy = e.clientY - d.lastY; d.lastY=e.clientY;
    d.val = Math.max(-24, Math.min(24, d.val - ballisticNudge(dy,1/6)));
    setTranspose(Math.round(d.val));
  },[]);
  const handleStUp = useCallback(()=>{stDraggingR.current=false;setStDragging(false);},[]);

  const [swingDragging, setSwingDragging] = useState(false);
  const swingDragRef  = useRef(null);
  const swingDragData = useRef({lastY:0, val:0});
  const swingDraggingR = useRef(false);
  const handleSwingDown = useCallback(e=>{
    e.preventDefault();e.stopPropagation();
    if(isDoubleTap(e)){setSwing(0);return;}
    swingDragData.current = {lastY: e.clientY, val: swingR.current};
    swingDraggingR.current=true;setSwingDragging(true);
    swingDragRef.current.setPointerCapture(e.pointerId);
  },[]);
  const handleSwingMove = useCallback(e=>{
    if(!swingDraggingR.current)return;
    e.preventDefault();e.stopPropagation();
    const d=swingDragData.current;
    const dy = e.clientY - d.lastY; d.lastY=e.clientY;
    d.val = Math.max(0, Math.min(100, d.val - ballisticNudge(dy,1/3)));
    setSwing(Math.round(d.val));
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

  // Per-pattern speed: the SPEED selector reads/writes the active pat's
  // speedMult so each pattern can have its own playback rate. Falls back to
  // the legacy global speedMult when the pat is missing the field.
  const activePatForSpeed = activeLayer==="drums"
    ? drumPats.find(x=>x.id===activeDrumId)
    : pats.find(x=>x.id===activeId);
  const activePatSpeed = activePatForSpeed?.speedMult ?? speedMult;
  const setActivePatSpeed = (mult)=>{
    if(activeLayer==="drums") setDrumPats(ps=>ps.map(p=>p.id!==activeDrumId?p:Object.assign({},p,{speedMult:mult})));
    else setPats(ps=>ps.map(p=>p.id!==activeId?p:Object.assign({},p,{speedMult:mult})));
  };
  // VARY is per-layer; these drive the global indicators (tab tint, mobile
  // chip). anyVary = at least one layer on; activeVary = the layer the user
  // is currently looking at.
  const anyVary = varyMode.synth||varyMode.lead||varyMode.drums;
  const activeVary = !!varyMode[activeLayer];

  // ── GLOBAL FX panel ──────────────────────────────────────────────────────
  // The reverb and delay *design* params. These are global
  // (shared by every layer); each layer's SOUND page only carries its own SEND
  // amount into the reverb/delay buses. Rendered identically on the desktop FX
  // tab and the mobile FX sheet.
  const globalFxSections = (<>
    <SynthSection title="DELAY" accent={C_DLY}>
      <div style={{padding:"4px 12px 10px",display:"flex",flexDirection:"column",gap:6}}>
        <KnobSlider label="TIME"   value={dlyIdx}    min={0} max={DLY_NOTES.length-1} def={3} onChange={setDlyIdx}    display={DLY_NOTES[dlyIdx].label} accent={C_DLY}/>
        <KnobSlider label="FDBK"   value={dlyFbPct}  min={0} max={95}                 def={45} onChange={setDlyFbPct}  display={dlyFbPct+"%"}            accent={C_DLY}/>
        <KnobSlider label="HP"     value={dlyHpVal}  min={0} max={100}                def={8} onChange={setDlyHpVal}  display={hpLbl(dlyHpVal)}         accent={C_DLY}/>
        <KnobSlider label="LP"     value={dlyLpVal}  min={0} max={100}                def={78} onChange={setDlyLpVal}  display={lpLbl(dlyLpVal)}         accent={C_DLY}/>
        <KnobSlider label="→ REV"  value={dlyToRev}  min={0} max={100}                onChange={setDlyToRev}  display={dlyToRev+"%"}            accent={C_DLY}/>
      </div>
    </SynthSection>
    <SynthSection title="REVERB" accent={C_REV}>
      <div style={{padding:"4px 12px 10px",display:"flex",flexDirection:"column",gap:6}}>
        <KnobSlider label="SIZE"    value={rvSize}     min={0} max={100} def={50} onChange={setRvSize}     display={rvSize+"%"}      accent={C_REV}/>
        <KnobSlider label="PRE"     value={rvPreDelay} min={0} max={250} onChange={setRvPreDelay} display={rvPreDelay+"ms"} accent={C_REV}/>
        {/* HF DAMP: slider position is openness (right=bright=0 damp, left=dark=100 damp). */}
        <KnobSlider label="HF DAMP" value={100-rvDamp} min={0} max={100} def={60} onChange={v=>setRvDamp(100-v)} display={fmtHz(rvHfHz(rvDamp))} accent={C_REV}/>
        <KnobSlider label="LF DAMP" value={rvLfDamp}   min={0} max={100} onChange={setRvLfDamp}   display={fmtHz(rvLfHz(rvLfDamp))} accent={C_REV}/>
      </div>
    </SynthSection>
  </>);

  return(
    <div style={S.root} onContextMenu={e=>e.preventDefault()} onDragStart={e=>e.preventDefault()}>
      <style>{CSS}</style>

      {/* MP3 share prompt (mobile) — appears after a bounce so the SHARE tap is a
          fresh user gesture (required by navigator.share). */}
      {/* MP3 bounce lock — a dimmed (not opaque) scrim that captures every pointer
          event so controls can't be touched mid-bounce, with a centered status
          card + realtime progress. The app stays visible behind it so it's clear
          what's happening. */}
      {exporting&&(
        <div
          style={{position:"fixed",inset:0,zIndex:10001,display:"flex",alignItems:"center",justifyContent:"center",background:"rgba(12,10,8,0.62)",backdropFilter:"blur(2px)",WebkitBackdropFilter:"blur(2px)",touchAction:"none"}}
          onPointerDown={e=>{e.preventDefault();e.stopPropagation();}}
          onPointerMove={e=>{e.preventDefault();e.stopPropagation();}}
          onClick={e=>{e.preventDefault();e.stopPropagation();}}
          onWheel={e=>e.preventDefault()}>
          <div style={{width:"min(86vw,340px)",background:"rgba(26,24,20,0.98)",border:"1px solid rgba(196,168,130,0.45)",borderRadius:16,boxShadow:"0 10px 40px rgba(0,0,0,0.7)",padding:"22px 22px 20px",textAlign:"center"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:9,marginBottom:6}}>
              <span style={{width:11,height:11,borderRadius:"50%",background:"#e0705f",boxShadow:"0 0 10px #e0705f"}}/>
              <span style={{fontSize:13,letterSpacing:3,fontWeight:700,color:"rgba(232,224,213,0.95)"}}>BOUNCING MP3</span>
            </div>
            <div style={{fontSize:10,letterSpacing:1.5,color:"rgba(210,195,175,0.55)",marginBottom:16}}>{(exportPhase||"Preparing")+(exportLoops>1?" · "+exportLoops+" passes":"")}</div>
            <div style={{height:7,background:"rgba(220,200,180,0.1)",borderRadius:4,overflow:"hidden",marginBottom:14}}>
              <div style={{height:"100%",width:Math.round(exportProgress*100)+"%",background:"linear-gradient(90deg,#c4a070,#e0a050)",borderRadius:4,transition:"width .15s linear"}}/>
            </div>
            <div style={{fontSize:9,letterSpacing:0.5,color:"rgba(210,195,175,0.4)",lineHeight:1.5}}>Recording in real time — keep this screen open.<br/>Controls are locked until it finishes.</div>
          </div>
        </div>
      )}

      {shareFile&&(
        <div style={{position:"fixed",left:0,right:0,bottom:0,zIndex:9999,display:"flex",justifyContent:"center",pointerEvents:"none"}}>
          <div style={{margin:"0 0 96px",display:"flex",alignItems:"center",gap:10,padding:"10px 12px",borderRadius:14,background:"rgba(24,22,18,0.97)",border:"1px solid rgba(168,197,160,0.4)",boxShadow:"0 6px 28px rgba(0,0,0,0.6)",pointerEvents:"auto"}}>
            <span style={{fontSize:10,letterSpacing:1,color:"rgba(210,195,175,0.5)",fontWeight:600}}>MP3 READY</span>
            <button onClick={async()=>{const f=shareFile;try{await navigator.share({files:[f],title:"Tabula",text:"Tabula sketch"});setShareFile(null);}catch(e){if(!(e&&e.name==="AbortError")){downloadBlob(f,"tabula-song.mp3","audio/mpeg");setShareFile(null);}}}}
              style={{padding:"10px 18px",borderRadius:10,border:"1px solid #a8c5a0",background:"rgba(168,197,160,0.18)",color:"#cfe3c8",fontSize:13,fontWeight:700,letterSpacing:1,cursor:"pointer",fontFamily:"inherit"}}>↗ SHARE</button>
            <button onClick={()=>setShareFile(null)}
              style={{padding:"10px 12px",borderRadius:10,border:"1px solid rgba(200,185,165,0.25)",background:"transparent",color:"rgba(210,195,175,0.6)",fontSize:13,cursor:"pointer",fontFamily:"inherit"}}>✕</button>
          </div>
        </div>
      )}

      {/* One-time fullscreen nudge (iOS, in-browser only). */}
      {installHint&&(
        <div style={{position:"fixed",left:8,right:8,bottom:8,zIndex:9998,display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:12,background:"rgba(24,22,18,0.98)",border:"1px solid rgba(200,185,165,0.25)",boxShadow:"0 6px 28px rgba(0,0,0,0.6)"}}>
          <span style={{flex:1,fontSize:11,lineHeight:1.35,color:"rgba(210,195,175,0.8)"}}>For fullscreen: <b style={{color:"#c4a882"}}>Share ▸ Add to Home Screen</b>, then open Tabula from your home screen.</span>
          <button onClick={()=>{try{localStorage.setItem("tabula-nohint","1");}catch(e){}setInstallHint(false);}}
            style={{padding:"7px 12px",borderRadius:9,border:"1px solid rgba(200,185,165,0.3)",background:"rgba(200,185,165,0.08)",color:"rgba(220,205,180,0.9)",fontSize:11,fontWeight:600,letterSpacing:0.5,cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>Got it</button>
        </div>
      )}

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
                  <div key={arm.key} style={{marginBottom:8,touchAction:"none"}}
                    onPointerDown={e=>{
                      e.stopPropagation();
                      if(isDoubleTap(e)){setParamPopup(p=>p?{...p,activeArm:arm.key,values:{...p.values,[arm.key]:arm.def}}:p);return;}
                      const dim=e.currentTarget.getBoundingClientRect().width;
                      const range=arm.max-arm.min;
                      let cur=val, lx=e.clientX;
                      setParamPopup(p=>p?{...p,activeArm:arm.key}:p);
                      const update=ev=>{
                        const pd=ev.clientX-lx; lx=ev.clientX;
                        cur=Math.max(arm.min,Math.min(arm.max,cur+ballisticDelta(pd,dim,range)));
                        const nv=Math.round(cur);
                        setParamPopup(p=>p?{...p,activeArm:arm.key,values:{...p.values,[arm.key]:nv}}:p);
                      };
                      const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};
                      document.addEventListener("pointermove",update);
                      document.addEventListener("pointerup",up);
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
                  ["MUT8",  ()=>act(mutatePat1)],
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
              {/* Global TEMPO / PITCH / SWING — vertical drag scrubbers, mirror
                  the mobile widgets. SPEED moved out of here because it's per-
                  pattern; these three actually are global, so they own this slot. */}
              <div style={{display:"flex",gap:3,marginBottom:winW>900?8:4}}>
                <div ref={bpmDragRef} style={{...S.bpmDragTarget,flex:1,padding:winW>900?"6px 4px":"4px 2px",minWidth:0}} onPointerDown={handleBpmDown} onPointerMove={handleBpmMove} onPointerUp={handleBpmUp} onPointerCancel={handleBpmUp}>
                  <span style={{fontSize:winW>900?16:13,fontWeight:700,display:"block",lineHeight:1.05}}>{bpm}</span>
                  <span style={{fontSize:winW>900?9:7,color:"rgba(210,195,175,0.35)",letterSpacing:1,display:"block"}}>BPM</span>
                </div>
                <div ref={stDragRef} style={{...S.bpmDragTarget,flex:1,padding:winW>900?"6px 4px":"4px 2px",minWidth:0}} onPointerDown={handleStDown} onPointerMove={handleStMove} onPointerUp={handleStUp} onPointerCancel={handleStUp}>
                  <span style={{fontSize:winW>900?16:13,fontWeight:700,display:"block",lineHeight:1.05}}>{stLabel}</span>
                  <span style={{fontSize:winW>900?9:7,color:"rgba(210,195,175,0.35)",letterSpacing:1,display:"block"}}>ST</span>
                </div>
                <div ref={swingDragRef} style={{...S.bpmDragTarget,flex:1,padding:winW>900?"6px 4px":"4px 2px",minWidth:0}} onPointerDown={handleSwingDown} onPointerMove={handleSwingMove} onPointerUp={handleSwingUp} onPointerCancel={handleSwingUp}>
                  <span style={{fontSize:winW>900?16:13,fontWeight:700,display:"block",lineHeight:1.05}}>{swing}</span>
                  <span style={{fontSize:winW>900?9:7,color:"rgba(210,195,175,0.35)",letterSpacing:1,display:"block"}}>SWG</span>
                </div>
              </div>
            </>
          )}

          {/* Layer boxes — select layer + pattern, replaces old pills + layer selector */}
          {!IS_MOBILE&&(
            <div style={{flexShrink:0,borderTop:"1px solid rgba(200,185,165,0.08)",paddingTop:6,marginBottom:6,display:"flex",flexDirection:"column",gap:4}}>
              {/* POLY / MONO layer boxes — non-active layers read pats from layerStoreR */}
              {[
                ["synth","POLY","#a8c5a0","168,197,160"],
                ["lead", "MONO","#6c9ad6","108,154,214"]
              ].map(([layer,label,accent,accentRgb])=>{
                const isActive=activeLayer===layer;
                const layerPats=isActive?pats:(layerStoreR.current[layer]?.pats||[]);
                const layerActiveId=isActive?activeId:layerStoreR.current[layer]?.activeId;
                return(
                  <div key={layer} data-layer-box={layer} style={{border:"1px solid "+(patternDrag?.overLayerBox===layer?`rgba(${accentRgb},0.85)`:isActive?`rgba(${accentRgb},0.55)`:"rgba(200,185,165,0.1)"),borderRadius:8,padding:"5px 6px",cursor:"pointer",background:patternDrag?.overLayerBox===layer?`rgba(${accentRgb},0.18)`:isActive?`rgba(${accentRgb},0.06)`:"transparent",transition:"all .1s"}}
                    onClick={()=>{
                      // Clicking an already-active layer jumps into its sound page
                      // (mirrors mobile). Clicking a different one just switches.
                      if(songView){setSongView(false);setPage("sound");return;}
                      if(isActive){setPage("sound");}
                      else{switchLayer(layer);}
                    }}>
                    <div style={{fontSize:7,letterSpacing:2,color:isActive?`rgba(${accentRgb},0.6)`:"rgba(210,195,175,0.25)",fontWeight:500,marginBottom:4}}>{label}</div>
                    <div style={{display:"flex",flexWrap:"wrap",gap:3,alignItems:"center"}}>
                      {layerPats.map((p)=>{
                        const isA=p.id===layerActiveId&&isActive;
                        const isP=playing&&isActive&&playId===p.id;
                        const isDragging=patternDrag&&patternDrag.patId===p.id;
                        return(
                          <div key={p.id} style={{padding:"3px 9px",borderRadius:20,border:"1.5px solid "+accent,background:isA?accent:"transparent",color:isA?"#1a1814":accent,fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",gap:3,boxShadow:isP&&!isA?"0 0 10px "+accent+"88":"none",touchAction:"none",opacity:isDragging?0.4:1}}
                            onClick={e=>e.stopPropagation()}
                            onPointerDown={e=>{
                              e.stopPropagation();
                              const startX=e.clientX,startY=e.clientY,pointerId=e.pointerId,target=e.currentTarget;
                              let dragging=false;
                              const dragLayer=layer;
                              const onMove=(ev)=>{
                                if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                                if(!dragging){
                                  if(Math.abs(ev.clientX-startX)<4&&Math.abs(ev.clientY-startY)<4)return;
                                  dragging=true;
                                  try{target.setPointerCapture(pointerId);}catch(_){}
                                  setPatternDrag({patId:p.id,name:p.name,accent,x:ev.clientX,y:ev.clientY,overDrop:false,overSongCell:null,overLayerBox:null});
                                }
                                const el=document.elementFromPoint(ev.clientX,ev.clientY);
                                let overSongCell=null;
                                if(songView){
                                  const cell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                                  if(cell&&cell.dataset.songLayer===dragLayer){
                                    overSongCell={layer:cell.dataset.songLayer,barIdx:parseInt(cell.dataset.songBar,10)};
                                  }
                                }
                                // Cross-layer drop target — synth-type only, different from source.
                                let overLayerBox=null;
                                const boxEl=el&&el.closest&&el.closest('[data-layer-box]');
                                if(boxEl){
                                  const tl=boxEl.dataset.layerBox;
                                  if(SYNTH_LAYERS.indexOf(tl)>=0&&tl!==dragLayer)overLayerBox=tl;
                                }
                                setPatternDrag(d=>d?{...d,x:ev.clientX,y:ev.clientY,overSongCell,overLayerBox}:null);
                              };
                              const onUp=(ev)=>{
                                if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                                document.removeEventListener("pointermove",onMove);
                                document.removeEventListener("pointerup",onUp);
                                document.removeEventListener("pointercancel",onUp);
                                try{target.releasePointerCapture(pointerId);}catch(_){}
                                if(!dragging){
                                  // Clicking an already-active pattern jumps into edit
                                  // (mirrors mobile). New layer / new pattern: switch + activate.
                                  const wasActivePattern=isActive&&activeId===p.id;
                                  if(!isActive)switchLayer(dragLayer);
                                  setActiveId(p.id);
                                  if(songView){setSongView(false);setPage("edit");}
                                  else if(wasActivePattern){setPage("edit");}
                                  return;
                                }
                                const el=document.elementFromPoint(ev.clientX,ev.clientY);
                                // Drop on song-matrix cell (same-layer only)
                                if(songView){
                                  const cell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                                  if(cell&&cell.dataset.songLayer===dragLayer){
                                    const barIdx=parseInt(cell.dataset.songBar,10);
                                    pushHistory();
                                    setSongMatrix(m=>{const r=[...m[dragLayer]];r[barIdx]=p.id;return{...m,[dragLayer]:r};});
                                    setPatternDrag(null);
                                    return;
                                  }
                                }
                                // Drop on a layer box — cross-layer copy if different layer, cancel if same.
                                const boxEl=el&&el.closest&&el.closest('[data-layer-box]');
                                if(boxEl){
                                  const tl=boxEl.dataset.layerBox;
                                  if(SYNTH_LAYERS.indexOf(tl)>=0&&tl!==dragLayer){
                                    // Cross-layer copy. POLY → MONO culls to monophonic.
                                    const targetData=layerStoreR.current[tl]||{pats:[],activeId:null};
                                    const targetPats=targetData.pats||[];
                                    if(targetPats.length<8){
                                      pushHistory();
                                      const srcGrid=p.grid.map(r=>[...r]);
                                      const srcDurs=p.durs?p.durs.map(r=>[...r]):mkDurs();
                                      const culled=tl==="lead"?cullPatToMono(srcGrid,srcDurs):{grid:srcGrid,durs:srcDurs};
                                      const newPat=Object.assign({},mkPat(symPat(targetPats.length)),{
                                        grid:culled.grid,
                                        durs:culled.durs,
                                        params:(p.params||defaultStepParams()).map(s=>Object.assign({},s)),
                                        gridLen:p.gridLen??16
                                      });
                                      layerStoreR.current[tl]={...targetData,pats:[...targetPats,newPat],activeId:newPat.id};
                                      switchLayer(tl);
                                    }
                                  }
                                  // Dropping on ANY layer box (including the source) is a cancel,
                                  // not a delete. Only truly off-canvas drops delete.
                                  setPatternDrag(null);
                                  return;
                                }
                                // Dropped outside any valid target — delete the pattern.
                                delPatInLayer(dragLayer,p.id);
                                setPatternDrag(null);
                              };
                              document.addEventListener("pointermove",onMove);
                              document.addEventListener("pointerup",onUp);
                              document.addEventListener("pointercancel",onUp);
                            }}>
                            {isP&&!isA&&<span style={{fontSize:6,opacity:0.7}}>●</span>}{p.name}
                          </div>
                        );
                      })}
                      {isActive&&layerPats.length<8&&<button style={{padding:"3px 7px",borderRadius:20,border:"1px dashed rgba("+accentRgb+",0.3)",background:"transparent",color:"rgba("+accentRgb+",0.4)",fontSize:12,lineHeight:1,cursor:"pointer",fontFamily:"inherit"}} onClick={e=>{e.stopPropagation();addPat();}}>＋</button>}
                    </div>
                  </div>
                );
              })}
              {/* DRUMS layer box */}
              <div style={{border:"1px solid "+(activeLayer==="drums"?"rgba(196,114,122,0.55)":"rgba(200,185,165,0.1)"),borderRadius:8,padding:"5px 6px",cursor:"pointer",background:activeLayer==="drums"?"rgba(196,114,122,0.06)":"transparent",transition:"all .1s"}}
                onClick={()=>{
                  // Stepping into DRUMS lands on the grid editor (the main drum
                  // workspace). The mixer / kit live on the SOUND tab; global FX
                  // on the FX tab. (POLY/MONO keep layer→sound since "sound" is
                  // their per-layer instrument; drums "sound" is the shared kit.)
                  if(activeLayer!=="drums")switchLayer("drums");
                  // Persist the current view (SOUND / VARY / EDIT) on layer select,
                  // exactly like POLY/MONO — only snap to the grid when coming from
                  // song view. STEP is hidden for drums, so the effect below falls
                  // a parked STEP page back to EDIT; every other page is kept.
                  if(songView){setSongView(false);setPage("edit");}
                }}>
                <div style={{fontSize:7,letterSpacing:2,color:activeLayer==="drums"?"rgba(196,114,122,0.6)":"rgba(210,195,175,0.25)",fontWeight:500,marginBottom:4}}>DRUMS</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:3,alignItems:"center"}}>
                  {drumPats.map((dp)=>{
                    const isA=dp.id===activeDrumId&&activeLayer==="drums";
                    // "Currently playing" highlight: song mode reads the matrix
                    // at the drum lane's current bar; otherwise the active pat
                    // is the one being fired by the scheduler.
                    const _playingDrumId=songMode?songMatrix.drums?.[songBarLayer.drums]:activeDrumId;
                    const isP=playing&&_playingDrumId===dp.id;
                    const isDragging=patternDrag&&patternDrag.patId===dp.id;
                    return(
                      <div key={dp.id} style={{padding:"3px 9px",borderRadius:20,border:"1.5px solid #c4727a",background:isA?"#c4727a":"transparent",color:isA?"#1a1814":"#c4727a",fontSize:10,fontWeight:700,letterSpacing:1,cursor:"pointer",userSelect:"none",display:"flex",alignItems:"center",gap:3,boxShadow:isP&&!isA?"0 0 10px #c4727a88":"none",touchAction:"none",opacity:isDragging?0.4:1}}
                        onClick={e=>e.stopPropagation()}
                        onPointerDown={e=>{
                          e.stopPropagation();
                          const startX=e.clientX,startY=e.clientY,pointerId=e.pointerId,target=e.currentTarget;
                          let dragging=false;
                          const onMove=(ev)=>{
                            if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                            if(!dragging){
                              if(Math.abs(ev.clientX-startX)<4&&Math.abs(ev.clientY-startY)<4)return;
                              dragging=true;
                              try{target.setPointerCapture(pointerId);}catch(_){}
                              setPatternDrag({patId:dp.id,name:dp.name,accent:"#c4727a",x:ev.clientX,y:ev.clientY,overDrop:false,overSongCell:null});
                            }
                            let overSongCell=null;
                            if(songView){
                              const el=document.elementFromPoint(ev.clientX,ev.clientY);
                              const cell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                              if(cell&&cell.dataset.songLayer==="drums"){
                                overSongCell={layer:"drums",barIdx:parseInt(cell.dataset.songBar,10)};
                              }
                            }
                            setPatternDrag(d=>d?{...d,x:ev.clientX,y:ev.clientY,overSongCell}:null);
                          };
                          const onUp=(ev)=>{
                            if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                            document.removeEventListener("pointermove",onMove);
                            document.removeEventListener("pointerup",onUp);
                            document.removeEventListener("pointercancel",onUp);
                            try{target.releasePointerCapture(pointerId);}catch(_){}
                            if(!dragging){
                              // Same rule as synth pillows: clicking the active drum
                              // pattern enters edit.
                              const wasActivePattern=activeLayer==="drums"&&activeDrumId===dp.id;
                              if(activeLayer!=="drums")switchLayer("drums");
                              setActiveDrumId(dp.id);
                              if(songView){setSongView(false);setPage("edit");}
                              else if(wasActivePattern){setPage("edit");}
                              return;
                            }
                            const el=document.elementFromPoint(ev.clientX,ev.clientY);
                            // Drop on drums song-matrix cell
                            if(songView){
                              const cell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                              if(cell&&cell.dataset.songLayer==="drums"){
                                const barIdx=parseInt(cell.dataset.songBar,10);
                                pushHistory();
                                setSongMatrix(m=>{const r=[...m.drums];r[barIdx]=dp.id;return{...m,drums:r};});
                                setPatternDrag(null);
                                return;
                              }
                            }
                            // Drop on a layer box — cancel (no cross-layer drum → synth or vice versa).
                            const boxEl=el&&el.closest&&el.closest('[data-layer-box]');
                            if(boxEl){setPatternDrag(null);return;}
                            // Dropped outside any valid target — delete this drum pattern.
                            delPatInLayer("drums",dp.id);
                            setPatternDrag(null);
                          };
                          document.addEventListener("pointermove",onMove);
                          document.addEventListener("pointerup",onUp);
                          document.addEventListener("pointercancel",onUp);
                        }}
                        onContextMenu={e=>{e.preventDefault();e.stopPropagation();setActiveDrumId(dp.id);setDrumMenu({id:dp.id,x:e.clientX,y:e.clientY});}}>
                        {isP&&<span style={{fontSize:6,opacity:0.7}}>●</span>}{dp.name}
                      </div>
                    );
                  })}
                  {drumPats.length<8&&<button style={{padding:"3px 7px",borderRadius:20,border:"1px dashed rgba(196,114,122,0.3)",background:"transparent",color:"rgba(196,114,122,0.4)",fontSize:12,lineHeight:1,cursor:"pointer",fontFamily:"inherit"}} onClick={e=>{e.stopPropagation();addDrumPat();}}>＋</button>}
                </div>
              </div>
              {/* Action buttons — context-sensitive to active layer.
                  SPEED selector sits inside this block because it's a per-pattern
                  control (writes to pat.speedMult); putting it here next to the
                  other pattern ops makes that scoping visible. */}
              {activeLayer!=="drums"&&(()=>{
                const targetId=activeId;const isOnlyPat=pats.length<=1;
                return(
                  <div style={{display:"flex",flexDirection:"column",gap:2}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:2}}>
                      {[["RAND",()=>randPatId(targetId),false,false],["CLR",()=>clearPatId(targetId),false,false],["MUT8",mutatePat1,false,false]].map(([l,f,d])=>(
                        <button key={l} style={{padding:"4px 0",border:"1px solid rgba(200,185,165,0.13)",borderRadius:5,background:"transparent",color:"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:"pointer",fontFamily:"inherit"}} onClick={f}>{l}</button>
                      ))}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2}}>
                      {[["CPY",()=>copyPatId(targetId),false,false],["PST",()=>pastePatId(targetId),!clipboard,false],["DUP",()=>dupPatId(targetId),pats.length>=8,false],["DEL",()=>delPatId(targetId),isOnlyPat,true]].map(([l,f,d,danger])=>(
                        <button key={l} disabled={!!d} style={{padding:"4px 0",border:"1px solid rgba(200,185,165,"+(d?"0.06":"0.13")+")",borderRadius:5,background:"transparent",color:d?"rgba(200,185,165,0.18)":danger?"#c47a7a":"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit"}} onClick={d?undefined:f}>{l}</button>
                      ))}
                    </div>
                    {/* Per-pattern SPEED selector */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:2,marginTop:2}}>
                      {SPEED_OPTS.map(({label,mult})=>(
                        <button key={label} style={Object.assign({},S.speedBtn,{padding:"4px 0",fontSize:8,minWidth:0},Math.abs(activePatSpeed-mult)<0.001?S.speedBtnOn:{})}
                          onClick={()=>setActivePatSpeed(mult)}>{label}</button>
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
                      {[["RAND",randDrumVel,false,false],["CLR",clearDrums,false,false],["MUT8",mutateDrumPat1,false,false]].map(([l,f,d])=>(
                        <button key={l} disabled={!!d} style={{padding:"4px 0",border:"1px solid rgba(200,185,165,"+(d?"0.04":"0.13")+")",borderRadius:5,background:"transparent",color:d?"rgba(200,185,165,0.15)":"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit"}} onClick={d?undefined:f}>{l}</button>
                      ))}
                    </div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2}}>
                      {[["CPY",copyDrumPatFn,false,false],["PST",pasteDrumPatFn,!drumClipboard,false],["DUP",dupDrumPat,drumPats.length>=8,false],["DEL",delDrumPat,isOnlyDrum,true]].map(([l,f,d,danger])=>(
                        <button key={l} disabled={!!d} style={{padding:"4px 0",border:"1px solid rgba(200,185,165,"+(d?"0.06":"0.13")+")",borderRadius:5,background:"transparent",color:d?"rgba(200,185,165,0.18)":danger?"#c47a7a":"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit"}} onClick={d?undefined:f}>{l}</button>
                      ))}
                    </div>
                    {/* Per-pattern SPEED selector — drums layer */}
                    <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:2,marginTop:2}}>
                      {SPEED_OPTS.map(({label,mult})=>(
                        <button key={label} style={Object.assign({},S.speedBtn,{padding:"4px 0",fontSize:8,minWidth:0},Math.abs(activePatSpeed-mult)<0.001?S.speedBtnOn:{})}
                          onClick={()=>setActivePatSpeed(mult)}>{label}</button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* SONG mode toggle — sits below the layer boxes */}
          {!IS_MOBILE&&(
            <div style={{flexShrink:0,borderTop:"1px solid rgba(200,185,165,0.08)",paddingTop:6,marginBottom:6}}>
              <button style={{width:"100%",padding:"8px 0",borderRadius:8,border:"1px solid "+(songView?"rgba(210,195,175,0.5)":songMode?"rgba(210,195,175,0.25)":"rgba(200,185,165,0.12)"),background:songView?"rgba(210,195,175,0.06)":"transparent",color:songView?"rgba(210,195,175,0.9)":songMode?"rgba(210,195,175,0.7)":"rgba(210,195,175,0.55)",fontSize:10,letterSpacing:2,fontWeight:600,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:6,transition:"all .12s"}}
                onClick={()=>{if(songView){setSongView(false);}else{setSongMode(true);setSongView(true);}}}>
                <span style={{fontSize:14,lineHeight:1}}>▦</span> SONG
              </button>
            </div>
          )}

          {/* MIXER — per-layer level balancing (poly/mono in layerParams.mix, drums global) */}
          {!IS_MOBILE&&(()=>{
            const polyMix=layerParams.synth?.mix??85;
            const monoMix=layerParams.lead?.mix??85;
            const setSynthMix=v=>setLayerParams(lps=>({...lps,synth:{...lps.synth,mix:v}}));
            const setLeadMix=v=>setLayerParams(lps=>({...lps,lead:{...lps.lead,mix:v}}));
            const toggleMute=key=>setTrackMute(t=>({...t,[key]:!t[key]}));
            const toggleSolo=key=>setTrackSolo(t=>({...t,[key]:!t[key]}));
            const msBtn=(label,active,color,onClick)=>(
              <button onClick={e=>{e.stopPropagation();onClick();}}
                style={{width:16,height:14,fontSize:7,fontWeight:700,letterSpacing:0,borderRadius:3,cursor:"pointer",fontFamily:"inherit",flexShrink:0,
                  border:"1px solid "+(active?color:"rgba(200,185,165,0.2)"),
                  background:active?color+"22":"transparent",
                  color:active?color:"rgba(210,195,175,0.45)"}}>{label}</button>
            );
            const fader=(label,val,color,onChange,layerKey)=>{
              const muted=!!trackMute[layerKey];
              const solo=!!trackSolo[layerKey];
              const anySolo=trackSolo.synth||trackSolo.lead||trackSolo.drums;
              const dim=muted||(anySolo&&!solo);
              return(
                <div style={{display:"flex",alignItems:"center",gap:4,opacity:dim?0.4:1}}>
                  <span style={{width:32,fontSize:8,letterSpacing:1.5,fontWeight:600,color,textAlign:"right",flexShrink:0}}>{label}</span>
                  <div style={{flex:1,height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"ew-resize",touchAction:"none"}}
                    onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){onChange(85);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));onChange(Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);}}
                    onDoubleClick={e=>{e.stopPropagation();onChange(85);}}>
                    <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${val}%`,background:color+"99",borderRadius:3,transition:"width .04s"}}/>
                    <div style={{position:"absolute",top:-3,bottom:-3,width:8,left:`calc(${val}% - 4px)`,background:"rgba(255,255,255,0.85)",borderRadius:2,boxShadow:"0 0 3px "+color+"88"}}/>
                  </div>
                  {msBtn("M",muted,"#c47a7a",()=>toggleMute(layerKey))}
                  {msBtn("S",solo,"#d4a850",()=>toggleSolo(layerKey))}
                </div>
              );
            };
            return(
              <div style={{flexShrink:0,borderTop:"1px solid rgba(200,185,165,0.08)",paddingTop:6,marginBottom:6,display:"flex",flexDirection:"column",gap:4}}>
                <div style={{fontSize:7,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500}}>MIX</div>
                {fader("POLY",polyMix,"#a8c5a0",setSynthMix,"synth")}
                {fader("MONO",monoMix,"#6c9ad6",setLeadMix,"lead")}
                {fader("DRUMS",drumLevel,"#c4727a",setDrumLevel,"drums")}
                {/* Output meters removed — a master limiter now prevents clipping,
                    so there's nothing for the user to watch for. */}
              </div>
            );
          })()}

          {/* Sequence/chain UI removed from desktop — SONG matrix replaces it */}
          {!IS_MOBILE&&<div style={{flex:1,minHeight:0}}/>}

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

                {/* NEW PROJECT — discards in-memory work and resets to defaults */}
                <button style={{width:"100%",padding:"7px 0",border:"1px solid rgba(122,170,150,0.4)",borderRadius:5,background:"transparent",color:"rgba(122,170,150,0.85)",fontSize:10,letterSpacing:2,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:6,transition:"all .12s"}} onClick={newProject}>＋ NEW PROJECT</button>
                {/* Slot grid: each slot is a column with label, SAVE, LOAD stacked */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6}}>
                  {SLOTS.map(slot=>{
                    const has=!!slotData[slot];
                    const isActive=activeSlot===slot;
                    const activeStyle=isActive?{border:"1px solid #c9a96e",background:"rgba(201,169,110,0.12)",color:"#c9a96e"}:{};
                    return(
                      <div key={slot} style={{display:"flex",flexDirection:"column",gap:3,alignItems:"stretch"}}>
                        <div style={{fontSize:9,letterSpacing:2,fontWeight:600,color:isActive?"#c9a96e":"rgba(210,195,175,0.55)",textAlign:"center",marginBottom:1}}>{slot}{has&&<span style={{...S.menuSlotDot,marginLeft:2}}>●</span>}</div>
                        <button style={Object.assign({},S.menuSlotBtn,{padding:"6px 0",fontSize:9,letterSpacing:1,fontWeight:600},activeStyle)} onClick={()=>saveSlot(slot)}>SAVE</button>
                        <button style={Object.assign({},S.menuSlotBtn,{padding:"6px 0",fontSize:9,letterSpacing:1,fontWeight:600},has?S.menuSlotBtnLit:{},activeStyle)} onClick={()=>loadSlot(slot)} disabled={!has}>LOAD</button>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div style={{marginBottom:6}}>
                <div style={S.menuSaveLabel}>SHARE</div>
                {shareFlash&&<div style={S.menuFlash}>{shareFlash}</div>}
                <div style={{display:"grid",gridTemplateColumns:winW>900?"repeat(3,1fr)":"repeat(auto-fill,minmax(36px,1fr))",gap:3}}>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:winW>900?"8px 0":"4px 0",fontSize:winW>900?9:7,minWidth:0})} onClick={copyShareLink}>{winW>650?"LINK":"LNK"}</button>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:winW>900?"8px 0":"4px 0",fontSize:winW>900?9:7,minWidth:0})} onClick={exportJSON}>{winW>650?"EXPORT":"EXP"}</button>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:winW>900?"8px 0":"4px 0",fontSize:winW>900?9:7,minWidth:0})} onClick={()=>importRef.current?.click()}>{winW>650?"IMPORT":"IMP"}</button>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:winW>900?"8px 0":"4px 0",fontSize:winW>900?9:7,minWidth:0})} onClick={exportMIDI}>MIDI</button>
                  <button style={Object.assign({},S.menuSlotBtn,{padding:winW>900?"8px 0":"4px 0",fontSize:winW>900?9:7,minWidth:0,opacity:exporting?0.5:1,cursor:exporting?"wait":"pointer"})} disabled={exporting} onClick={exportMP3}>{exporting?"…":"MP3"}</button>
                </div>
                {/* MP3 bounce length — how many passes through the song. */}
                <div style={{display:"flex",alignItems:"center",gap:3,marginTop:4}}>
                  <span style={{fontSize:7,letterSpacing:1,color:"rgba(210,195,175,0.35)",flexShrink:0}}>MP3 ×</span>
                  {[1,2,4,8].map(n=>(
                    <button key={n} onClick={()=>setExportLoops(n)} style={{flex:1,padding:"3px 0",fontSize:8,fontWeight:600,border:"1px solid "+(exportLoops===n?"rgba(200,185,165,0.5)":"rgba(200,185,165,0.12)"),background:exportLoops===n?"rgba(200,185,165,0.1)":"transparent",color:exportLoops===n?"rgba(232,224,213,0.9)":"rgba(210,195,175,0.4)",borderRadius:4,cursor:"pointer",fontFamily:"inherit"}}>{n}</button>
                  ))}
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
            {/* SONG matrix — 12×16, 4 row-groups × 3 layers (poly/mono/drums) × 16 bars */}
            {songView&&(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"6px 10px 6px",boxSizing:"border-box",gap:6}}>
                {/* SYNC|FREE (exclusive base) + RAND (additive). RAND over SYNC
                    cycles a random shared column each bar; RAND over FREE jumps
                    each layer to a random populated bar independently. */}
                <div style={{display:"flex",gap:4,flexShrink:0,alignSelf:"center",alignItems:"center"}}>
                  {[["sync","SYNC"],["free","FREE"]].map(([val,lbl])=>{
                    const sel=songSyncMode===val;
                    return(
                      <button key={lbl} onClick={()=>setSongSyncMode(val)}
                        style={{padding:"4px 14px",fontSize:9,letterSpacing:2,fontWeight:600,border:"1px solid "+(sel?"rgba(220,200,180,0.5)":"rgba(220,200,180,0.12)"),background:sel?"rgba(220,200,180,0.08)":"transparent",color:sel?"rgba(220,200,180,0.9)":"rgba(220,200,180,0.4)",borderRadius:4,cursor:"pointer",fontFamily:"inherit",lineHeight:1}}>
                        {lbl}
                      </button>
                    );
                  })}
                  <div style={{width:1,height:16,background:"rgba(220,200,180,0.15)",margin:"0 2px"}}/>
                  <button onClick={()=>setSongRandom(v=>!v)}
                    style={{padding:"4px 14px",fontSize:9,letterSpacing:2,fontWeight:600,border:"1px solid "+(songRandom?"#c9a96e":"rgba(220,200,180,0.12)"),background:songRandom?"rgba(201,169,110,0.12)":"transparent",color:songRandom?"#c9a96e":"rgba(220,200,180,0.4)",borderRadius:4,cursor:"pointer",fontFamily:"inherit",lineHeight:1}}>
                    RAND
                  </button>
                </div>
                <div style={{width:"min(100%,calc(100dvh - "+(isLandscape?56:175)+"px))",aspectRatio:"1",display:"flex",flexDirection:"column",flexShrink:0,gap:3}}>
                  {Array.from({length:4},(_,group)=>(
                    <div key={group} style={{flex:1,display:"flex",flexDirection:"column",gap:1}}>
                      {["synth","lead","drums"].map(layer=>{
                        const accent = layer==="synth"?"#a8c5a0":layer==="lead"?"#6c9ad6":"#c4727a";
                        const accentRgb = layer==="synth"?"168,197,160":layer==="lead"?"108,154,214":"196,114,122";
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
                              const isCursor = playing&&songView&&songBarLayer[layer]===barIdx;
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
                                           // Tap on filled cell → step into the pattern. Switch to the
                                           // cell's layer (if different), make this pat the active one,
                                           // exit song view, land on the edit page. Clearing a cell now
                                           // happens via drag-off-grid (handled below).
                                           if(layer!==activeLayer)switchLayer(layer);
                                           if(layer==="drums")setActiveDrumId(patId);
                                           else setActiveId(patId);
                                           setSongView(false);
                                           setPage("edit");
                                           return;
                                         }
                                         // drop logic — same-layer cell = move; off-grid = clear source cell.
                                         const el=document.elementFromPoint(ev.clientX,ev.clientY);
                                         const targetCell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                                         if(targetCell&&targetCell.dataset.songLayer===layer){
                                           const tBar=parseInt(targetCell.dataset.songBar,10);
                                           if(tBar!==barIdx){
                                             pushHistory();
                                             setSongMatrix(m=>{const r=[...m[layer]];r[tBar]=patId;r[barIdx]=null;return{...m,[layer]:r};});
                                           }
                                         } else {
                                           // Dropped outside the song grid (or on a different layer's cell)
                                           // → remove the pattern from this cell. The pattern itself stays in
                                           // the library; only the bar assignment goes away.
                                           pushHistory();
                                           setSongMatrix(m=>{const r=[...m[layer]];r[barIdx]=null;return{...m,[layer]:r};});
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
            {!songView&&(<>
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
                  // VARY visual feedback (synth/lead): the live varied grid for the
                  // active pattern while vary is on + playing. Drives the gold/dim
                  // overlay below; re-renders each step via `step`.
                  const vSGrid=(varyMode[activeLayer]&&playing&&activePat)?variedGrids.current.get(activePat.id):null;
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
                          const span=Math.max(1,activePat?.durs?.[r]?.[ci]??1);
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
                    {vSGrid&&Array.from({length:COLS},(_,c)=>{
                      if(c>=gridLen)return null;
                      const baseOn=activePat?activePat.grid[r][c]:false;
                      const vOn=!!(vSGrid[r]&&vSGrid[r][c]);
                      if(vOn===baseOn)return null;
                      const L=`calc(${c/COLS}*(100% + 2px))`;
                      const W=`calc(${1/COLS}*(100% + 2px) - 2px)`;
                      return vOn
                        ? <div key={"va"+c} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:2,border:"1.5px solid "+C_VARY,boxShadow:"0 0 5px "+C_VARY+"aa",pointerEvents:"none"}}/>
                        : <div key={"vd"+c} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:2,background:"rgba(20,16,12,0.5)",pointerEvents:"none"}}/>;
                    })}
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
              // VARY visual feedback: while vary.drums is on AND playing, read the
              // live varied grid so the editor animates the variation (gold ring on
              // added hits, dim on dropped). Re-renders each step via drumStep.
              const dVaryShow=varyMode.drums&&playing;
              const vGridD=dVaryShow?variedDrumGrids.current.get(dPat.id):null;
              return(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:4}}>
                {/* (RAND/CLR live in the action row — no duplicate header here.) */}
                {/* Grid — voice labels are transparent overlays inside each row.
                    Tap a cell to toggle; click-and-drag vertically on a cell to
                    set its per-cell velocity (drag up = louder). Brightness of a
                    lit cell reflects its velocity. */}
                <div style={{width:dw||"80%",height:dh||"auto",flexShrink:0,display:"flex",flexDirection:"column",gap:2}}>
                  {DRUM_VOICES.map((voice,r)=>{
                    const dc=drumColor(r,linkHat,linkTom);
                    return(
                    <div key={voice.key} style={{flex:1,display:"flex",gap:2,position:"relative"}}>
                      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"space-around",pointerEvents:"none",zIndex:2,fontSize:10,fontWeight:700,color:dc,opacity:0.22,letterSpacing:1}}>{[0,1,2,3].map(i=><span key={i}>{voice.full||voice.label}</span>)}</div>
                      {Array.from({length:COLS},(_,c)=>{
                        const on=dPat?.grid[r]?.[c]||false;
                        const cv=(dPat&&dPat.vel&&dPat.vel[r]&&dPat.vel[r][c]!=null)?dPat.vel[r][c]:100;
                        const rt=(dPat&&dPat.rat&&dPat.rat[r]&&dPat.rat[r][c]!=null)?dPat.rat[r][c]:1;
                        const isActive=playing&&c===drumStep;
                        const inactive=c>=dLen;
                        const isQ=c%4===0;
                        // VARY overlay: gold ring where the live variation ADDED a
                        // hit, dim where it DROPPED one. Base grid stays editable.
                        const varOn=vGridD?!!(vGridD[r]&&vGridD[r][c]):on;
                        const vAdd=vGridD&&varOn&&!on&&c<dLen, vDrop=vGridD&&!varOn&&on;
                        // Velocity → brightness via alpha on the voice color.
                        const aHex=Math.round((0.30+0.70*(cv/127))*255).toString(16).padStart(2,"0");
                        const onBg=isActive?"rgba(255,255,255,0.9)":dc+aHex;
                        return(
                          <div key={c} style={{flex:1,position:"relative",borderRadius:2,cursor:inactive?"default":"pointer",background:inactive?"rgba(220,200,180,0.02)":on?onBg:isActive?"rgba(220,200,180,0.15)":isQ?"rgba(220,200,180,0.06)":"rgba(220,200,180,0.03)",border:"1px solid "+(inactive?"rgba(220,200,180,0.04)":on?dc:isQ?"rgba(220,200,180,0.12)":"rgba(220,200,180,0.06)"),boxShadow:on&&isActive?"0 0 6px "+dc:"none",transition:"background .06s"}}
                            onPointerDown={e=>{
                              // Shift+drag → move the whole pattern (grid+vel+rat).
                              if(e.shiftKey){
                                e.preventDefault();e.stopPropagation();
                                const ge=e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                                const cw=ge.width/COLS||1,ch=ge.height/DRUM_ROWS||1,sx=e.clientX,sy=e.clientY;
                                const base={grid:dPat.grid.map(rw=>[...rw]),vel:toDrumVel2D(dPat.vel),rat:toDrumRat2D(dPat.rat),gridLen:dLen};
                                pushHistory();
                                const mv=ev=>applyDrumShift(Math.round((ev.clientX-sx)/cw),Math.round((ev.clientY-sy)/ch),base);
                                const up=()=>{document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};
                                document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
                                return;
                              }
                              e.stopPropagation();if(inactive)return;
                              // Ctrl/Cmd+click → cycle this cell's ratchet count.
                              if(e.ctrlKey||e.metaKey){e.preventDefault();pushHistory();cycleDrumRat(r,c);return;}
                              e.preventDefault();
                              // Gesture: horizontal drag = paint/erase a run of notes
                              // (like POLY/MONO); vertical drag = per-cell velocity;
                              // pure tap = toggle. paintVal is decided by the start
                              // cell (empty → paint on, lit → erase).
                              const ge=e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                              const cw=ge.width/COLS||1,chh=ge.height/DRUM_ROWS||1;
                              const startX=e.clientX,startY=e.clientY,wasOn=on,startVel=cv,paintVal=!wasOn;
                              let mode=null;const painted=new Set();
                              const paint=(rr,cc)=>{const k=rr+":"+cc;if(painted.has(k))return;painted.add(k);if(cc<dLen)setDrumCell(rr,cc,paintVal);};
                              pushHistory();
                              if(!wasOn){setDrumCell(r,c,true);painted.add(r+":"+c);}
                              const onMove=ev=>{
                                const dx=ev.clientX-startX,dy=startY-ev.clientY;
                                if(mode===null){
                                  if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>cw*0.5){mode="paint";paint(r,c);}
                                  else if(Math.abs(dy)>5){mode="vel";}
                                }
                                if(mode==="vel")setDrumVelCell(r,c,Math.max(1,Math.min(127,Math.round(startVel+dy))));
                                else if(mode==="paint"){
                                  const cc=Math.max(0,Math.min(COLS-1,Math.floor((ev.clientX-ge.left)/cw)));
                                  const rr=Math.max(0,Math.min(DRUM_ROWS-1,Math.floor((ev.clientY-ge.top)/chh)));
                                  paint(rr,cc);
                                }
                              };
                              const onUp=()=>{
                                document.removeEventListener("pointermove",onMove);document.removeEventListener("pointerup",onUp);document.removeEventListener("pointercancel",onUp);
                                if(mode===null&&wasOn)setDrumCell(r,c,false); // pure tap on existing note → clear
                              };
                              document.addEventListener("pointermove",onMove);document.addEventListener("pointerup",onUp);document.addEventListener("pointercancel",onUp);
                            }}>
                            {on&&rt>1&&Array.from({length:rt-1},(_,i)=>(
                              <div key={"r"+i} style={{position:"absolute",top:1,bottom:1,width:1,left:`${((i+1)/rt)*100}%`,background:"rgba(20,16,12,0.5)",pointerEvents:"none"}}/>
                            ))}
                            {vAdd&&<div style={{position:"absolute",inset:1,borderRadius:2,border:"1.5px solid "+C_VARY,boxShadow:"0 0 5px "+C_VARY+"aa",pointerEvents:"none"}}/>}
                            {vDrop&&<div style={{position:"absolute",inset:0,borderRadius:2,background:"rgba(20,16,12,0.5)",pointerEvents:"none"}}/>}
                          </div>
                        );
                      })}
                    </div>
                  )})}
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
              const mix=fillDrumMix(drumMix); // GLOBAL static mix (not per-pattern)
              return(
              <div style={{width:"100%",height:"100%",overflow:"hidden",padding:"12px 12px 8px",boxSizing:"border-box",display:"flex",flexDirection:"column"}}>
                {/* Kit selector — switch between curated sample packs or the synth engine */}
                <div style={{flexShrink:0,marginBottom:8}}>
                  <div style={{fontSize:7,letterSpacing:2,color:"rgba(210,195,175,0.3)",fontWeight:500,marginBottom:4}}>KIT</div>
                  <div style={{display:"flex",gap:3,flexWrap:"wrap"}}>
                    {DRUM_KITS.map(kit=>{
                      const on=activeKit===kit.id;
                      return(
                        <button key={kit.id} disabled={kitLoading}
                          onClick={()=>loadKit(kit.id)}
                          style={{padding:"3px 8px",borderRadius:4,border:"1px solid "+(on?"rgba(210,195,175,0.6)":"rgba(210,195,175,0.15)"),background:on?"rgba(210,195,175,0.1)":"transparent",color:on?"rgba(210,195,175,0.9)":"rgba(210,195,175,0.4)",fontSize:8,letterSpacing:1,fontWeight:on?700:400,cursor:kitLoading?"wait":"pointer",fontFamily:"inherit"}}>
                          {kitLoading&&on?"…":kit.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div style={{flexShrink:0,marginBottom:8,display:"flex",alignItems:"center",gap:6}}>
                  <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500}}>MIXER</div>
                  {/* Group-link toggles (defeatable). HH = all params; TOM = all but pan. */}
                  {[["HH",linkHat,setLinkHat],["TOM",linkTom,setLinkTom]].map(([lbl,on,set])=>(
                    <button key={lbl} onClick={()=>set(v=>!v)} title={"Link "+lbl+" channels"}
                      style={{padding:"3px 7px",borderRadius:4,fontSize:7,letterSpacing:0.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(on?"#7aaa96":"rgba(200,185,165,0.2)"),background:on?"rgba(122,170,150,0.14)":"transparent",color:on?"#9fcfb5":"rgba(210,195,175,0.4)"}}>{"⛓ "+lbl}</button>
                  ))}
                  <div style={{flex:1}}/>
                  {/* MOTION mode + record arm. In MOTION mode dragging a slider
                      is a live override; with REC armed during playback the hold
                      writes per-step automation. */}
                  <button onClick={()=>setMotionEnabled(v=>!v)}
                    style={{padding:"3px 9px",borderRadius:4,fontSize:8,letterSpacing:1,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(motionEnabled?"#c4727a":"rgba(200,185,165,0.2)"),background:motionEnabled?"rgba(196,114,122,0.16)":"transparent",color:motionEnabled?"#e0909a":"rgba(210,195,175,0.45)"}}>MOTION</button>
                  {motionEnabled&&(
                    <button onClick={()=>setMotionRec(v=>!v)}
                      style={{padding:"3px 9px",borderRadius:4,fontSize:8,letterSpacing:1,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(motionRec?"#e07060":"rgba(200,185,165,0.2)"),background:motionRec?"rgba(224,112,96,0.2)":"transparent",color:motionRec?"#ff8a78":"rgba(210,195,175,0.45)"}}>{motionRec?"● REC":"REC"}</button>
                  )}
                  {motionEnabled&&(
                    <button onClick={clearMotion}
                      style={{padding:"3px 9px",borderRadius:4,fontSize:8,letterSpacing:1,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"1px solid rgba(200,185,165,0.2)",background:"transparent",color:"rgba(210,195,175,0.45)"}}>CLR</button>
                  )}
                </div>
                {/* Channel strips — horizontal row of conventional vertical strips.
                    CH + OH are separate strips (each holds its own sample) but their
                    params are linked via setDrumMix. Toms link on level only. Layout
                    per strip: name → PITCH → FILT → SAT → ENV → PAN → REV → DLY →
                    fader → REC/CLR. */}
                <div style={{flex:1,display:"flex",gap:4,overflowX:"auto",overflowY:"hidden",alignItems:"stretch",paddingBottom:4}}>
                  {DRUM_VOICES.map((voice,r)=>{
                    const stripLabel=voice.full||voice.label;
                    const m=mix[r];
                    const md=effDispMix(dPat,r,m); // motion-aware display values
                    const stripBg="rgba(30,28,24,0.55)";
                    const dc=drumColor(r,linkHat,linkTom);
                    const cell={display:"flex",flexDirection:"column",alignItems:"center",gap:2};
                    // Horizontal mini-slider builder. Drag routes through onMixDrag
                    // (base edit, or motion override/record), onMixUp on release.
                    const miniSlider=(key,val,minVal,maxVal,bipolar)=>(
                      <div style={{width:"100%",height:5,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer",touchAction:"none"}}
                        onPointerDown={e=>{
                          e.stopPropagation();
                          const rect=e.currentTarget.getBoundingClientRect();
                          if(isDoubleTap(e)){onMixDrag(r,key,0);onMixUp(r,key);return;}
                          const dim=rect.width, range=maxVal-minVal; let cur=val, lx=e.clientX;
                          const update=ev=>{
                            const pd=ev.clientX-lx; lx=ev.clientX;
                            cur=Math.max(minVal,Math.min(maxVal,cur+ballisticDelta(pd,dim,range)));
                            onMixDrag(r,key,Math.round(cur));
                          };
                          const up=()=>{onMixUp(r,key);document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};
                          document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);
                        }}
                        onDoubleClick={()=>{onMixDrag(r,key,0);onMixUp(r,key);}}>
                        {bipolar&&<div style={{position:"absolute",left:"50%",top:-1,bottom:-1,width:1,background:"rgba(220,200,180,0.25)"}}/>}
                        {bipolar
                          ?<div style={{position:"absolute",top:0,bottom:0,left:val<=0?`${50+(val-minVal)/(maxVal-minVal)*100-50}%`:"50%",width:`${Math.abs(val)/(maxVal-minVal)*100}%`,background:dc+"99",borderRadius:3}}/>
                          :<div style={{position:"absolute",left:0,top:0,bottom:0,width:`${((val-minVal)/(maxVal-minVal))*100}%`,background:dc+"99",borderRadius:3}}/>}
                        <div style={{position:"absolute",top:-3,bottom:-3,width:8,
                          left:`calc(${((val-minVal)/(maxVal-minVal))*100}% - 4px)`,
                          background:"rgba(255,255,255,0.85)",borderRadius:2,boxShadow:"0 0 3px "+dc+"88"}}/>
                      </div>
                    );
                    const isRec=recordingVoice===voice.key;
                    const hasSample=!!voiceSamples[voice.key];
                    const filtMode=m.filt||"off";
                    const cycleFilt=()=>{const i=FILT_MODES.indexOf(filtMode);const nx=FILT_MODES[(i+1)%FILT_MODES.length];setDrumMix(r,"filt",nx);};
                    const filtColors={off:"rgba(200,185,165,0.3)",lp:"#7aaa96",hp:"#c4a070",bp:"#a890c0"};
                    return(
                      <div key={voice.key} style={{flexShrink:0,width:62,minWidth:62,display:"flex",flexDirection:"column",gap:5,padding:"6px 4px",background:stripBg,border:"1px solid "+dc+"22",borderRadius:4,boxSizing:"border-box",position:"relative",overflow:"hidden"}}>
                        {/* Hit flash — a uniform full-strip glow that pulses on
                            each hit, peak opacity scaling with velocity, then
                            fades. (Intensity, not height — a bottom-anchored
                            gradient read like the level fader moving.) */}
                        {drumFlash[r]&&(()=>{const fv=drumFlash[r];const a=Math.round((0.08+0.30*Math.max(0,Math.min(127,fv.vel))/127)*255).toString(16).padStart(2,"0");return(
                          <div key={fv.n} style={{position:"absolute",inset:0,background:dc+a,boxShadow:"inset 0 0 8px "+dc+a,pointerEvents:"none",borderRadius:4,animation:"dflash 240ms ease-out forwards"}}/>
                        );})()}
                        {/* Voice name */}
                        <div style={{fontSize:8,fontWeight:700,letterSpacing:1,color:dc,textAlign:"center",lineHeight:1.15,minHeight:12}}>{stripLabel}</div>
                        {/* PITCH (semitones, bipolar) */}
                        <div style={cell}>
                          <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>PITCH</div>
                          {miniSlider("pitch",md.pitch||0,-12,12,true)}
                          <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{(md.pitch||0)>0?"+"+md.pitch:(md.pitch||0)}</div>
                        </div>
                        {/* FILTER — type chip on its own row above, then a
                            full-width cutoff slider + numeric readout (matches the
                            PITCH/ENV cells; the chip no longer steals slider width). */}
                        <div style={cell}>
                          <button onClick={e=>{e.stopPropagation();cycleFilt();}}
                            style={{alignSelf:"flex-start",height:11,padding:"0 5px",fontSize:6,letterSpacing:0.5,fontWeight:700,borderRadius:2,cursor:"pointer",fontFamily:"inherit",
                              border:"1px solid "+(filtMode==="off"?"rgba(200,185,165,0.2)":filtColors[filtMode]),
                              background:filtMode==="off"?"transparent":filtColors[filtMode]+"22",
                              color:filtMode==="off"?"rgba(210,195,175,0.4)":filtColors[filtMode]}}>{"FILT "+filtMode.toUpperCase()}</button>
                          <div style={{width:"100%",opacity:filtMode==="off"?0.4:1}}>{miniSlider("filtCut",md.filtCut!=null?md.filtCut:100,0,100,false)}</div>
                          <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{vcfLbl(md.filtCut!=null?md.filtCut:100)}</div>
                        </div>
                        {/* ENV — sample playback length (full right = whole sample) */}
                        <div style={cell}>
                          <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>ENV</div>
                          {miniSlider("env",md.env!=null?md.env:100,0,100,false)}
                          <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{md.env!=null?md.env:100}</div>
                        </div>
                        {/* SAT — per-voice saturation/drive */}
                        <div style={cell}>
                          <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>SAT</div>
                          {miniSlider("sat",md.sat||0,0,100,false)}
                          <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{md.sat||0}</div>
                        </div>
                        {/* PAN */}
                        <div style={cell}>
                          <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>PAN</div>
                          {miniSlider("pan",md.pan,-100,100,true)}
                          <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{md.pan>0?"+"+md.pan:md.pan}</div>
                        </div>
                        {/* REV send */}
                        <div style={cell}>
                          <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>REV</div>
                          {miniSlider("rvSend",md.rvSend,0,100,false)}
                          <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{md.rvSend}</div>
                        </div>
                        {/* DLY send */}
                        <div style={cell}>
                          <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>DLY</div>
                          {miniSlider("dlySend",md.dlySend,0,100,false)}
                          <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{md.dlySend}</div>
                        </div>
                        {/* Vertical level fader */}
                        <div style={{flex:1,minHeight:60,position:"relative",background:"rgba(220,200,180,0.06)",borderRadius:3,cursor:"ns-resize",margin:"4px 12px 0",touchAction:"none"}}
                          onPointerDown={e=>{
                            e.stopPropagation();
                            const rect=e.currentTarget.getBoundingClientRect();
                            if(isDoubleTap(e)){onMixDrag(r,"level",100);onMixUp(r,"level");return;}
                            const dim=rect.height; let cur=md.level!=null?md.level:100, ly=e.clientY;
                            const update=ev=>{
                              const pd=ly-ev.clientY; ly=ev.clientY; // drag up = louder
                              cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));
                              onMixDrag(r,"level",Math.round(cur));
                            };
                            const up=()=>{onMixUp(r,"level");document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};
                            document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);
                          }}>
                          {/* Fill from bottom up */}
                          <div style={{position:"absolute",left:0,right:0,bottom:0,height:`${md.level}%`,background:"linear-gradient(to top,"+dc+"cc,"+dc+"66)",borderRadius:3}}/>
                          {/* Thumb */}
                          <div style={{position:"absolute",left:-4,right:-4,height:6,top:`calc(${100-md.level}% - 3px)`,background:"rgba(255,255,255,0.92)",borderRadius:2,boxShadow:"0 0 4px "+dc+"88"}}/>
                          {/* Center notch */}
                          <div style={{position:"absolute",left:0,right:0,top:"50%",height:1,background:"rgba(220,200,180,0.18)"}}/>
                        </div>
                        <div style={{fontSize:7,color:"rgba(210,195,175,0.6)",textAlign:"center",fontWeight:600}}>{md.level}</div>
                        {/* REC / sample — only on the USER kit (curated presets
                            don't expose the sampler). */}
                        {activeKit==="user"&&(
                        <div style={{display:"flex",gap:2,justifyContent:"center"}}>
                          <button style={{flex:1,padding:"3px 0",borderRadius:3,border:"1px solid "+(isRec?"#e07060":hasSample?dc+"99":"rgba(200,185,165,0.18)"),background:isRec?"rgba(224,112,96,0.18)":hasSample?dc+"22":"transparent",color:isRec?"#e07060":hasSample?dc:"rgba(200,185,165,0.6)",fontSize:7,letterSpacing:0.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                            onClick={()=>isRec?stopRecord():startRecord(voice.key)}>
                            {isRec?"STOP":hasSample?"●":"REC"}
                          </button>
                          {hasSample&&!isRec&&<button style={{padding:"3px 5px",borderRadius:3,border:"1px solid rgba(200,185,165,0.18)",background:"transparent",color:"rgba(200,185,165,0.5)",fontSize:7,letterSpacing:0.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>clearVoiceSample(voice.key)}>✕</button>}
                        </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
              );
            })()}

            {activeLayer==="drums"&&page==="vary"&&(()=>{
              const dPat=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
              const vRhythm=dPat?.vRhythm||0;
              const vVelocity=dPat?.vVelocity||0;
              const SliderRow=({label,value,onChange,accent})=>(
                <div style={{marginBottom:16}}>
                  <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:5}}>
                    <span style={{fontSize:9,letterSpacing:2,color:accent||"rgba(210,195,175,0.5)",fontWeight:500}}>{label}</span>
                    <span style={{fontSize:11,color:"rgba(210,195,175,0.7)",fontWeight:300,marginLeft:"auto"}}>{value}<span style={{fontSize:8,color:"rgba(210,195,175,0.35)",marginLeft:2}}>%</span></span>
                  </div>
                  <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"ew-resize",touchAction:"none"}}
                    onPointerDown={e=>{
                      e.stopPropagation();
                      const rect=e.currentTarget.getBoundingClientRect();
                      if(isDoubleTap(e)){onChange(0);return;}
                      const dim=rect.width;let cur=value,lx=e.clientX;
                      const upd=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));onChange(Math.round(cur));};
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
                  {/* VARY enable toggle — per layer; this page is DRUMS. */}
                  <button onClick={()=>setVaryMode(v=>({...v,drums:!v.drums}))}
                    style={{width:"100%",padding:"10px 14px",marginBottom:16,borderRadius:8,border:"1px solid "+(varyMode.drums?"#c9a96e":"rgba(200,185,165,0.18)"),background:varyMode.drums?"rgba(201,169,110,0.14)":"transparent",color:varyMode.drums?"#c9a96e":"rgba(210,195,175,0.55)",fontSize:10,letterSpacing:2.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                    <span style={{width:8,height:8,borderRadius:"50%",background:varyMode.drums?"#c9a96e":"rgba(210,195,175,0.25)",boxShadow:varyMode.drums?"0 0 6px #c9a96e":"none"}}/>
                    DRUMS VARY {varyMode.drums?"ON":"OFF"}
                  </button>
                  <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:16}}>DRUM VARY</div>
                  <div style={{padding:"14px 16px",background:"rgba(220,200,180,0.04)",borderRadius:8,border:"1px solid rgba(220,200,180,0.08)",marginBottom:8}}>
                    <div style={{fontSize:8,letterSpacing:1,color:"rgba(210,195,175,0.25)",marginBottom:12}}>Re-generates each loop while VARY is on.</div>
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
                    // Only FLT/OCT/GLIDE actually animate mid-note (Bell.play's mods array
                    // schedules cutoff/pitch/transition style). Everything else (VEL, DUR,
                    // DLY, REV, RHY) is locked at note-start, so on tied-note extension
                    // cells those lanes stay locked.
                    const isMidNote=lane.key==="flt"||lane.key==="oct"||lane.key==="glide";
                    const colHasNote=Array.from({length:COLS},(_,c)=>{
                      if(!activePat)return false;
                      if(!isMidNote){
                        for(let r=0;r<ROWS;r++) if(activePat.grid[r][c]) return true;
                        return false;
                      }
                      for(let r=0;r<ROWS;r++)for(let c2=0;c2<=c;c2++){
                        if(activePat.grid[r][c2]){
                          const span=Math.max(1,activePat.durs?.[r]?.[c2]??1);
                          if(c<c2+span) return true;
                        }
                      }
                      return false;
                    });
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
                          onChange={(col,val)=>setStepParam(col,lane.key,val)} onDragStart={pushHistory} onResetCol={resetStepCol}
                          tall/>
                      </div>
                    );
                  })}
                </div>
              )}
            {/* VARY page — was "SET", now includes an in-page enable toggle. */}
            {activeLayer!=="drums"&&page==="vary"&&(
              <div style={{height:"100%",minHeight:0,overflowY:"auto",padding:"8px 12px 40px"}}>
                {/* Enable / disable — per layer; this page is POLY or MONO. */}
                <button onClick={()=>setVaryMode(v=>({...v,[activeLayer]:!v[activeLayer]}))}
                  style={{width:"100%",padding:"10px 14px",marginBottom:10,borderRadius:8,border:"1px solid "+(varyMode[activeLayer]?C_VARY:"rgba(200,185,165,0.18)"),background:varyMode[activeLayer]?"rgba(201,169,110,0.14)":"transparent",color:varyMode[activeLayer]?C_VARY:"rgba(210,195,175,0.55)",fontSize:10,letterSpacing:2.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",display:"flex",alignItems:"center",justifyContent:"center",gap:8}}>
                  <span style={{width:8,height:8,borderRadius:"50%",background:varyMode[activeLayer]?C_VARY:"rgba(210,195,175,0.25)",boxShadow:varyMode[activeLayer]?"0 0 6px "+C_VARY:"none"}}/>
                  {activeLayer==="lead"?"MONO":"POLY"} VARY {varyMode[activeLayer]?"ON":"OFF"}
                </button>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8,alignItems:"start"}}>
                    <SynthSection title="RHYTHM VARY / MUT8" accent={C_VARY}>
                      <div style={{display:"flex",gap:12,padding:"8px 16px 10px",height:160,alignItems:"stretch"}}>
                        <KnobSlider vertical label="DROP"  value={vDropRate}  min={0} max={60} def={13} onChange={setVDropRate}  display={vDropRate+"%"}    accent={C_VARY}/>
                        <KnobSlider vertical label="SHIFT" value={vShiftRate} min={0} max={60} def={17} onChange={setVShiftRate} display={vShiftRate+"%"}   accent={C_VARY}/>
                        <KnobSlider vertical label="RANGE" value={vShiftRange}min={1} max={8}  onChange={setVShiftRange}display={vShiftRange+"st"} accent={C_VARY}/>
                      </div>
                    </SynthSection>
                    <SynthSection title="MELODY VARY / MUT8" accent={C_VARY}>
                      <div style={{display:"flex",gap:12,padding:"8px 16px 10px",height:160,alignItems:"stretch"}}>
                        <KnobSlider vertical label="PITCH" value={vPitchRate} min={0} max={60} onChange={setVPitchRate} display={vPitchRate+"%"}   accent={C_VARY}/>
                        <KnobSlider vertical label="RANGE" value={vPitchRange}min={1} max={12} onChange={setVPitchRange}display={vPitchRange+"st"} accent={C_VARY}/>
                        <KnobSlider vertical label="GHOST" value={vGhostRate} min={0} max={60} onChange={setVGhostRate} display={vGhostRate+"%"}   accent={C_VARY}/>
                      </div>
                    </SynthSection>
                    <SynthSection title="STEP VARY / MUT8" accent={C_VARY}>
                      <div style={{padding:"4px 12px 10px",display:"flex",flexDirection:"column",gap:6}}>
                        <KnobSlider label="VEL"   value={vVelJitter}   min={0} max={100} onChange={setVVelJitter}   display={vVelJitter+"%"}   accent={C_VARY}/>
                        <KnobSlider label="FLT"   value={vFltJitter}   min={0} max={100} onChange={setVFltJitter}   display={vFltJitter+"%"}   accent={C_VARY}/>
                        <KnobSlider label="DLY"   value={vDlyJitter}   min={0} max={100} onChange={setVDlyJitter}   display={vDlyJitter+"%"}   accent={C_VARY}/>
                        <KnobSlider label="RHY"   value={vRhyJitter}   min={0} max={100} onChange={setVRhyJitter}   display={vRhyJitter+"%"}   accent={C_VARY}/>
                        <KnobSlider label="OCT"   value={vOctJitter}   min={0} max={100} onChange={setVOctJitter}   display={vOctJitter+"%"}   accent={C_VARY}/>
                        <KnobSlider label="GLIDE" value={vGlideJitter} min={0} max={100} onChange={setVGlideJitter} display={vGlideJitter+"%"} accent={C_VARY}/>
                        <KnobSlider label="DUR"   value={vDurJitter}   min={0} max={100} onChange={setVDurJitter}   display={vDurJitter+"%"}   accent={C_VARY}/>
                      </div>
                    </SynthSection>
                </div>
              </div>
            )}
            {activeLayer!=="drums"&&page==="sound"&&(
              <div style={{height:"100%",minHeight:0,overflowY:"auto",padding:"8px 12px 40px"}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:8,alignItems:"start"}}>
                    <SynthSection title="OSCILLATOR" accent={C_OSC}>
                      <div style={{display:"flex",gap:10,padding:"8px 10px 10px",height:160,alignItems:"stretch",justifyContent:"center"}}>
                        {/* DETUNE and SPREAD are POLY-only — MONO is a single oscillator. */}
                        {activeLayer==="synth"&&(
                          <KnobSlider vertical label="DETUNE" value={detune} min={0} max={50} def={8} onChange={setDetune} display={detune+"¢"} accent={C_OSC}/>
                        )}
                        {activeLayer==="synth"&&(
                          <KnobSlider vertical label="SPREAD" value={spread} min={0} max={100} def={50} onChange={setSpread} display={spread+"%"} accent={C_OSC}/>
                        )}
                        {activeLayer==="lead"&&(
                          <KnobSlider vertical label="SUB" value={subLvl} min={0} max={100} def={50} onChange={setSubLvl} display={subLvl+"%"} accent={C_OSC}/>
                        )}
                        {activeLayer==="lead"&&(
                          <KnobSlider vertical label="GLIDE" value={glideLP} min={0} max={100} onChange={setGlideLP} display={glideLP+"%"} accent={C_OSC}/>
                        )}
                        {/* OSC velocity knob = global VCA velocity sensitivity. */}
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                          <KnobSlider vertical label="VEL" value={velAmp} min={0} max={100} def={100} onChange={setVelAmp} display={velAmp+"%"} accent={C_OSC}/>
                          <button onClick={()=>setVelAmpInv(!velAmpInv)} style={{padding:"2px 6px",fontSize:7,letterSpacing:1,fontWeight:600,border:"1px solid "+C_OSC+(velAmpInv?"":"22"),background:velAmpInv?C_OSC+"14":"transparent",color:velAmpInv?C_OSC:"rgba(210,195,175,0.4)",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>INV</button>
                        </div>
                        {/* Waveform buttons stacked vertically — centered, scale with card */}
                        <div style={{display:"flex",flexDirection:"column",gap:4,flex:"0 1 40%",minWidth:50,maxWidth:90}}>
                          {WAVEFORMS.map((w,i)=>(
                            <button key={w} style={Object.assign({},S.wfBtn,{flex:1,padding:"0",borderColor:C_OSC+(waveform===w?"":"22"),color:waveform===w?C_OSC:"rgba(210,195,175,0.35)",background:waveform===w?C_OSC+"14":"transparent"})} onClick={()=>setWaveform(w)}>
                              {WF_LABELS[i]}
                            </button>
                          ))}
                        </div>
                      </div>
                      {/* OCTAVE — per-layer transposition: -2..+2 */}
                      <div style={{padding:"0 12px 10px",display:"flex",alignItems:"center",gap:8}}>
                        <div style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.4)",minWidth:36}}>OCT</div>
                        <div style={{flex:1,display:"flex",gap:3}}>
                          {[-2,-1,0,1,2].map(o=>(
                            <button key={o} onClick={()=>setOctaveLP(o)}
                              style={{flex:1,height:26,padding:0,fontSize:11,fontWeight:600,border:"1px solid "+C_OSC+(octaveLP===o?"":"22"),background:octaveLP===o?C_OSC+"14":"transparent",color:octaveLP===o?C_OSC:"rgba(210,195,175,0.4)",borderRadius:4,cursor:"pointer",fontFamily:"inherit"}}>
                              {o>0?"+"+o:o}
                            </button>
                          ))}
                        </div>
                      </div>
                    </SynthSection>
                    <SynthSection title="ENV" accent={C_ENV}>
                      <div style={{display:"flex",gap:10,padding:"8px 12px 10px",height:160,alignItems:"stretch",justifyContent:"center"}}>
                        <KnobSlider vertical label="ATK" value={attack}  min={1}  max={2000} def={8} onChange={setAttack}  display={attack+"ms"}  accent={C_ENV}/>
                        <KnobSlider vertical label="DEC" value={decay}   min={10} max={4000} def={400} onChange={setDecay}   display={decay+"ms"}   accent={C_ENV}/>
                        <KnobSlider vertical label="SUS" value={sustain} min={0}  max={100}  def={40} onChange={setSustain} display={sustain+"%"}  accent={C_ENV}/>
                        {/* ENV velocity = scales decay/release time with velocity (low vel = shorter). */}
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                          <KnobSlider vertical label="VEL" value={velEnv} min={0} max={100} onChange={setVelEnv} display={velEnv+"%"} accent={C_ENV}/>
                          <button onClick={()=>setVelEnvInv(!velEnvInv)} style={{padding:"2px 6px",fontSize:7,letterSpacing:1,fontWeight:600,border:"1px solid "+C_ENV+(velEnvInv?"":"22"),background:velEnvInv?C_ENV+"14":"transparent",color:velEnvInv?C_ENV:"rgba(210,195,175,0.4)",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>INV</button>
                        </div>
                      </div>
                    </SynthSection>
                    <SynthSection title="FILTER" accent={C_FILT}>
                      <div style={{display:"flex",gap:10,padding:"8px 12px 10px",height:160,alignItems:"stretch",justifyContent:"center"}}>
                        <KnobSlider vertical label="CUT" value={vcfCutoff}    min={0} max={100} def={80} onChange={setVcfCutoff}    display={vcfLbl(vcfCutoff)} accent={C_FILT}/>
                        <KnobSlider vertical label="RES" value={vcfRes}       min={0} max={100} def={15} onChange={setVcfRes}       display={vcfRes+"%"}        accent={C_FILT}/>
                        <KnobSlider vertical label="ENV" value={filterEnvAmt} min={0} max={100} onChange={setFilterEnvAmt} display={filterEnvAmt+"%"}  accent={C_FILT}/>
                        {/* FILTER velocity = scales filter envelope amount with velocity. */}
                        <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                          <KnobSlider vertical label="VEL" value={velFlt} min={0} max={100} def={100} onChange={setVelFlt} display={velFlt+"%"} accent={C_FILT}/>
                          <button onClick={()=>setVelFltInv(!velFltInv)} style={{padding:"2px 6px",fontSize:7,letterSpacing:1,fontWeight:600,border:"1px solid "+C_FILT+(velFltInv?"":"22"),background:velFltInv?C_FILT+"14":"transparent",color:velFltInv?C_FILT:"rgba(210,195,175,0.4)",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>INV</button>
                        </div>
                      </div>
                    </SynthSection>
                    {/* Per-layer FX is just the SEND into the shared reverb/delay
                        buses. The bus design lives on the global FX tab. */}
                    <SynthSection title="DELAY" accent={C_DLY}>
                      <div style={{padding:"4px 12px 10px",display:"flex",flexDirection:"column",gap:6}}>
                        <KnobSlider label="SEND"   value={dlySend}   min={0} max={100} def={50} onChange={setDlySend}   display={dlySend+"%"} accent={C_DLY}/>
                        <div style={{fontSize:8,letterSpacing:1,color:"rgba(210,195,175,0.3)",textAlign:"center",paddingTop:2}}>design → FX tab</div>
                      </div>
                    </SynthSection>
                    <SynthSection title="REVERB" accent={C_REV}>
                      <div style={{padding:"4px 12px 10px",display:"flex",flexDirection:"column",gap:6}}>
                        <KnobSlider label="SEND"   value={rvSend}    min={0} max={100} def={30} onChange={setRvSend}    display={rvSend+"%"}  accent={C_REV}/>
                        <div style={{fontSize:8,letterSpacing:1,color:"rgba(210,195,175,0.3)",textAlign:"center",paddingTop:2}}>design → FX tab</div>
                      </div>
                    </SynthSection>
                </div>
              </div>
            )}
            {/* Global FX page — reverb / delay design. Same
                for every layer (these buses are shared), drums included. */}
            {page==="fx"&&(
              <div style={{height:"100%",minHeight:0,overflowY:"auto",padding:"8px 12px 40px"}}>
                <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:10}}>GLOBAL FX</div>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))",gap:8,alignItems:"start"}}>
                  {globalFxSections}
                </div>
              </div>
            )}
            </>)}
          </div>

          {/* Tabs — always visible. VARY replaces the old SET tab; SET's contents
              moved inside the VARY page along with an in-page enable toggle. */}
          <div style={{...S.tabs, flexShrink:0, paddingTop:8}}>
            {[["edit","EDIT"],...(activeLayer==="drums"?[]:[["step","STEP"]]),["sound","SOUND"],["fx","FX"],["vary","VARY"]].map(([p,lbl])=>(
              <button key={p} style={Object.assign({},S.tab,page===p?S.tabOn:{},p==="vary"&&activeVary?{color:C_VARY,borderColor:C_VARY}:{})} onClick={()=>{setPage(p);if(songView)setSongView(false);}}>{lbl}</button>
            ))}
          </div>
          {/* Transport — always visible, centered. VARY toggle removed; it lives
              inside the VARY page now (tab still glows orange while enabled). */}
          <div style={{flexShrink:0,display:"flex",gap:6,alignItems:"center",justifyContent:"center",paddingTop:8,borderTop:"1px solid rgba(200,185,165,0.08)"}}>
            <button style={Object.assign({},S.loopBtnBottom,{opacity:historyR.current.length?1:0.35})} onClick={undo} disabled={!historyR.current.length}>↶ UNDO</button>
            <button style={Object.assign({},S.loopBtnBottom,{opacity:redoR.current.length?1:0.35})} onClick={redo} disabled={!redoR.current.length}>↷ REDO</button>
            <button style={Object.assign({},S.playBtn,{width:44,height:44,fontSize:16},playing?S.playOn:{})} onClick={startStop}>{playing?<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><rect x="1" y="1" width="9" height="9" rx="1.5"/></svg>:<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><polygon points="1.5,0.5 10.5,5.5 1.5,10.5"/></svg>}</button>
            <button style={Object.assign({},S.loopBtnBottom,loopMode?S.loopOn:{})} onClick={()=>setLoopMode(l=>!l)}>LOOP</button>
            <button style={Object.assign({},S.loopBtnBottom,followSeq?{border:"1px solid #7aaa96",color:"#7aaa96",background:"rgba(122,170,150,0.12)"}:{})} onClick={()=>setFollowSeq(f=>!f)}>FOLLOW</button>
          </div>
        </div>
        {/* DRAG GHOST — floating pill that follows pointer (desktop) */}
        {patternDrag&&(
          <div style={{position:"fixed",left:patternDrag.x-24,top:patternDrag.y-14,zIndex:9999,pointerEvents:"none",padding:"4px 12px",borderRadius:20,border:"1.5px solid "+patternDrag.accent,background:patternDrag.accent,color:"#1a1814",fontSize:14,fontWeight:700,letterSpacing:1,boxShadow:"0 4px 20px rgba(0,0,0,0.5)",lineHeight:1,opacity:(patternDrag.overSongCell||patternDrag.overLayerBox)?1:0.85,transform:(patternDrag.overSongCell||patternDrag.overLayerBox)?"scale(1.1)":"scale(1)",transition:"transform 0.1s, opacity 0.1s"}}>
            {patternDrag.name}
          </div>
        )}
      </div>
      )} {/* end !IS_MOBILE desktop layout */}

      {/* ══ MOBILE LAYOUT ══ */}
      {IS_MOBILE&&(
        <div style={{position:"fixed",top:0,left:0,right:0,bottom:0,display:"flex",flexDirection:isLandscape?"row":"column",background:"#1a1814",overflow:"hidden",
            // Keep all content clear of the notch / Dynamic Island / home indicator
            // in the installed fullscreen app (viewport-fit=cover). Portrait: inset top;
            // landscape: inset whichever side the camera sits on. Bottom inset always.
            paddingTop:isLandscape?"env(safe-area-inset-top)":"env(safe-area-inset-top)",
            paddingBottom:"env(safe-area-inset-bottom)",
            paddingLeft:isLandscape?"env(safe-area-inset-left)":0,
            paddingRight:isLandscape?"env(safe-area-inset-right)":0,
            boxSizing:"border-box"}}>

          {/* ══ LANDSCAPE LEFT RAIL — layer + pattern selection ══ */}
          {isLandscape&&(
            <div style={{width:74,flexShrink:0,display:"flex",flexDirection:"column",gap:6,padding:"8px 6px",borderRight:"1px solid rgba(255,255,255,0.07)",background:"rgba(24,22,18,0.6)",overflow:"hidden",boxSizing:"content-box"}}>
              {[["synth","POLY","#a8c5a0","rgba(168,197,160,"],["lead","MONO","#6c9ad6","rgba(108,154,214,"],["drums","DRUMS","#c4727a","rgba(196,114,122,"]].map(([lyr,lbl,c,cf])=>(
                <button key={lyr} data-layer-box={lyr} style={{flexShrink:0,padding:"8px 0",border:"1px solid "+(patternDrag?.overLayerBox===lyr?c+"FF":activeLayer===lyr?c+"99":cf+"0.15)"),borderRadius:8,background:activeLayer===lyr?cf+"0.1)":"transparent",color:activeLayer===lyr?c:cf+"0.4)",fontSize:8,letterSpacing:1,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                  onClick={()=>{ if(activeLayer===lyr){setActiveSheet(s=>s==="sound"?null:"sound");}else{switchLayer(lyr);} }}>{lbl}</button>
              ))}
              <div style={{height:1,background:"rgba(255,255,255,0.07)",flexShrink:0,margin:"1px 0"}}/>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:5,overflowY:"auto",overflowX:"hidden",touchAction:"pan-y"}}>
                {(activeLayer==="drums"?drumPats:pats).map(p=>{
                  const isDrums=activeLayer==="drums";const isSynth=!isDrums;
                  const isA=isDrums?p.id===activeDrumId:p.id===activeId;
                  const accent=activeLayer==="synth"?"#a8c5a0":activeLayer==="lead"?"#6c9ad6":"#c4727a";
                  return(
                    <button key={p.id} style={{flexShrink:0,padding:"9px 4px",borderRadius:14,border:"1.5px solid "+accent,background:isA?accent:"transparent",color:isA?"#1a1814":accent,fontSize:13,fontWeight:700,letterSpacing:1,cursor:"pointer",fontFamily:"inherit",lineHeight:1}}
                      onClick={()=>{
                        const wasActive=isSynth?activeId===p.id:activeDrumId===p.id;
                        if(songView){ if(!wasActive)isSynth?setActiveId(p.id):setActiveDrumId(p.id); setSongView(false); setActiveSheet(null); }
                        else if(wasActive){ setSeqPage("step"); setActiveSheet(s=>s==="pattern"?null:"pattern"); }
                        else { isSynth?setActiveId(p.id):setActiveDrumId(p.id); setActiveSheet(null); }
                      }}>{p.name}</button>
                  );
                })}
                {(activeLayer==="drums"?drumPats:pats).length<8&&<button style={{flexShrink:0,padding:"7px 4px",borderRadius:14,border:"1px dashed "+(activeLayer==="synth"?"rgba(168,197,160,0.35)":activeLayer==="lead"?"rgba(108,154,214,0.35)":"rgba(196,114,122,0.35)"),background:"transparent",color:activeLayer==="synth"?"rgba(168,197,160,0.45)":activeLayer==="lead"?"rgba(108,154,214,0.45)":"rgba(196,114,122,0.45)",fontSize:12,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>{activeLayer==="drums"?addDrumPat():addPat();}}>＋</button>}
              </div>
              {/* per-layer function pills — STEP / SOUND / VARY */}
              <div style={{height:1,background:"rgba(255,255,255,0.07)",flexShrink:0,margin:"1px 0"}}/>
              {[["step","STEP",activeSheet==="pattern"],["sound","SOUND",activeSheet==="sound"],["vary","VARY",activeSheet==="vary"||activeVary]].map(([key,lbl,on])=>(
                <button key={key} onClick={()=>{ if(key==="step"){setSeqPage("step");setActiveSheet(s=>s==="pattern"?null:"pattern");} else setActiveSheet(s=>s===key?null:key); }}
                  style={{flexShrink:0,padding:"7px 0",borderRadius:8,fontFamily:"inherit",cursor:"pointer",fontSize:9,fontWeight:700,letterSpacing:1.5,
                    border:"1px solid "+(on?(key==="vary"?"rgba(201,169,110,0.6)":"rgba(200,185,165,0.5)"):"rgba(200,185,165,0.14)"),
                    background:on?(key==="vary"?"rgba(201,169,110,0.12)":"rgba(200,185,165,0.1)"):"transparent",
                    color:on?(key==="vary"?"#c9a96e":"rgba(232,224,213,0.9)"):"rgba(210,195,175,0.5)"}}>
                  {lbl}
                </button>
              ))}
            </div>
          )}

          {/* ══ CENTER COLUMN — the grid lives here in both orientations ══ */}
          <div style={{flex:1,minWidth:0,display:"flex",flexDirection:"column",overflow:"hidden"}}>

          {/* ── TABULA BRANDING ── */}
          {!isLandscape&&(
          <div style={{display:"flex",alignItems:"center",justifyContent:"center",padding:"10px 16px 4px",flexShrink:0}}>
            <span style={{fontFamily:"'DM Sans',sans-serif",fontSize:18,fontWeight:300,letterSpacing:6,color:"rgba(210,195,175,0.7)",textTransform:"uppercase"}}>Tabula</span>
          </div>
          )}

          {/* ── PERSISTENT LAYER BAR — top of screen (portrait) ── */}
          {!isLandscape&&(
          <div style={{display:"flex",gap:6,padding:"8px 12px 6px",flexShrink:0}}>
            {[["synth","POLY","#a8c5a0","rgba(168,197,160,"],["lead","MONO","#6c9ad6","rgba(108,154,214,"],["drums","DRUMS","#c4727a","rgba(196,114,122,"]].map(([lyr,lbl,c,cf])=>(
              <button key={lyr} data-layer-box={lyr} style={{flex:1,padding:"7px 0",border:"1px solid "+(patternDrag?.overLayerBox===lyr?c+"FF)":activeLayer===lyr?c+"99)":cf+"0.15)"),borderRadius:8,background:patternDrag?.overLayerBox===lyr?cf+"0.18)":activeLayer===lyr?cf+"0.1)":"transparent",color:activeLayer===lyr?c:cf+"0.4)",fontSize:8,letterSpacing:1.2,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                onClick={()=>{
                  if(activeLayer===lyr){
                    // already on this layer — step into its sound page
                    setActiveSheet(s=>s==="sound"?null:"sound");
                  }else{
                    switchLayer(lyr);
                  }
                }}>
                {lbl}
              </button>
            ))}
          </div>
          )}
          {/* ── PERSISTENT PATTERN PILLS — tap to select, drag to phrase or song-matrix cell (portrait) ── */}
          {!isLandscape&&(
          <div style={{display:"flex",gap:5,flexWrap:"wrap",flexShrink:0,padding:"4px 12px 6px",alignItems:"center",touchAction:"none"}}>
            {(activeLayer==="drums"?drumPats:pats).map(p=>{
              const isDrums=activeLayer==="drums";
              const isSynth=!isDrums; // any synth-type layer
              const isA=isDrums?p.id===activeDrumId:p.id===activeId;
              const isP=playing&&(isSynth&&activeLayer==="synth"?playId===p.id:false);
              const accent=activeLayer==="synth"?"#a8c5a0":activeLayer==="lead"?"#6c9ad6":"#c4727a";
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
                      const el=document.elementFromPoint(ev.clientX,ev.clientY);
                      // hit-test song-matrix cells (only valid if cell.layer === dragLayer)
                      let overSongCell=null;
                      if(songView){
                        const cell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                        if(cell&&cell.dataset.songLayer===dragLayer){
                          overSongCell={layer:cell.dataset.songLayer,barIdx:parseInt(cell.dataset.songBar,10)};
                        }
                      }
                      // hit-test mobile layer bar — cross-layer drag between synth-type layers
                      let overLayerBox=null;
                      const boxEl=el&&el.closest&&el.closest('[data-layer-box]');
                      if(boxEl){
                        const tl=boxEl.dataset.layerBox;
                        if(SYNTH_LAYERS.indexOf(tl)>=0&&SYNTH_LAYERS.indexOf(dragLayer)>=0&&tl!==dragLayer)overLayerBox=tl;
                      }
                      setPatternDrag(d=>d?{...d,x:ev.clientX,y:ev.clientY,overDrop,overSongCell,overLayerBox}:null);
                    };
                    const onUp=(ev)=>{
                      if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                      document.removeEventListener("pointermove",onMove);
                      document.removeEventListener("pointerup",onUp);
                      document.removeEventListener("pointercancel",onUp);
                      try{target.releasePointerCapture(pointerId);}catch(_){}
                      if(!dragging){
                        const wasActive = isSynth ? activeId===p.id : activeDrumId===p.id;
                        if(songView){
                          // Song view: tap = leave view, show pattern's note grid.
                          // songMode (playback source) is unchanged — matrix keeps driving playback.
                          if(!wasActive) isSynth?setActiveId(p.id):setActiveDrumId(p.id);
                          setSongView(false);
                          setActiveSheet(null);
                        }else if(wasActive){
                          // Already on this pattern's grid: tap opens drawer
                          setSeqPage("step");
                          setActiveSheet(s=>s==="pattern"?null:"pattern");
                        }else{
                          // Different pattern: just activate it
                          isSynth?setActiveId(p.id):setActiveDrumId(p.id);
                          setActiveSheet(null);
                        }
                        return;
                      }
                      const el=document.elementFromPoint(ev.clientX,ev.clientY);
                      // Drop on song-matrix cell — same-layer only
                      if(songView){
                        const cell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                        if(cell&&cell.dataset.songLayer===dragLayer){
                          const barIdx=parseInt(cell.dataset.songBar,10);
                          pushHistory();
                          setSongMatrix(m=>{const r=[...m[dragLayer]];r[barIdx]=p.id;return{...m,[dragLayer]:r};});
                          setPatternDrag(null);
                          return;
                        }
                      }
                      // Drop on a layer button — cross-layer copy if different synth-type; cancel otherwise.
                      // Mobile mono-cull mirrors the desktop drop rule.
                      const boxEl=el&&el.closest&&el.closest('[data-layer-box]');
                      if(boxEl){
                        const tl=boxEl.dataset.layerBox;
                        if(SYNTH_LAYERS.indexOf(tl)>=0&&SYNTH_LAYERS.indexOf(dragLayer)>=0&&tl!==dragLayer){
                          const targetData=layerStoreR.current[tl]||{pats:[],activeId:null};
                          const targetPats=targetData.pats||[];
                          if(targetPats.length<8){
                            pushHistory();
                            const srcGrid=p.grid.map(r=>[...r]);
                            const srcDurs=p.durs?p.durs.map(r=>[...r]):mkDurs();
                            const culled=tl==="lead"?cullPatToMono(srcGrid,srcDurs):{grid:srcGrid,durs:srcDurs};
                            const newPat=Object.assign({},mkPat(symPat(targetPats.length)),{
                              grid:culled.grid,
                              durs:culled.durs,
                              params:(p.params||defaultStepParams()).map(s=>Object.assign({},s)),
                              gridLen:p.gridLen??16,
                              speedMult:p.speedMult??1,
                            });
                            layerStoreR.current[tl]={...targetData,pats:[...targetPats,newPat],activeId:newPat.id};
                            switchLayer(tl);
                            setActiveSheet(null);
                            setPatternDrag(null);
                            return;
                          }
                        }
                        // Layer-bar drop (any direction) is a cancel — not a delete.
                        setPatternDrag(null);
                        return;
                      }
                      // Drop on phrase chain — append to active phrase.
                      if(phraseDropRef.current){
                        const rect=phraseDropRef.current.getBoundingClientRect();
                        if(ev.clientY>=rect.top&&ev.clientY<=rect.bottom&&ev.clientX>=rect.left&&ev.clientX<=rect.right){
                          pushHistory();
                          if(isSynth)setSynthPhrases(ps=>ps.map(ph=>ph.id===activeSynthPhraseId?{...ph,chain:[...ph.chain,p.id]}:ph));
                          else setDrumPhrases(ps=>ps.map(ph=>ph.id===activeDrumPhraseId?{...ph,chain:[...ph.chain,p.id]}:ph));
                          setPatternDrag(null);
                          return;
                        }
                      }
                      // Dropped outside any valid target — delete the pattern.
                      delPatInLayer(dragLayer,p.id);
                      setPatternDrag(null);
                    };
                    document.addEventListener("pointermove",onMove);
                    document.addEventListener("pointerup",onUp);
                    document.addEventListener("pointercancel",onUp);
                  }}>
                  {isP&&!isA&&<span style={{fontSize:6,opacity:0.7}}>●</span>}{p.name}
                </div>);
            })}
            {(activeLayer==="drums"?drumPats:pats).length<8&&<div style={{padding:"4px 10px",borderRadius:20,border:"1px dashed "+(activeLayer==="synth"?"rgba(168,197,160,0.35)":activeLayer==="lead"?"rgba(108,154,214,0.35)":"rgba(196,114,122,0.35)"),color:activeLayer==="synth"?"rgba(168,197,160,0.45)":activeLayer==="lead"?"rgba(108,154,214,0.45)":"rgba(196,114,122,0.45)",fontSize:12,cursor:"pointer",flexShrink:0,userSelect:"none"}} onPointerDown={e=>{e.stopPropagation();activeLayer==="drums"?addDrumPat():addPat();}}>＋</div>}
          </div>
          )}
          {/* ── PER-LAYER FUNCTION PILLS — STEP / SOUND / VARY (portrait) ──
               First-class home-screen access to the pattern's step drawer, the
               layer's sound page, and per-layer variation. (These were formerly
               reached only by tapping the already-active layer/pattern.) */}
          {!isLandscape&&(
          <div style={{display:"flex",gap:6,flexShrink:0,padding:"2px 12px 8px"}}>
            {[["step","STEP",activeSheet==="pattern"],["sound","SOUND",activeSheet==="sound"],["vary","VARY",activeSheet==="vary"||activeVary]].map(([key,lbl,on])=>(
              <button key={key} onClick={()=>{ if(key==="step"){setSeqPage("step");setActiveSheet(s=>s==="pattern"?null:"pattern");} else setActiveSheet(s=>s===key?null:key); }}
                style={{flex:1,padding:"10px 0",borderRadius:9,fontFamily:"inherit",cursor:"pointer",fontSize:10,fontWeight:700,letterSpacing:2,
                  border:"1px solid "+(on?(key==="vary"?"rgba(201,169,110,0.6)":"rgba(200,185,165,0.5)"):"rgba(200,185,165,0.14)"),
                  background:on?(key==="vary"?"rgba(201,169,110,0.12)":"rgba(200,185,165,0.1)"):"transparent",
                  color:on?(key==="vary"?"#c9a96e":"rgba(232,224,213,0.9)"):"rgba(210,195,175,0.5)"}}>
                {lbl}
              </button>
            ))}
          </div>
          )}
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

            {/* SONG matrix — 12×16, 4 row-groups × 3 layers (poly/mono/drums) × 16 bars */}
            {songView&&(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"flex-start",padding:"6px 10px 6px",boxSizing:"border-box",gap:6}}>
                {/* SYNC|FREE (exclusive base) + RAND (additive). RAND over SYNC
                    cycles a random shared column each bar; RAND over FREE jumps
                    each layer to a random populated bar independently. */}
                <div style={{display:"flex",gap:4,flexShrink:0,alignSelf:"center",alignItems:"center"}}>
                  {[["sync","SYNC"],["free","FREE"]].map(([val,lbl])=>{
                    const sel=songSyncMode===val;
                    return(
                      <button key={lbl} onClick={()=>setSongSyncMode(val)}
                        style={{padding:"4px 14px",fontSize:9,letterSpacing:2,fontWeight:600,border:"1px solid "+(sel?"rgba(220,200,180,0.5)":"rgba(220,200,180,0.12)"),background:sel?"rgba(220,200,180,0.08)":"transparent",color:sel?"rgba(220,200,180,0.9)":"rgba(220,200,180,0.4)",borderRadius:4,cursor:"pointer",fontFamily:"inherit",lineHeight:1}}>
                        {lbl}
                      </button>
                    );
                  })}
                  <div style={{width:1,height:16,background:"rgba(220,200,180,0.15)",margin:"0 2px"}}/>
                  <button onClick={()=>setSongRandom(v=>!v)}
                    style={{padding:"4px 14px",fontSize:9,letterSpacing:2,fontWeight:600,border:"1px solid "+(songRandom?"#c9a96e":"rgba(220,200,180,0.12)"),background:songRandom?"rgba(201,169,110,0.12)":"transparent",color:songRandom?"#c9a96e":"rgba(220,200,180,0.4)",borderRadius:4,cursor:"pointer",fontFamily:"inherit",lineHeight:1}}>
                    RAND
                  </button>
                </div>
                <div style={{width:"min(100%,calc(100dvh - "+(isLandscape?56:175)+"px))",aspectRatio:"1",display:"flex",flexDirection:"column",flexShrink:0,gap:3}}>
                  {Array.from({length:4},(_,group)=>(
                    <div key={group} style={{flex:1,display:"flex",flexDirection:"column",gap:1}}>
                      {["synth","lead","drums"].map(layer=>{
                        const accent = layer==="synth"?"#a8c5a0":layer==="lead"?"#6c9ad6":"#c4727a";
                        const accentRgb = layer==="synth"?"168,197,160":layer==="lead"?"108,154,214":"196,114,122";
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
                              const isCursor = playing&&songView&&songBarLayer[layer]===barIdx;
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
                                           // Tap on filled cell → step into the pattern. Switch to the
                                           // cell's layer (if different), make this pat the active one,
                                           // exit song view, land on the edit page. Clearing a cell now
                                           // happens via drag-off-grid (handled below).
                                           if(layer!==activeLayer)switchLayer(layer);
                                           if(layer==="drums")setActiveDrumId(patId);
                                           else setActiveId(patId);
                                           setSongView(false);
                                           setPage("edit");
                                           return;
                                         }
                                         // drop logic — same-layer cell = move; off-grid = clear source cell.
                                         const el=document.elementFromPoint(ev.clientX,ev.clientY);
                                         const targetCell=el&&el.closest&&el.closest('[data-song-cell="1"]');
                                         if(targetCell&&targetCell.dataset.songLayer===layer){
                                           const tBar=parseInt(targetCell.dataset.songBar,10);
                                           if(tBar!==barIdx){
                                             pushHistory();
                                             setSongMatrix(m=>{const r=[...m[layer]];r[tBar]=patId;r[barIdx]=null;return{...m,[layer]:r};});
                                           }
                                         } else {
                                           // Dropped outside the song grid (or on a different layer's cell)
                                           // → remove the pattern from this cell. The pattern itself stays in
                                           // the library; only the bar assignment goes away.
                                           pushHistory();
                                           setSongMatrix(m=>{const r=[...m[layer]];r[barIdx]=null;return{...m,[layer]:r};});
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
            {!songView&&activeLayer!=="drums"&&(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"6px 10px",boxSizing:"border-box"}}>
              <div style={{width:"min(100%,calc(100dvh - "+(isLandscape?32:150)+"px))",aspectRatio:"1",display:"flex",flexDirection:"column",flexShrink:0}}>
                  <div ref={gridRef} data-grid="1" style={Object.assign({},S.gridWrap,shifting?S.gridShifting:{},{flex:1,display:"flex",flexDirection:"column"})}
                    onPointerDown={handleGridDown} onPointerMove={handleGridMove} onPointerUp={handleGridUp} onPointerCancel={handleGridUp}
                    onContextMenu={handleGridContextMenu}>
                    {Array.from({length:ROWS},(_,r)=>{
                      const fromBot=ROWS-1-r;const isOct=fromBot%SCALE_SPAN===0;const isFifth=!isOct&&fromBot%SCALE_SPAN===4;
                      const vSGrid=(varyMode[activeLayer]&&playing&&activePat)?variedGrids.current.get(activePat.id):null;
                      return(<div key={r} style={Object.assign({},S.gridRow,{background:isOct?"rgba(200,185,165,0.06)":isFifth?"rgba(160,190,170,0.03)":"transparent",position:"relative"})}>
                        {Array.from({length:COLS},(_,c)=>{
                          const isCol=playing&&playId===activeId&&c===step,isQ=c%4===0;
                          const on=activePat?activePat.grid[r][c]:false;const inactive=c>=gridLen;
                          return(<div key={c} data-row={r} data-col={c} style={Object.assign({},S.cell,{aspectRatio:"1",
                            background:inactive?"rgba(220,200,180,0.008)":isCol?"rgba(220,200,180,0.09)":isQ?"rgba(220,200,180,0.035)":"rgba(220,200,180,0.015)",
                            outline:isQ&&!on&&!inactive?"1px solid rgba(255,255,255,0.06)":"none",outlineOffset:"-1px"})}/>);
                        })}
                        {(()=>{const rects=[];let ci=0;while(ci<COLS){const on=activePat?activePat.grid[r][ci]:false;if(on){const p=activePat?.params?.[ci];const rhy=p?Math.round(p.rhy??1):1;const span=Math.max(1,activePat?.durs?.[r]?.[ci]??1);const vel=p?(p.vel??100):100;const b=0.35+(vel/127)*0.65;const inactive=ci>=gridLen;const bright=inactive?`rgba(220,200,180,0.12)`:`rgba(230,215,195,${b})`;const glow=inactive?"none":`0 0 4px rgba(230,215,195,${b*0.5}),0 0 10px rgba(230,215,195,${b*0.22})`;const isActive=!inactive&&playing&&playId===activeId&&step>=ci&&step<ci+span;const L=`calc(${ci/COLS}*(100% + 2px))`;const W=`calc(${span/COLS}*(100% + 2px) - 2px)`;rects.push(<div key={ci} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:span>1?3:2,background:isActive?bright:inactive?bright:`rgba(230,215,195,${b*0.75})`,boxShadow:isActive?glow:"none",pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:"2px",padding:"0 2px"}}>{!inactive&&rhy===2&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}{!inactive&&rhy===3&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}{!inactive&&rhy>=4&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px",width:"100%",height:"86%"}}>{[0,1,2,3].map(i=><div key={i} style={{borderRadius:1,background:"rgba(0,0,0,0.25)"}}/>)}</div>}{!inactive&&(()=>{const octV=p?(p.oct??2):2,sh=octV-2;if(sh===0)return null;const n=Math.abs(sh),up=sh>0;const cols=rhy>=4?2:rhy>=2?rhy:1;return(<div style={{position:'absolute',left:0,right:0,[up?'top':'bottom']:0,display:'flex',flexDirection:up?'column':'column-reverse',gap:3,pointerEvents:'none',zIndex:1}}>{Array.from({length:n},(_,i)=>(<div key={i} style={{height:3,display:'flex',gap:rhy>=4?3:2,padding:'0 2px'}}>{Array.from({length:cols},(_,j)=>(<div key={j} style={{flex:1,background:'#6a5088'}}/>))}</div>))}</div>);})()}</div>);ci+=span;}else{ci++;}}return rects;})()}
                        {vSGrid&&Array.from({length:COLS},(_,c)=>{
                          if(c>=gridLen)return null;
                          const baseOn=activePat?activePat.grid[r][c]:false;
                          const vOn=!!(vSGrid[r]&&vSGrid[r][c]);
                          if(vOn===baseOn)return null;
                          const L=`calc(${c/COLS}*(100% + 2px))`;const W=`calc(${1/COLS}*(100% + 2px) - 2px)`;
                          return vOn
                            ? <div key={"va"+c} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:2,border:"1.5px solid "+C_VARY,boxShadow:"0 0 5px "+C_VARY+"aa",pointerEvents:"none"}}/>
                            : <div key={"vd"+c} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:2,background:"rgba(20,16,12,0.5)",pointerEvents:"none"}}/>;
                        })}
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
            {!songView&&activeLayer==="drums"&&(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"6px 10px",boxSizing:"border-box",overflow:"hidden"}}>
                {(()=>{
                  const dPat=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
                  const dLen=dPat?.gridLen??16;
                  const dVaryShow=varyMode.drums&&playing;
                  const vGridD=dVaryShow?variedDrumGrids.current.get(dPat.id):null;
                  const GAP=2;
                  // Drum grid is now oriented to match the synth grid: voices
                  // run vertically as rows, steps horizontally as columns. Time
                  // flows right → same direction as synth playback. Voice
                  // labels are transparent overlays on the leftmost portion of
                  // each row so the cells themselves get the full width.
                  const SIZE=isLandscape?`min(calc(100vw - 190px), calc(100dvh - 32px))`:`min(calc(100vw - 20px), calc(100dvh - 150px))`;
                  return(
                    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:6,flexShrink:0}}>
                      <div style={{width:SIZE,display:"flex",flexDirection:"column",gap:GAP,flexShrink:0,touchAction:"none"}}>
                        {DRUM_VOICES.map((voice,r)=>{
                          const dc=drumColor(r,linkHat,linkTom);
                          return(
                          <div key={voice.key} style={{display:"flex",gap:GAP,position:"relative"}}>
                            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"space-around",pointerEvents:"none",zIndex:2,fontSize:10,fontWeight:700,color:dc,opacity:0.22,letterSpacing:1}}>{[0,1,2,3].map(i=><span key={i}>{voice.full||voice.label}</span>)}</div>
                            {Array.from({length:COLS},(_,step)=>{
                              const on=dPat?.grid[r]?.[step]||false;
                              const cv=(dPat&&dPat.vel&&dPat.vel[r]&&dPat.vel[r][step]!=null)?dPat.vel[r][step]:100;
                              const rt=(dPat&&dPat.rat&&dPat.rat[r]&&dPat.rat[r][step]!=null)?dPat.rat[r][step]:1;
                              const isActive=playing&&step===drumStep;
                              const inactive=step>=dLen;
                              const isQ=step%4===0;
                              const varOn=vGridD?!!(vGridD[r]&&vGridD[r][step]):on;
                              const vAdd=vGridD&&varOn&&!on&&step<dLen, vDrop=vGridD&&!varOn&&on;
                              const aHex=Math.round((0.30+0.70*(cv/127))*255).toString(16).padStart(2,"0");
                              const onBg=isActive?"rgba(255,255,255,0.88)":dc+aHex;
                              return(<div key={step} style={{flex:1,position:"relative",aspectRatio:"1",borderRadius:2,cursor:inactive?"default":"pointer",
                                background:inactive?"rgba(220,200,180,0.015)":on?onBg:isActive?"rgba(220,200,180,0.1)":isQ?"rgba(220,200,180,0.05)":"rgba(220,200,180,0.03)",
                                border:"1px solid "+(inactive?"rgba(220,200,180,0.03)":on?dc:"rgba(220,200,180,0.07)"),
                                boxShadow:on&&isActive?"0 0 4px "+dc:"none",
                                boxSizing:"border-box",
                              }} onPointerDown={e=>{
                                // Shift+drag → move the whole pattern (grid+vel+rat).
                                if(e.shiftKey){
                                  e.preventDefault();e.stopPropagation();
                                  const ge=e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                                  const cw=ge.width/COLS||1,ch=ge.height/DRUM_ROWS||1,sx=e.clientX,sy=e.clientY;
                                  const base={grid:dPat.grid.map(rw=>[...rw]),vel:toDrumVel2D(dPat.vel),rat:toDrumRat2D(dPat.rat),gridLen:dLen};
                                  pushHistory();
                                  const mv=ev=>applyDrumShift(Math.round((ev.clientX-sx)/cw),Math.round((ev.clientY-sy)/ch),base);
                                  const up=()=>{document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};
                                  document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
                                  return;
                                }
                                e.preventDefault();e.stopPropagation();if(inactive)return;
                                // Ctrl/Cmd+click → cycle this cell's ratchet count.
                                if(e.ctrlKey||e.metaKey){pushHistory();cycleDrumRat(r,step);return;}
                                // Horizontal drag = paint/erase a run; vertical drag
                                // = per-cell velocity; tap = toggle.
                                const ge=e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                                const cw=ge.width/COLS||1,chh=ge.height/DRUM_ROWS||1;
                                const startX=e.clientX,startY=e.clientY,wasOn=on,startVel=cv,paintVal=!wasOn;
                                let mode=null;const painted=new Set();
                                const paint=(rr,cc)=>{const k=rr+":"+cc;if(painted.has(k))return;painted.add(k);if(cc<dLen)setDrumCell(rr,cc,paintVal);};
                                pushHistory();
                                if(!wasOn){setDrumCell(r,step,true);painted.add(r+":"+step);}
                                const onMove=ev=>{
                                  const dx=ev.clientX-startX,dy=startY-ev.clientY;
                                  if(mode===null){
                                    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>cw*0.5){mode="paint";paint(r,step);}
                                    else if(Math.abs(dy)>5){mode="vel";}
                                  }
                                  if(mode==="vel")setDrumVelCell(r,step,Math.max(1,Math.min(127,Math.round(startVel+dy))));
                                  else if(mode==="paint"){
                                    const cc=Math.max(0,Math.min(COLS-1,Math.floor((ev.clientX-ge.left)/cw)));
                                    const rr=Math.max(0,Math.min(DRUM_ROWS-1,Math.floor((ev.clientY-ge.top)/chh)));
                                    paint(rr,cc);
                                  }
                                };
                                const onUp=()=>{
                                  document.removeEventListener("pointermove",onMove);document.removeEventListener("pointerup",onUp);document.removeEventListener("pointercancel",onUp);
                                  if(mode===null&&wasOn)setDrumCell(r,step,false);
                                };
                                document.addEventListener("pointermove",onMove);document.addEventListener("pointerup",onUp);document.addEventListener("pointercancel",onUp);
                              }}>
                                {on&&rt>1&&Array.from({length:rt-1},(_,i)=>(
                                  <div key={"r"+i} style={{position:"absolute",top:1,bottom:1,width:1,left:`${((i+1)/rt)*100}%`,background:"rgba(20,16,12,0.5)",pointerEvents:"none"}}/>
                                ))}
                                {vAdd&&<div style={{position:"absolute",inset:1,borderRadius:2,border:"1.5px solid "+C_VARY,boxShadow:"0 0 5px "+C_VARY+"aa",pointerEvents:"none"}}/>}
                                {vDrop&&<div style={{position:"absolute",inset:0,borderRadius:2,background:"rgba(20,16,12,0.5)",pointerEvents:"none"}}/>}
                              </div>);
                            })}
                          </div>
                        )})}
                      </div>
                      {/* Horizontal length slider (matches synth grid orientation) */}
                      <div style={{width:SIZE,height:10,background:"rgba(220,200,180,0.06)",borderRadius:5,position:"relative",cursor:"ew-resize",touchAction:"none",flexShrink:0}}
                        onPointerDown={e=>{
                          e.stopPropagation();
                          const rect=e.currentTarget.getBoundingClientRect();
                          const update=ev=>{const pct=Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width));setDrumLen(Math.max(1,Math.round(pct*COLS)));};
                          update(e);
                          const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};
                          document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);
                        }}>
                        <div style={{position:"absolute",top:0,bottom:0,left:0,width:`${(dLen/COLS)*100}%`,background:"rgba(210,195,175,0.18)",borderRadius:"5px 0 0 5px"}}/>
                        <div style={{position:"absolute",top:-2,bottom:-2,width:6,left:`calc(${(dLen/COLS)*100}% - 3px)`,background:"rgba(255,255,255,0.85)",borderRadius:3,boxShadow:"0 0 5px rgba(255,255,255,0.3)"}}/>
                        <span style={{position:"absolute",right:6,top:"50%",transform:"translateY(-50%)",fontSize:6,color:"rgba(210,195,175,0.4)",pointerEvents:"none"}}>{dLen}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}

            {/* (Step-param popup is rendered once at the root — see {paramPopup&&...}
                near the top of the return — so it is NOT duplicated here.) */}
          </div>

          {/* ── BOTTOM CHROME: chips row + persistent transport (portrait) ── */}
          {!isLandscape&&(
          <div style={{flexShrink:0,borderTop:"1px solid rgba(255,255,255,0.07)",background:"rgba(24,22,18,0.98)"}}>
            {/* Row 1: global chips — TEMPO / SONG / FX / PROJECT.
                 (VARY moved up to the per-layer pill row; four chips here gives
                 each more width and lets the labels be legible.) */}
            <div style={{display:"flex",alignItems:"stretch",padding:"9px 12px 5px",gap:6}}>
              {/* TEMPO chip */}
              <button style={{flex:1,height:42,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,border:"1px solid "+(activeSheet==="tempo"?"rgba(200,185,165,0.45)":"rgba(200,185,165,0.12)"),borderRadius:9,background:activeSheet==="tempo"?"rgba(200,185,165,0.08)":"transparent",cursor:"pointer",fontFamily:"inherit",padding:0}}
                onClick={()=>setActiveSheet(s=>s==="tempo"?null:"tempo")}>
                <span style={{fontSize:13,fontWeight:700,color:"rgba(255,255,255,0.85)",lineHeight:1}}>{bpm}</span>
                <span style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.4)"}}>TEMPO</span>
              </button>
              {/* SONG chip — toggles the matrix view. Song mode (the playback intent)
                   stays on once enabled — only loop mode in transport overrides it. */}
              <button style={{flex:1,height:42,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,border:"1px solid "+(songView?"rgba(210,195,175,0.5)":songMode?"rgba(210,195,175,0.25)":"rgba(200,185,165,0.12)"),borderRadius:9,background:songView?"rgba(210,195,175,0.06)":"transparent",cursor:"pointer",fontFamily:"inherit",padding:0}}
                onClick={()=>{
                  if(songView){ setSongView(false); }
                  else{ setSongMode(true);setSongView(true); }
                  setActiveSheet(null);
                }}>
                <span style={{fontSize:16,fontWeight:700,color:songView?"rgba(210,195,175,0.9)":songMode?"rgba(210,195,175,0.7)":"rgba(210,195,175,0.5)",lineHeight:1}}>▦</span>
                <span style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.4)"}}>SONG</span>
              </button>
              {/* FX chip — global reverb/delay design */}
              <button style={{flex:1,height:42,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,border:"1px solid "+(activeSheet==="fx"?C_SAT+"99":"rgba(200,185,165,0.12)"),borderRadius:9,background:activeSheet==="fx"?C_SAT+"1a":"transparent",cursor:"pointer",fontFamily:"inherit",padding:0}}
                onClick={()=>setActiveSheet(s=>s==="fx"?null:"fx")}>
                <span style={{fontSize:15,lineHeight:1,color:activeSheet==="fx"?C_SAT:"rgba(210,195,175,0.5)"}}>≋</span>
                <span style={{fontSize:8,letterSpacing:1.5,color:activeSheet==="fx"?C_SAT:"rgba(210,195,175,0.4)"}}>FX</span>
              </button>
              {/* PROJECT chip */}
              <button style={{flex:1,height:42,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,border:"1px solid "+(activeSheet==="project"?"rgba(200,185,165,0.45)":"rgba(200,185,165,0.12)"),borderRadius:9,background:activeSheet==="project"?"rgba(200,185,165,0.07)":"transparent",cursor:"pointer",fontFamily:"inherit",padding:0}}
                onClick={()=>setActiveSheet(s=>s==="project"?null:"project")}>
                <span style={{fontSize:15,lineHeight:1,color:"rgba(210,195,175,0.5)"}}>⋯</span>
                <span style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.4)"}}>PROJECT</span>
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
          )}
          </div>{/* ══ end CENTER COLUMN ══ */}

          {/* ══ LANDSCAPE RIGHT RAIL — transport + tool chips ══ */}
          {isLandscape&&(
            <div style={{width:76,flexShrink:0,display:"flex",flexDirection:"column",gap:5,padding:"8px 6px",borderLeft:"1px solid rgba(255,255,255,0.07)",background:"rgba(24,22,18,0.6)",overflow:"hidden",boxSizing:"content-box"}}>
              <button style={Object.assign({},S.playBtn,{width:"100%",height:52,borderRadius:14,flexShrink:0},playing?S.playOn:{})} onClick={startStop}>
                {playing?<svg width="13" height="13" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><rect x="1" y="1" width="9" height="9" rx="1.5"/></svg>:<svg width="13" height="13" viewBox="0 0 11 11" fill="currentColor" style={{display:"block"}}><polygon points="1.5,0.5 10.5,5.5 1.5,10.5"/></svg>}
              </button>
              <button style={Object.assign({},S.loopBtnBottom,{width:"100%",height:30,flexShrink:0},loopMode?S.loopOn:{})} onClick={()=>setLoopMode(l=>!l)}>LOOP</button>
              <button style={Object.assign({},S.loopBtnBottom,{width:"100%",height:30,flexShrink:0},followSeq?{border:"1px solid #7aaa96",color:"#7aaa96",background:"rgba(122,170,150,0.12)"}:{})} onClick={()=>setFollowSeq(f=>!f)}>FOLLOW</button>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                <button style={Object.assign({},S.loopBtnBottom,{flex:1,height:30,opacity:historyR.current.length?1:0.35})} onClick={undo} disabled={!historyR.current.length}>↶</button>
                <button style={Object.assign({},S.loopBtnBottom,{flex:1,height:30,opacity:redoR.current.length?1:0.35})} onClick={redo} disabled={!redoR.current.length}>↷</button>
              </div>
              <div style={{height:1,background:"rgba(255,255,255,0.07)",flexShrink:0,margin:"1px 0"}}/>
              <div style={{flex:1,display:"flex",flexDirection:"column",gap:5,overflowY:"auto",overflowX:"hidden"}}>
                <button style={{flexShrink:0,height:40,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"1px solid "+(activeSheet==="tempo"?"rgba(200,185,165,0.45)":"rgba(200,185,165,0.1)"),borderRadius:8,background:activeSheet==="tempo"?"rgba(200,185,165,0.08)":"transparent",cursor:"pointer",fontFamily:"inherit",padding:0}} onClick={()=>setActiveSheet(s=>s==="tempo"?null:"tempo")}>
                  <span style={{fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.8)",lineHeight:1.1}}>{bpm}</span>
                  <span style={{fontSize:5,letterSpacing:1.5,color:"rgba(210,195,175,0.35)"}}>TEMPO</span>
                </button>
                <button style={{flexShrink:0,height:40,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"1px solid "+(songView?"rgba(210,195,175,0.5)":songMode?"rgba(210,195,175,0.25)":"rgba(200,185,165,0.1)"),borderRadius:8,background:songView?"rgba(210,195,175,0.06)":"transparent",cursor:"pointer",fontFamily:"inherit",padding:0}} onClick={()=>{ if(songView){setSongView(false);}else{setSongMode(true);setSongView(true);} setActiveSheet(null); }}>
                  <span style={{fontSize:14,fontWeight:700,color:songView?"rgba(210,195,175,0.9)":songMode?"rgba(210,195,175,0.7)":"rgba(210,195,175,0.5)",lineHeight:1.1}}>▦</span>
                  <span style={{fontSize:5,letterSpacing:1.5,color:"rgba(210,195,175,0.35)"}}>SONG</span>
                </button>
                <button style={{flexShrink:0,height:40,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"1px solid "+(activeSheet==="fx"?C_SAT+"99":"rgba(200,185,165,0.1)"),borderRadius:8,background:activeSheet==="fx"?C_SAT+"1a":"transparent",cursor:"pointer",fontFamily:"inherit",padding:0}} onClick={()=>setActiveSheet(s=>s==="fx"?null:"fx")}>
                  <span style={{fontSize:12,lineHeight:1.1,color:activeSheet==="fx"?C_SAT:"rgba(210,195,175,0.5)"}}>≋</span>
                  <span style={{fontSize:5,letterSpacing:1.5,color:activeSheet==="fx"?C_SAT:"rgba(210,195,175,0.35)"}}>FX</span>
                </button>
                <button style={{flexShrink:0,height:40,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",border:"1px solid "+(activeSheet==="project"?"rgba(200,185,165,0.45)":"rgba(200,185,165,0.1)"),borderRadius:8,background:activeSheet==="project"?"rgba(200,185,165,0.07)":"transparent",cursor:"pointer",fontFamily:"inherit",padding:0}} onClick={()=>setActiveSheet(s=>s==="project"?null:"project")}>
                  <span style={{fontSize:12,lineHeight:1.1,color:"rgba(210,195,175,0.45)"}}>⋯</span>
                  <span style={{fontSize:5,letterSpacing:1.5,color:"rgba(210,195,175,0.35)"}}>PROJECT</span>
                </button>
              </div>
            </div>
          )}

          {/* ── BOTTOM SHEET — slides up, one per chip ── */}
          {activeSheet&&(
            <>
              {/* Backdrop — full screen so ANY tap outside the sheet closes it. */}
              <div style={{position:"fixed",inset:0,zIndex:199,background:"rgba(0,0,0,0.4)"}} onClick={()=>setActiveSheet(null)}/>
              <div style={{position:"fixed",bottom:isLandscape?0:60,left:0,right:0,zIndex:200,background:"rgba(24,22,18,0.98)",backdropFilter:"blur(20px)",WebkitBackdropFilter:"blur(20px)",borderTop:"1px solid rgba(255,255,255,0.1)",borderRadius:"16px 16px 0 0",maxHeight:isLandscape?"82vh":"65vh",overflowY:"auto",padding:"16px 16px 24px"}}>

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
                      const accent=activeLayer==="synth"?"#a8c5a0":activeLayer==="lead"?"#6c9ad6":"#c4727a";
                      const accentF=activeLayer==="synth"?"rgba(168,197,160,":activeLayer==="lead"?"rgba(108,154,214,":"rgba(196,114,122,";
                      const ops=isDrum
                        ?[["RAND",randDrumVel,false,false],["CLR",clearDrums,false,false],["DUP",dupDrumPat,drumPats.length>=8,false],["DEL",delDrumPat,drumPats.length<=1,true],["CPY",copyDrumPatFn,false,false],["PST",pasteDrumPatFn,!drumClipboard,false],["MUT8",mutateDrumPat1,false,false]]
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
                            const sel=Math.abs(activePatSpeed-opt.mult)<0.001;
                            return(
                              <div key={opt.label} onPointerDown={e=>{e.stopPropagation();setActivePatSpeed(opt.mult);}}
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
                          // Only FLT/OCT/GLIDE animate mid-note via Bell.play's mods array.
                          // VEL/DUR/DLY/REV/RHY are locked at note-start, so tied-note
                          // extension cells stay locked for those lanes.
                          const isMidNote=lane.key==="flt"||lane.key==="oct"||lane.key==="glide";
                          const colHasNote=Array.from({length:COLS},(_,c)=>{
                            if(!activePat)return false;
                            if(!isMidNote){
                              for(let r=0;r<ROWS;r++) if(activePat.grid[r][c]) return true;
                              return false;
                            }
                            for(let r=0;r<ROWS;r++)for(let c2=0;c2<=c;c2++){
                              if(activePat.grid[r][c2]){
                                const span=Math.max(1,activePat.durs?.[r]?.[c2]??1);
                                if(c<c2+span) return true;
                              }
                            }
                            return false;
                          });
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
                                onChange={(col,val)=>setStepParam(col,lane.key,val)} onDragStart={pushHistory} onResetCol={resetStepCol}
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
                        {/* Portrait is too narrow for two columns (knobs shrink and
                            labels like DETUNE clip) — stack full-width there; keep
                            two columns in the roomier landscape sheet. */}
                        <div style={{display:"grid",gridTemplateColumns:isLandscape?"1fr 1fr":"1fr",gap:8}}>
                          <SynthSection title="OSCILLATOR" accent={C_OSC}>
                            <div style={{display:"flex",gap:8,padding:"6px 10px 8px",height:120,alignItems:"stretch",justifyContent:"center"}}>
                              {/* DETUNE and SPREAD are POLY-only — MONO is a single oscillator. */}
                              {activeLayer==="synth"&&(
                                <KnobSlider vertical label="DETUNE" value={detune} min={0} max={50} def={8} onChange={setDetune} display={detune+"¢"} accent={C_OSC}/>
                              )}
                              {activeLayer==="synth"&&(
                                <KnobSlider vertical label="SPREAD" value={spread} min={0} max={100} def={50} onChange={setSpread} display={spread+"%"} accent={C_OSC}/>
                              )}
                              {activeLayer==="lead"&&(
                                <KnobSlider vertical label="SUB" value={subLvl} min={0} max={100} def={50} onChange={setSubLvl} display={subLvl+"%"} accent={C_OSC}/>
                              )}
                              {activeLayer==="lead"&&(
                                <KnobSlider vertical label="GLIDE" value={glideLP} min={0} max={100} onChange={setGlideLP} display={glideLP+"%"} accent={C_OSC}/>
                              )}
                              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                <KnobSlider vertical label="VEL" value={velAmp} min={0} max={100} def={100} onChange={setVelAmp} display={velAmp+"%"} accent={C_OSC}/>
                                <button onClick={()=>setVelAmpInv(!velAmpInv)} style={{padding:"2px 5px",fontSize:6,letterSpacing:1,fontWeight:600,border:"1px solid "+C_OSC+(velAmpInv?"":"22"),background:velAmpInv?C_OSC+"14":"transparent",color:velAmpInv?C_OSC:"rgba(210,195,175,0.4)",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>INV</button>
                              </div>
                              <div style={{display:"flex",flexDirection:"column",gap:3,flex:"0 1 40%",minWidth:44}}>
                                {WAVEFORMS.map((w,i)=>(
                                  <button key={w} style={Object.assign({},S.wfBtn,{flex:1,padding:"0",borderColor:C_OSC+(waveform===w?"":"22"),color:waveform===w?C_OSC:"rgba(210,195,175,0.35)",background:waveform===w?C_OSC+"14":"transparent"})} onClick={()=>setWaveform(w)}>{WF_LABELS[i]}</button>
                                ))}
                              </div>
                            </div>
                            {/* OCTAVE — per-layer transposition: -2..+2 */}
                            <div style={{padding:"0 8px 8px",display:"flex",alignItems:"center",gap:6}}>
                              <div style={{fontSize:7,letterSpacing:1.5,color:"rgba(210,195,175,0.4)",minWidth:32}}>OCT</div>
                              <div style={{flex:1,display:"flex",gap:2}}>
                                {[-2,-1,0,1,2].map(o=>(
                                  <button key={o} onClick={()=>setOctaveLP(o)}
                                    style={{flex:1,height:22,padding:0,fontSize:10,fontWeight:600,border:"1px solid "+C_OSC+(octaveLP===o?"":"22"),background:octaveLP===o?C_OSC+"14":"transparent",color:octaveLP===o?C_OSC:"rgba(210,195,175,0.4)",borderRadius:4,cursor:"pointer",fontFamily:"inherit"}}>
                                    {o>0?"+"+o:o}
                                  </button>
                                ))}
                              </div>
                            </div>
                          </SynthSection>
                          <SynthSection title="ENV" accent={C_ENV}>
                            <div style={{display:"flex",gap:6,padding:"6px 8px 8px",height:120,alignItems:"stretch",justifyContent:"center"}}>
                              <KnobSlider vertical label="ATK" value={attack}  min={1}  max={2000} def={8} onChange={setAttack}  display={attack+"ms"}  accent={C_ENV}/>
                              <KnobSlider vertical label="DEC" value={decay}   min={10} max={4000} def={400} onChange={setDecay}   display={decay+"ms"}   accent={C_ENV}/>
                              <KnobSlider vertical label="SUS" value={sustain} min={0}  max={100}  def={40} onChange={setSustain} display={sustain+"%"}  accent={C_ENV}/>
                              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                <KnobSlider vertical label="VEL" value={velEnv} min={0} max={100} onChange={setVelEnv} display={velEnv+"%"} accent={C_ENV}/>
                                <button onClick={()=>setVelEnvInv(!velEnvInv)} style={{padding:"2px 5px",fontSize:6,letterSpacing:1,fontWeight:600,border:"1px solid "+C_ENV+(velEnvInv?"":"22"),background:velEnvInv?C_ENV+"14":"transparent",color:velEnvInv?C_ENV:"rgba(210,195,175,0.4)",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>INV</button>
                              </div>
                            </div>
                          </SynthSection>
                          <SynthSection title="FILTER" accent={C_FILT}>
                            <div style={{display:"flex",gap:6,padding:"6px 8px 8px",height:120,alignItems:"stretch",justifyContent:"center"}}>
                              <KnobSlider vertical label="CUT" value={vcfCutoff}    min={0} max={100} def={80} onChange={setVcfCutoff}    display={vcfLbl(vcfCutoff)} accent={C_FILT}/>
                              <KnobSlider vertical label="RES" value={vcfRes}       min={0} max={100} def={15} onChange={setVcfRes}       display={vcfRes+"%"}        accent={C_FILT}/>
                              <KnobSlider vertical label="ENV" value={filterEnvAmt} min={0} max={100} onChange={setFilterEnvAmt} display={filterEnvAmt+"%"}  accent={C_FILT}/>
                              <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                <KnobSlider vertical label="VEL" value={velFlt} min={0} max={100} def={100} onChange={setVelFlt} display={velFlt+"%"} accent={C_FILT}/>
                                <button onClick={()=>setVelFltInv(!velFltInv)} style={{padding:"2px 5px",fontSize:6,letterSpacing:1,fontWeight:600,border:"1px solid "+C_FILT+(velFltInv?"":"22"),background:velFltInv?C_FILT+"14":"transparent",color:velFltInv?C_FILT:"rgba(210,195,175,0.4)",borderRadius:3,cursor:"pointer",fontFamily:"inherit"}}>INV</button>
                              </div>
                            </div>
                          </SynthSection>
                          {/* Per-layer FX = SEND only; design lives on the FX sheet. */}
                          <SynthSection title="DELAY" accent={C_DLY}>
                            <div style={{padding:"4px 8px 8px",display:"flex",flexDirection:"column",gap:5}}>
                              <KnobSlider label="SEND" value={dlySend} min={0} max={100} def={50} onChange={setDlySend} display={dlySend+"%"} accent={C_DLY}/>
                              <div style={{fontSize:7,letterSpacing:1,color:"rgba(210,195,175,0.3)",textAlign:"center"}}>design → FX</div>
                            </div>
                          </SynthSection>
                          <SynthSection title="REVERB" accent={C_REV}>
                            <div style={{padding:"4px 8px 8px",display:"flex",flexDirection:"column",gap:5}}>
                              <KnobSlider label="SEND" value={rvSend} min={0} max={100} def={30} onChange={setRvSend} display={rvSend+"%"} accent={C_REV}/>
                              <div style={{fontSize:7,letterSpacing:1,color:"rgba(210,195,175,0.3)",textAlign:"center"}}>design → FX</div>
                            </div>
                          </SynthSection>
                        </div>
                      </div>
                    )}
                    {activeLayer==="drums"&&(()=>{
                      const dPat=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
                      const mix=fillDrumMix(drumMix); // GLOBAL static mix (not per-pattern)
                      // Mobile mixer: horizontally-scrolling row of compact channel strips.
                      // Each strip mirrors the desktop layout (name → PAN → REV → DLY →
                      // vertical level fader → REC) but at a narrower width.
                      return(<div>
                      {/* KIT selector (mobile) */}
                      <div style={{marginBottom:6}}>
                        <div style={{fontSize:7,letterSpacing:2,color:"rgba(210,195,175,0.3)",fontWeight:500,marginBottom:3}}>KIT</div>
                        <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
                          {DRUM_KITS.map(kit=>{const on=activeKit===kit.id;return(
                            <button key={kit.id} disabled={kitLoading} onClick={()=>loadKit(kit.id)}
                              style={{padding:"5px 12px",borderRadius:5,border:"1px solid "+(on?"rgba(210,195,175,0.6)":"rgba(210,195,175,0.15)"),background:on?"rgba(210,195,175,0.1)":"transparent",color:on?"rgba(210,195,175,0.9)":"rgba(210,195,175,0.4)",fontSize:10,letterSpacing:1,fontWeight:on?700:500,cursor:kitLoading?"wait":"pointer",fontFamily:"inherit"}}>
                              {kitLoading&&on?"…":kit.label}
                            </button>);})}
                        </div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6,flexWrap:"wrap"}}>
                        {[["HH",linkHat,setLinkHat],["TOM",linkTom,setLinkTom]].map(([lbl,on,set])=>(
                          <button key={lbl} onClick={()=>set(v=>!v)}
                            style={{padding:"4px 8px",borderRadius:5,fontSize:8,letterSpacing:0.5,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(on?"#7aaa96":"rgba(200,185,165,0.2)"),background:on?"rgba(122,170,150,0.14)":"transparent",color:on?"#9fcfb5":"rgba(210,195,175,0.4)"}}>{"⛓ "+lbl}</button>
                        ))}
                        <button onClick={()=>setMotionEnabled(v=>!v)}
                          style={{padding:"4px 10px",borderRadius:5,fontSize:9,letterSpacing:1,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(motionEnabled?"#c4727a":"rgba(200,185,165,0.2)"),background:motionEnabled?"rgba(196,114,122,0.16)":"transparent",color:motionEnabled?"#e0909a":"rgba(210,195,175,0.45)"}}>MOTION</button>
                        {motionEnabled&&(
                          <button onClick={()=>setMotionRec(v=>!v)}
                            style={{padding:"4px 10px",borderRadius:5,fontSize:9,letterSpacing:1,fontWeight:700,cursor:"pointer",fontFamily:"inherit",border:"1px solid "+(motionRec?"#e07060":"rgba(200,185,165,0.2)"),background:motionRec?"rgba(224,112,96,0.2)":"transparent",color:motionRec?"#ff8a78":"rgba(210,195,175,0.45)"}}>{motionRec?"● REC":"REC"}</button>
                        )}
                        {motionEnabled&&(
                          <button onClick={clearMotion}
                            style={{padding:"4px 10px",borderRadius:5,fontSize:9,letterSpacing:1,fontWeight:600,cursor:"pointer",fontFamily:"inherit",border:"1px solid rgba(200,185,165,0.2)",background:"transparent",color:"rgba(210,195,175,0.45)"}}>CLR</button>
                        )}
                      </div>
                      {/* Drag-scrollbar — reliable horizontal scroll for the strips
                          (their sliders capture touch, blocking native swipe). */}
                      <div style={{height:16,marginBottom:5,position:"relative",background:"rgba(220,200,180,0.06)",borderRadius:8,touchAction:"none",cursor:"ew-resize",overflow:"hidden"}}
                        onPointerDown={e=>{try{e.currentTarget.setPointerCapture(e.pointerId);}catch(_){}const track=e.currentTarget;mixScrollTo(e.clientX,track);const mv=ev=>mixScrollTo(ev.clientX,track);const up=()=>{document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);}}>
                        <div style={{position:"absolute",top:2,bottom:2,width:"32%",left:`calc(${mixScrollPct}*(100% - 32%))`,background:"rgba(210,195,175,0.4)",borderRadius:7,pointerEvents:"none"}}/>
                        <span style={{position:"absolute",left:"50%",top:"50%",transform:"translate(-50%,-50%)",fontSize:7,letterSpacing:1.5,color:"rgba(210,195,175,0.5)",fontWeight:600,pointerEvents:"none",whiteSpace:"nowrap"}}>◂ DRAG TO SCROLL ▸</span>
                      </div>
                      <div ref={mixScrollRef} onScroll={mixScrollSync} style={{display:"flex",gap:3,overflowX:"auto",overflowY:"hidden",height:340,paddingBottom:4,WebkitOverflowScrolling:"touch"}}>
                        {DRUM_VOICES.map((voice,r)=>{
                          const stripLabel=voice.full||voice.label;
                          const m=mix[r];
                          const md=effDispMix(dPat,r,m); // motion-aware display values
                          const isRec=recordingVoice===voice.key;
                          const hasSample=!!voiceSamples[voice.key];
                          const cell={display:"flex",flexDirection:"column",alignItems:"center",gap:1};
                          const dc=drumColor(r,linkHat,linkTom);
                          const miniSlider=(key,val,minVal,maxVal,bipolar)=>(
                            <div style={{width:"100%",height:7,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",touchAction:"none"}}
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){onMixDrag(r,key,0);onMixUp(r,key);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width,range=maxVal-minVal;let cur=val,lx=e.clientX;const u=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(minVal,Math.min(maxVal,cur+ballisticDelta(pd,dim,range)));onMixDrag(r,key,Math.round(cur));};const up=()=>{onMixUp(r,key);document.removeEventListener("pointermove",u);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",u);document.addEventListener("pointerup",up);}}
                              onDoubleClick={()=>{onMixDrag(r,key,0);onMixUp(r,key);}}>
                              {bipolar&&<div style={{position:"absolute",left:"50%",top:-1,bottom:-1,width:1,background:"rgba(220,200,180,0.25)"}}/>}
                              {bipolar
                                ?<div style={{position:"absolute",top:0,bottom:0,left:val<=0?`${((val-minVal)/(maxVal-minVal))*100}%`:"50%",width:`${Math.abs(val)/(maxVal-minVal)*100}%`,background:dc+"99",borderRadius:3}}/>
                                :<div style={{position:"absolute",left:0,top:0,bottom:0,width:`${((val-minVal)/(maxVal-minVal))*100}%`,background:dc+"99",borderRadius:3}}/>}
                              <div style={{position:"absolute",top:-3,bottom:-3,width:8,left:`calc(${((val-minVal)/(maxVal-minVal))*100}% - 4px)`,background:"rgba(255,255,255,0.85)",borderRadius:2}}/>
                            </div>
                          );
                          const filtMode=m.filt||"off";
                          const cycleFilt=()=>{const i=FILT_MODES.indexOf(filtMode);const nx=FILT_MODES[(i+1)%FILT_MODES.length];setDrumMix(r,"filt",nx);};
                          const filtColors={off:"rgba(200,185,165,0.3)",lp:"#7aaa96",hp:"#c4a070",bp:"#a890c0"};
                          return(<div key={voice.key} style={{flexShrink:0,width:56,display:"flex",flexDirection:"column",gap:4,padding:"5px 3px",background:"rgba(30,28,24,0.55)",border:"1px solid "+dc+"22",borderRadius:4,boxSizing:"border-box",position:"relative",overflow:"hidden"}}>
                            {drumFlash[r]&&(()=>{const fv=drumFlash[r];const a=Math.round((0.08+0.30*Math.max(0,Math.min(127,fv.vel))/127)*255).toString(16).padStart(2,"0");return(
                              <div key={fv.n} style={{position:"absolute",inset:0,background:dc+a,boxShadow:"inset 0 0 8px "+dc+a,pointerEvents:"none",borderRadius:4,animation:"dflash 240ms ease-out forwards"}}/>
                            );})()}
                            <div style={{fontSize:8,fontWeight:700,letterSpacing:1,color:dc,textAlign:"center",lineHeight:1.1,minHeight:10}}>{stripLabel}</div>
                            <div style={cell}>
                              <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>PITCH</div>
                              {miniSlider("pitch",md.pitch||0,-12,12,true)}
                              <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{(md.pitch||0)>0?"+"+md.pitch:(md.pitch||0)}</div>
                            </div>
                            <div style={cell}>
                              <button onClick={e=>{e.stopPropagation();cycleFilt();}}
                                style={{alignSelf:"flex-start",height:11,padding:"0 5px",fontSize:6,letterSpacing:0.5,fontWeight:700,borderRadius:2,cursor:"pointer",fontFamily:"inherit",
                                  border:"1px solid "+(filtMode==="off"?"rgba(200,185,165,0.2)":filtColors[filtMode]),
                                  background:filtMode==="off"?"transparent":filtColors[filtMode]+"22",
                                  color:filtMode==="off"?"rgba(210,195,175,0.4)":filtColors[filtMode]}}>{"FILT "+filtMode.toUpperCase()}</button>
                              <div style={{width:"100%",opacity:filtMode==="off"?0.4:1}}>{miniSlider("filtCut",md.filtCut!=null?md.filtCut:100,0,100,false)}</div>
                              <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{vcfLbl(md.filtCut!=null?md.filtCut:100)}</div>
                            </div>
                            <div style={cell}>
                              <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>ENV</div>
                              {miniSlider("env",md.env!=null?md.env:100,0,100,false)}
                              <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{md.env!=null?md.env:100}</div>
                            </div>
                            <div style={cell}>
                              <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>SAT</div>
                              {miniSlider("sat",md.sat||0,0,100,false)}
                              <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{md.sat||0}</div>
                            </div>
                            <div style={cell}>
                              <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>PAN</div>
                              {miniSlider("pan",md.pan,-100,100,true)}
                              <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{md.pan>0?"+"+md.pan:md.pan}</div>
                            </div>
                            <div style={cell}>
                              <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>REV</div>
                              {miniSlider("rvSend",md.rvSend,0,100,false)}
                              <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{md.rvSend}</div>
                            </div>
                            <div style={cell}>
                              <div style={{fontSize:6,letterSpacing:1,color:"rgba(210,195,175,0.4)",alignSelf:"flex-start"}}>DLY</div>
                              {miniSlider("dlySend",md.dlySend,0,100,false)}
                              <div style={{fontSize:6,color:"rgba(210,195,175,0.55)"}}>{md.dlySend}</div>
                            </div>
                            <div style={{flex:1,minHeight:50,position:"relative",background:"rgba(220,200,180,0.06)",borderRadius:3,margin:"3px 10px 0",touchAction:"none"}}
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){onMixDrag(r,"level",100);onMixUp(r,"level");return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.height;let cur=md.level!=null?md.level:100,ly=e.clientY;const u=ev=>{const pd=ly-ev.clientY;ly=ev.clientY;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));onMixDrag(r,"level",Math.round(cur));};const up=()=>{onMixUp(r,"level");document.removeEventListener("pointermove",u);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",u);document.addEventListener("pointerup",up);}}>
                              <div style={{position:"absolute",left:0,right:0,bottom:0,height:`${md.level}%`,background:"linear-gradient(to top,"+dc+"cc,"+dc+"66)",borderRadius:3}}/>
                              <div style={{position:"absolute",left:-3,right:-3,height:5,top:`calc(${100-md.level}% - 3px)`,background:"rgba(255,255,255,0.92)",borderRadius:2}}/>
                              <div style={{position:"absolute",left:0,right:0,top:"50%",height:1,background:"rgba(220,200,180,0.18)"}}/>
                            </div>
                            <div style={{fontSize:7,color:"rgba(210,195,175,0.6)",textAlign:"center",fontWeight:600}}>{md.level}</div>
                            {activeKit==="user"&&(
                            <div style={{display:"flex",gap:2,justifyContent:"center"}}>
                              <button style={{flex:1,padding:"3px 0",borderRadius:3,border:"1px solid "+(isRec?"#e07060":hasSample?dc+"99":"rgba(200,185,165,0.18)"),background:isRec?"rgba(224,112,96,0.18)":hasSample?dc+"22":"transparent",color:isRec?"#e07060":hasSample?dc:"rgba(200,185,165,0.6)",fontSize:7,letterSpacing:0.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}
                                onClick={()=>isRec?stopRecord():startRecord(voice.key)}>
                                {isRec?"STOP":hasSample?"●":"REC"}
                              </button>
                              {hasSample&&!isRec&&<button style={{padding:"3px 4px",borderRadius:3,border:"1px solid rgba(200,185,165,0.18)",background:"transparent",color:"rgba(200,185,165,0.5)",fontSize:7,letterSpacing:0.5,fontWeight:600,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>clearVoiceSample(voice.key)}>✕</button>}
                            </div>
                            )}
                          </div>);
                        })}
                      </div>
                      </div>);
                    })()}
                  </div>
                )}
                {/* FX sheet — global reverb / delay design */}
                {activeSheet==="fx"&&(
                  <div>
                    <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:12}}>GLOBAL FX</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:8}}>
                      {globalFxSections}
                    </div>
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
                    {/* MIXER — per-layer level balancing */}
                    {(()=>{
                      const polyMix=layerParams.synth?.mix??85;
                      const monoMix=layerParams.lead?.mix??85;
                      const setSynthMix=v=>setLayerParams(lps=>({...lps,synth:{...lps.synth,mix:v}}));
                      const setLeadMix=v=>setLayerParams(lps=>({...lps,lead:{...lps.lead,mix:v}}));
                      const toggleMute=key=>setTrackMute(t=>({...t,[key]:!t[key]}));
                      const toggleSolo=key=>setTrackSolo(t=>({...t,[key]:!t[key]}));
                      const msBtn=(label,active,color,onClick)=>(
                        <button onClick={e=>{e.stopPropagation();onClick();}}
                          style={{width:22,height:22,fontSize:9,fontWeight:700,letterSpacing:0,borderRadius:4,cursor:"pointer",fontFamily:"inherit",flexShrink:0,
                            border:"1px solid "+(active?color:"rgba(200,185,165,0.2)"),
                            background:active?color+"22":"transparent",
                            color:active?color:"rgba(210,195,175,0.45)"}}>{label}</button>
                      );
                      const fader=(label,val,color,onChange,layerKey)=>{
                        const muted=!!trackMute[layerKey];
                        const solo=!!trackSolo[layerKey];
                        const anySolo=trackSolo.synth||trackSolo.lead||trackSolo.drums;
                        const dim=muted||(anySolo&&!solo);
                        return(
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8,opacity:dim?0.4:1}}>
                            <span style={{width:42,fontSize:9,letterSpacing:1.5,fontWeight:700,color,textAlign:"right",flexShrink:0}}>{label}</span>
                            <div style={{flex:1,height:8,background:"rgba(220,200,180,0.07)",borderRadius:4,position:"relative",cursor:"ew-resize",touchAction:"none"}}
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){onChange(85);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));onChange(Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);}}
                              onDoubleClick={e=>{e.stopPropagation();onChange(85);}}>
                              <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${val}%`,background:color+"99",borderRadius:4}}/>
                              <div style={{position:"absolute",top:-3,bottom:-3,width:10,left:`calc(${val}% - 5px)`,background:"rgba(255,255,255,0.85)",borderRadius:2,boxShadow:"0 0 4px "+color+"88"}}/>
                            </div>
                            {msBtn("M",muted,"#c47a7a",()=>toggleMute(layerKey))}
                            {msBtn("S",solo,"#d4a850",()=>toggleSolo(layerKey))}
                          </div>
                        );
                      };
                      return(
                        <div style={{marginBottom:16}}>
                          <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:8}}>MIX</div>
                          {fader("POLY",polyMix,"#a8c5a0",setSynthMix,"synth")}
                          {fader("MONO",monoMix,"#6c9ad6",setLeadMix,"lead")}
                          {fader("DRUMS",drumLevel,"#c4727a",setDrumLevel,"drums")}
                          {/* Output meters intentionally desktop-only (they were
                              unreliable on mobile WebKit; removed here per design). */}
                        </div>
                      );
                    })()}
                    {/* NEW PROJECT — discards in-memory work and resets to defaults */}
                    <button style={{width:"100%",padding:"10px 0",border:"1px solid rgba(122,170,150,0.4)",borderRadius:6,background:"transparent",color:"rgba(122,170,150,0.85)",fontSize:11,letterSpacing:2,fontWeight:600,cursor:"pointer",fontFamily:"inherit",marginBottom:14,transition:"all .12s"}} onClick={newProject}>＋ NEW PROJECT</button>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:6,marginBottom:16}}>
                      {SLOTS.map(slot=>{const has=!!slotData[slot];const isActive=activeSlot===slot;const activeStyle=isActive?{border:"1px solid #c9a96e",background:"rgba(201,169,110,0.12)",color:"#c9a96e"}:{};return(
                        <div key={slot} style={{display:"flex",flexDirection:"column",gap:3,alignItems:"center"}}>
                          <span style={Object.assign({},S.menuSlotName,isActive?{color:"#c9a96e"}:{})}>{slot}{has&&<span style={S.menuSlotDot}>●</span>}</span>
                          <button style={Object.assign({},S.menuSlotBtn,activeStyle)} onClick={()=>saveSlot(slot)}>SAVE</button>
                          <button style={Object.assign({},S.menuSlotBtn,has?S.menuSlotBtnLit:{},activeStyle)} onClick={()=>loadSlot(slot)} disabled={!has}>LOAD</button>
                        </div>
                      );})}
                    </div>
                    <div style={{fontSize:9,letterSpacing:2,color:"rgba(210,195,175,0.35)",fontWeight:500,marginBottom:8}}>SHARE</div>
                    {shareFlash&&<div style={S.menuFlash}>{shareFlash}</div>}
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:6}}>
                      <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={copyShareLink}>LINK</button>
                      <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={exportJSON}>EXPORT</button>
                      <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={()=>importRef.current?.click()}>IMPORT</button>
                      <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0"})} onClick={exportMIDI}>MIDI</button>
                      <button style={Object.assign({},S.menuSlotBtn,{padding:"10px 0",opacity:exporting?0.5:1})} disabled={exporting} onClick={exportMP3}>{exporting?"…":"MP3"}</button>
                    </div>
                    {/* MP3 bounce length — how many passes through the song. */}
                    <div style={{display:"flex",alignItems:"center",gap:5,marginTop:8}}>
                      <span style={{fontSize:9,letterSpacing:1.5,color:"rgba(210,195,175,0.4)",flexShrink:0}}>MP3 PASSES ×</span>
                      {[1,2,4,8].map(n=>(
                        <button key={n} onClick={()=>setExportLoops(n)} style={{flex:1,padding:"8px 0",fontSize:11,fontWeight:700,border:"1px solid "+(exportLoops===n?"rgba(200,185,165,0.5)":"rgba(200,185,165,0.14)"),background:exportLoops===n?"rgba(200,185,165,0.1)":"transparent",color:exportLoops===n?"rgba(232,224,213,0.9)":"rgba(210,195,175,0.4)",borderRadius:6,cursor:"pointer",fontFamily:"inherit"}}>{n}</button>
                      ))}
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
                          <button style={{padding:"4px 14px",borderRadius:20,border:"1px solid "+(varyMode[activeLayer]?"rgba(201,169,110,0.6)":"rgba(200,185,165,0.2)"),background:varyMode[activeLayer]?"rgba(201,169,110,0.12)":"transparent",color:varyMode[activeLayer]?C_VARY:"rgba(200,185,165,0.4)",fontSize:10,letterSpacing:1,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setVaryMode(v=>({...v,[activeLayer]:!v[activeLayer]}))}>{(activeLayer==="lead"?"MONO":"POLY")+" VARY "+(varyMode[activeLayer]?"ON":"OFF")}</button>
                        </div>
                        <div style={{fontSize:8,letterSpacing:1.5,color:C_VARY,fontWeight:600,marginBottom:8}}>RHYTHM</div>
                        {[["DROP",vDropRate,setVDropRate,60],["SHIFT",vShiftRate,setVShiftRate,60],["RANGE",vShiftRange,setVShiftRange,8,"st"]].map(([label,val,setter,max,unit])=>(
                          <div key={label} style={{marginBottom:10}}>
                            <div style={{display:"flex",alignItems:"baseline",marginBottom:4}}>
                              <span style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.5)",fontWeight:500,width:52}}>{label}</span>
                              <span style={{fontSize:10,color:"rgba(210,195,175,0.7)",marginLeft:"auto"}}>{val}<span style={{fontSize:7,color:"rgba(210,195,175,0.35)",marginLeft:2}}>{unit||"%"}</span></span>
                            </div>
                            <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer",touchAction:"none"}}
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){setter(VDEF[label]??0);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(max,cur+ballisticDelta(pd,dim,max)));setter(Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);}}>
                              <div style={{position:"absolute",left:0,top:0,bottom:0,width:(val/max*100)+"%",background:"rgba(201,169,110,0.45)",borderRadius:3}}/>
                              <div style={{position:"absolute",top:-4,bottom:-4,width:12,left:`calc(${val/max*100}% - 6px)`,background:"rgba(255,255,255,0.85)",borderRadius:3}}/>
                            </div>
                          </div>
                        ))}
                        <div style={{fontSize:8,letterSpacing:1.5,color:C_VARY,fontWeight:600,marginBottom:8,marginTop:14}}>MELODY</div>
                        {[["PITCH",vPitchRate,setVPitchRate,60],["RANGE",vPitchRange,setVPitchRange,12,"st"],["GHOST",vGhostRate,setVGhostRate,60]].map(([label,val,setter,max,unit])=>(
                          <div key={label} style={{marginBottom:10}}>
                            <div style={{display:"flex",alignItems:"baseline",marginBottom:4}}>
                              <span style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.5)",fontWeight:500,width:52}}>{label}</span>
                              <span style={{fontSize:10,color:"rgba(210,195,175,0.7)",marginLeft:"auto"}}>{val}<span style={{fontSize:7,color:"rgba(210,195,175,0.35)",marginLeft:2}}>{unit||"%"}</span></span>
                            </div>
                            <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer",touchAction:"none"}}
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){setter(VDEF[label]??0);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(max,cur+ballisticDelta(pd,dim,max)));setter(Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);}}>
                              <div style={{position:"absolute",left:0,top:0,bottom:0,width:(val/max*100)+"%",background:"rgba(201,169,110,0.45)",borderRadius:3}}/>
                              <div style={{position:"absolute",top:-4,bottom:-4,width:12,left:`calc(${val/max*100}% - 6px)`,background:"rgba(255,255,255,0.85)",borderRadius:3}}/>
                            </div>
                          </div>
                        ))}
                        <div style={{fontSize:8,letterSpacing:1.5,color:C_VARY,fontWeight:600,marginBottom:8,marginTop:14}}>STEP</div>
                        {[["VEL",vVelJitter,setVVelJitter],["FLT",vFltJitter,setVFltJitter],["DLY",vDlyJitter,setVDlyJitter],["RHY",vRhyJitter,setVRhyJitter],["OCT",vOctJitter,setVOctJitter],["GLIDE",vGlideJitter,setVGlideJitter],["DUR",vDurJitter,setVDurJitter]].map(([label,val,setter])=>(
                          <div key={label} style={{marginBottom:10}}>
                            <div style={{display:"flex",alignItems:"baseline",marginBottom:4}}>
                              <span style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.5)",fontWeight:500,width:52}}>{label}</span>
                              <span style={{fontSize:10,color:"rgba(210,195,175,0.7)",marginLeft:"auto"}}>{val}<span style={{fontSize:7,color:"rgba(210,195,175,0.35)",marginLeft:2}}>%</span></span>
                            </div>
                            <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer",touchAction:"none"}}
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){setter(VDEF[label]??0);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));setter(Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);}}>
                              <div style={{position:"absolute",left:0,top:0,bottom:0,width:val+"%",background:"rgba(201,169,110,0.45)",borderRadius:3}}/>
                              <div style={{position:"absolute",top:-4,bottom:-4,width:12,left:`calc(${val}% - 6px)`,background:"rgba(255,255,255,0.85)",borderRadius:3}}/>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {/* DRUMS VARY — enable + RHYTHM/VELOCITY (mobile parity with desktop). */}
                    {activeLayer==="drums"&&(()=>{
                      const dPat=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
                      const vRhythm=dPat?.vRhythm||0, vVelocity=dPat?.vVelocity||0;
                      const Row=(label,val,key,accent)=>(
                        <div key={label} style={{marginBottom:12}}>
                          <div style={{display:"flex",alignItems:"baseline",marginBottom:4}}>
                            <span style={{fontSize:8,letterSpacing:1.5,color:accent,fontWeight:600,width:70}}>{label}</span>
                            <span style={{fontSize:10,color:"rgba(210,195,175,0.7)",marginLeft:"auto"}}>{val}<span style={{fontSize:7,color:"rgba(210,195,175,0.35)",marginLeft:2}}>%</span></span>
                          </div>
                          <div style={{height:6,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer",touchAction:"none"}}
                            onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){setDrumVary(key,0);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));setDrumVary(key,Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);}}>
                            <div style={{position:"absolute",left:0,top:0,bottom:0,width:val+"%",background:accent+"99",borderRadius:3}}/>
                            <div style={{position:"absolute",top:-4,bottom:-4,width:12,left:`calc(${val}% - 6px)`,background:"rgba(255,255,255,0.85)",borderRadius:3}}/>
                          </div>
                        </div>
                      );
                      return(
                        <div>
                          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:14}}>
                            <button style={{padding:"4px 14px",borderRadius:20,border:"1px solid "+(varyMode.drums?"rgba(201,169,110,0.6)":"rgba(200,185,165,0.2)"),background:varyMode.drums?"rgba(201,169,110,0.12)":"transparent",color:varyMode.drums?C_VARY:"rgba(200,185,165,0.4)",fontSize:10,letterSpacing:1,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>setVaryMode(v=>({...v,drums:!v.drums}))}>{"DRUMS VARY "+(varyMode.drums?"ON":"OFF")}</button>
                          </div>
                          <div style={{fontSize:8,letterSpacing:1.5,color:"rgba(210,195,175,0.3)",marginBottom:12}}>Re-generates each loop while VARY is on.</div>
                          {Row("RHYTHM",vRhythm,"vRhythm","#c8a840")}
                          {Row("VELOCITY",vVelocity,"vVelocity","#7888d0")}
                        </div>
                      );
                    })()}
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
  @keyframes dflash{from{opacity:1}to{opacity:0}}
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
