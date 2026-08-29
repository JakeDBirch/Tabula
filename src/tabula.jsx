import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

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
// COLS is STEPS PER BAR — and also the width of the visible grid page. A
// pattern may now be several bars long: its arrays are patW(p)=bars*COLS wide
// and the editor shows one bar at a time (see barPage). Keeping COLS meaning
// "steps per bar" is what lets every bit of layout math (ci/COLS, rect.width/
// COLS, the step bar) stay exactly as it was — the grid just draws a window
// into a wider pattern.
const MAX_BARS=32;
const patBars=p=>Math.max(1,Math.min(MAX_BARS,(p&&p.bars)||1));
const patW=p=>patBars(p)*COLS;
// Width actually allocated in a pattern's arrays (may lag `bars` mid-migration).
const gridW=g=>(g&&g[0]&&g[0].length)||COLS;
// Single shared pool of 16 abstract, structurally-distinct glyphs.
// Each field type picks from the pool with its own start offset and stride
// (strides 5, 11, 3 are all coprime with 16, so each field visits every
// symbol in a different order before wrapping). Result: same symbol palette
// across patterns, but each field defaults to a different
// glyph and progresses through them in a different order.
const SYM_POOL=["☉","☾","☿","♀","♂","♃","♄","♅","♆","♇","⚳","⚴","⚵","⚶","⚷","⚸"];
const _N=SYM_POOL.length;
const symPat=i=>SYM_POOL[(0  + i*5)  %_N];
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
// Per-pattern playback speed (the label is the speed FACTOR; `mult` scales step
// duration, so faster = smaller mult). Ordered fastest → slowest.
const SPEED_OPTS=[
  {label:"2×",  mult:0.5},
  {label:"1×",  mult:1},
  {label:"⅔×",  mult:1.5},
  {label:"½×",  mult:2},
  {label:"⅓×",  mult:3},
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
// LOOP's accent — same steel blue as the LOOP button, so the marked bar chip
// reads as "this is the bar LOOP is holding".
const C_LOOP="#9fb4c7";

const rowHue=r=>Math.round(195-(r/(ROWS-1))*135);
const rowCol=r=>"hsl("+rowHue(r)+",100%,62%)";
const patCol=i=>PAT_COLORS[i%PAT_COLORS.length];
let _id=0;
const mkGrid=(w=COLS)=>Array.from({length:ROWS},()=>new Array(w).fill(false));

// ── Musical RAND ───────────────────────────────────────────────────────────
// The rows are already scale degrees (fromBot = ROWS-1-row; the tonic sits at
// fromBot % SCALE_SPAN === 0, and the triad chord-tones 1/3/5 at
// fromBot % SCALE_SPAN in {0,2,4}). So RAND only has to add *rhythm* and
// *contour* logic to stop sounding like static noise. Two generators:
//   MONO → a metric-weighted rhythm skeleton + a chord-anchored stepwise walk.
//   POLY → a rotating arpeggio of one implied triad, with light dyads.
// Both pick one implied chord per press (I 60% / IV 20% / V 20%) so the bar
// has a single harmonic identity, and clamp density so every press is usable.
const _clsBeat=c=>c%4===0?"down":(c%2===0?"off":"16th");           // metric class
const _isChordTone=(fb,root)=>{const d=(((fb-root)%SCALE_SPAN)+SCALE_SPAN)%SCALE_SPAN;return d===0||d===2||d===4;};
const _pickRoot=()=>{const r=Math.random();return r<0.60?0:(r<0.80?3:4);};

const randMonoGrid=()=>{
  const g=mkGrid();
  const root=_pickRoot();
  // 1) Rhythm skeleton — metric-weighted trigger probability (monophonic: ≤1/col).
  const P={down:0.92,off:0.55,"16th":0.24};                        // E[hits] ≈ 7.6
  let cols=[];
  for(let c=0;c<COLS;c++)if(Math.random()<P[_clsBeat(c)])cols.push(c);
  if(!cols.includes(0))cols.unshift(0);                            // anchor the downbeat
  // 2) Density clamp to [6,11] — drop weakest cols first, add strongest empty cols.
  const STR={down:3,off:2,"16th":1},score=c=>STR[_clsBeat(c)]+Math.random();
  while(cols.length>11){const v=cols.filter(c=>c!==0).reduce((a,b)=>score(a)<score(b)?a:b);cols=cols.filter(c=>c!==v);}
  while(cols.length<6){const e=[];for(let c=0;c<COLS;c++)if(!cols.includes(c))e.push(c);cols.push(e.reduce((a,b)=>score(a)>score(b)?a:b));}
  cols.sort((a,b)=>a-b);
  // 3) Contour — chord-anchored stepwise walk inside a comfortable register.
  const LO=3,HI=12,clamp=fb=>Math.max(LO,Math.min(HI,fb));
  // nearest in-range chord tone to fb (guarantees strong beats land on 1/3/5)
  const snapChord=fb=>{let best=fb,bd=99;for(let x=LO;x<=HI;x++)if(_isChordTone(x,root)){const d=Math.abs(x-fb);if(d<bd){bd=d;best=x;}}return best;};
  let cur=snapChord(clamp([7,9,11,4][Math.floor(Math.random()*4)]));
  for(let k=0;k<cols.length;k++){
    const c=cols[k];
    if(k>0){
      const t=Math.random();
      const step=t<0.62?(Math.random()<0.5?1:-1)                   // 62% stepwise
        :t<0.82?0                                                  // 20% repeat
        :(Math.random()<0.5?1:-1)*(Math.random()<0.5?2:3);         // 18% small leap
      let next=cur+step;
      if(next<LO||next>HI)next=cur-step;                           // bounce off the walls
      cur=clamp(next);
    }
    let fb=cur;
    // strong beats (and the final note) resolve to a chord tone; weak 16ths may
    // stay on a passing tone for color.
    if(_clsBeat(c)!=="16th"||k===cols.length-1)fb=snapChord(fb);
    cur=fb;
    g[ROWS-1-fb][c]=true;                                          // ≤1 note per column
  }
  return g;
};

const randPolyGrid=()=>{
  const g=mkGrid();
  const root=_pickRoot();
  // 1) Chord-tone ladder over ~1.75 octaves of the chosen triad.
  const lo=2+Math.floor(Math.random()*3),hi=Math.min(ROWS-1,lo+11),ladder=[];
  for(let fb=lo;fb<=hi;fb++)if(_isChordTone(fb,root))ladder.push(fb);
  if(!ladder.length)ladder.push(root);                            // defensive (never empty in practice)
  // 2) Arp — random direction + starting rotation each press.
  const dir=Math.random()<0.5?1:-1;
  let idx=Math.floor(Math.random()*ladder.length);
  // 3) Rhythm — metric-weighted, a touch denser than MONO; col 0 forced.
  const W={down:0.85,off:0.55,"16th":0.30};
  for(let c=0;c<COLS;c++){
    if(!(c===0||Math.random()<W[_clsBeat(c)]))continue;
    const fb=ladder[idx];
    g[ROWS-1-fb][c]=true;                                          // primary arp note
    if(Math.random()<(_clsBeat(c)==="down"?0.35:0.18)){           // sometimes a dyad
      const up=ladder[idx+1]!=null?ladder[idx+1]:ladder[idx-1];
      if(up!=null&&up!==fb)g[ROWS-1-up][c]=true;
    }
    idx=(idx+dir+ladder.length)%ladder.length;                    // advance the arp
  }
  // 4) Clutter cap — keep it denser than MONO but never a wall (≤22 hits).
  const STR={down:3,off:2,"16th":1};
  const colHits=()=>{const h=[];for(let c=0;c<COLS;c++){let n=0;for(let r=0;r<ROWS;r++)if(g[r][c])n++;h.push(n);}return h;};
  let total=colHits().reduce((a,b)=>a+b,0);
  while(total>22){
    const h=colHits(),cands=[];for(let c=1;c<COLS;c++)if(h[c]>0)cands.push(c);
    if(!cands.length)break;
    const v=cands.reduce((a,b)=>(STR[_clsBeat(a)]+Math.random())<(STR[_clsBeat(b)]+Math.random())?a:b);
    for(let r=0;r<ROWS;r++)g[r][v]=false;
    total=colHits().reduce((a,b)=>a+b,0);
  }
  return g;
};
// durs[r][c] = how many cols this note extends to the right (1 = single cell). Only
// meaningful where grid[r][c] is true. Per-row durations enable true polyphony —
// extending one note's duration doesn't affect notes in other rows. Within a row,
// only one note plays at any moment (per-row monophony).
const mkDurs=(w=COLS)=>Array.from({length:ROWS},()=>new Array(w).fill(1));
const defaultStepParams=(w=COLS)=>Array.from({length:w},()=>({vel:100,flt:50,dly:0,rev:0,rhy:1,dur:0,oct:2,glide:0}));
const mkPat=name=>({id:++_id,name,grid:mkGrid(),durs:mkDurs(),params:defaultStepParams(),gridLen:16,bars:1,speedMult:1});
// Cull a pattern down to monophonic — at most one active note per column.
// Used when copying a POLY (multi-row-per-col) pattern onto the MONO layer:
// without this, dragging a chord onto MONO would still try to play every
// note. Keeps the TOP-MOST note (lowest row index = highest pitch — that's
// usually the melody line in a chord). Returns new grid+durs arrays; doesn't
// mutate inputs.
const cullPatToMono=(grid,durs)=>{
  const g=grid.map(row=>[...row]);
  const W=gridW(grid);
  const d=durs?durs.map(row=>[...row]):mkDurs(W);
  for(let c=0;c<W;c++){
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
const mkDrumVel=(w=COLS)=>Array.from({length:DRUM_ROWS},()=>new Array(w).fill(100));
// Normalize any saved vel into the per-cell 2D shape. Legacy saves stored a
// 1D per-column array — broadcast each column value across all rows. A 2D
// array (current shape) is copied cell-by-cell into a fresh full-size grid.
// `w` is the pattern's column count. Without it these normalizers would clip a
// multi-bar pattern's velocity/ratchet lanes back to one bar on every call —
// and they're called from the cell editors, so the damage would be silent.
const toDrumVel2D=(vel,w)=>{
  const W=w||(Array.isArray(vel)&&Array.isArray(vel[0])?gridW(vel):COLS);
  const out=mkDrumVel(W);
  if(!Array.isArray(vel))return out;
  if(Array.isArray(vel[0])){ // already per-cell
    for(let r=0;r<DRUM_ROWS;r++)for(let c=0;c<W;c++)
      if(vel[r]&&vel[r][c]!=null)out[r][c]=vel[r][c];
  } else { // legacy per-column → broadcast down each column
    for(let r=0;r<DRUM_ROWS;r++)for(let c=0;c<W;c++)
      if(vel[c%vel.length]!=null)out[r][c]=vel[c%vel.length];
  }
  return out;
};
// Per-cell ratchet: rat[row][col] = how many evenly-spaced retriggers fire
// within that step (1 = a single normal hit). Ctrl/Cmd+click a cell cycles it.
const mkDrumRat=(w=COLS)=>Array.from({length:DRUM_ROWS},()=>new Array(w).fill(1));
// Normalize a saved ratchet grid into the 2D shape. No legacy 1D form exists
// (the field is new), so anything non-2D just yields all-1s.
const toDrumRat2D=(rat,w)=>{
  const W=w||(Array.isArray(rat)&&Array.isArray(rat[0])?gridW(rat):COLS);
  const out=mkDrumRat(W);
  if(!Array.isArray(rat)||!Array.isArray(rat[0]))return out;
  for(let r=0;r<DRUM_ROWS;r++)for(let c=0;c<W;c++)
    if(rat[r]&&rat[r][c]!=null)out[r][c]=Math.max(1,Math.min(8,rat[r][c]));
  return out;
};
const mkDrumPat=name=>({id:++_id,name,grid:Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(false)),vel:mkDrumVel(),rat:mkDrumRat(),gridLen:16,bars:1,mix:defaultDrumMix(),vRhythm:0,vVelocity:0,speedMult:1,vo:DRUM_ORDER_V});


// ── Sparse pattern codec ─────────────────────────────────────────────────
// A pattern's grid is ROWS × (bars*COLS) cells that are overwhelmingly false,
// and JSON writes every one of them out longhand: a single 1-bar pattern costs
// ~3.3KB, so a project of 32-bar patterns would serialize to megabytes. That
// breaks in two places at once — share links carry the whole project base64'd
// in the URL, and autosave writes the same blob into localStorage's ~5MB quota
// — and it would put 50 dense undo snapshots in memory on a phone.
//
// So everything that leaves live state (share link, file export, save slot,
// undo snapshot) stores only the cells that are ON and the values that differ
// from their default. A 32-bar pattern with 60 notes costs single-digit KB,
// which is smaller than today's dense 1-bar encoding.
//
// Decoding is tolerant: anything without the `_pk` marker is a pre-codec dense
// save and passes through untouched, so old projects still load.
const _packBool=(rows,W)=>{
  const on=[];
  for(let r=0;r<(rows||[]).length;r++){
    const row=rows[r]; if(!row)continue;
    for(let c=0;c<W;c++)if(row[c])on.push(r*W+c);
  }
  return on;
};
const _unpackBool=(on,H,W)=>{
  const g=Array.from({length:H},()=>new Array(W).fill(false));
  for(const k of (on||[])){const r=Math.floor(k/W),c=k%W;if(g[r]&&c<W)g[r][c]=true;}
  return g;
};
// Numeric lanes ride as a flat [index,value,index,value,…] pair list — half the
// JSON of an array of 2-element arrays.
const _packNum=(rows,W,def)=>{
  const out=[];
  for(let r=0;r<(rows||[]).length;r++){
    const row=rows[r]; if(!row)continue;
    for(let c=0;c<W;c++){const v=row[c];if(v!==undefined&&v!==def)out.push(r*W+c,v);}
  }
  return out;
};
const _unpackNum=(flat,H,W,def)=>{
  const g=Array.from({length:H},()=>new Array(W).fill(def));
  for(let i=0;i+1<(flat||[]).length;i+=2){
    const k=flat[i],r=Math.floor(k/W),c=k%W;
    if(g[r]&&c<W)g[r][c]=flat[i+1];
  }
  return g;
};
const _packParams=(arr,W)=>{
  const D=defaultStepParams(1)[0],out=[];
  for(let i=0;i<W;i++){
    const sp=arr&&arr[i]; if(!sp)continue;
    const d={};let any=false;
    for(const k of Object.keys(sp)){
      if(!(k in D)||sp[k]!==D[k]){d[k]=sp[k];any=true;}   // keeps unknown keys too
    }
    if(any)out.push([i,d]);
  }
  return out;
};
const _unpackParams=(list,W)=>{
  const a=defaultStepParams(W);
  for(const e of (list||[])){if(Array.isArray(e)&&a[e[0]])Object.assign(a[e[0]],e[1]);}
  return a;
};
// packPat also serves as the deep copy for undo snapshots — every heavy lane
// comes back as a fresh array, so callers don't need a JSON round-trip first.
const packPat=(p)=>{
  if(!p||!Array.isArray(p.grid)||p._pk)return p;
  const W=gridW(p.grid),H=p.grid.length;
  const o=Object.assign({},p,{_pk:1,_w:W,_h:H});
  o.grid=_packBool(p.grid,W);
  if(p.durs)  o.durs  =_packNum(p.durs,W,1);
  if(p.params)o.params=_packParams(p.params,W);
  if(p.vel)   o.vel   =_packNum(Array.isArray(p.vel[0])?p.vel:toDrumVel2D(p.vel,W),W,100);
  if(p.rat)   o.rat   =_packNum(Array.isArray(p.rat[0])?p.rat:toDrumRat2D(p.rat,W),W,1);
  if(Array.isArray(p.mix))o.mix=p.mix.map(m=>Object.assign({},m));
  if(p.motion&&typeof p.motion==="object"){
    const m={};
    for(const k of Object.keys(p.motion)){
      const lane=p.motion[k];
      if(Array.isArray(lane))m[k]=_packNum(lane,W,null);
    }
    o.motion=m;
  }
  return o;
};
const unpackPat=(p)=>{
  if(!p||!p._pk)return p;                       // pre-codec dense save
  const W=p._w||COLS, H=p._h||(p.durs!==undefined?ROWS:DRUM_ROWS);
  const o=Object.assign({},p);
  delete o._pk;delete o._w;delete o._h;
  o.grid=_unpackBool(p.grid,H,W);
  if(p.durs!==undefined)  o.durs  =_unpackNum(p.durs,H,W,1);
  if(p.params!==undefined)o.params=_unpackParams(p.params,W);
  if(p.vel!==undefined)   o.vel   =_unpackNum(p.vel,H,W,100);
  if(p.rat!==undefined)   o.rat   =_unpackNum(p.rat,H,W,1);
  if(p.motion&&typeof p.motion==="object"){
    const m={};
    for(const k of Object.keys(p.motion))m[k]=_unpackNum(p.motion[k],H,W,null);
    o.motion=m;
  }
  return normalizePatBars(o);
};
// Patterns live in three places in a project: the active layer's `pats`, the
// drum `drumPats`, and each parked layer inside `layerStore`. Miss one and that
// layer silently loses its notes on the next save — the layer-store split is
// exactly the trap the architecture notes warn about.
const _mapProjectPats=(st,fn)=>{
  if(!st)return st;
  const o=Object.assign({},st);
  // Unified store: every part of every pattern.
  if(Array.isArray(st.patterns))o.patterns=st.patterns.map(p=>{
    if(!p||!p.parts)return p;
    const parts={};
    for(const l of Object.keys(p.parts))parts[l]=fn(p.parts[l]);
    return Object.assign({},p,{parts});
  });
  if(Array.isArray(st.pats))o.pats=st.pats.map(fn);
  if(Array.isArray(st.drumPats))o.drumPats=st.drumPats.map(fn);
  if(st.layerStore&&typeof st.layerStore==="object"){
    const ls={};
    for(const k of Object.keys(st.layerStore)){
      const v=st.layerStore[k];
      ls[k]=(v&&Array.isArray(v.pats))?Object.assign({},v,{pats:v.pats.map(fn)}):v;
    }
    o.layerStore=ls;
  }
  return o;
};
const packProject  =(st)=>_mapProjectPats(st,packPat);
const unpackProject=(st)=>_mapProjectPats(st,unpackPat);

// ── Unified patterns ─────────────────────────────────────────────────────
// A PATTERN is everything the machine is doing at once: a synth part, a lead
// part and a drum part, sharing one bar count. It is the unit a song sequences.
//
// This replaces three independent per-layer libraries (`pats`, the parked
// `layerStore[layer].pats`, and `drumPats`) plus a three-lane song matrix. That
// arrangement is what forced the layer-store swap — the single largest source
// of "a track went silent when I switched layers" bugs — and what forced the
// scheduler to invent a shared bar length by taking the shortest populated
// lane. With one pattern holding all three parts, both problems stop existing:
// there is nothing to park, and a pattern knows its own length.
//
// The trade, stated plainly: parts can no longer be reused independently. The
// same drums under two different melodies means two patterns, and edits to one
// don't reach the other.
const MAX_PATTERNS=16;
// A song slot can play its pattern up to this many times before the song moves
// on — a ratchet for the arrangement. Four, like a step's ratchet.
const SONG_MAX_REP=4;
const normSongRep=(r)=>{
  const out=new Array(64).fill(1);
  if(Array.isArray(r))for(let i=0;i<64;i++){
    const v=Math.round(r[i]);
    if(v>=1&&v<=SONG_MAX_REP)out[i]=v;
  }
  return out;
};
const PART_LAYERS=["synth","lead","drums"];
const mkSynthPart=(w=COLS)=>({grid:mkGrid(w),durs:mkDurs(w),params:defaultStepParams(w),gridLen:Math.min(COLS,w),speedMult:1});
const mkDrumPart =(w=COLS)=>({grid:Array.from({length:DRUM_ROWS},()=>new Array(w).fill(false)),
  vel:mkDrumVel(w),rat:mkDrumRat(w),gridLen:Math.min(COLS,w),speedMult:1,
  mix:defaultDrumMix(),vRhythm:0,vVelocity:0,vo:DRUM_ORDER_V});
const mkPattern=(name,bars=1)=>{
  const w=Math.max(1,Math.min(MAX_BARS,bars))*COLS;
  return {id:++_id,name,bars:Math.max(1,Math.min(MAX_BARS,bars)),
    parts:{synth:mkSynthPart(w),lead:mkSynthPart(w),drums:mkDrumPart(w)}};
};
// ── Compatibility views ──────────────────────────────────────────────────
// Most of the editor was written against a flat per-layer pattern: `p.grid`,
// `p.gridLen`, `p.id`, `p.name`, `p.bars`. `partView` presents one part in
// exactly that shape, and `mergeLayer` folds an edited library back into the
// unified store — so the existing call sites keep working while the model
// underneath is a single list. Delete these once the call sites are rewritten.
const partView=(pat,layer)=>Object.assign({},pat.parts[layer],{id:pat.id,name:pat.name,bars:pat.bars});
const layerLib=(pats,layer)=>(pats||[]).map(p=>partView(p,layer));
const _stripView=(v)=>{const o=Object.assign({},v);delete o.id;delete o.name;delete o.bars;return o;};
const mergeLayer=(patterns,layer,next)=>{
  const seen=new Set((next||[]).map(v=>v.id));
  const out=[];
  for(const p of (patterns||[])){
    if(!seen.has(p.id))continue;                 // dropped from the view = pattern deleted
    const v=(next||[]).find(x=>x.id===p.id);
    const nb=Math.max(1,Math.min(MAX_BARS,v.bars||p.bars||1));
    const np=Object.assign({},p,{name:v.name!=null?v.name:p.name,bars:nb});
    np.parts=Object.assign({},p.parts,{[layer]:_stripView(v)});
    // A bar-count change has to carry ALL THREE parts with it, or the untouched
    // parts read as undefined past the old width at playback time.
    if(nb!==p.bars){
      for(const l of PART_LAYERS)
        np.parts[l]=_stripView(resizePatBars(Object.assign({},np.parts[l],{bars:nb}),nb));
    }
    out.push(np);
  }
  for(const v of (next||[])){                    // a new id in the view = a new pattern
    if((patterns||[]).some(p=>p.id===v.id))continue;
    const bars=Math.max(1,Math.min(MAX_BARS,v.bars||1));
    const base=mkPattern(v.name,bars);
    base.id=v.id;
    base.parts[layer]=_stripView(v);
    out.push(base);
  }
  return out;
};

// ── Legacy project migration ─────────────────────────────────────────────
// Pre-unification saves hold three independent libraries (the active layer in
// `pats`, the parked one in `layerStore[layer].pats`, drums in `drumPats`) and
// a three-lane `songMatrix`. Each populated song column names one combination
// of the three, which is exactly what a unified pattern is — so every distinct
// column becomes a pattern, in first-appearance order, and the song becomes the
// sequence of those.
//
// This is lossy in one specific way, and deliberately so: where a drum pattern
// was shared across several columns it becomes independent copies, so editing
// one no longer changes the others. Nothing is silenced.
const unifyLegacyProject=(s)=>{
  if(!s||Array.isArray(s.patterns))return s;            // already unified
  if(!Array.isArray(s.pats)&&!Array.isArray(s.drumPats))return s;
  const libOf=(layer)=>{
    if(layer==="drums")return s.drumPats||[];
    if(s.activeLayer===layer||(!s.activeLayer&&layer==="synth"))return s.pats||[];
    const ld=s.layerStore&&s.layerStore[layer];
    return (ld&&ld.pats)||[];
  };
  const libs={synth:libOf("synth"),lead:libOf("lead"),drums:libOf("drums")};
  const activeOf=(layer)=>{
    if(layer==="drums")return s.activeDrumId;
    if(s.activeLayer===layer||(!s.activeLayer&&layer==="synth"))return s.activeId;
    const ld=s.layerStore&&s.layerStore[layer];
    return ld&&ld.activeId;
  };
  const sm=s.songMatrix||null;
  const cols=[];
  if(sm){
    for(let i=0;i<64;i++){
      const t={synth:sm.synth?sm.synth[i]:null,lead:sm.lead?sm.lead[i]:null,drums:sm.drums?sm.drums[i]:null};
      if(t.synth!=null||t.lead!=null||t.drums!=null)cols.push({i,t});
    }
  }
  // Every library pattern has to end up somewhere or it is silently lost — a
  // project with patterns but no song arrangement would otherwise migrate to
  // just the active combination. Pair the libraries up by index and append any
  // combination the song didn't already name.
  const maxLib=Math.max(libs.synth.length,libs.lead.length,libs.drums.length,1);
  const _k=t=>[t.synth,t.lead,t.drums].join("|");
  const named=new Set(cols.map(c=>_k(c.t)));
  for(let i=0;i<maxLib;i++){
    const t={synth:libs.synth[i]?libs.synth[i].id:null,
             lead: libs.lead[i]? libs.lead[i].id :null,
             drums:libs.drums[i]?libs.drums[i].id:null};
    if(t.synth==null&&t.lead==null&&t.drums==null)continue;
    if(named.has(_k(t)))continue;
    named.add(_k(t));
    cols.push({i:-1,t});                      // -1 = exists as a pattern, not placed in the song
  }
  if(!cols.length)cols.push({i:0,t:{synth:activeOf("synth"),lead:activeOf("lead"),drums:activeOf("drums")}});
  const key=t=>[t.synth,t.lead,t.drums].join("|");
  const byKey=new Map(); const patterns=[]; const song=new Array(64).fill(null);
  for(const {i,t} of cols){
    const k=key(t);
    let pat=byKey.get(k);
    if(!pat){
      if(patterns.length>=MAX_PATTERNS)continue;        // more sections than slots — drop the tail
      const src={};
      let bars=1;
      for(const l of PART_LAYERS){
        let found=t[l]!=null?libs[l].find(x=>x&&x.id===t[l]):null;
        // Drum saves are positional; bring them to the current voice order
        // before they become a part, or the kit remaps silently.
        if(found&&l==="drums")found=migrateDrumPatRows(found);
        if(found)bars=Math.max(bars,patBars(normalizePatBars(found)));
        src[l]=found||null;
      }
      pat=mkPattern(String.fromCharCode(65+patterns.length),bars);
      for(const l of PART_LAYERS){
        if(!src[l])continue;
        const np=normalizePatBars(resizePatBars(src[l],bars));
        const part=Object.assign({},np);
        delete part.id;delete part.name;delete part.bars;
        pat.parts[l]=part;
      }
      byKey.set(k,pat);patterns.push(pat);
    }
    if(i>=0)song[i]=pat.id;
  }
  if(!patterns.length)patterns.push(mkPattern("A"));
  // Close the gaps: the old matrix could be sparse, a song is linear.
  const linear=song.filter(x=>x!=null);
  const out=Object.assign({},s,{patterns,activePatId:patterns[0].id,
    song:linear.concat(new Array(64).fill(null)).slice(0,64)});
  delete out.pats;delete out.drumPats;delete out.layerStore;delete out.songMatrix;
  return out;
};

// ── Bar-scoped column helpers ────────────────────────────────────────────
// The editor works one bar at a time, so RAND / CLR / CPY / PST / MUT8 all act
// on a COLS-wide column window rather than the whole pattern. These move those
// windows around: `sliceCols` lifts one out, `spliceCols` drops one in.
const sliceCols=(rows,off,w=COLS,fill=()=>false)=>(rows||[]).map(row=>{
  const o=new Array(w);
  for(let i=0;i<w;i++)o[i]=(row&&row[off+i]!==undefined)?row[off+i]:fill();
  return o;
});
const spliceCols=(dst,src,dstOff,srcOff=0,w=COLS,fill=()=>false)=>(dst||[]).map((row,ri)=>{
  const o=[...row];
  for(let i=0;i<w;i++){
    const d=dstOff+i; if(d>=o.length)break;
    const sv=(src&&src[ri])?src[ri][srcOff+i]:undefined;
    o[d]=sv!==undefined?sv:fill();
  }
  return o;
});
// Flat per-column arrays (a pattern's `params`). Values are objects, so both
// directions copy rather than alias — otherwise editing a pasted step's
// velocity would reach back into the clipboard.
const sliceFlat=(arr,off,w=COLS,mk=()=>defaultStepParams(1)[0])=>{
  const o=new Array(w);
  for(let i=0;i<w;i++)o[i]=(arr&&arr[off+i])?Object.assign({},arr[off+i]):mk();
  return o;
};
// Open a COLS-wide hole at column `at` by sliding everything from there to the
// right — the pattern must already have been grown by one bar. Used by
// duplicate-bar, which INSERTS after the visible bar rather than overwriting
// whatever came next.
const openBarGap=(rows,at,W)=>(rows||[]).map(row=>{
  const o=[...row];
  for(let c=W-1;c>=at+COLS;c--)o[c]=o[c-COLS];
  return o;
});
const openBarGapFlat=(arr,at,W)=>{
  const o=[...(arr||[])];
  for(let c=W-1;c>=at+COLS;c--)o[c]=o[c-COLS];
  return o;
};
const spliceFlat=(dst,src,dstOff,srcOff=0,w=COLS,mk=()=>defaultStepParams(1)[0])=>{
  const o=[...(dst||[])];
  for(let i=0;i<w;i++){
    const d=dstOff+i; if(d>=o.length)break;
    o[d]=(src&&src[srcOff+i])?Object.assign({},src[srcOff+i]):mk();
  }
  return o;
};

// ── Bar resizing ─────────────────────────────────────────────────────────
// Patterns are 1..MAX_BARS bars long. Every per-column structure (grid, durs,
// params, drum vel/rat, drum motion lanes) is bars*COLS wide and has to grow
// and shrink together — a half-resized pattern reads as undefined at playback
// time, which Babel compiles happily and only explodes when you press play.
const _resizeRows=(rows,w,fill)=>(rows||[]).map(r=>{
  const o=new Array(w);
  for(let i=0;i<w;i++)o[i]=(r&&r[i]!==undefined&&r[i]!==null)?r[i]:fill();
  return o;
});
// Returns a NEW pattern resized to `bars`. Growing sets gridLen to the new full
// width (adding a bar means the pattern is a bar longer — you can still trim it
// back with the length slider); shrinking clamps gridLen into what is left.
const resizePatBars=(p,bars)=>{
  if(!p)return p;
  const nb=Math.max(1,Math.min(MAX_BARS,Math.round(bars)));
  const w=nb*COLS, oldW=gridW(p.grid), grew=w>oldW;
  const out=Object.assign({},p,{bars:nb});
  const isDrum=Array.isArray(p.grid)&&p.grid.length===DRUM_ROWS&&!p.durs;
  out.grid=_resizeRows(p.grid,w,()=>false);
  if(p.durs)  out.durs=_resizeRows(p.durs,w,()=>1);
  if(p.params){
    const np=new Array(w);
    for(let i=0;i<w;i++)np[i]=p.params[i]?Object.assign({},p.params[i]):defaultStepParams(1)[0];
    out.params=np;
  }
  if(p.vel) out.vel=_resizeRows(Array.isArray(p.vel[0])?p.vel:toDrumVel2D(p.vel,oldW),w,()=>100);
  if(p.rat) out.rat=_resizeRows(Array.isArray(p.rat[0])?p.rat:toDrumRat2D(p.rat,oldW),w,()=>1);
  if(p.motion&&typeof p.motion==="object"){
    const m={};
    for(const k of Object.keys(p.motion)){
      const lane=p.motion[k];
      // motion cells are number|null and null is MEANINGFUL ("inherit the base
      // mix here"), so this lane can't go through _resizeRows' null-as-missing.
      if(Array.isArray(lane))m[k]=lane.map(r=>{const o=new Array(w);for(let i=0;i<w;i++)o[i]=(r&&i<r.length)?r[i]:null;return o;});
    }
    out.motion=m;
  }
  void isDrum;void grew;
  // A part keeps ITS OWN length when the pattern gets longer. That's what makes
  // a part loop to fill: the scheduler wraps each part's cursor at its gridLen
  // inside a pattern that is bars*COLS long, so a 1-bar drum part repeats
  // through a 4-bar pattern instead of playing one bar and going silent.
  // Snapping gridLen out to the full width on every ADD BAR is what killed it.
  out.gridLen=Math.max(1,Math.min(w,p.gridLen||w));
  return out;
};
// Writing into a bar past the end of a part would be silent under that rule, so
// an explicit note extends the part through the bar it landed in — that's how a
// bar you just added gets content of its own. Only note CREATION calls this;
// erasing never shortens, and the length slider stays the way to trim.
const growLenTo=(p,col)=>{
  if(!p||!Array.isArray(p.grid))return p;
  const w=gridW(p.grid), end=Math.min(w,(Math.floor(col/COLS)+1)*COLS);
  return (p.gridLen||0)>=end?p:Object.assign({},p,{gridLen:end});
};
// Normalize a pattern loaded from disk: derive `bars` from whatever its arrays
// actually carry, then re-run the resize so every lane agrees on the width.
const normalizePatBars=(p)=>{
  if(!p||!Array.isArray(p.grid))return p;
  const declared=p.bars!=null?Math.max(1,Math.min(MAX_BARS,p.bars)):null;
  const fromArr=Math.max(1,Math.min(MAX_BARS,Math.ceil(gridW(p.grid)/COLS)));
  const bars=declared||fromArr;
  if(p.bars===bars&&gridW(p.grid)===bars*COLS)return p;
  return resizePatBars(p,bars);
};// Continuous drum-mix params that support motion automation (the slider ones;
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
    const _w=gridW(pat.grid);
    const v=(Array.isArray(pat.vel)&&Array.isArray(pat.vel[0]))?pat.vel:toDrumVel2D(pat.vel,_w);
    return normalizePatBars(Object.assign({},pat,{vel:v,rat:toDrumRat2D(pat.rat,_w)}));
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
  const vel2=toDrumVel2D(pat.vel,gridW(pat.grid)); // full DRUM_ROWS in *current* order if 2D, else broadcast
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
// Legacy saves named patterns with letters ("A","B",…). The
// app now uses abstract glyphs assigned by index. On load, any name that isn't
// already one of the glyph symbols gets reassigned to its index-based glyph so
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
const RV_DAMP_DB=-7;  // per-pass shelf cut; compounds over recirculations. Gentler
                      // than the old -12 so the damping eases in around the corner
                      // instead of clamping hard just past it.
const rvHfHz=pct=>20000*Math.pow(1200/20000,Math.max(0,Math.min(100,pct))/100);
const rvLfHz=pct=>20*Math.pow(800/20,Math.max(0,Math.min(100,pct))/100);
const fmtHz=f=>f>=1000?(f/1000).toFixed(f>=10000?0:1)+"k":Math.round(f)+"";
const defaultDrums=()=>({
  grid:Array.from({length:DRUM_ROWS},()=>new Array(COLS).fill(false)),
  vel:mkDrumVel(),
  rat:mkDrumRat(),
  gridLen:16,
  bars:1,
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
  rvSize:50, rvDamp:40, rvLfDamp:0, rvPreDelay:0, rvMod:0, dlyToRev:0,
  drumLevel:85, drumMix:defaultDrumMix(), activeKit:DEFAULT_KIT,
  vDropRate:13, vShiftRate:17, vShiftRange:1,
  vPitchRate:0, vPitchRange:1, vGhostRate:0,
  vVelJitter:0, vFltJitter:0, vDlyJitter:0,
  vRhyJitter:0, vOctJitter:0, vGlideJitter:0, vDurJitter:0,
  loopMode:false, loopBar:-1, loopPat:null, varyMode:{synth:false,lead:false,drums:false},
  songMode:false, songView:false,
});


const vcfHz=v=>Math.round(20*Math.pow(1000,v/100)); // 20Hz–20kHz
const vcfLbl=v=>{const f=vcfHz(v);return f>=1000?(f/1000).toFixed(1)+"k":String(f);};
const hpHz=v=>Math.round(20*Math.pow(100,v/100));
const hpLbl=v=>{const f=hpHz(v);return f>=1000?(f/1000).toFixed(1)+"k":String(f);};
const lpHz=v=>Math.round(400*Math.pow(50,v/100));
const lpLbl=v=>{const f=lpHz(v);return f>=1000?(f/1000).toFixed(1)+"k":String(f);};
// Inverses (Hz → 0..100 param) for the dual-thumb RangeSlider, which drags on a
// shared frequency axis and converts back to each param's own scale.
const hpInv  =f=>100*Math.log(f/20)/Math.log(100);
const lpInv  =f=>100*Math.log(f/400)/Math.log(50);
const rvLfInv=f=>100*Math.log(f/20)/Math.log(800/20);
const rvHfInv=f=>100*Math.log(f/20000)/Math.log(1200/20000);
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
// unreliable on touch (controls capture the pointer + touch-action:none), so we
// detect it ourselves: a clean TAP (press+release that DIDN'T move) on a
// control, followed within 350ms by a press on the SAME element near the same
// spot. The "clean tap" requirement — tracked by document-level capture-phase
// listeners installed once — is what stops two quick nudge-DRAGS (or a
// drag-then-grab) from false-firing a reset mid-adjustment. The optional `key`
// (e.g. a step column) lets one element host several reset targets: only taps
// sharing a key pair up, so taps on adjacent steps of one lane don't collide.
const _lastTap={t:-1e9,x:0,y:0,el:null,key:null};
let _tapPress=null; // the in-flight press that called isDoubleTap (for move/up tracking)
const _tapInstall=()=>{
  if(_tapInstall.done||typeof document==="undefined")return; _tapInstall.done=true;
  // Capture phase → these run before React's bubble-phase pointer handlers.
  document.addEventListener("pointerdown",()=>{_tapPress=null;},true);
  document.addEventListener("pointermove",e=>{
    if(_tapPress&&(Math.abs(e.clientX-_tapPress.x)>8||Math.abs(e.clientY-_tapPress.y)>8))_tapPress.moved=true;
  },true);
  const finish=(e,cancelled)=>{
    if(_tapPress&&!_tapPress.moved&&!cancelled){ // a clean tap → arm it as a double-tap candidate
      _lastTap.el=_tapPress.el;_lastTap.key=_tapPress.key;_lastTap.t=e.timeStamp;_lastTap.x=_tapPress.x;_lastTap.y=_tapPress.y;
    }
    _tapPress=null;
  };
  document.addEventListener("pointerup",e=>finish(e,false),true);
  document.addEventListener("pointercancel",e=>finish(e,true),true);
};
const isDoubleTap=(e,key=null)=>{
  _tapInstall();
  const t=e.timeStamp, el=e.currentTarget;
  _tapPress={el,key,x:e.clientX,y:e.clientY,moved:false};
  const dbl=el===_lastTap.el && key===_lastTap.key && (t-_lastTap.t)<350 && Math.abs(e.clientX-_lastTap.x)<30 && Math.abs(e.clientY-_lastTap.y)<30;
  if(dbl){_lastTap.t=-1e9;_lastTap.el=null;_lastTap.key=null;_tapPress=null;return true;} // consume; don't arm this press
  return false;
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

// c0/w bound the column WINDOW this variation touches; shifts and ghost notes
// wrap inside it. Defaults to the whole grid, which for a 1-bar pattern is
// exactly the old behaviour. Multi-bar patterns pass one bar at a time so VARY
// keeps meaning what it always meant: a fresh roll every bar.
const genVariation=(grid,vp={},c0=0,w=null)=>{
  const W=w!=null?w:gridW(grid);
  const C0=c0|0, C1=Math.min(gridW(grid),C0+W);
  const wrap=c=>C0+(((c-C0)%(C1-C0))+(C1-C0))%(C1-C0);
  const g=grid.map(r=>[...r]);
  const drop=(vp.dropRate??13)/100;
  const shift=(vp.shiftRate??17)/100;
  const sRange=vp.shiftRange??1;
  const pitch=(vp.pitchRate??0)/100;
  const pRange=vp.pitchRange??1;
  const ghost=(vp.ghostRate??0)/100;
  const on=[];
  let droppedCount=0;
  for(let r=0;r<ROWS;r++)for(let c=C0;c<C1;c++){
    if(!grid[r][c])continue;
    const roll=Math.random();
    if(roll<drop){ g[r][c]=false; droppedCount++; }
    else if(roll<drop+shift){
      const nc=wrap(c+(Math.floor(Math.random()*sRange*2+1)-sRange));
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
    for(let r=0;r<ROWS;r++)for(let c=C0;c<C1;c++){
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
        const nc=wrap(bc+Math.floor(Math.random()*5)-2);
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
  for(let r=0;r<ROWS;r++)for(let c=C0;c<C1;c++){
    if(grid[r][c])hadInput=true;
    if(g[r][c])hasOut=true;
    if(hadInput&&hasOut)break;
  }
  if(hadInput&&!hasOut){
    outer:for(let r=0;r<ROWS;r++)for(let c=C0;c<C1;c++){
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
// c0/w scope the roll to one bar (see genVariation). The anti-silence guard is
// scoped the same way — it asks "did THIS bar lose all its notes", not "did the
// whole pattern", so a 32-bar pattern with an intentionally empty bar 7 doesn't
// get a note forced into it.
const safeVaryGrid=(grid,vp,gridLen,c0=0,w=null)=>{
  const W=gridW(grid);
  const len=Math.max(1,Math.min(W,gridLen||W));
  const C0=c0|0, C1=Math.min(W,len,C0+(w!=null?w:W));
  const hasInWindow=(g)=>{
    for(let r=0;r<ROWS;r++)for(let c=C0;c<C1;c++)if(g[r]&&g[r][c])return true;
    return false;
  };
  if(C1<=C0)return grid.map(r=>[...r]);
  const origHas=hasInWindow(grid);
  const varied=genVariation(grid,vp,C0,C1-C0);
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
    if(isDoubleTap(e)){drag.current=null;onChange(def!=null?def:((min<0&&max>0)?0:min));return;} // clear so the held 2nd tap can't resume a stale drag
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
  const onUp=useCallback(()=>{drag.current=null;},[]); // end the drag on release so it can't linger
  if(vertical){
    return(
      <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4,userSelect:"none",width:52}}>
        <div style={{fontSize:10,letterSpacing:1,fontWeight:500,color:col+"bb",textAlign:"center",lineHeight:1.4}}>
          <div>{label}</div>
          <div style={{color:col,letterSpacing:0}}>{display}</div>
        </div>
        <div ref={ref} style={{position:"relative",width:28,flex:1,minHeight:80,cursor:"ns-resize",touchAction:"none",display:"flex",justifyContent:"center"}}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={onReset}>
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
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onDoubleClick={onReset}>
        <div style={S.knobTrackBg}/>
        <div style={Object.assign({},S.knobTrackFill,{width:pct+"%",background:col+"88"})}/>
        <div style={Object.assign({},S.knobThumb,{left:pct+"%",background:col,boxShadow:"0 0 8px "+col+"99"})}/>
      </div>
    </div>
  );
}
// Dual-thumb range slider on a shared log-frequency axis (20Hz..20kHz). Each
// thumb owns one param (the low/high corner of a band) and reads/writes it via
// toFreq/fromFreq; the fill between the thumbs is the passband. Used so the
// delay HP+LP and the reverb LF+HF damp each read as one "range" control rather
// than two separate sliders. Each thumb drags ballistically in axis space,
// double-taps to its default, and a small gap stops the corners from crossing.
//   lo / hi = {val,min,max,toFreq,fromFreq,onChange,def,disp}
function RangeSlider({label,accent,lo,hi}){
  const ref=useRef(null);
  const drag=useRef(null);
  const col=accent||"rgba(255,255,255,0.6)";
  const A0=Math.log(20), AW=Math.log(20000)-A0;
  const f2p=f=>(Math.log(Math.max(20,Math.min(20000,f)))-A0)/AW*100;
  const p2f=p=>Math.exp(A0+(Math.max(0,Math.min(100,p))/100)*AW);
  const loPos=f2p(lo.toFreq(lo.val)), hiPos=f2p(hi.toFreq(hi.val));
  // Each thumb's allowed span on the shared axis (its own param's freq range).
  const loAxis={aMin:Math.min(f2p(lo.toFreq(lo.min)),f2p(lo.toFreq(lo.max))),aMax:Math.max(f2p(lo.toFreq(lo.min)),f2p(lo.toFreq(lo.max)))};
  const hiAxis={aMin:Math.min(f2p(hi.toFreq(hi.min)),f2p(hi.toFreq(hi.max))),aMax:Math.max(f2p(hi.toFreq(hi.min)),f2p(hi.toFreq(hi.max)))};
  const GAP=3;
  const setLo=p=>lo.onChange(Math.round(Math.max(lo.min,Math.min(lo.max,lo.fromFreq(p2f(p))))));
  const setHi=p=>hi.onChange(Math.round(Math.max(hi.min,Math.min(hi.max,hi.fromFreq(p2f(p))))));
  const onDown=useCallback(e=>{
    e.stopPropagation();
    const rect=ref.current.getBoundingClientRect();
    const xPos=Math.max(0,Math.min(100,(e.clientX-rect.left)/Math.max(1,rect.width)*100));
    const grabPct=16/Math.max(1,rect.width)*100;            // ~one thumb radius
    const loD=Math.abs(xPos-loPos), hiD=Math.abs(xPos-hiPos);
    let which;
    if(Math.min(loD,hiD)<=grabPct) which=loD<=hiD?"lo":"hi"; // grabbed a thumb (point)
    else if(xPos>loPos&&xPos<hiPos) which="band";           // grabbed the line → move both
    else which=loD<=hiD?"lo":"hi";                          // outside the band → nearer thumb
    if(which!=="band"&&isDoubleTap(e,which)){drag.current=null;const t=which==="lo"?lo:hi;t.onChange(t.def);return;}
    try{ref.current.setPointerCapture(e.pointerId);}catch(_){}
    drag.current=which==="band"
      ?{which,fine:e.ctrlKey||e.metaKey,lx:e.clientX,loPos,hiPos}
      :{which,fine:e.ctrlKey||e.metaKey,lx:e.clientX,pos:which==="lo"?loPos:hiPos};
  },[lo,hi,loPos,hiPos]);
  const onMove=useCallback(e=>{
    if(!e.buttons||!drag.current)return;e.stopPropagation();
    const d=drag.current,rect=ref.current.getBoundingClientRect();
    const dim=Math.max(40,rect.width);
    const pd=e.clientX-d.lx; d.lx=e.clientX;
    const inc=d.fine?pd*(100/1200):ballisticDelta(pd,dim,100); // axis-position units
    if(d.which==="band"){
      // Shift both thumbs by one delta (constant gap), clamped so each stays in
      // its own range — the band slides without changing its width.
      let delta=inc;
      delta=Math.max(loAxis.aMin-d.loPos, hiAxis.aMin-d.hiPos, delta);
      delta=Math.min(loAxis.aMax-d.loPos, hiAxis.aMax-d.hiPos, delta);
      d.loPos+=delta; d.hiPos+=delta;
      setLo(d.loPos); setHi(d.hiPos);
    }else if(d.which==="lo"){
      let np=d.pos+inc; np=Math.max(loAxis.aMin,np); np=Math.min(loAxis.aMax,hiPos-GAP,np); d.pos=np;
      setLo(np);
    }else{
      let np=d.pos+inc; np=Math.max(hiAxis.aMin,loPos+GAP,np); np=Math.min(hiAxis.aMax,np); d.pos=np;
      setHi(np);
    }
  },[lo,hi,loPos,hiPos]);
  const onUp=useCallback(()=>{drag.current=null;},[]);
  return(
    <div style={S.knobWrap}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
        <div style={Object.assign({},S.knobLabel,{color:col+"cc"})}>{label}</div>
        <div style={Object.assign({},S.knobValue,{color:col})}>{lo.disp} – {hi.disp}</div>
      </div>
      <div ref={ref} style={S.knobTrackWrap}
        onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp}>
        <div style={S.knobTrackBg}/>
        <div style={Object.assign({},S.knobTrackFill,{left:loPos+"%",width:Math.max(0,hiPos-loPos)+"%",background:col+"88"})}/>
        <div style={Object.assign({},S.knobThumb,{left:loPos+"%",background:col,boxShadow:"0 0 8px "+col+"99"})}/>
        <div style={Object.assign({},S.knobThumb,{left:hiPos+"%",background:col,boxShadow:"0 0 8px "+col+"99"})}/>
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

// angle is only used by the radial long-press drag; the rendered popup is a
// slider list (render order = array order). Angles are spread evenly at 30° so
// the radial picker can't confuse adjacent params (the old 10°/30° cluster let
// an OCT drag bleed into RTCH/DLY).
const PARAM_ARMS=[
  {key:"rhy", label:"RTCH", color:"#c9a96e", angle:180, min:1,    max:4,   discrete:true,  def:1},
  {key:"dly", label:"DLY",  color:"#7aaa96", angle:150, min:0,    max:100, discrete:false, def:0},
  {key:"vel", label:"VEL",  color:"#c8bfb0", angle:90,  min:0,    max:127, discrete:false, def:100},
  {key:"dur", label:"DUR",  color:"#9fb4c7", angle:120, min:-100, max:100, discrete:false, def:0},
  {key:"flt", label:"FLT",  color:"#c97b8a", angle:60,  min:0,    max:100, discrete:false, def:50},
  {key:"oct", label:"OCT",  color:"#6c9ad6", angle:30,  min:0,    max:4,   discrete:true,  def:2},
  {key:"rev", label:"REV",  color:"#a98fd0", angle:0,   min:0,    max:100, discrete:false, def:0},
];
// Defaults for the mobile VARY sliders (by label) so double-tap returns each to
// its session default; anything not listed (the STEP jitters) defaults to 0.
const VDEF={DROP:13,SHIFT:17,RANGE:1,PITCH:0,GHOST:0};

// Compact per-step value label for the tall STEP lanes (rhy → ×N, oct → signed
// octave, dur → signed %, else the raw number).
const fmtStepVal=(lane,v)=>{
  if(lane.key==="rhy")return "×"+Math.max(1,v);
  if(lane.key==="oct"){const o=v-2;return (o>0?"+":"")+o;}
  if(lane.key==="dur")return (v>0?"+":"")+v;
  return ""+v;
};

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
    const startLocked=!!(colHasNote&&!colHasNote[col]);
    // Double-tap an unlocked step → reset it. Keyed by column so taps on ADJACENT
    // steps don't pair. No extra history push here: the single tap that armed
    // this already snapshotted the pre-gesture state, so one undo restores it.
    if(!startLocked&&isDoubleTap(e,col)){drag.current={active:false};onChange(col,lane.def);return;}
    drag.current={active:true,mode:null,col,startLocked,cur:(values[col]??lane.def),ly:e.clientY,sx:e.clientX,sy:e.clientY,hgt:ref.current.getBoundingClientRect().height,didStart:false};
  },[getCol,colHasNote,values,lane,onChange]);
  const onMove=useCallback(e=>{
    const d=drag.current; if(!d||!d.active)return; e.stopPropagation();
    if(d.mode===null){
      const dx=e.clientX-d.sx, dy=e.clientY-d.sy;
      if(d.startLocked){ // a sweep that started on a note-less step can only DRAW across the others
        if(Math.abs(dx)>6||Math.abs(dy)>6) d.mode="draw"; else return;
      }else if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>6) d.mode="draw";
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
      d.cur=Math.max(lane.min,Math.min(lane.max,d.cur+ballisticDelta(pd,d.hgt,lane.max-lane.min)));
      onChange(d.col,Math.round(d.cur));
    }
  },[getCV,onChange,colHasNote,lane,onDragStart]);
  const onUp=useCallback(e=>{
    const d=drag.current;
    if(d&&d.active&&d.mode===null&&!d.startLocked&&e&&e.type==="pointerup"){
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
              {/* Always-visible per-step value — shown on programmed (non-default)
                  or currently-playing steps so you can read values without dragging. */}
              {tall&&!locked&&(isAct||v!==lane.def)&&<span style={{position:"absolute",top:0,left:0,right:0,textAlign:"center",fontSize:7,fontWeight:700,lineHeight:1.3,color:"rgba(245,240,232,0.95)",textShadow:"0 0 3px #000,0 1px 2px #000",pointerEvents:"none",zIndex:1}}>{fmtStepVal(lane,v)}</span>}
              {lane.center!=null&&<div style={Object.assign({},S.laneCenterLine,{bottom:(cp*100)+"%",borderColor:lane.color+"22"})}/>}
              <div style={Object.assign({},S.laneBar,{height:(pct*100)+"%",background:isAct?lane.color:lane.color+"55",boxShadow:isAct?"0 0 5px "+lane.color:"none"})}/>
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
      rvCombs.push({delay:cd, fb:cfb, hsh, lsh, base:delaySec});
    };
    [0.0297, 0.0371, 0.0411, 0.0437].forEach(ct=>mkComb(ct, 0)); // left
    [0.0306, 0.0383, 0.0421, 0.0451].forEach(ct=>mkComb(ct, 1)); // right (offset)
    this.rvCombs = rvCombs;
    // Tail modulation — a slow, slightly-detuned LFO per comb jitters that
    // comb's delay length, chorusing the tail so it shimmers instead of ringing
    // static/metallic. The LFOs always run; depth (rvModGains) is 0 until the
    // MOD control opens it. Connected as an a-rate input, the LFO offset SUMS
    // with the size-set base delay, so the swing rides on top of the room size.
    const rvModRates=[0.21,0.27,0.33,0.39,0.24,0.30,0.36,0.42];
    const rvModGains=[];
    rvCombs.forEach((c,i)=>{
      const lfo=this.ctx.createOscillator(); lfo.type="sine"; lfo.frequency.value=rvModRates[i%rvModRates.length];
      const dep=this.ctx.createGain(); dep.gain.value=0; // seconds of delay swing
      lfo.connect(dep); dep.connect(c.delay.delayTime);
      try{lfo.start();}catch(e){}
      rvModGains.push(dep);
    });
    this.rvModGains=rvModGains;

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
    // Two coupled effects of "size":
    //  • Feedback gain → exponential decay rate (0.40..0.96). Damping prevents
    //    HF runaway even at the top — shelf cuts accumulate per pass.
    //  • Comb DELAY times → physical room dimension. Scaled 1×..2× so 100% is
    //    a room twice as large as before (which also roughly doubles the tail
    //    again at the same feedback, since T60 ∝ delay length). This is what
    //    actually makes a big space feel big rather than just ring longer.
    const p=Math.max(0,Math.min(100,pct)), n=p/100;
    const fb=0.50+Math.pow(n,0.7)*0.46;      // 0.50..0.96 decay (concave — raised
                                             // floor so even small sizes have body)
    const sizeFactor=1+Math.pow(n,0.75)*1.6; // 1×..2.6× room (concave — most of the
                                             // range feels big, 100% noticeably larger)
    this.rvSizeFactor=sizeFactor;            // exposed so modulation can scale depth
    const t=this.ctx.currentTime;
    for(const c of this.rvCombs){
      c.fb.gain.setTargetAtTime(fb,t,0.02);
      // Slew the delay slowly so resizing the room doesn't click/pitch-glitch.
      if(c.base)c.delay.delayTime.setTargetAtTime(c.base*sizeFactor,t,0.06);
    }
  }
  // Reverb tail modulation depth — 0..100 maps to 0..~4 ms of delay-line swing
  // per comb. Low values add subtle movement/shimmer; high values push toward a
  // pronounced chorused tail. Independent of room size (rides on top of it).
  setRvMod(pct){if(!this.ready||!this.rvModGains)return;
    const depth=(Math.max(0,Math.min(100,pct))/100)*0.004;
    const t=this.ctx.currentTime;
    for(const g of this.rvModGains)g.gain.setTargetAtTime(depth,t,0.03);
  }
  // HF damping — high-shelf gain (dB cut) in the feedback path. 0 pct = no
  // damp (0 dB), 100 pct = max damp (RV_DAMP_DB). The cut compounds: each comb
  // recirculation applies it once more, so the cumulative HF attenuation
  // over a tail with N reflections is N × shelfGain. -7 dB per pass over
  // ~5 reflections still makes highs die before mids/lows, but eases in gently.
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
  // ── THE STORE ──────────────────────────────────────────────────────────
  // One list of unified patterns; each holds all three parts. Everything below
  // (`pats`, `drumPats`, `activeId`, `activeDrumId`) is a VIEW onto this, kept
  // so the per-layer editor code can stay as it is while the model underneath
  // is single. There is no layer store any more: nothing to park, nothing to
  // go silent on a layer switch.
  const [patterns, setPatterns] = useState(()=>[mkPattern(symPat(0))]);
  const [activePatId, setActivePatId] = useState(null);
  // Falls back to the first pattern, which also covers "the active one was
  // just deleted" without a separate effect.
  const activePatternId = (activePatId!=null&&patterns.some(p=>p.id===activePatId))
    ? activePatId : (patterns[0]?patterns[0].id:null);

  const [page,      setPage]      = useState("edit");
  const [activeLayer, setActiveLayer] = useState("synth"); // "synth" (POLY) | "lead" (MONO) | "drums"
  // Which part the synth-side views read. Drums keep their own view below.
  const _synthLayer = activeLayer==="drums"?"synth":activeLayer;
  // useMemo matters here: these arrays feed dependency lists (the scheduler
  // effect among them). Rebuilding them every render would re-run it every
  // render — back when `pats` was state its identity only changed on an edit.
  const pats = useMemo(()=>layerLib(patterns,_synthLayer),[patterns,_synthLayer]);
  const activeId = activePatternId;
  const setActiveId = setActivePatId;
  // Writes an edited per-layer library back into the unified store. Handles
  // edits, additions (a new id = a new pattern) and removals (a missing id =
  // the whole pattern goes).
  const setPats = useCallback(updater=>setPatterns(ps=>{
    const layer = activeLayerR.current==="drums"?"synth":activeLayerR.current;
    const prev = layerLib(ps,layer);
    const next = typeof updater==="function"?updater(prev):updater;
    return mergeLayer(ps,layer,next);
  }),[]);
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
  // Which bar LOOP is pinned to (-1 = not looping). Captured when LOOP is
  // switched on and held there: paging, FOLLOW and the playhead cannot move
  // it. Reading the live page every tick meant the loop crawled around under
  // you, which is what made LOOP feel intertwined with everything else.
  const [loopBar,   setLoopBar]   = useState(-1);
  // ...and WHICH pattern's bar. A bar index alone was applied to whatever the
  // song happened to be playing, so looping bar 4 of pattern B while the song
  // sat in A sounded A's bar 4.
  const [loopPat,   setLoopPat]   = useState(null);
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
  const exportBarR = useRef(null); // progress-bar DOM node — width driven directly (no re-render) during capture
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
  // ── BAR PAGING ─────────────────────────────────────────────────────────
  // Patterns can be up to MAX_BARS bars long, but the editor only ever shows
  // ONE bar at a time (COLS cells wide). barPage is which bar you're looking
  // at. It's shared across layers on purpose — "I'm editing bar 3" should mean
  // the same thing whichever layer you flip to — and clamped per-pattern on
  // read, since layers can hold patterns of different lengths.
  // NOTE: paged, not scrolled. A scrolling grid needs a parent with overflow-x,
  // and that makes iOS Safari swallow vertical drags at the OS level (see the
  // gesture-interception lesson) — which would break note entry on the phone.
  const [barPage, setBarPage] = useState(0);
  const barPageR   = useRef(0);
  useEffect(()=>{barPageR.current=barPage;},[barPage]);
  // Visible bar index / column offset, clamped into a specific pattern.
  const barIdxIn = p2=>Math.max(0,Math.min(patBars(p2)-1,barPageR.current));
  const barOffIn = p2=>barIdxIn(p2)*COLS;
  // The grid renders a COLS-wide WINDOW, so every pointer hit-test yields a
  // VIEW column (0..COLS-1) that has to be offset into the pattern before it
  // touches data. These read live refs, so the stable []-dep useCallbacks can
  // call them without baking in a first-render page (the useCallback trap).
  const synthBarOffR = ()=>barOffIn(patsR.current.find(p2=>p2.id===activeIdR.current));
  const drumBarOffR  = ()=>barOffIn(drumPatsR.current.find(p2=>p2.id===activeDrumIdR.current));
  const [speedMult, setSpeedMult] = useState(1);
  const speedMultR = useRef(1);
  const [showMenu,  setShowMenu]  = useState(false);
  const [topTrayOpen,   setTopTrayOpen]   = useState(false);
  const [bottomTrayOpen,setBottomTrayOpen]= useState(false);
  const sliderDragR  = useRef(false); // true while dragging a popup slider — suppresses the radial picker so it can't bleed into another arm
  const [patMenu,   setPatMenu]   = useState(null); // {id, x, y}
  const [drumMenu,  setDrumMenu]  = useState(null); // {id, x, y}
  const [paramPopup,setParamPopup]= useState(null); // {col,x,y,activeArm,values}
  const popupR       = useRef(null); // mirror for handlers: {col,originX,originY,baseValues}
  const longPressR   = useRef(null); // setTimeout id
  const varyLongPressR = useRef(null);
  const patDropRef   = useRef(null); // sequence drawer drop zones
  const seqDropRef   = useRef(null);
  const activePtrsR  = useRef(new Set()); // active pointer IDs on grid — stateless multi-touch via isPrimary, this set just tracks "all up". Self-heals (cleared on every primary-down) so a missed up/cancel can't permanently lock editing.
  const [patternDrag, setPatternDrag] = useState(null); // {patId, name, accent, x, y, overDrop}
  // Song page's DEL is armed by the first tap and fires on the second. Deleting
  // a pattern also empties every song slot holding it, which is too much to
  // hand a stray thumb on a phone. Holds the id it was armed for, so selecting
  // a different chip disarms it.
  const [delArm, setDelArm] = useState(null);
  // Long-press a filled song slot to set how many times it repeats.
  // {idx,x,y} while open.
  const [repPopup, setRepPopup] = useState(null);
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
  const [rvMod,      setRvMod]      = useState(0);  // tail modulation depth (0..100 → chorused tail)
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
  // Drum view over the same store. activeDrumId IS activePatternId now — a
  // pattern is one thing, so selecting it selects all three parts at once.
  const drumPats = useMemo(()=>layerLib(patterns,"drums"),[patterns]);
  const activeDrumId = activePatternId;
  const setActiveDrumId = setActivePatId;
  const setDrumPats = useCallback(updater=>setPatterns(ps=>{
    const prev = layerLib(ps,"drums");
    const next = typeof updater==="function"?updater(prev):updater;
    return mergeLayer(ps,"drums",next);
  }),[]);
  const initDrum = drumPats[0];
  const [drumClipboard,setDrumClipboard]=useState(null);
  // ── Synth-type layer store ─────────────────────────────────────────────
  // The app now exposes TWO synth-type layers: POLY (polyphonic, internal key
  // "synth") and MONO (monophonic lead/bass, internal key "lead"). Internal
  // string keys remain "synth"/"lead" to minimize refactor scope; the UI
  // labels are POLY / MONO. The legacy "bass" layer was removed in the
  // 3-layer pare-down — bass pats from legacy saves migrate into the mono
  // layer (see fillLayerParams + load paths).
  const activeLayerR = useRef("synth");
  useEffect(()=>{activeLayerR.current=activeLayer;},[activeLayer]);
  const SYNTH_LAYERS = ["synth","lead"];
  // Switching layers is now just "look at a different part of the same
  // pattern" — no saving, no loading, nothing that can go out of sync.
  const switchLayer = (newLayer)=>{
    if(newLayer===activeLayer)return;
    setActiveLayer(newLayer);
  };



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
  // ── THE SONG ───────────────────────────────────────────────────────────
  // A linear list of pattern ids. A pattern is all three parts, so there is
  // nothing left to put in separate lanes.
  const [song, setSong] = useState(()=>Array(64).fill(null));
  // How many times each slot plays before the song moves on — 1..SONG_MAX_REP,
  // the same idea as a step's ratchet. Kept in a parallel array rather than
  // making a slot an object: `song` is a flat list of ids at four persistence
  // sites, in the packed codec and in the legacy readers, and every one of them
  // would have had to learn a new element type. A missing entry reads as 1.
  const [songRep, setSongRep] = useState(()=>Array(64).fill(1));
  const _rep=(i)=>Math.max(1,Math.min(SONG_MAX_REP,(songRep&&songRep[i])||1));
  // Legacy saves carry a three-lane matrix. Every lane holds ids that are all
  // the same pattern after unification, so the first non-null across the three
  // is the entry for that slot.
  const _songFromLegacyMatrix=(sm)=>{
    if(!sm)return null;
    const out=new Array(64).fill(null);
    for(let i=0;i<64;i++){
      const v=(sm.synth&&sm.synth[i])??(sm.lead&&sm.lead[i])??(sm.drums&&sm.drums[i])??null;
      out[i]=v==null?null:v;
    }
    const linear=out.filter(x=>x!=null);
    return linear.concat(new Array(64).fill(null)).slice(0,64);
  };
  const _adoptSong=(st)=>{
    if(Array.isArray(st.song))setSong(st.song.slice(0,64));
    else{const l=_songFromLegacyMatrix(st.songMatrix);if(l)setSong(l);}
    // Pre-repeat saves have no songRep at all — every slot plays once.
    setSongRep(normSongRep(st.songRep));
  };
  // Quarter-note position inside the playing pattern, as bar*4+quarter. The
  // song page's bar dots read it: which dot is lit, and a value that changes
  // on every quarter so the lit dot can re-trigger its pulse. Published at
  // QUARTER granularity — two renders a second at 120bpm rather than eight.
  const [songPulse,    setSongPulse]    = useState(-1);
  const songPulseR  = useRef(-1);
  const [songBar,      setSongBar]      = useState(-1); // index into the song; -1 when stopped
  const [songBarLayer, setSongBarLayer] = useState({synth:-1,lead:-1,drums:-1});
  const songBarR    = useRef(-1);
  const songModeR   = useRef(false);
  // Per-part scheduler cursors: {step, nextNoteTime}. Parts drift apart inside a
  // pattern (different gridLen / speedMult) and are snapped back together at the
  // pattern boundary. Named freeR from when "free mode" existed.
  const freeR = useRef({
    synth:{step:0,nextAt:0,bar:0},
    lead: {step:0,nextAt:0,bar:0},
    drums:{step:0,nextAt:0,bar:0},
  });
  useEffect(()=>{songBarR.current=songBar;},[songBar]);
  useEffect(()=>{songModeR.current=songMode;},[songMode]);

  const drumPatsR   =useRef([initDrum]);
  const activeDrumIdR=useRef(initDrum.id);
  useEffect(()=>{drumPatsR.current=drumPats;},[drumPats]);
  useEffect(()=>{activeDrumIdR.current=activeDrumId;},[activeDrumId]);
  const variedDrumGrids=useRef(new Map());
  const variedDrumVels=useRef(new Map());
  const drumPillLongPressR=useRef(null);
  // Note: the legacy per-layer pattern chains were vestigial in
  // non-song mode. The song matrix is the arrangement primitive now.
  const stepR=useRef(0),tmrR=useRef(null),nextNoteR=useRef(0);
  // Live mirrors for the scheduler.
  const patternsR=useRef(patterns);
  useEffect(()=>{patternsR.current=patterns;},[patterns]);
  const activePatternIdR=useRef(activePatternId);
  useEffect(()=>{activePatternIdR.current=activePatternId;},[activePatternId]);
  // The playable song: the list with its gaps closed. Editing leaves holes;
  // playback shouldn't sit in silence waiting them out.
  // Repeats expand here, so the scheduler and songPosR still see a plain list
  // of pattern ids and needed no changes at all.
  const songSeq = useMemo(()=>{
    const out=[];
    for(let i=0;i<64;i++){
      if(song[i]==null)continue;
      const n=Math.max(1,Math.min(SONG_MAX_REP,(songRep&&songRep[i])||1));
      for(let k=0;k<n;k++)out.push(song[i]);
    }
    return out;
  },[song,songRep]);
  const songSeqR=useRef(songSeq);
  useEffect(()=>{songSeqR.current=songSeq;},[songSeq]);
  const songPosR=useRef(0);
  const patsR=useRef(pats);
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
  useEffect(()=>{bpmR.current=bpm;bell.current.stepDur=60/bpm/4*speedMultR.current;},[bpm]);
  useEffect(()=>{speedMultR.current=speedMult;bell.current.stepDur=60/bpmR.current/4*speedMult;},[speedMult]);
  useEffect(()=>{scaleR.current=scale;},[scale]);
  useEffect(()=>{loopR.current=loopMode;},[loopMode]);
  const loopBarR=useRef(-1);
  useEffect(()=>{loopBarR.current=loopBar;},[loopBar]);
  const loopPatR=useRef(null);
  useEffect(()=>{loopPatR.current=loopPat;},[loopPat]);
  // FOLLOW only meaningfully applies to the synth track — that's where
  // playId comes from the synth part of the playing pattern. On bass/lead,
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
      // Both parts come straight off the unified store — no parked library.
      if(varyMode.synth)regenSynth(layerLib(patternsR.current||[],"synth"));
      if(varyMode.lead) regenSynth(layerLib(patternsR.current||[],"lead"));
      if(varyMode.drums){
        for(const dp of (drumPatsR.current||[])){
          if(!dp||!dp.grid)continue;
          const vRhythm=(dp.vRhythm||0)/100;
          const vVelocity=(dp.vVelocity||0)/100;
          const len=Math.max(1,Math.min(patW(dp),dp.gridLen||patW(dp)));
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
          const baseVel=toDrumVel2D(dp.vel,gridW(dp.grid));
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
  useEffect(()=>{bell.current.setRvMod&&bell.current.setRvMod(rvMod);},[rvMod]);
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
    // packPat produces fresh arrays for every heavy lane, so it doubles as the
    // deep copy this snapshot needs — and keeps MAX_HISTORY snapshots of 32-bar
    // patterns from running the phone out of memory.
    return ({
    patterns:_mapProjectPats({patterns},packPat).patterns,
    activePatId:activePatternId,
    song:[...song],songRep:[...songRep],
    songMode,songView,
    activeLayer,
    bpm,scale,transpose,swing,speedMult,
    layerParams:JSON.parse(JSON.stringify(layerParams)),
    dlyIdx,dlyFbPct,dlyHpVal,dlyLpVal,rvSize,rvDamp,rvLfDamp,rvPreDelay,rvMod,dlyToRev,drumLevel,
    drumMix:JSON.parse(JSON.stringify(drumMix)),
    trackMute:{...trackMute},trackSolo:{...trackSolo},
    varyMode,loopMode,loopBar,loopPat,
    vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,
    vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter
  });};
  // Installs a unified pattern list from any load path, and bumps the id
  // counter past everything in it so a later-created pattern can't collide.
  // 3-layer pare-down: collapse legacy "bass" layer into "lead". Active
  // layer "bass" becomes "lead"; bass pats append to lead pats (capped at
  // 8). The legacy bass song lane is folded in by unifyLegacyProject.
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

  const _adoptPatterns=(s)=>{
    const pl=(Array.isArray(s.patterns)&&s.patterns.length)?s.patterns:[mkPattern(symPat(0))];
    const maxId=Math.max(0,...pl.map(p=>p&&p.id).filter(x=>typeof x==="number"));
    if(maxId>=_id)_id=maxId+1;
    setPatterns(pl);
    setActivePatId(s.activePatId!=null?s.activePatId:(s.activeId!=null?s.activeId:pl[0].id));
  };

  const applySnapshot = rawSnap=>{
    if(!rawSnap)return;
    const s=unifyLegacyProject(unpackProject(rawSnap));
    // Do NOT reset the bar page here. Undo is an edit-level operation — being
    // thrown back to bar 1 every time you undo a note makes it feel broken.
    // The clamp effect handles a page left past the end of a shorter pattern.
    {const t=s.activeLayer||"synth";if(t!==activeLayer)setActiveLayer(t);}
    _adoptPatterns(s);
    setDrumMixArr(s.drumMix?fillDrumMix(s.drumMix):defaultDrumMix()); // global mix (snapshots always carry it)
    _adoptSong(s);
    if(s.songMode!=null)setSongMode(s.songMode);
    if(s.songView!=null)setSongView(s.songView);

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
     ["rvSize",setRvSize],["rvDamp",setRvDamp],["rvLfDamp",setRvLfDamp],["rvPreDelay",setRvPreDelay],["rvMod",setRvMod],
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
    setLoopBar(s.loopBar!=null?s.loopBar:SESSION_DEFAULTS.loopBar);
    setLoopPat(s.loopPat!=null?s.loopPat:null);
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
  // Every substantive edit snapshots history — and the first such edit of a
  // share-loaded "preview" session adopts it: clearing loadedFromShareR resumes
  // autosave so continued work is crash-recoverable. (Safe to reference here: the
  // body runs only when called, long after the ref is initialized, and the share
  // restore sets the flag true AFTER applyShareState's own history push.)
  const pushHistory = ()=>{loadedFromShareR.current=false;pushHistoryR.current();};
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
      if(exportingR.current)return; // UI is locked while an MP3 bounce is capturing
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
    // Reverb knobs + drumLevel were previously not in this snap → they never
    // persisted to slot saves (issue surfaced when users noticed their reverb
    // and drum-bus levels never came back on load). Keep this list in sync
    // with captureSnapshotR / getShareState — the 4-site rule.
    const snap={ver:PROJ_VER,patterns,activePatId:activePatternId,bpm,scale,transpose,swing,speedMult,activeLayer,layerParams,dlyIdx,dlyFbPct,dlyHpVal,dlyLpVal,rvSize,rvDamp,rvLfDamp,rvPreDelay,rvMod,dlyToRev,drumMix,drumLevel,activeKit,userSamples:serializeSamples(userSamples),trackMute:{...trackMute},trackSolo:{...trackSolo},varyMode,loopMode,loopBar,loopPat,vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,song,songRep,songMode,songView};
    const next=Object.assign({},slotData,{[slot]:packProject(snap)});
    setSlotData(next);
    const ok=await storageSet("slots",JSON.stringify(next));
    if(ok){setActiveSlot(slot);showFlash("SAVED "+slot);}
    else showFlash("SAVE FAILED — TOO LARGE"); // storage quota (recorded samples can be big)
  };
  // ── Load-time sanitizers ──────────────────────────────────────────────────
  const doLoad=slot=>{
    let s=slotData[slot];if(!s)return;
    setBarPage(0);
    s=unifyLegacyProject(migrateLegacyBass(unpackProject(s)));
    const reroll=s.ver!==PROJ_VER; // old/un-versioned project → refresh icons to the current scheme
    setActiveLayer(s.activeLayer||"synth");
    _adoptPatterns(s);
    // Top-level scalar params — always set, fall back to defaults if missing.
    // Old saves predate some fields (e.g. swing, speedMult); without explicit
    // fallback the previous project's value would leak into this load.
    setBpm(s.bpm!=null?s.bpm:SESSION_DEFAULTS.bpm);
    setScale(s.scale!=null?s.scale:SESSION_DEFAULTS.scale);
    setTranspose(s.transpose!=null?s.transpose:SESSION_DEFAULTS.transpose);
    setSwing(s.swing!=null?s.swing:SESSION_DEFAULTS.swing);
    setSpeedMult(s.speedMult!=null?s.speedMult:SESSION_DEFAULTS.speedMult);
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
    [["dlyIdx",setDlyIdx],["dlyFbPct",setDlyFbPct],["dlyHpVal",setDlyHpVal],["dlyLpVal",setDlyLpVal],["rvSize",setRvSize],["rvDamp",setRvDamp],["rvLfDamp",setRvLfDamp],["rvPreDelay",setRvPreDelay],["rvMod",setRvMod],["dlyToRev",setDlyToRev],["drumLevel",setDrumLevel],
     ["vDropRate",setVDropRate],["vShiftRate",setVShiftRate],["vShiftRange",setVShiftRange],
     ["vPitchRate",setVPitchRate],["vPitchRange",setVPitchRange],["vGhostRate",setVGhostRate],
     ["vVelJitter",setVVelJitter],["vFltJitter",setVFltJitter],["vDlyJitter",setVDlyJitter],
     ["vRhyJitter",setVRhyJitter],["vOctJitter",setVOctJitter],["vGlideJitter",setVGlideJitter],["vDurJitter",setVDurJitter]
    ].forEach(([k,fn])=>{fn(s[k]!=null?s[k]:SESSION_DEFAULTS[k]);});
    setLoopMode(s.loopMode!=null?s.loopMode:SESSION_DEFAULTS.loopMode);
    setLoopBar(s.loopBar!=null?s.loopBar:SESSION_DEFAULTS.loopBar);
    setLoopPat(s.loopPat!=null?s.loopPat:null);
    setVaryMode(normVary(s.varyMode));
    setTrackMute(s.trackMute&&typeof s.trackMute==="object"?{...{synth:false,lead:false,drums:false},...s.trackMute}:{synth:false,lead:false,drums:false});
    setTrackSolo(s.trackSolo&&typeof s.trackSolo==="object"?{...{synth:false,lead:false,drums:false},...s.trackSolo}:{synth:false,lead:false,drums:false});
    // Backfill missing fields on drum pats — older saves only carried
    // {level,pan} per voice; rvSend/dlySend default to 0.
    // Global mix: use the saved global drumMix; for legacy projects (which
    // stored mix per-pattern) seed it from the first pattern's drum part.
    setDrumMixArr(s.drumMix?fillDrumMix(s.drumMix)
      :fillDrumMix(s.patterns[0]&&s.patterns[0].parts&&s.patterns[0].parts.drums&&s.patterns[0].parts.drums.mix));
    _adoptSong(s);
    setSongMode(s.songMode!=null?s.songMode:SESSION_DEFAULTS.songMode);
    setSongView(s.songView!=null?s.songView:(s.songMode?true:SESSION_DEFAULTS.songView));

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
  // ── Clear a saved slot back to empty ────────────────────────────────────
  // Frees the slot so it shows as available again (unlike NEW, which resets the
  // live working state but leaves slots untouched). Destructive → confirm first.
  const clearSlot=slot=>{
    if(!slotData[slot])return; // already empty
    setConfirmAction({type:"clear",slot,label:"CLEAR "+slot+"?"});
  };
  const doClear=async slot=>{
    const next=Object.assign({},slotData,{[slot]:null});
    setSlotData(next);
    if(activeSlot===slot)setActiveSlot(null); // drop the highlight — slot is empty now
    const ok=await storageSet("slots",JSON.stringify(next));
    showFlash(ok?"CLEARED "+slot:"CLEAR FAILED");
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
    const p0=mkPattern(symPat(0));
    setBarPage(0);
    setPatterns([p0]);setActivePatId(p0.id);
    // Seed the lead store with a fresh empty pat so switching to MONO after
    setActiveLayer("synth");
    setLoopMode(false);setLoopBar(-1);setLoopPat(null);setVaryMode({synth:false,lead:false,drums:false});
    setTrackMute({synth:false,lead:false,drums:false});
    setTrackSolo({synth:false,lead:false,drums:false});
    setSongMode(false);setSongView(false);
    setSong(Array(64).fill(null));setSongRep(Array(64).fill(1));
    setSongBar(-1);songBarR.current=-1;
    setSongBarLayer({synth:-1,lead:-1,drums:-1});
    setBpm(120);setScale("major");setTranspose(0);setSwing(0);setSpeedMult(1);
    setLayerParams({synth:DEFAULT_LP(0),lead:DEFAULT_LP_MONO(0)});
    setDlyIdx(3);setDlyFbPct(45);setDlyHpVal(8);setDlyLpVal(78);
    setRvSize(50);setRvDamp(40);setRvLfDamp(0);setRvPreDelay(0);setRvMod(0);setDlyToRev(0);setDrumLevel(85);setDrumMixArr(defaultDrumMix());
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
    else if(confirmAction.type==="clear")doClear(confirmAction.slot);
    else if(confirmAction.type==="new")doNew();
    setConfirmAction(null);
  };
  const confirmNo=()=>setConfirmAction(null);

  const activePat=pats.find(p=>p.id===activeId);
  const gridLen=activePat?.gridLen??16;
  useEffect(()=>{gridLenR.current=gridLen;},[gridLen]);

  // ── Visible bar (render side) ──────────────────────────────────────────
  // barPage is shared across layers; each layer clamps it into its own active
  // pattern, so flipping from a 4-bar synth pattern to a 1-bar drum pattern
  // shows drum bar 1 without losing your place in the synth pattern.
  const activeDrumPat = drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
  const editPat       = activeLayer==="drums"?activeDrumPat:activePat;
  const barCount      = patBars(editPat);
  const curBar        = Math.max(0,Math.min(barCount-1,barPage));
  const barOff        = curBar*COLS;
  // Which bar the playhead is in right now (-1 when stopped). `step`/`drumStep`
  // are absolute pattern steps, so this is just their bar.
  // How much of THIS page is inside the playable length (drives the one-bar-wide
  // length slider): 1 on bars before the loop end, 0 past it, partial on the bar
  // the end lands in.
  const _lenFrac      = Math.max(0,Math.min(1,((editPat?.gridLen??COLS)-barOff)/COLS));
  const liveStep      = activeLayer==="drums"?drumStep:step;
  const playingBar    = playing&&liveStep>=0?Math.floor(liveStep/COLS):-1;

  // FOLLOW: while playing, page along with the music. Tapping a bar pins it
  // (turns follow off) so you can edit bar 1 while bar 7 plays; the ◎ button
  // and pressing stop both re-arm it.
  // Page-follow is part of the EXISTING FOLLOW (followSeq), not a toggle of its
  // own: FOLLOW already means "keep the editor on whatever is playing", and the
  // visible bar is just the finer grain of the same idea. So the same button
  // that locks the active pattern to the playing one also pulls the page
  // through the bars.
  useEffect(()=>{
    if(!followSeq||!playing)return;
    if(playingBar>=0&&playingBar!==barPage&&playingBar<barCount)setBarPage(playingBar);
  },[followSeq,playing,playingBar,barPage,barCount]);
  // Never leave the page pointing past the end of a pattern (switching pattern,
  // switching layer, or removing bars can all strand it).
  useEffect(()=>{ if(barPage>barCount-1)setBarPage(Math.max(0,barCount-1)); },[barCount,barPage]);
  // LOOP pins itself to the bar you are ON when you switch it on, and holds
  // there until you switch it off. Move it by turning LOOP off and on again
  // from the bar you want. Every LOOP button goes through here.
  const toggleLoop=()=>{
    if(loopMode){setLoopMode(false);setLoopBar(-1);setLoopPat(null);}
    else{setLoopMode(true);setLoopBar(curBar);setLoopPat(activePatternId);}
  };
  // Switching to a different pattern while LOOP is on moves the loop with you —
  // that's an explicit "I'm working on this one now", unlike paging or FOLLOW,
  // which the pin deliberately ignores.
  useEffect(()=>{ if(loopMode)setLoopPat(activePatternId); },[loopMode,activePatternId]);
  // A pattern that shrank (DEL BAR, or switching to a shorter one) must not
  // leave the loop pinned past the end.
  useEffect(()=>{ if(loopMode&&loopBar>barCount-1)setLoopBar(Math.max(0,barCount-1)); },[loopMode,loopBar,barCount]);

  // ── ADD / REMOVE BAR ───────────────────────────────────────────────────
  // Resizing invalidates the cached VARY grids for that pattern (they're keyed
  // by pat id and sized to the old width), so drop them and let the scheduler
  // re-roll at the next bar boundary.
  const _dropVaryCache=(id)=>{
    try{variedGrids.current.delete(id);variedDrumGrids.current.delete(id);variedDrumVels.current.delete(id);}catch(e){}
  };
  const setEditPatBars=(n)=>{
    const target=Math.max(1,Math.min(MAX_BARS,n));
    if(!editPat||target===patBars(editPat))return;
    const grew=target>patBars(editPat);
    pushHistory();
    _dropVaryCache(editPat.id);
    if(activeLayer==="drums")setDrumPats(ps=>ps.map(p=>p.id===editPat.id?resizePatBars(p,target):p));
    else setPats(ps=>ps.map(p=>p.id===editPat.id?resizePatBars(p,target):p));
    if(grew){
      // Adding a bar means you want to write in it — land there. FOLLOW has to
      // go or the playhead would drag the page straight back off it, same as
      // any other edit clearing follow.
      setFollowSeq(false);
      setBarPage(target-1);
    } else {
      setBarPage(bp=>Math.min(bp,target-1));
    }
  };
  const addBar    = ()=>setEditPatBars(patBars(editPat)+1);
  const removeBar = ()=>setEditPatBars(patBars(editPat)-1);
  // Copy the visible bar into a NEW bar appended right after it — the fastest
  // way to build a long pattern (lay down bar 1, extend, vary).
  // DUP BAR inserts a copy of the visible bar right after it — in ALL THREE
  // parts. Doing it through a per-layer view was wrong: mergeLayer would notice
  // the bar count changed and resize the other two parts, which appends a blank
  // bar at the END rather than inserting one, so the parts slid out of
  // alignment with each other.
  const duplicateBar=()=>{
    if(!editPat)return;
    const n=patBars(editPat);
    if(n>=MAX_BARS)return;
    pushHistory();
    _dropVaryCache(editPat.id);
    const off=curBar*COLS, dst=(curBar+1)*COLS, newW=(n+1)*COLS;
    const growPart=(part)=>{
      if(!part||!Array.isArray(part.grid))return part;
      const oldW=gridW(part.grid);
      const g=resizePatBars(Object.assign({},part,{bars:n}),n+1);
      // Slide everything from the insert point right, THEN drop the copy in.
      const out=Object.assign({},g,{
        grid:spliceCols(openBarGap(g.grid,dst,newW),sliceCols(part.grid,off),dst)});
      if(g.durs)  out.durs  = spliceCols(openBarGap(g.durs,dst,newW),  sliceCols(part.durs||[],off,COLS,()=>1),dst,0,COLS,()=>1);
      if(g.params)out.params= spliceFlat(openBarGapFlat(g.params,dst,newW),sliceFlat(part.params||[],off),dst);
      if(g.vel)   out.vel   = spliceCols(openBarGap(g.vel,dst,newW),   sliceCols(toDrumVel2D(part.vel,oldW),off,COLS,()=>100),dst,0,COLS,()=>100);
      if(g.rat)   out.rat   = spliceCols(openBarGap(g.rat,dst,newW),   sliceCols(toDrumRat2D(part.rat,oldW),off,COLS,()=>1),  dst,0,COLS,()=>1);
      if(out.motion&&typeof out.motion==="object"){
        const m={};
        for(const k of Object.keys(out.motion))m[k]=openBarGap(out.motion[k],dst,newW);
        out.motion=m;
      }
      // Inserting a bar inside the loop extends the loop by exactly that bar,
      // rather than snapping the length out to the full allocated width. A part
      // whose loop ends before the duplicated bar never sounded it, so its
      // length is left alone and it keeps looping to fill.
      const oldLen=Math.max(1,Math.min(oldW,part.gridLen||oldW));
      out.gridLen=oldLen>off?Math.min(newW,oldLen+COLS):oldLen;
      delete out.bars;                       // bars lives on the pattern
      return out;
    };
    setPatterns(ps=>ps.map(p=>{
      if(p.id!==editPat.id)return p;
      const parts={};
      for(const l of PART_LAYERS)parts[l]=growPart(p.parts[l]);
      return Object.assign({},p,{bars:n+1,parts});
    }));
    // Land on the copy, for the same reason ADD BAR does.
    setFollowSeq(false);
    setBarPage(curBar+1);
  };
  // DOUBLE — the pattern becomes twice as long and the new half is a copy of
  // the old one, so "two nearly identical passes with small variations" is one
  // button instead of DUP BAR n times. Like DUP BAR this has to go through
  // setPatterns and touch all three parts at once.
  //
  // Every part's DATA is copied, but only a part whose loop already spanned the
  // whole pattern gets its gridLen doubled. A shorter part was looping to fill
  // and still is — doubling its length would turn a 1-bar drum loop into a
  // half-empty 8-bar part. Its copied data sits past its loop end, inert, in
  // the same way notes past a trimmed length always have.
  const doublePattern=()=>{
    if(!editPat)return;
    const n=patBars(editPat);
    if(n*2>MAX_BARS){showFlash("MAX "+MAX_BARS+" BARS");return;}
    pushHistory();
    _dropVaryCache(editPat.id);
    const oldW=n*COLS, W=oldW*2;
    const dbl=(part)=>{
      if(!part||!Array.isArray(part.grid))return part;
      const srcW=gridW(part.grid);
      const oldLen=Math.max(1,Math.min(srcW,part.gridLen||srcW));
      const g=resizePatBars(Object.assign({},part,{bars:n}),n*2);
      const out=Object.assign({},g,{
        grid:spliceCols(g.grid,sliceCols(part.grid,0,oldW),oldW,0,oldW)});
      if(g.durs)  out.durs  = spliceCols(g.durs, sliceCols(part.durs||[],0,oldW,()=>1),oldW,0,oldW,()=>1);
      if(g.params)out.params= spliceFlat(g.params,sliceFlat(part.params||[],0,oldW),oldW,0,oldW);
      if(g.vel)   out.vel   = spliceCols(g.vel,  sliceCols(toDrumVel2D(part.vel,srcW),0,oldW,()=>100),oldW,0,oldW,()=>100);
      if(g.rat)   out.rat   = spliceCols(g.rat,  sliceCols(toDrumRat2D(part.rat,srcW),0,oldW,()=>1),  oldW,0,oldW,()=>1);
      if(out.motion&&typeof out.motion==="object"){
        const m={};
        for(const k of Object.keys(out.motion))
          m[k]=spliceCols(out.motion[k],sliceCols(out.motion[k],0,oldW,()=>null),oldW,0,oldW,()=>null);
        out.motion=m;
      }
      out.gridLen=oldLen>=oldW?W:oldLen;
      delete out.bars;
      return out;
    };
    setPatterns(ps=>ps.map(p=>{
      if(p.id!==editPat.id)return p;
      const parts={};
      for(const l of PART_LAYERS)parts[l]=dbl(p.parts[l]);
      return Object.assign({},p,{bars:n*2,parts});
    }));
    // Land on the top of the copy — that's the half you're about to vary.
    setFollowSeq(false);
    setBarPage(n);
  };

  // ── SONG PAGE ──────────────────────────────────────────────────────────
  // One lane, because a pattern is all three parts. The palette at the top is
  // the pattern selector for the whole app — picking one here is what the part
  // pages then edit, which is what frees the pill row from those pages.
  //
  // Placement is tap-first: tapping an empty slot drops the selected pattern in.
  // Dragging still works (move between slots, drag off to clear) but nothing
  // requires it, which matters on a phone.
  // songBar indexes the EXPANDED sequence, so walk the slots consuming each
  // one's repeat count to find which cell the cursor is actually sitting on.
  // Which bar of the playing pattern is sounding, from the quarter-note pulse.
  const _pulseBar=songPulse<0?-1:Math.floor(songPulse/4);
  const _songPlayingSlot = (()=>{
    if(!playing||!songMode||songBar<0)return -1;
    let n=0;
    for(let i=0;i<64;i++){
      if(song[i]==null)continue;
      const r=_rep(i);
      if(songBar<n+r)return i;
      n+=r;
    }
    return -1;
  })();
  // Which pass through a repeated slot is playing (0-based), for lighting the
  // pips one at a time.
  const _songPlayingPass = (()=>{
    if(_songPlayingSlot<0)return -1;
    let n=0;
    for(let i=0;i<64;i++){
      if(song[i]==null)continue;
      if(i===_songPlayingSlot)return songBar-n;
      n+=_rep(i);
    }
    return -1;
  })();
  // Eight slots across. The grid shows two rows until the song outgrows them,
  // then one more row than it needs — so there is always somewhere to drop the
  // next pattern without the page being mostly empty squares.
  const SONG_COLS=8;
  const _songRows=(()=>{
    let last=-1;
    for(let i=0;i<64;i++)if(song[i]!=null)last=i;
    return Math.max(2,Math.min(64/SONG_COLS,Math.floor(last/SONG_COLS)+2));
  })();
  useEffect(()=>{ if(delArm==null)return; const t=setTimeout(()=>setDelArm(null),4000); return ()=>clearTimeout(t); },[delArm]);
  useEffect(()=>{ setDelArm(null); },[activePatternId]);
  // ── Song drop targets ───────────────────────────────────────────────
  // A drop lands either ON a cell (replace what's there) or on the SEAM
  // between two cells (insert, sliding everything after it right). Rects are
  // cached when the drag starts: the song grid can't move or reflow mid-drag,
  // and measuring 64 elements on every pointermove would be felt on a phone.
  const songHitR=useRef([]);
  const _songMeasure=()=>{
    const out=[];
    document.querySelectorAll('[data-song-cell="1"]').forEach(el=>{
      const r=el.getBoundingClientRect();
      out.push({idx:parseInt(el.dataset.songBar,10),l:r.left,t:r.top,w:r.width,h:r.height});
    });
    songHitR.current=out;
  };
  const _songHit=(x,y)=>{
    let best=null,bd=Infinity;
    for(const r of songHitR.current){
      const dx=x<r.l?r.l-x:(x>r.l+r.w?x-(r.l+r.w):0);
      const dy=y<r.t?r.t-y:(y>r.t+r.h?y-(r.t+r.h):0);
      const d=dx*dx+dy*dy;
      if(d<bd){bd=d;best=r;}
    }
    // Nearest-rect rather than elementFromPoint, so the gap BETWEEN two cells
    // is a seam instead of "off the grid" (it used to clear the slot). The slop
    // is kept to about a third of a cell: enough to catch the gaps and the space
    // between rows, tight enough that "off the grid" — which CLEARS a slot —
    // still means clearly off it, not a near miss at the edge.
    if(!best||bd>Math.pow(best.w*0.35,2))return null;
    const rx=(x-best.l)/best.w;
    if(rx<0.22)return{seam:best.idx};
    if(rx>0.78)return{seam:best.idx+1};
    return{cell:best.idx};
  };
  // Insert at a seam. The song is a fixed 64 slots, so this pushes the tail
  // right and drops the (empty) last one; if the last slot is occupied there is
  // nowhere for it to go and the drop is refused rather than losing it.
  const _songInsert=(k,id,rep)=>{
    if(song[63]!=null){showFlash("SONG FULL");return false;}
    setSong(sg=>{const r=[...sg];r.splice(k,0,id);r.length=64;return r;});
    setSongRep(rp=>{const r=[...rp];r.splice(k,0,Math.max(1,rep||1));r.length=64;return r;});
    return true;
  };
  // Reorder: pull the slot out, then drop it in at the seam. Removing first is
  // what makes the target index shift when you drag rightwards.
  const _songMove=(from,k)=>{
    const id=song[from],rep=_rep(from);
    const ns=[...song],nr=[...songRep];
    ns.splice(from,1);nr.splice(from,1);
    const t=k>from?k-1:k;
    ns.splice(t,0,id);nr.splice(t,0,rep);
    ns.length=64;nr.length=64;
    setSong(ns);setSongRep(nr);
  };
  const _patColorOf=(id)=>{
    const i=patterns.findIndex(p=>p.id===id);
    return i<0?"rgba(220,200,180,0.4)":patCol(i);
  };
  const songPage=(
    <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",
      justifyContent:"flex-start",padding:"6px 10px",boxSizing:"border-box",gap:8,minHeight:0}}>
      {/* PATTERNS — the selector. Tap a chip to make it active (what the part
          pages edit); DRAG one onto a song slot to place it there, which is the
          workflow the old pattern pills had. Both, because tapping is easier on
          a phone and dragging is faster once you know where a section goes. */}
      <div style={{width:"100%",maxWidth:640,flexShrink:0}}>
        {/* DUP / DEL act on the SELECTED chip — the same rule as the bar ops
            acting on the visible bar. Deferred calls, not bare references:
            dupPatternId / delPatternId are declared further down and Babel
            lowers const to var, so binding them here installs undefined. */}
        <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:5}}>
          <div style={{flex:1,fontSize:8,letterSpacing:2,color:"rgba(210,195,175,0.5)",fontWeight:600}}>PATTERNS</div>
          {(()=>{
            const selName=(patterns.find(p2=>p2.id===activePatternId)||{name:""}).name;
            const full=patterns.length>=MAX_PATTERNS;
            const last=patterns.length<=1;
            const armed=delArm!=null&&delArm===activePatternId;
            const btn=(d,extra)=>Object.assign({minWidth:34,height:28,padding:"0 9px",borderRadius:6,
              display:"flex",alignItems:"center",justifyContent:"center",gap:3,
              fontSize:9,letterSpacing:1,fontWeight:600,lineHeight:1,userSelect:"none",
              cursor:d?"default":"pointer",flexShrink:0,
              border:"1px solid rgba(200,185,165,"+(d?"0.07":"0.2")+")",background:"transparent",
              color:d?"rgba(200,185,165,0.16)":"rgba(210,195,175,0.6)"},extra||{});
            return(
              <Fragment>
                {/* Names the chip DUP/DEL will act on — the highlighted chip
                    says so too, but not while your thumb is over the row. */}
                <span style={{fontSize:11,fontWeight:700,color:_patColorOf(activePatternId),marginRight:1}}>{selName}</span>
                <div role="button" aria-label="Duplicate selected pattern"
                  onClick={full?undefined:()=>{setDelArm(null);dupPatternId(activePatternId);}}
                  style={btn(full)}>⧉ DUP</div>
                <div role="button" aria-label="Delete selected pattern"
                  onClick={last?undefined:()=>{
                    // First tap arms, second deletes. delPatternId also strips
                    // the pattern out of the song, so this is not a one-tap op.
                    if(armed){delPatternId(activePatternId);setDelArm(null);}
                    else setDelArm(activePatternId);
                  }}
                  style={btn(last,armed?{border:"1px solid #c47a7a",background:"rgba(196,122,122,0.14)",color:"#d09090"}:last?{}:{color:"rgba(196,122,122,0.7)"})}>
                  {armed?"DELETE "+selName+"?":"✕ DEL"}</div>
              </Fragment>
            );
          })()}
        </div>
        <div style={{display:"flex",flexWrap:"wrap",gap:5}}>
          {patterns.map((p,i)=>{
            const sel=p.id===activePatternId;
            const col=patCol(i);
            // Show at a glance whether a pattern has anything in it at all.
            const empty=PART_LAYERS.every(l=>{
              const g=p.parts[l]&&p.parts[l].grid;
              return !g||!g.some(row=>row&&row.some(Boolean));
            });
            const dragging=patternDrag&&patternDrag.fromPalette&&patternDrag.patId===p.id;
            return(
              <div key={p.id}
                onPointerDown={(e)=>{
                  e.stopPropagation();
                  const pointerId=e.pointerId,startX=e.clientX,startY=e.clientY;
                  let moved=false;
                  _songMeasure();
                  const hit=(ev)=>_songHit(ev.clientX,ev.clientY);
                  const onMove=(ev)=>{
                    if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                    if(!moved){
                      if(Math.abs(ev.clientX-startX)<6&&Math.abs(ev.clientY-startY)<6)return;
                      moved=true;
                      setPatternDrag({patId:p.id,name:p.name,accent:col,fromPalette:true,
                        x:ev.clientX,y:ev.clientY,overDrop:false,overSongCell:null});
                    }
                    setPatternDrag(d=>d?{...d,x:ev.clientX,y:ev.clientY,overSongCell:hit(ev)}:null);
                  };
                  const onUp=(ev)=>{
                    if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                    document.removeEventListener("pointermove",onMove);
                    document.removeEventListener("pointerup",onUp);
                    document.removeEventListener("pointercancel",onUp);
                    if(!moved){ setActivePatId(p.id); return; }   // a tap just selects
                    const t=hit(ev);
                    if(t){
                      // On a slot: fill it, replacing whatever was there. On a
                      // seam: insert, sliding the rest of the song right. Either
                      // way this becomes the pattern you're editing, so dragging
                      // one in and going straight to a part page works.
                      pushHistory();
                      if(t.seam!=null){ if(_songInsert(t.seam,p.id,1))setActivePatId(p.id); }
                      else{
                        setSong(sg=>{const r=[...sg];r[t.cell]=p.id;return r;});
                        setSongRep(rp=>{const r=[...rp];r[t.cell]=1;return r;});
                        setActivePatId(p.id);
                      }
                    }
                    setPatternDrag(null);
                  };
                  document.addEventListener("pointermove",onMove);
                  document.addEventListener("pointerup",onUp);
                  document.addEventListener("pointercancel",onUp);
                }}
                style={{minWidth:38,height:36,padding:"0 10px",borderRadius:7,display:"flex",
                  alignItems:"center",justifyContent:"center",gap:5,cursor:"grab",userSelect:"none",
                  touchAction:"none",
                  border:"1px solid "+(sel?col:"rgba(200,185,165,0.16)"),
                  background:sel?col+"22":"transparent",
                  color:sel?col:(empty?"rgba(210,195,175,0.3)":"rgba(210,195,175,0.7)"),
                  opacity:dragging?0.35:1,
                  fontSize:13,fontWeight:700,lineHeight:1}}>
                {p.name}
                <span style={{fontSize:8,opacity:0.6,fontWeight:600}}>{patBars(p)>1?patBars(p)+"b":""}</span>
              </div>
            );
          })}
          {patterns.length<MAX_PATTERNS&&(
            // Deferred call, not a bare reference: addPattern is declared later
            // in the component and Babel turns const into var, so binding it
            // directly here would silently install onClick={undefined}.
            <div onClick={()=>addPattern()}
              style={{minWidth:38,height:36,padding:"0 10px",borderRadius:7,display:"flex",alignItems:"center",
                justifyContent:"center",cursor:"pointer",userSelect:"none",
                border:"1px dashed rgba(200,185,165,0.25)",background:"transparent",
                color:"rgba(210,195,175,0.45)",fontSize:15,fontWeight:600,lineHeight:1}}>+</div>
          )}
        </div>
      </div>
      {/* SONG — played top-left to bottom-right, gaps skipped. Eight across, so
          a slot is a real touch target rather than a 21px sliver: a slot holds a
          whole pattern now (up to MAX_BARS long), so there was never any need to
          show all 64 at once. Starts at two rows and grows a row at a time as
          you fill it, up to the full 64. */}
      <div style={{width:"100%",maxWidth:640,flex:1,minHeight:0,display:"flex",flexDirection:"column",gap:5}}>
        <div style={{fontSize:8,letterSpacing:2,color:"rgba(210,195,175,0.5)",fontWeight:600,display:"flex",gap:8}}>
          <span>SONG</span>
          <span style={{color:"rgba(210,195,175,0.3)",letterSpacing:1,fontWeight:500}}>
            {songSeq.length?songSeq.length+" step"+(songSeq.length===1?"":"s"):"tap a slot to place "+(patterns.find(p=>p.id===activePatternId)||{name:""}).name}
          </span>
        </div>
        <div style={{width:"100%",display:"flex",flexDirection:"column",gap:4,flexShrink:0}}>
          {Array.from({length:_songRows},(_,row)=>(
            <div key={row} style={{display:"flex",gap:4}}>
              {Array.from({length:SONG_COLS},(_,col)=>{
                const idx=row*SONG_COLS+col;
                const id=song[idx];
                const pat=id!=null?patterns.find(p=>p.id===id):null;
                const isCursor=idx===_songPlayingSlot;
                const col0=id!=null?_patColorOf(id):null;
                // Run length, drawn on the first slot of a repeat so a long
                // stretch of the same pattern reads as "x4" without collapsing
                // the individually tappable cells.
                const rep=_rep(idx);
                const pbars=pat?patBars(pat):1;
                // A run's badge counts PLAYS, not cells, so it agrees with the
                // pips: two cells at x2 each is a run of 4. Only drawn when the
                // run spans more than one cell — a single cell's repeats are
                // already spelled out by its pips.
                const runStart=id!=null&&(idx===0||song[idx-1]!==id);
                let run=0,plays=0;
                if(runStart){let j=idx;while(j<64&&song[j]===id){run++;plays+=_rep(j);j++;}}
                const _ov=patternDrag&&patternDrag.overSongCell;
                const isHover=!!(_ov&&_ov.cell===idx);
                // Seam k draws as a caret on cell k's LEFT edge. A seam at the
                // end of a row has no cell to its right on that row, so it
                // draws on this cell's right edge instead.
                const seamL=!!(_ov&&_ov.seam===idx);
                const seamR=!!(_ov&&_ov.seam===idx+1&&(idx+1)%SONG_COLS===0);
                return(
                  <div key={col} data-song-cell="1" data-song-bar={idx} data-song-cursor={isCursor?"1":undefined}
                    style={{flex:1,aspectRatio:"1",maxHeight:80,borderRadius:5,position:"relative",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      background:pat?col0:(isCursor?"rgba(220,200,180,0.25)":"rgba(220,200,180,0.05)"),
                      border:pat?"none":"1px solid rgba(220,200,180,0.09)",boxSizing:"border-box",
                      outline:isHover?"2px solid rgba(232,220,205,0.9)":(isCursor?"2.5px solid #fff":"none"),
                      outlineOffset:"-1px",
                      boxShadow:isCursor?"0 0 10px rgba(255,255,255,0.5)":"none",
                      color:pat?"#1a1814":"transparent",fontSize:17,fontWeight:700,
                      touchAction:"none",cursor:"pointer",userSelect:"none",
                      transition:"background .08s, outline .08s"}}
                    onPointerDown={(e)=>{
                      e.stopPropagation();
                      const pointerId=e.pointerId,startX=e.clientX,startY=e.clientY;
                      let dragging=false,held=false;
                      // Press and hold a filled slot to set its repeat count —
                      // the same gesture that opens a step's params. Movement
                      // past the drag threshold cancels it, so holding never
                      // steals a drag.
                      const holdT=id==null?null:setTimeout(()=>{
                        held=true;
                        setRepPopup({idx,x:startX,y:startY});
                      },450);
                      const onMove=(ev)=>{
                        if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                        if(id==null)return;                       // nothing to drag out of an empty slot
                        if(held)return;
                        if(!dragging){
                          if(Math.abs(ev.clientX-startX)<6&&Math.abs(ev.clientY-startY)<6)return;
                          if(holdT)clearTimeout(holdT);
                          dragging=true;
                          _songMeasure();
                          setPatternDrag({patId:id,name:pat?pat.name:"",accent:col0,x:ev.clientX,y:ev.clientY,overDrop:false,overSongCell:null,sourceCell:{barIdx:idx}});
                        }
                        const h=_songHit(ev.clientX,ev.clientY);
                        // Hovering your own cell isn't a target; hovering the
                        // seams either side of it is a no-op reorder, so those
                        // aren't marked either.
                        const over=(h&&((h.cell!=null&&h.cell===idx)||(h.seam!=null&&(h.seam===idx||h.seam===idx+1))))?null:h;
                        setPatternDrag(d=>d?{...d,x:ev.clientX,y:ev.clientY,overSongCell:over}:null);
                      };
                      const onUp=(ev)=>{
                        if(ev.pointerId!==pointerId&&ev.pointerId!==undefined)return;
                        if(holdT)clearTimeout(holdT);
                        document.removeEventListener("pointermove",onMove);
                        document.removeEventListener("pointerup",onUp);
                        document.removeEventListener("pointercancel",onUp);
                        // The hold already did the work; releasing must not also
                        // count as a tap on the slot.
                        if(held)return;
                        if(!dragging){
                          pushHistory();
                          if(id==null){
                            // Tap an empty slot: place the selected pattern.
                            setSong(sg=>{const r=[...sg];r[idx]=activePatternId;return r;});
                            setSongRep(rp=>{const r=[...rp];r[idx]=1;return r;});
                          } else {
                            // Tap a filled slot: make that pattern the one you're editing.
                            setActivePatId(id);
                          }
                          return;
                        }
                        const t=_songHit(ev.clientX,ev.clientY);
                        pushHistory();
                        if(t&&t.seam!=null){
                          // Onto a seam: reorder — pull this slot out and drop
                          // it back in between the two you aimed at.
                          _songMove(idx,t.seam);
                        } else if(t){
                          if(t.cell!==idx){
                            setSong(sg=>{const r=[...sg];r[t.cell]=id;r[idx]=null;return r;});
                            // The repeat count belongs to the slot's contents,
                            // so it travels with them.
                            setSongRep(rp=>{const r=[...rp];r[t.cell]=r[idx];r[idx]=1;return r;});
                          }
                        } else {
                          // Dragged off the grid: the slot empties. The pattern
                          // itself stays in the palette.
                          setSong(sg=>{const r=[...sg];r[idx]=null;return r;});
                          setSongRep(rp=>{const r=[...rp];r[idx]=1;return r;});
                        }
                        setPatternDrag(null);
                      };
                      document.addEventListener("pointermove",onMove);
                      document.addEventListener("pointerup",onUp);
                      document.addEventListener("pointercancel",onUp);
                    }}
                    onContextMenu={id==null?undefined:(e)=>{e.preventDefault();e.stopPropagation();setRepPopup({idx,x:e.clientX,y:e.clientY});}}>
                    {pat?pat.name:""}
                    {(seamL||seamR)&&(
                      <div style={{position:"absolute",top:-2,bottom:-2,width:3,borderRadius:2,
                        [seamL?"left":"right"]:-3.5,background:"rgba(232,220,205,0.95)",
                        boxShadow:"0 0 6px rgba(232,220,205,0.6)",pointerEvents:"none",zIndex:2}}/>
                    )}
                    {runStart&&run>1&&(
                      <span style={{position:"absolute",right:3,bottom:2,fontSize:9,fontWeight:700,
                        color:"rgba(26,24,20,0.6)",pointerEvents:"none",lineHeight:1}}>×{plays}</span>
                    )}
                    {/* Bar dots — one per bar of the pattern, above the symbol,
                        mirroring the repeat pips below it. On the playing cell
                        the current bar's dot swells on every quarter note, so
                        the song page carries the tempo. They flex to fit: real
                        dots up to 8 bars, and past that they close into a
                        segmented bar where the lit one still reads as it moves
                        (32 countable dots don't fit in a phone-sized cell). */}
                    {pat&&(pbars>1||isCursor)&&(
                      <div style={{position:"absolute",left:4,right:4,top:3,display:"flex",
                        alignItems:"center",justifyContent:"center",gap:pbars<=8?1.5:0,
                        pointerEvents:"none"}}>
                        {Array.from({length:pbars},(_,k)=>{
                          const lit=isCursor&&k===_pulseBar;
                          return(
                            <div key={lit?"p"+k+"-"+songPulse:k}
                              className={lit?"barpulse":undefined}
                              style={{flex:"1 1 0",minWidth:0,maxWidth:pbars<=8?4:undefined,
                                height:3,borderRadius:pbars<=8?2:0,
                                background:lit?"rgba(255,255,255,0.95)":"rgba(26,24,20,0.4)"}}/>
                          );
                        })}
                      </div>
                    )}
                    {/* Repeat pips — one per play, along the bottom edge. The
                        one that's sounding lights up, so a x4 cell reads as
                        progress rather than a static count. */}
                    {pat&&rep>1&&(
                      <div style={{position:"absolute",left:0,right:0,bottom:3,display:"flex",
                        justifyContent:"center",gap:2,pointerEvents:"none"}}>
                        {Array.from({length:rep},(_,k)=>(
                          <div key={k} style={{width:4,height:4,borderRadius:2,
                            background:(isCursor&&k===_songPlayingPass)?"rgba(255,255,255,0.95)":"rgba(26,24,20,0.45)"}}/>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {/* Repeat picker. Sits ABOVE the press point on purpose: it opens while
          your finger is still down, and the trailing click of that same press
          would otherwise land on whatever is underneath. The backdrop dismisses
          on pointerDOWN for the same reason — a click handler there would eat
          the release of the press that opened it (the sheet-opener trap). */}
      {repPopup&&(()=>{
        const W=4*38+3*6, vw=(typeof window!=="undefined"?window.innerWidth:360);
        const left=Math.max(8,Math.min(vw-W-8,repPopup.x-W/2));
        const above=repPopup.y-64;
        const top=above<8?repPopup.y+22:above;
        const cur=_rep(repPopup.idx);
        const acc=_patColorOf(song[repPopup.idx]);
        return(
          <Fragment>
            <div onPointerDown={(e)=>{e.stopPropagation();setRepPopup(null);}}
              style={{position:"fixed",inset:0,zIndex:60,background:"transparent"}}/>
            <div style={{position:"fixed",left,top,zIndex:61,display:"flex",gap:6,padding:6,
              borderRadius:9,background:"rgba(28,25,21,0.97)",
              border:"1px solid rgba(200,185,165,0.22)",
              boxShadow:"0 6px 20px rgba(0,0,0,0.5)",touchAction:"none"}}
              onPointerDown={e=>e.stopPropagation()}>
              {Array.from({length:SONG_MAX_REP},(_,k)=>{
                const n=k+1, on=n===cur;
                return(
                  <div key={n} role="button" aria-label={"Play "+n+" time"+(n===1?"":"s")}
                    onClick={()=>{
                      if(n!==cur){pushHistory();setSongRep(rp=>{const r=[...rp];r[repPopup.idx]=n;return r;});}
                      setRepPopup(null);
                    }}
                    style={{width:38,height:38,borderRadius:7,display:"flex",flexDirection:"column",
                      alignItems:"center",justifyContent:"center",gap:3,cursor:"pointer",userSelect:"none",
                      border:"1px solid "+(on?acc:"rgba(200,185,165,0.18)"),
                      background:on?acc+"22":"transparent",
                      color:on?acc:"rgba(210,195,175,0.7)",fontSize:13,fontWeight:700,lineHeight:1}}>
                    <span>{n}</span>
                    <div style={{display:"flex",gap:1.5}}>
                      {Array.from({length:n},(_,j)=>(
                        <div key={j} style={{width:3,height:3,borderRadius:1.5,
                          background:on?acc:"rgba(210,195,175,0.4)"}}/>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </Fragment>
        );
      })()}
    </div>
  );

  // ── BAR STRIP ──────────────────────────────────────────────────────────
  // Kept as a JSX VALUE rather than a function returning JSX — module-level
  // arrows returning JSX are the CJS-transform footgun the build audit guards
  // against, and a plain const sidesteps the question entirely while still
  // letting all four editor layouts (synth/drums × portrait/landscape) share
  // one strip.
  //
  // Reads as a minimap: each segment is a bar, filled if it contains notes, so
  // you can see the shape of a long pattern and where you are in it at a glance.
  const _barHasNotes=(bi)=>{
    if(!editPat||!editPat.grid)return false;
    const a=bi*COLS,b=a+COLS;
    for(let r=0;r<editPat.grid.length;r++){
      const row=editPat.grid[r]; if(!row)continue;
      for(let c=a;c<b;c++)if(row[c])return true;
    }
    return false;
  };
  // Chips only. Every control that used to sit alongside them (add / remove /
  // duplicate bar, follow) moved into the SEQUENCE drawer next to the pattern
  // ops, where the buttons can be a real touch size — a row of 18px glyphs above
  // the grid was too small to hit on the phone.
  const _scrubTo=(clientX,el)=>{
    const rect=el.getBoundingClientRect();
    const i=Math.floor(((clientX-rect.left)/rect.width)*barCount);
    const bi=Math.max(0,Math.min(barCount-1,i));
    // Deliberately does NOT switch FOLLOW off — that's the transport's toggle
    // and a grid edit is what clears it, same as it always was.
    setBarPage(bi);
  };
  // Tap or drag anywhere along the chips to move. The row is deliberately tall
  // so a thin chip on a long pattern is still an easy target. Held separately
  // from barStrip because the drawer repeats the chips on their own: the sheet
  // covers the strip above the grid, and DUP BAR / DEL BAR act on the VISIBLE
  // bar, so you must be able to see and change it from inside the drawer.
  const barChips=(
      <div style={{position:"relative",flex:1,display:"flex",gap:2,height:22,touchAction:"none",cursor:"pointer"}}
           onPointerDown={e=>{e.stopPropagation();e.preventDefault();e.currentTarget.setPointerCapture(e.pointerId);_scrubTo(e.clientX,e.currentTarget);}}
           onPointerMove={e=>{if(!e.buttons)return;e.stopPropagation();_scrubTo(e.clientX,e.currentTarget);}}>
        {Array.from({length:barCount},(_,bi)=>{
          const isCur=bi===curBar, isPlaying=bi===playingBar;
          // Three states have to stay tellable apart on the same chip: the bar
          // you're EDITING (light fill), the bar that's SOUNDING (gold inset
          // ring) and the bar LOOP is holding (steel underline, LOOP's colour).
          const isLoop=loopMode&&bi===loopBar;
          const has=_barHasNotes(bi);
          // Bars past this part's loop end hold no content of their own — the
          // part repeats its own length through them (loop to fill), which is
          // also why the playhead ring never visits them. Recessed for that.
          const past=bi*COLS>=(editPat?.gridLen??COLS);
          const wide=barCount<=8;   // number the chips while they're readable
          return(
            <div key={bi} style={{position:"relative",flex:1,minWidth:2,borderRadius:3,
              display:"flex",alignItems:"center",justifyContent:"center",
              background:isCur?"rgba(232,220,205,0.55)":isLoop?"rgba(159,180,199,0.16)":past?"rgba(220,200,180,0.03)":has?"rgba(220,200,180,0.17)":"rgba(220,200,180,0.07)",
              boxShadow:isPlaying?"inset 0 0 0 1.5px "+C_VARY:"none",
              color:isCur?"rgba(20,16,12,0.75)":isLoop?C_LOOP:"rgba(210,195,175,0.45)",
              fontSize:9,fontWeight:700,lineHeight:1,pointerEvents:"none",
              transition:"background .08s"}}>
              {wide?bi+1:""}
              {/* Underline, not a ring or a fill: it survives a 2px-wide chip on
                  a 32-bar pattern and doesn't collide with the other two states. */}
              {isLoop?<div style={{position:"absolute",left:1,right:1,bottom:1,height:2,borderRadius:1,background:C_LOOP}}/>:null}
            </div>
          );
        })}
      </div>
  );
  const barStrip=(
    <div style={{display:"flex",alignItems:"center",gap:IS_MOBILE?5:6,marginBottom:IS_MOBILE?4:5,width:"100%",touchAction:"none"}}>
      {barChips}
      {/* The bar count doubles as the handle for the pattern drawer — the bar
          controls it holds belong to what this readout is describing, so that's
          where you reach for them. (Mobile only: on desktop the same controls
          are always visible in the sidebar, so there's no drawer to open.) */}
      {IS_MOBILE?(
        <div role="button" aria-label="Pattern and bar controls"
          onClick={e=>{
            // onClick, NOT onPointerDown: opening the sheet from pointerdown
            // mounts the full-screen backdrop under the finger, and the same
            // tap's trailing click then lands on it and dismisses the sheet
            // instantly — the handle just looks dead. Every other sheet opener
            // in here is onClick for the same reason.
            e.stopPropagation();
            setActiveSheet(sh=>sh==="bars"?null:"bars");}}
          style={{display:"flex",alignItems:"center",justifyContent:"center",gap:3,
            height:22,minWidth:66,padding:"0 8px",borderRadius:5,
            border:"1px solid "+(activeSheet==="bars"?"rgba(232,220,205,0.5)":"rgba(200,185,165,0.18)"),
            background:activeSheet==="bars"?"rgba(232,220,205,0.12)":"transparent",
            color:activeSheet==="bars"?"rgba(232,220,205,0.9)":"rgba(210,195,175,0.55)",
            fontSize:10,fontWeight:600,letterSpacing:0.5,lineHeight:1,
            cursor:"pointer",userSelect:"none",flexShrink:0}}>
          {/* Names the pattern you're editing — the pills that used to say so
              are gone from the part pages. */}
          <span style={{color:_patColorOf(activePatternId),fontWeight:700}}>{(patterns.find(p2=>p2.id===activePatternId)||{name:""}).name}</span>
          <span style={{opacity:0.35}}>·</span>
          <span>{curBar+1}/{barCount}</span>
          <span style={{fontSize:7,opacity:0.7,transform:activeSheet==="bars"?"rotate(180deg)":"none"}}>▾</span>
        </div>
      ):(
        <span style={{fontSize:9,letterSpacing:0.5,minWidth:52,textAlign:"center",pointerEvents:"none",display:"flex",gap:4,justifyContent:"center"}}>
          <span style={{color:_patColorOf(activePatternId),fontWeight:700}}>{(patterns.find(p2=>p2.id===activePatternId)||{name:""}).name}</span>
          <span style={{color:"rgba(210,195,175,0.4)"}}>{curBar+1}/{barCount}</span>
        </span>
      )}
    </div>
  );
  // Desktop sidebar version of the bar controls. The mobile drawer carries a
  // thumb-sized set; this one matches the density of the ops rows it sits under.
  const barOpsRow=(
    <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:2}}>
      {[["+BAR",addBar,barCount>=MAX_BARS,false],
        ["⧉BAR",duplicateBar,barCount>=MAX_BARS,false],
        ["−BAR",removeBar,barCount<=1,true],
        ["×2",doublePattern,barCount*2>MAX_BARS,false]].map(([l,f,d,danger])=>(
        <button key={l} disabled={!!d} title={l==="⧉BAR"?"Duplicate the visible bar":(l==="×2"?"Double the pattern — the new half is a copy of the old one":undefined)}
          style={{padding:"4px 0",border:"1px solid rgba(200,185,165,"+(d?"0.06":"0.13")+")",borderRadius:5,background:"transparent",color:d?"rgba(200,185,165,0.18)":danger?"#c47a7a":"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit"}}
          onClick={d?undefined:f}>{l}</button>
      ))}
    </div>
  );

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
  // Sparse-packed on the way out (see the codec): share links live in a URL and
  // autosave lives in localStorage, neither of which can hold dense multi-bar
  // grids. applyShareState unpacks, and pre-codec saves pass through untouched.
  const getShareState=(includeSamples=true)=>packProject({
    ver:PROJ_VER,
    bpm,scale,transpose,swing,speedMult,
    layerParams,
    dlyIdx,dlyFbPct,dlyHpVal,dlyLpVal,rvSize,rvDamp,rvLfDamp,rvPreDelay,rvMod,dlyToRev,drumLevel,
    drumMix:JSON.parse(JSON.stringify(drumMix)),
    trackMute,trackSolo,activeKit,
    ...(includeSamples?{userSamples:serializeSamples(userSamples)}:{}),
    vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,
    vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,
    loopMode,loopBar,loopPat,varyMode,
    patterns,activePatId:activePatternId,
    song,songRep,songMode,songView,activeLayer
  });

  const applyShareState=rawState=>{
    if(!rawState)return;
    setBarPage(0);
    const s=unifyLegacyProject(migrateLegacyBass(unpackProject(rawState)));
    setActiveLayer(s.activeLayer||"synth");
    _adoptPatterns(s);
    // Apply with fallback to defaults — share imports should reset to a clean
    // baseline for anything the link doesn't carry, same rule as doLoad.
    setBpm(s.bpm!=null?s.bpm:SESSION_DEFAULTS.bpm);
    setScale(s.scale!=null?s.scale:SESSION_DEFAULTS.scale);
    setTranspose(s.transpose!=null?s.transpose:SESSION_DEFAULTS.transpose);
    setSwing(s.swing!=null?s.swing:SESSION_DEFAULTS.swing);
    // s.gridLen was per-pattern in legacy shares; new shares carry it on
    // each pat directly. The global setGridLen doesn't exist any more.
    setSpeedMult(s.speedMult!=null?s.speedMult:SESSION_DEFAULTS.speedMult);
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
    setLoopBar(s.loopBar!=null?s.loopBar:SESSION_DEFAULTS.loopBar);
    setLoopPat(s.loopPat!=null?s.loopPat:null);
    setVaryMode(normVary(s.varyMode));
    setTrackMute(s.trackMute&&typeof s.trackMute==="object"?{...{synth:false,lead:false,drums:false},...s.trackMute}:{synth:false,lead:false,drums:false});
    setTrackSolo(s.trackSolo&&typeof s.trackSolo==="object"?{...{synth:false,lead:false,drums:false},...s.trackSolo}:{synth:false,lead:false,drums:false});
    // Global mix: saved global drumMix, else seed from the first pattern's drums.
    setDrumMixArr(s.drumMix?fillDrumMix(s.drumMix)
      :fillDrumMix(s.patterns[0]&&s.patterns[0].parts&&s.patterns[0].parts.drums&&s.patterns[0].parts.drums.mix));
    [["dlyIdx",setDlyIdx],["dlyFbPct",setDlyFbPct],["dlyHpVal",setDlyHpVal],["dlyLpVal",setDlyLpVal],["rvSize",setRvSize],["rvDamp",setRvDamp],["rvLfDamp",setRvLfDamp],["rvPreDelay",setRvPreDelay],["rvMod",setRvMod],["dlyToRev",setDlyToRev],["drumLevel",setDrumLevel],
     ["vDropRate",setVDropRate],["vShiftRate",setVShiftRate],["vShiftRange",setVShiftRange],
     ["vPitchRate",setVPitchRate],["vPitchRange",setVPitchRange],["vGhostRate",setVGhostRate],
     ["vVelJitter",setVVelJitter],["vFltJitter",setVFltJitter],["vDlyJitter",setVDlyJitter],
     ["vRhyJitter",setVRhyJitter],["vOctJitter",setVOctJitter],["vGlideJitter",setVGlideJitter],["vDurJitter",setVDurJitter],
    ].forEach(([k,fn])=>{fn(s[k]!=null?s[k]:SESSION_DEFAULTS[k]);});
    _adoptSong(s);
    setSongMode(s.songMode!=null?s.songMode:SESSION_DEFAULTS.songMode);
    setSongView(s.songView!=null?s.songView:(s.songMode?true:SESSION_DEFAULTS.songView));

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
  // One part of one pattern, in the flat shape the export code expects.
  const _partOf=(id,layer)=>{
    const p2=patterns.find(x=>x.id===id);
    return p2&&p2.parts&&p2.parts[layer]?partView(p2,layer):null;
  };
  // Ordered bars to export: the full populated song matrix, else one bar of the
  // active patterns. Each entry = {synth,lead,drums} pattern ids (or null).
  // What a bounce plays: the song's patterns in order, or just the one you're
  // editing. Every entry is a whole pattern now, so a "bar" is a pattern id.
  const _exportBars=()=>{
    if(songMode&&songSeq.length)return songSeq.map(id=>({synth:id,lead:id,drums:id}));
    const id=activePatternId;
    return [{synth:id,lead:id,drums:id}];
  };
  // A song entry lasts its pattern's full length — that's the boundary the
  // scheduler re-synchronises on.
  const _patStepsOf=(id)=>{
    const p2=patterns.find(x=>x.id===id);
    return p2?Math.max(1,patBars(p2)*COLS):COLS;
  };

  // Export the song arrangement as a Standard MIDI File. Each song cell runs for
  // as long as its SHORTEST pattern's loop (gridLen, which is now up to
  // MAX_BARS*COLS steps), mirroring how the sync scheduler advances the song
  // bar; shorter patterns in the same cell repeat to fill it.
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
    // Cell length in 16th steps = the shortest populated pattern's loop, which
    // is what the sync scheduler uses as the song-bar boundary. speedMult is
    // deliberately NOT applied here — per-pattern speed is a performance layer,
    // and this export is the underlying composition.
    const _midiCellSteps=(bar)=>_patStepsOf(bar.synth);
    let _runTick=0;
    bars.forEach((bar)=>{
      const barTick=_runTick;
      const cellSteps=_midiCellSteps(bar);
      _runTick+=cellSteps*TICKS_16;
      [["synth",synthEv,0],["lead",leadEv,1]].forEach(([layer,ev,ch])=>{
        const pat=_partOf(bar[layer],layer);
        if(!pat||!pat.grid)return;
        const len=pat.gridLen||16;
        const layerOct=(layerParams[layer]&&layerParams[layer].octave)||0;
        const mono=!!(layerParams[layer]&&layerParams[layer].monoSingle);
        for(let s=0;s<cellSteps;s++){
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
        for(let s=0;s<cellSteps;s++){
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
    exportingR.current=true;setExporting(true);setExportPhase("Preparing");
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
      const loops=Math.max(1,Math.min(16,exportLoops||1));
      // Each song cell lasts as long as its SHORTEST pattern (gridLen × speedMult,
      // in absolute 16th steps), mirroring the live sync scheduler — so a song
      // with 1/2-speed patterns bounces at its true (longer) length, not 16/bar.
      const absStepSec=60/Math.max(1,bpm)/4;
      const _cellSteps=bar=>_patStepsOf(bar.synth);
      const _bars=_exportBars();
      // Sync/free linear bounces play the whole first→last span (gaps included).
      // RANDOM never visits gap bars, so one of its cycles is just the total
      // duration of the AVAILABLE (populated) patterns.
      const isRandom=false;
      const spanSec =_bars.reduce((s,bar)=>s+_cellSteps(bar)*absStepSec,0);
      const availSec=_bars.filter(b=>b.synth!=null||b.lead!=null||b.drums!=null)
                          .reduce((s,bar)=>s+_cellSteps(bar)*absStepSec,0);
      const cycleSec=isRandom?(availSec||spanSec):spanSec;
      const totalSec=cycleSec*loops; // `loops` cycles in whatever mode the user is in
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
      // Start the song cleanly from the top, in the user's CURRENT mode (restore
      // after). Sync/free and random are left exactly as set, so the bounce
      // captures the arrangement they were working on — only LOOP is forced off
      // (it solos one pattern, which would not play the song).
      const haveSong=songSeq.length>0;
      if(haveSong){
        restore={mode:songModeR.current,loop:loopR.current};
        songModeR.current=true;setSongMode(true);
        loopR.current=false;setLoopMode(false);
        // Start at the first populated bar (startStop only does this when its
        // `songMode` state closure is true; force via the ref so the bounce
        // starts from the top even if the user wasn't viewing song mode).
        songPosR.current=0;songBarR.current=0;setSongBar(0);
      }
      showFlash("BOUNCING…");setExportPhase("Bouncing");
      capturing=true;
      await startStop();                       // start playback from the song top
      const t0=ctx.currentTime;
      progTmr=setInterval(()=>{if(exportBarR.current)exportBarR.current.style.width=Math.min(99.9,(ctx.currentTime-t0)/(totalSec+tailSec)*100)+"%";},100);
      await _waitAudio(ctx,t0+totalSec);        // play `loops` passes of the song
      if(playingR.current)await startStop();    // stop notes; FX tail keeps ringing
      await _waitAudio(ctx,t0+totalSec+tailSec);// capture the tail
      capturing=false;
      if(progTmr){clearInterval(progTmr);progTmr=null;}
      const L=_concatF32(Lc),R=_concatF32(Rc);
      if(!L.length){showFlash("NOTHING TO BOUNCE");return;}
      showFlash("ENCODING…");setExportPhase("Encoding");if(exportBarR.current)exportBarR.current.style.width="100%";
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
      setExportPhase("");
      try{if(master&&cap)master.disconnect(cap);}catch(e){}
      try{if(cap)cap.disconnect();cap&&(cap.onaudioprocess=null);}catch(e){}
      try{if(sink)sink.disconnect();}catch(e){}
      // Safety: never leave the master muted or the FX feedback flushed if the
      // bounce bailed out between the silence step and its restore.
      try{const c=bell.current.ctx;if(c&&bell.current.master){bell.current.master.gain.setValueAtTime(0.55,c.currentTime);bell.current.setRvSize&&bell.current.setRvSize(rvSize);bell.current.setDlyFb&&bell.current.setDlyFb(dlyFbPct/100);}}catch(e){}
      if(restore){songModeR.current=restore.mode;setSongMode(restore.mode);loopR.current=restore.loop;setLoopMode(restore.loop);}
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
  // A session loaded FROM a share-link hash starts as a "preview": it must NOT
  // silently overwrite the user's own stored autosave + recorded samples just by
  // being opened. Persistence stays suppressed until the first real edit
  // (pushHistory clears this flag), at which point the user has adopted the
  // shared project and autosave resumes for crash-recovery.
  const loadedFromShareR = useRef(false);
  // Recorded samples are heavy to encode, so persist them only when they
  // actually change — record/clear sets this; a restore or a stop never does.
  const samplesDirtyR = useRef(false);
  useEffect(()=>{
    const hash=window.location.hash.slice(1);
    if(hash){
      window.location.hash="";                          // clear regardless of validity
      const s=decodeState(hash);
      if(s){applyShareState(s);loadedFromShareR.current=true;autosaveReadyR.current=true;return;}
      // corrupt/unreadable hash → ignore it and restore the user's autosave below
    }
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
      }catch(e){
        // Never swallow this silently: a throw in here looks exactly like
        // "the project just didn't load", and autosave then never fires
        // because no state changed — which is how a restore bug hides.
        try{console.error("Tabula: autosave restore failed —",e&&e.message,e);}catch(_){}
      }
      autosaveReadyR.current=true;
    })();
  },[]);
  // Debounced LEAN persist (no samples → cheap, never janks). Skipped while
  // playing (a write must never block the audio thread mid-play), while
  // exporting (so the bounce's forced transport state can't leak in), and for a
  // share-loaded preview. `playing` is a dep so play-start clears the pending
  // timer and play-stop schedules a catch-up save.
  useEffect(()=>{
    if(!autosaveReadyR.current||playing||exportingR.current||loadedFromShareR.current)return;
    if(autosaveTmrR.current)clearTimeout(autosaveTmrR.current);
    autosaveTmrR.current=setTimeout(()=>{
      try{storageSet("autosave",JSON.stringify(getShareState(false)));}catch(e){}
    },1200);
    return ()=>{if(autosaveTmrR.current)clearTimeout(autosaveTmrR.current);};
  },[playing,pats,drumPats,layerParams,bpm,scale,transpose,swing,speedMult,activeId,activeDrumId,activeLayer,drumMix,drumLevel,dlyIdx,dlyFbPct,dlyHpVal,dlyLpVal,rvSize,rvDamp,rvLfDamp,rvPreDelay,rvMod,dlyToRev,trackMute,trackSolo,activeKit,varyMode,loopMode,loopBar,loopPat,vDropRate,vShiftRate,vShiftRange,vPitchRate,vPitchRange,vGhostRate,vVelJitter,vFltJitter,vDlyJitter,vRhyJitter,vOctJitter,vGlideJitter,vDurJitter,song,songRep,songMode,songView]);
  // Recorded USER samples persist on their own key, ONLY when they actually
  // change (record/clear sets samplesDirtyR) — never re-encoded on a restore or
  // a stop, and never during playback / export / a share preview. A restore
  // therefore can't erase the stored samples with an empty re-write.
  useEffect(()=>{
    if(!autosaveReadyR.current||playing||exportingR.current||loadedFromShareR.current||!samplesDirtyR.current)return;
    const id=setTimeout(()=>{
      samplesDirtyR.current=false;
      try{const smp=serializeSamples(userSamplesR.current);storageSet("autosave_smp",(smp&&Object.keys(smp).length)?JSON.stringify(smp):"");}catch(e){}
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
    // LOOP does NOT drop you out of the song any more. In song mode it parks
    // the song on its CURRENT entry and cycles one bar of that entry's pattern;
    // switch LOOP off and the song carries on from where it was held.
    const inSong=songModeR.current;

    // ── What is playing right now ──────────────────────────────────────
    // A pattern is all three parts, so there is exactly one of them at any
    // moment: the song's current entry, or the pattern you're editing. No
    // per-layer resolution, no parked layer store, no shortest-lane fudge.
    const allPats=patternsR.current||[];
    const seq=songSeqR.current||[];
    let curPat=null;
    if(inSong&&seq.length){
      if(songPosR.current<0||songPosR.current>=seq.length)songPosR.current=0;
      curPat=allPats.find(p=>p.id===seq[songPosR.current]);
    }
    // LOOP pins the pattern you were LOOKING AT, not the one the song is on.
    if(inLoop){const lp=allPats.find(p=>p.id===loopPatR.current);if(lp)curPat=lp;}
    if(!curPat)curPat=allPats.find(p=>p.id===activePatternIdR.current)||allPats[0];
    if(!curPat)return;
    // LOOP cycles ONE bar of whatever pattern is playing (the song's current
    // entry in song mode, the pattern you're editing otherwise), in every part,
    // so you can sit on it and work. The bar is the one that was visible when
    // LOOP was switched on and stays put — NOT whatever page you're on now. It
    // is a bar INDEX, so it clamps into a shorter song entry. Otherwise: the
    // whole pattern.
    const loopBarIdx=inLoop?Math.max(0,Math.min(patBars(curPat)-1,Math.max(0,loopBarR.current))):-1;
    const loopOff=loopBarIdx*COLS;
    // The cycle length in absolute steps. Everything re-synchronises here:
    // parts loop inside it at their own gridLen and speed, and the song
    // advances when it wraps (unless LOOP is holding it).
    const patLen=Math.max(1,inLoop?COLS:patBars(curPat)*COLS);
    const curPart=(layer)=>{
      const part=curPat.parts&&curPat.parts[layer];
      if(!part)return null;
      return Object.assign({},part,{id:curPat.id,name:curPat.name,bars:curPat.bars});
    };

    // ── PART SCHEDULING — each part runs its own cursor inside the pattern,
    // at its own gridLen and speedMult. They can drift apart within the
    // pattern (that's the polymeter) and are snapped back together at the
    // pattern boundary by the master clock below.
    for(const layer of PART_LAYERS){
      const lf=freeR.current[layer];
      lf.bar=0;
      while(lf.nextAt<ctx.currentTime+LOOKAHEAD){
        const pat=curPart(layer);
        if(!pat){
          // Silent layer at this bar — just advance time so we re-check next tick.
          lf.nextAt+=absStepDur;
          break;
        }
        const len=pat.gridLen??16;
        const layerStepDur=absStepDur*(pat.speedMult??1);
        // In LOOP the cursor runs 0..COLS-1 across the visible bar's columns;
        // otherwise it runs the part's own loop length.
        const s=inLoop?loopOff+(lf.step%COLS):lf.step%len;
        const at=lf.nextAt;
        // Variation regenerates at every BAR boundary (s%COLS===0), not just at
        // the top of the pattern. On a 1-bar pattern that IS step 0, so this is
        // unchanged from before multi-bar patterns; on a 32-bar pattern it keeps
        // VARY meaning "a fresh roll each bar" instead of once every 32 bars.
        const _barC0=Math.floor(s/COLS)*COLS;
        if(s%COLS===0&&varyModeR.current[layer]){
          if(layer==="drums"){
            const vRhythm=(pat.vRhythm||0)/100;
            const vVelocity=(pat.vVelocity||0)/100;
            const _bC1=Math.min(len,_barC0+COLS);
            // Keep the bars we're NOT rerolling as they already were, so a long
            // pattern varies bar-by-bar instead of the whole thing at once.
            const prevG=variedDrumGrids.current.get(pat.id);
            const inBar=ci=>ci>=_barC0&&ci<_bC1;
            let vGrid=pat.grid.map((row,ri)=>row.map((on,ci)=>{
              if(!inBar(ci))return (prevG&&prevG[ri]&&prevG[ri][ci]!==undefined)?prevG[ri][ci]:(ci<len&&on);
              if(on&&Math.random()<vRhythm*0.45)return false;
              if(!on&&Math.random()<vRhythm*0.18)return true;
              return on;
            }));
            // Anti-silence guard (matches the toggle regen): if the variation
            // cleared every hit inside THIS BAR, keep the bar's original hits.
            const had=pat.grid.some(row=>row.some((on,ci)=>on&&inBar(ci)));
            const got=vGrid.some(row=>row.some((on,ci)=>on&&inBar(ci)));
            if(had&&!got)vGrid=vGrid.map((row,ri)=>row.map((v,ci)=>inBar(ci)?!!(pat.grid[ri]&&pat.grid[ri][ci]):v));
            const baseVel=toDrumVel2D(pat.vel,gridW(pat.grid));
            const vVel=baseVel.map(row=>row.map(v=>Math.max(1,Math.min(127,Math.round(v+(Math.random()*2-1)*vVelocity*50)))));
            variedDrumGrids.current.set(pat.id,vGrid);
            variedDrumVels.current.set(pat.id,vVel);
          } else {
            // Only this bar rerolls; earlier bars keep the roll they got.
            const prevS=variedGrids.current.get(pat.id);
            const rolled=safeVaryGrid(pat.grid,varyParamsR.current,len,_barC0,COLS);
            if(prevS&&prevS.length===rolled.length){
              for(let ri=0;ri<rolled.length;ri++)
                for(let ci=0;ci<rolled[ri].length;ci++)
                  if(ci<_barC0||ci>=_barC0+COLS)rolled[ri][ci]=prevS[ri][ci];
            }
            variedGrids.current.set(pat.id,rolled);
            // Self-record (synth-only) — vary the source pat and append.
            if(layer==="synth"&&recModeR.current&&patsR.current.length<8){
              const vp=varyParamsR.current;
              const src=patsR.current.find(x=>x.id===recSourceIdR.current)||pat;
              const rvg=genVariation(src.grid,vp);
              const newParams=(src.params||defaultStepParams()).map(p2=>jitterStepParam(p2,vp));
              const newPat={id:++_id,name:pickSym(patsR.current.map(p=>p.name)),grid:rvg,durs:src.durs?src.durs.map(rr=>[...rr]):mkDurs(gridW(src.grid)),params:newParams,gridLen:src.gridLen??16,bars:patBars(src),speedMult:src.speedMult??1};
              setPats(ps=>{if(ps.length>=MAX_PATTERNS){recModeR.current=false;setRecMode(false);return ps;}return [...ps,newPat];});
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
        const ns=inLoop?(lf.step+1)%COLS:(s+1)%len;
        lf.step=ns;
        lf.nextAt+=layerStepDur;
      }
    }

    // ── MASTER CLOCK — one pattern long (one BAR while LOOP holds one). When
    // it wraps, the song moves to its next entry and every part restarts from
    // step 0. That single rule replaces sync/free/random and the old "shortest
    // populated lane" bar.
    while(nextNoteR.current<ctx.currentTime+LOOKAHEAD){
      const ns=(stepR.current+1)%patLen;
      if(ns===0){
        // LOOP holds the song where it is: the entry keeps playing, one bar
        // of it at a time, and position is exactly where you left it when LOOP
        // goes off.
        if(inSong&&!inLoop&&seq.length>1){
          songPosR.current=(songPosR.current+1)%seq.length;
          setSongBar(songPosR.current);
          setSongBarLayer({synth:songPosR.current,lead:songPosR.current,drums:songPosR.current});
        }
        for(const l of PART_LAYERS){
          freeR.current[l].step=0;
          freeR.current[l].nextAt=nextNoteR.current+absStepDur;
        }
      }
      stepR.current=ns;
      nextNoteR.current+=absStepDur;
    }
    // Coarse position for the song page's bar dots. Same lookahead lead as the
    // grid playhead — both are published when a step is SCHEDULED, not when it
    // sounds — so the two agree with each other.
    {
      const cs=stepR.current;
      const pb=inLoop?loopBarIdx:Math.floor(cs/COLS);
      const pq=pb*4+Math.floor((cs%COLS)/4);
      if(songPulseR.current!==pq){songPulseR.current=pq;setSongPulse(pq);}
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
      setSongPulse(-1);songPulseR.current=-1;
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
    bell.current.setRvMod&&bell.current.setRvMod(rvMod);
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
        navigator.mediaSession.setActionHandler("play",()=>{if(!exportingR.current&&!playingR.current)startStop();});
        navigator.mediaSession.setActionHandler("pause",()=>{if(!exportingR.current&&playingR.current)startStop();});
        navigator.mediaSession.setActionHandler("stop",()=>{if(!exportingR.current&&playingR.current)startStop();});
      }catch(e){}
    }
    stepR.current=0;
    const t0=bell.current.ctx.currentTime+0.05;
    // All three parts start together at the top of the pattern.
    for(const layer of PART_LAYERS){
      freeR.current[layer]={step:0,nextAt:t0,bar:0};
    }
    // The song always starts at its first entry — it's a linear list now.
    songPosR.current=0;
    if(songMode){
      songBarR.current=0;setSongBar(0);
      setSongBarLayer({synth:0,lead:0,drums:0});
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
    const W=gridW(grid);
    for(let c=0;c<W;c++){let found=false;for(let r=0;r<ROWS;r++){if(g[r][c]){if(found)g[r][c]=false;else found=true;}}}
    return g;
  };
  // fn receives (grid, pat) so bar-scoped mutations can read the pattern's width.
  const mutatePat=fn=>setPats(ps=>ps.map(p=>{
    if(p.id!==activeId)return p;
    let grid=fn(p.grid,p);
    if(activeLayer==="lead")grid=cullMonoGrid(grid); // MONO never goes polyphonic
    return Object.assign({},p,{grid});
  }));

  // Collapse a grid to at most one note per column (keep a random one)
  const collapseToMono=g=>{
    const W=gridW(g);
    const out=mkGrid(W);
    for(let c=0;c<W;c++){
      const hits=[];
      for(let r=0;r<ROWS;r++)if(g[r][c])hits.push(r);
      if(hits.length)out[hits[Math.floor(Math.random()*hits.length)]][c]=true;
    }
    return out;
  };

  // MUT8 mutates the BAR you're looking at, not the whole pattern — same as
  // RAND/CLR/CPY/PST. On a 1-bar pattern that's the entire thing, as before.
  const mutatePat1=()=>{pushHistory();return mutatePat((g,p2)=>{
    return genVariation(g,varyParamsR.current,barOffIn(p2),COLS);
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
    // vc = view column (what's on screen, 0..COLS-1) — used for geometry.
    // c  = absolute pattern column (vc + the visible bar's offset) — used for data.
    let r=null,c=null,vc=null,hasCell=false,cellFracX=0.5;
    if(gridEl){
      const rect=gridEl.getBoundingClientRect();
      const relY=e.clientY-rect.top, relX=e.clientX-rect.left;
      const ri=Math.floor(relY/(rect.height/ROWS));
      const ci=Math.floor(relX/(rect.width/COLS));
      if(ri>=0&&ri<ROWS&&ci>=0&&ci<COLS){
        r=ri;vc=ci;c=ci+synthBarOffR();hasCell=true;
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
      const ox=rect?rect.left+rect.width/COLS*(vc+0.5):e.clientX;
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
    const vc=Math.floor((e.clientX-rect.left)/(rect.width/COLS));
    if(r<0||r>=ROWS||vc<0||vc>=COLS)return;
    const c=vc+synthBarOffR();
    const pat=patsR.current.find(p=>p.id===activeIdR.current);
    if(!pat||!pat.grid[r]||!pat.grid[r][c])return;
    const ox=rect.left+rect.width/COLS*(vc+0.5);
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
      // A slider in the popup panel is being dragged directly — let it own the
      // gesture. Without this the radial picker also runs (the overlay's
      // onPointerMove) and sets a DIFFERENT arm by angle, so e.g. dragging the
      // OCT slider also nudged RTCH/DLY. (#per-step popup bleed)
      if(sliderDragR.current)return;
      // For mouse (right-click popup): only update on drag with button held; touch always has buttons>0
      if(e.pointerType==='mouse'&&e.buttons===0)return;
      const fdx=e.clientX-pr.originX, fdy=e.clientY-pr.originY;
      const dist=Math.sqrt(fdx*fdx+fdy*fdy);
      if(dist<14){
        // Inside the deadzone: keep the arm locked for this drag (pin its value
        // to the minimum) instead of unlocking. Unlocking here let a wobble
        // through center silently re-lock onto an adjacent arm mid-drag.
        if(pr.lockedArm){const a=pr.lockedArm;setParamPopup(p=>p?{...p,activeArm:a.key,values:{...p.values,[a.key]:a.min}}:p);}
        else setParamPopup(p=>p?{...p,activeArm:null}:p);
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
            const _off=synthBarOffR();
            const targetCol=Math.max(g.durStartCol,Math.min(_off+COLS-1,_off+Math.floor((e.clientX-rect.left)/cellW)));
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
                return growLenTo(Object.assign({},p,{grid:ng,params:np}),sc.c);
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
      const cvc=Math.floor((e.clientX-rect.left)/(rect.width/COLS));
      if(cr<0||cr>=ROWS||cvc<0||cvc>=COLS)return;
      const cc=cvc+synthBarOffR();
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
            return growLenTo(Object.assign({},p,{grid:ng,params:np}),cc);
          }));
        }
      }
      return;
    }

    if(g.state==="dur-edit"){
      const gridEl=gridRef.current;if(!gridEl)return;
      const rect=gridEl.getBoundingClientRect();
      const cellW=rect.width/COLS;
      // Clamp targetCol to the loop end AND to the visible bar — you can only
      // drag a tie as far as the page you can see. (Longer ties are still
      // reachable via the step popup's DUR.)
      const activePat=patsR.current.find(p=>p.id===activeIdR.current);
      const _off=synthBarOffR();
      const maxCol = Math.min((activePat?.gridLen??patW(activePat))-1, _off+COLS-1);
      const targetCol=Math.max(g.durStartCol,Math.min(maxCol,_off+Math.floor((e.clientX-rect.left)/cellW)));
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
        // Rotation wraps around the whole pattern (all bars), not the visible
        // page — shifting a 4-bar pattern right by one step should carry the
        // last step of bar 4 around to the first step of bar 1.
        const _W=gridW(g.baseGrid);
        const sh=Array.from({length:ROWS},(_,r)=>Array.from({length:_W},(_,c)=>g.baseGrid[(r-ndy+ROWS)%ROWS][(c-ndx+_W)%_W]));
        const sp=Array.from({length:_W},(_,c)=>g.baseParams[(c-ndx+_W)%_W]);
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
          // A tap that turns a cell ON in a bar past the part's end extends the
          // part to cover that bar; turning one off never shortens it.
          const _out=Object.assign({},p,{grid:newGrid,durs:newDurs,params:np});
          return wasOn?_out:growLenTo(_out,c);
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

  // Clears the row within the VISIBLE bar (other bars keep their notes).
  const clearRow=r=>setPats(ps=>ps.map(p=>{
    if(p.id!==activeIdR.current)return p;
    const off=barOffIn(p);
    return Object.assign({},p,{grid:p.grid.map((row,ri)=>ri!==r?row:row.map((v,ci)=>(ci>=off&&ci<off+COLS)?false:v))});
  }));
  const clearCol=c=>setPats(ps=>ps.map(p=>p.id!==activeIdR.current?p:Object.assign({},p,{grid:p.grid.map(row=>row.map((v,ci)=>ci===c?false:v))})));
  // ── Whole-pattern ops ──────────────────────────────────────────────────
  // A pattern is all three parts, so add/duplicate/delete work on the unified
  // store directly rather than through a per-layer view — duplicating via the
  // synth view would have produced a copy with empty lead and drums.
  // NB: everything is computed BEFORE the setPatterns call. Calling other
  // setState functions from inside an updater is unsupported — React can drop
  // the whole update, which is exactly what made the palette's + do nothing.
  const addPattern=()=>{
    if(patterns.length>=MAX_PATTERNS)return;
    pushHistory();
    const np=mkPattern(pickSym(patterns.map(x=>x.name)));
    setPatterns(ps=>[...ps,np]);
    setActivePatId(np.id);
  };
  const dupPatternId=(id)=>{
    if(patterns.length>=MAX_PATTERNS)return;
    const src=patterns.find(x=>x.id===id);
    if(!src)return;
    pushHistory();
    const np=JSON.parse(JSON.stringify(src));
    np.id=++_id;np.name=pickSym(patterns.map(x=>x.name));
    setPatterns(ps=>[...ps,np]);
    setActivePatId(np.id);
  };
  const delPatternId=(id)=>{
    if(patterns.length<=1)return;
    pushHistory();
    const rem=patterns.filter(x=>x.id!==id);
    setPatterns(rem);
    if(activePatternId===id)setActivePatId(rem[0].id);
    setSong(sg=>sg.map(v=>v===id?null:v));
    setSongRep(rp=>rp.map((v,i)=>song[i]===id?1:v));
  };
  const addPat=addPattern;
  const dupPat=()=>dupPatternId(activeId);
  const delPat=()=>delPatternId(activeId);
  // CPY / PST move ONE BAR. That's what makes a long pattern workable: build a
  // bar, copy it forward, vary it. The clipboard is a COLS-wide slice.
  const copyPat=()=>{const src=pats.find(p=>p.id===activeId);if(!src)return;const off=barOffIn(src);
    setClipboard({grid:sliceCols(src.grid,off),durs:sliceCols(src.durs||mkDurs(gridW(src.grid)),off,COLS,()=>1),params:sliceFlat(src.params||defaultStepParams(gridW(src.grid)),off)});};
  const pastePat=()=>{if(!clipboard)return;setPats(ps=>ps.map(p=>{
    if(p.id!==activeId)return p;const off=barOffIn(p);
    return Object.assign({},p,{
      grid:spliceCols(p.grid,clipboard.grid,off),
      durs:spliceCols(p.durs||mkDurs(gridW(p.grid)),clipboard.durs,off,0,COLS,()=>1),
      params:spliceFlat(p.params||defaultStepParams(gridW(p.grid)),clipboard.params,off)});
  }));};
  const clearPat=()=>mutatePat((g,p2)=>spliceCols(g,null,barOffIn(p2)));

  // ID-targeted versions — used by pill context menu so activeId is never involved
  const dupPatId=dupPatternId;
  // Strip the id from the song as well — leaving a dangling ref produces
  // silent gaps in the song timeline. Drag-off-layer delete relies on this.
  const delPatId=delPatternId;
  // Deleting from any layer deletes the pattern — it's one object now, so
  // there is no such thing as removing only its drums.
  const delPatInLayer=(layer,id)=>delPatternId(id);
  const copyPatId=(id)=>{const src=pats.find(p=>p.id===id);if(!src)return;const off=barOffIn(src);
    setClipboard({grid:sliceCols(src.grid,off),durs:sliceCols(src.durs||mkDurs(gridW(src.grid)),off,COLS,()=>1),params:sliceFlat(src.params||defaultStepParams(gridW(src.grid)),off)});};
  const pastePatId=(id)=>{pushHistory();if(!clipboard)return;setPats(ps=>ps.map(p=>{
    if(p.id!==id)return p;const off=barOffIn(p);
    return Object.assign({},p,{
      grid:spliceCols(p.grid,clipboard.grid,off),
      durs:spliceCols(p.durs||mkDurs(gridW(p.grid)),clipboard.durs,off,0,COLS,()=>1),
      params:spliceFlat(p.params||defaultStepParams(gridW(p.grid)),clipboard.params,off)});
  }));};
  const clearPatId=(id)=>{pushHistory();setPats(ps=>ps.map(p=>p.id!==id?p:Object.assign({},p,{grid:spliceCols(p.grid,null,barOffIn(p))})));};
  // RAND generates one bar (randMonoGrid/randPolyGrid are COLS-wide by
  // construction) and drops it into the bar you're looking at.
  const randPatId=(id)=>{pushHistory();setPats(ps=>ps.map(p=>{
    if(p.id!==id)return p;
    const isMono=activeLayerR.current==="lead";
    const bar=isMono?randMonoGrid():randPolyGrid();
    return Object.assign({},p,{grid:spliceCols(p.grid,bar,barOffIn(p))});
  }));};
  const randPat=()=>mutatePat((g,p2)=>
    spliceCols(g,Array.from({length:ROWS},()=>Array.from({length:COLS},()=>Math.random()<.12)),barOffIn(p2)));
  const setDrumCell=(row,col,val)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const grid=p.grid.map((r,ri)=>ri===row?r.map((c,ci)=>ci===col?val:c):r);
    const out=Object.assign({},p,{grid});
    return val?growLenTo(out,col):out;
  }));
  // Per-cell velocity setter (row, col). vel is normalized to 2D first so
  // legacy 1D saves edited in-session upgrade cleanly.
  const setDrumVelCell=(row,col,val)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const v2=toDrumVel2D(p.vel,gridW(p.grid));
    const vel=v2.map((r,ri)=>ri===row?r.map((c,ci)=>ci===col?val:c):r);
    return Object.assign({},p,{vel});
  }));
  // `len` arrives as a 1..COLS position within the VISIBLE bar; offset it.
  const setDrumLen=(len)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const off=barOffIn(p);
    return Object.assign({},p,{gridLen:Math.max(1,Math.min(patW(p),off+len))});
  }));
  // Ctrl/Cmd+click a drum cell: cycle its ratchet count. An empty cell turns
  // on at 2 (start ratcheting); a lit cell cycles 1→2→3→4→1 (4 = max, wraps
  // back to a single hit but stays lit). Ratchet retriggers the voice that
  // many evenly-spaced times within the step — see playDrumStep.
  const cycleDrumRat=(row,col)=>setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const rat=toDrumRat2D(p.rat,gridW(p.grid));
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
    const W=gridW(base.grid);
    const L=Math.max(1,Math.min(W,base.gridLen||W));
    const mod=(n,m)=>((n%m)+m)%m;
    const ng=Array.from({length:DRUM_ROWS},()=>new Array(W).fill(false));
    const nv=mkDrumVel(W),nr=mkDrumRat(W);
    for(let r=0;r<DRUM_ROWS;r++){
      const sr=mod(r-dRows,DRUM_ROWS);
      for(let c=0;c<W;c++){
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
    const off=barOffIn(p);
    return Object.assign({},p,{
      grid:spliceCols(p.grid,null,off),
      vel:spliceCols(toDrumVel2D(p.vel,gridW(p.grid)),null,off,0,COLS,()=>100),
      rat:spliceCols(toDrumRat2D(p.rat,gridW(p.grid)),null,off,0,COLS,()=>1)});
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
    const _mw=gridW(p.grid);
    const lane=motion[key]?motion[key].map(r=>r?[...r]:new Array(_mw).fill(null))
                          :Array.from({length:DRUM_ROWS},()=>new Array(_mw).fill(null));
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
    // Per-cell velocity now — and only across the bar you're looking at, so
    // RAND on bar 3 of a long pattern doesn't wipe bars 1, 2 and 4.
    const off=barOffIn(p);
    const barVel=mkDrumVel().map(row=>row.map(()=>Math.round(80+Math.random()*Math.random()*47)));
    // Also randomize the rhythm grid. ~22% density per cell gives a sparse-
    // but-populated rhythm — repeat RAND to keep generating variations.
    const barGrid=Array.from({length:DRUM_ROWS},()=>Array.from({length:COLS},()=>Math.random()<0.22));
    return Object.assign({},p,{
      vel:spliceCols(toDrumVel2D(p.vel,gridW(p.grid)),barVel,off,0,COLS,()=>100),
      grid:spliceCols(p.grid,barGrid,off)});
  }));}
  // MUT8 for drums — nudge the active pattern: drop some existing hits, sprinkle
  // a few new ones, all within the active length. Anti-silence guard keeps the
  // original if the mutation happened to clear every in-window hit. Repeat for
  // progressive variations (like the synth MUT8).
  const mutateDrumPat1=()=>{pushHistory();return setDrumPats(ps=>ps.map(p=>{
    if(p.id!==activeDrumId)return p;
    const W=gridW(p.grid);
    const len=Math.max(1,Math.min(W,p.gridLen||W));
    const off=barOffIn(p), hi=Math.min(len,off+COLS);
    const inBar=ci=>ci>=off&&ci<hi;
    let grid=p.grid.map(row=>row.map((on,ci)=>{
      if(!inBar(ci))return on;
      if(on&&Math.random()<0.30)return false;
      if(!on&&Math.random()<0.10)return true;
      return on;
    }));
    const had=p.grid.some(row=>row.some((on,ci)=>on&&inBar(ci)));
    const got=grid.some(row=>row.some((on,ci)=>on&&inBar(ci)));
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
            samplesDirtyR.current=true; // user recorded → persist to autosave_smp
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
    samplesDirtyR.current=true; // user cleared → persist the new sample set
  };
  // The drum "library" is the same pattern list seen through the drums part,
  // so its lifecycle ops are the whole-pattern ones.
  const dupDrumPat=()=>dupPatternId(activeDrumId);
  const delDrumPat=()=>delPatternId(activeDrumId);
  const delDrumPatId=delPatternId;
  // One bar, like the synth clipboard. mix/motion stay pattern-level (they're
  // not per-column state you'd want to smear across a paste).
  const copyDrumPatFn=()=>{
    const src=drumPats.find(p=>p.id===activeDrumId)||drumPats[0];
    if(!src)return;
    const off=barOffIn(src);
    setDrumClipboard({
      grid:sliceCols(src.grid,off),
      vel:sliceCols(toDrumVel2D(src.vel,gridW(src.grid)),off,COLS,()=>100),
      rat:sliceCols(toDrumRat2D(src.rat,gridW(src.grid)),off,COLS,()=>1),
      mix:(src.mix||defaultDrumMix()).map(m=>({...m}))
    });
  };
  const pasteDrumPatFn=()=>{
    if(!drumClipboard)return;
    setDrumPats(ps=>ps.map(p=>{
      if(p.id!==activeDrumId)return p;
      const off=barOffIn(p);
      return Object.assign({},p,{
        grid:spliceCols(p.grid,drumClipboard.grid,off),
        vel:spliceCols(toDrumVel2D(p.vel,gridW(p.grid)),drumClipboard.vel,off,0,COLS,()=>100),
        rat:spliceCols(toDrumRat2D(p.rat,gridW(p.grid)),drumClipboard.rat,off,0,COLS,()=>1)
      });
    }));
  };
  const setDrumVary=(key,val)=>setDrumPats(ps=>ps.map(p=>p.id!==activeDrumId?p:Object.assign({},p,{[key]:val})));
  const addDrumPat=addPattern;
    // `col` is an ABSOLUTE pattern column (the STEP page maps its view columns
    // through barOff before calling in).
    const setStepParam=(col,key,val)=>{setFollowSeq(false);setPats(ps=>ps.map(p=>{
    if(p.id!==activeId)return p;
    const params=(p.params||defaultStepParams(patW(p))).map((sp,i)=>i===col?Object.assign({},sp,{[key]:val}):sp);
    return Object.assign({},p,{params});
  }));};
  const randStepLane=(key)=>{pushHistory();setFollowSeq(false);
    const lane=LANES.find(l=>l.key===key);if(!lane)return;
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeId)return p;
      const off=barOffIn(p);
      const params=(p.params||defaultStepParams(patW(p))).map((sp,i)=>(i<off||i>=off+COLS)?sp:Object.assign({},sp,{[key]:Math.round(lane.min+Math.random()*(lane.max-lane.min))}));
      return Object.assign({},p,{params});
    }));
  };
  const randStepAll=()=>LANES.forEach(l=>randStepLane(l.key));
  const resetStepLane=(key)=>{pushHistory();setFollowSeq(false);
    const lane=LANES.find(l=>l.key===key);if(!lane)return;
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeId)return p;
      const off=barOffIn(p);
      const params=(p.params||defaultStepParams(patW(p))).map((sp,i)=>(i<off||i>=off+COLS)?sp:Object.assign({},sp,{[key]:lane.def}));
      return Object.assign({},p,{params});
    }));
  };
  const resetStepAll=()=>setPats(ps=>ps.map(p=>{
    if(p.id!==activeId)return p;
    const off=barOffIn(p);
    return Object.assign({},p,{params:spliceFlat(p.params||defaultStepParams(patW(p)),null,off)});
  }));
  // Double-click on any lane cell at column c resets ALL lane values for that
  // step back to their defaults (one row of defaultStepParams). Faster than
  // pulling each lane down individually when a step has accumulated edits.
  const resetStepCol=(col)=>{
    pushHistory();setFollowSeq(false);
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeId)return p;
      const dflt=defaultStepParams(1)[0];
      const params=(p.params||defaultStepParams(patW(p))).map((sp,i)=>i===col?Object.assign({},dflt):sp);
      return Object.assign({},p,{params});
    }));
  };

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
    // The slider spans ONE bar, so it sets the loop end within the visible bar:
    // drag it on bar 3 of a 4-bar pattern and you get a length of 32..48.
    const off=synthBarOffR();
    setPats(ps=>ps.map(p=>{
      if(p.id!==activeIdR.current)return p;
      const len=Math.max(1,Math.min(patW(p),off+Math.round(pct*COLS)));
      return Object.assign({},p,{gridLen:len});
    }));
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
        <RangeSlider label="FILTER" accent={C_DLY}
          lo={{val:dlyHpVal,min:0,max:100,def:8, toFreq:hpHz,fromFreq:hpInv,onChange:setDlyHpVal,disp:hpLbl(dlyHpVal)}}
          hi={{val:dlyLpVal,min:0,max:100,def:78,toFreq:lpHz,fromFreq:lpInv,onChange:setDlyLpVal,disp:lpLbl(dlyLpVal)}}/>
        <KnobSlider label="→ REV"  value={dlyToRev}  min={0} max={100}                onChange={setDlyToRev}  display={dlyToRev+"%"}            accent={C_DLY}/>
      </div>
    </SynthSection>
    <SynthSection title="REVERB" accent={C_REV}>
      <div style={{padding:"4px 12px 10px",display:"flex",flexDirection:"column",gap:6}}>
        <KnobSlider label="PRE"     value={rvPreDelay} min={0} max={250} onChange={setRvPreDelay} display={rvPreDelay+"ms"} accent={C_REV}/>
        <KnobSlider label="SIZE"    value={rvSize}     min={0} max={100} def={50} onChange={setRvSize}     display={rvSize+"%"}      accent={C_REV}/>
        {/* DAMP range: left thumb = LF damp corner, right thumb = HF damp corner.
            The band between is what stays bright in the tail. */}
        <RangeSlider label="DAMP" accent={C_REV}
          lo={{val:rvLfDamp,min:0,max:100,def:0, toFreq:rvLfHz,fromFreq:rvLfInv,onChange:setRvLfDamp,disp:fmtHz(rvLfHz(rvLfDamp))}}
          hi={{val:rvDamp,  min:0,max:100,def:40,toFreq:rvHfHz,fromFreq:rvHfInv,onChange:setRvDamp,  disp:fmtHz(rvHfHz(rvDamp))}}/>
        <KnobSlider label="MOD"     value={rvMod}      min={0} max={100} def={0}  onChange={setRvMod}      display={rvMod+"%"}       accent={C_REV}/>
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
              <div ref={exportBarR} style={{height:"100%",width:"0%",background:"linear-gradient(90deg,#c4a070,#e0a050)",borderRadius:4,transition:"width .15s linear"}}/>
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
                      sliderDragR.current=true; // own the gesture — suppress the radial picker
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
                      const up=()=>{sliderDragR.current=false;document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};
                      document.addEventListener("pointermove",update);
                      document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
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
                  ["DUP",   ()=>act(()=>dupPatId(targetId)),   pats.length>=MAX_PATTERNS],
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
              {/* POLY / MONO layer boxes — layer selection only; patterns are
                  chosen on the SONG page. */}
              {[
                ["synth","POLY","#a8c5a0","168,197,160"],
                ["lead", "MONO","#6c9ad6","108,154,214"]
              ].map(([layer,label,accent,accentRgb])=>{
                const isActive=activeLayer===layer;
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
                    {/* Pattern pills removed — selection lives on the SONG page now. */}
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
                {/* Pattern pills removed — selection lives on the SONG page now. */}
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
                      {[["CPY",()=>copyPatId(targetId),false,false],["PST",()=>pastePatId(targetId),!clipboard,false],["DUP",()=>dupPatId(targetId),pats.length>=MAX_PATTERNS,false],["DEL",()=>delPatId(targetId),isOnlyPat,true]].map(([l,f,d,danger])=>(
                        <button key={l} disabled={!!d} style={{padding:"4px 0",border:"1px solid rgba(200,185,165,"+(d?"0.06":"0.13")+")",borderRadius:5,background:"transparent",color:d?"rgba(200,185,165,0.18)":danger?"#c47a7a":"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit"}} onClick={d?undefined:f}>{l}</button>
                      ))}
                    </div>
                    {barOpsRow}
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
                      {[["CPY",copyDrumPatFn,false,false],["PST",pasteDrumPatFn,!drumClipboard,false],["DUP",dupDrumPat,drumPats.length>=MAX_PATTERNS,false],["DEL",delDrumPat,isOnlyDrum,true]].map(([l,f,d,danger])=>(
                        <button key={l} disabled={!!d} style={{padding:"4px 0",border:"1px solid rgba(200,185,165,"+(d?"0.06":"0.13")+")",borderRadius:5,background:"transparent",color:d?"rgba(200,185,165,0.18)":danger?"#c47a7a":"rgba(200,185,165,0.55)",fontSize:8,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit"}} onClick={d?undefined:f}>{l}</button>
                      ))}
                    </div>
                    {barOpsRow}
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
                    onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){onChange(85);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));onChange(Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);}}
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
                        <button style={Object.assign({},S.menuSlotBtn,{padding:"6px 0",fontSize:9,letterSpacing:1,fontWeight:600,color:has?"#c98a8a":undefined})} onClick={()=>clearSlot(slot)} disabled={!has}>CLEAR</button>
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
            {/* SONG page — pattern palette + one linear lane */}
            {songView&&songPage}
            {!songView&&(<>
            {activeLayer!=="drums"&&page==="edit"&&(
              <div style={{width:"100%",height:"100%",display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{width:gridPx||"80%",height:gridPx||"80%",display:"flex",flexDirection:"column",flexShrink:0}}>
              {barStrip}
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
                      // c is the VIEW column; ac is the absolute pattern column.
                      const ac=barOff+c;
                      const isCol=playing&&playId===activeId&&ac===step,isQ=c%4===0;
                      const on=activePat?!!(activePat.grid[r]&&activePat.grid[r][ac]):false;
                      const inactive=ac>=gridLen;
                      return(<div key={c} data-row={r} data-col={c} style={Object.assign({},S.cell,{
                        background:inactive?"rgba(220,200,180,0.008)":isCol?"rgba(220,200,180,0.09)":isQ?"rgba(220,200,180,0.035)":"rgba(220,200,180,0.015)",
                        outline:isQ&&!on&&!inactive?"1px solid rgba(255,255,255,0.06)":"none",outlineOffset:"-1px",
                      })}/>);
                    })}
                    {(()=>{
                      const rects=[];
                      const A0=barOff, A1=barOff+COLS;
                      // Scan starts a bar EARLY so a note tied across the bar
                      // line still draws its tail on this page (clipped below).
                      let ci=Math.max(0,A0-COLS);
                      while(ci<A1){
                        const on=activePat?!!(activePat.grid[r]&&activePat.grid[r][ci]):false;
                        if(on){
                          const p=activePat?.params?.[ci];
                          const rhy=p?Math.round(p.rhy??1):1;
                          const span=Math.max(1,activePat?.durs?.[r]?.[ci]??1);
                          if(ci+span<=A0){ci+=span;continue;}   // ends before this page
                          const vs=Math.max(ci,A0)-A0;           // visible start, in view cols
                          const vw=Math.min(ci+span,A1)-A0-vs;   // visible width
                          const vel=p?(p.vel??100):100;
                          const b=0.35+(vel/127)*0.65;
                          const inactive=ci>=gridLen;
                          const bright=inactive?`rgba(220,200,180,0.12)`:`rgba(230,215,195,${b})`;
                          const glow=inactive?"none":`0 0 4px rgba(230,215,195,${b*0.5}),0 0 10px rgba(230,215,195,${b*0.22})`;
                          const isActive=!inactive&&playing&&playId===activeId&&step>=ci&&step<ci+span;
                          const L=`calc(${vs/COLS}*(100% + 2px))`;
                          const W=`calc(${vw/COLS}*(100% + 2px) - 2px)`;
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
                      const ac=barOff+c;
                      if(ac>=gridLen)return null;
                      const baseOn=activePat?!!(activePat.grid[r]&&activePat.grid[r][ac]):false;
                      const vOn=!!(vSGrid[r]&&vSGrid[r][ac]);
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
                  const ac=barOff+c;
                  const isA=playing&&ac===step,isQ=c%4===0,inactive=ac>=gridLen;
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
                {/* The slider is one BAR wide, so it shows this page's slice of
                    the playable length: full on bars before the loop end, empty
                    on bars past it, partial on the bar the end falls in. */}
                <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${_lenFrac*100}%`,background:"rgba(210,195,175,0.15)",borderRadius:"3px 0 0 3px",transition:"width .05s"}}/>
                <div style={{position:"absolute",right:0,top:0,bottom:0,width:`${(1-_lenFrac)*100}%`,background:"rgba(220,200,180,0.035)",borderRadius:"0 3px 3px 0"}}/>
                {_lenFrac>0&&_lenFrac<1&&<div style={{position:"absolute",top:IS_MOBILE?-3:-3,bottom:IS_MOBILE?-3:-3,width:IS_MOBILE?3:12,left:`calc(${_lenFrac*100}% - ${IS_MOBILE?1:6}px)`,background:"rgba(255,255,255,0.8)",borderRadius:3,boxShadow:"0 0 6px rgba(255,255,255,0.4)"}}/>}
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
                <div style={{width:dw||"80%",flexShrink:0}}>{barStrip}</div>
                <div style={{width:dw||"80%",height:dh||"auto",flexShrink:0,display:"flex",flexDirection:"column",gap:2}}>
                  {DRUM_VOICES.map((voice,r)=>{
                    const dc=drumColor(r,linkHat,linkTom);
                    return(
                    <div key={voice.key} style={{flex:1,display:"flex",gap:2,position:"relative"}}>
                      <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"space-around",pointerEvents:"none",zIndex:2,fontSize:10,fontWeight:700,color:dc,opacity:0.22,letterSpacing:1}}>{[0,1,2,3].map(i=><span key={i}>{voice.full||voice.label}</span>)}</div>
                      {Array.from({length:COLS},(_,c)=>{
                        // c = view column on this bar page; ac = absolute column.
                        const ac=barOff+c;
                        const on=dPat?.grid[r]?.[ac]||false;
                        const cv=(dPat&&dPat.vel&&dPat.vel[r]&&dPat.vel[r][ac]!=null)?dPat.vel[r][ac]:100;
                        const rt=(dPat&&dPat.rat&&dPat.rat[r]&&dPat.rat[r][ac]!=null)?dPat.rat[r][ac]:1;
                        const isActive=playing&&ac===drumStep;
                        const inactive=ac>=dLen;
                        const isQ=c%4===0;
                        // VARY overlay: gold ring where the live variation ADDED a
                        // hit, dim where it DROPPED one. Base grid stays editable.
                        const varOn=vGridD?!!(vGridD[r]&&vGridD[r][ac]):on;
                        const vAdd=vGridD&&varOn&&!on&&ac<dLen, vDrop=vGridD&&!varOn&&on;
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
                                const base={grid:dPat.grid.map(rw=>[...rw]),vel:toDrumVel2D(dPat.vel,gridW(dPat.grid)),rat:toDrumRat2D(dPat.rat,gridW(dPat.grid)),gridLen:dLen};
                                pushHistory();
                                const mv=ev=>applyDrumShift(Math.round((ev.clientX-sx)/cw),Math.round((ev.clientY-sy)/ch),base);
                                const up=()=>{document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};
                                document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
                                return;
                              }
                              e.stopPropagation();if(inactive)return;
                              // Ctrl/Cmd+click → cycle this cell's ratchet count.
                              if(e.ctrlKey||e.metaKey){e.preventDefault();pushHistory();cycleDrumRat(r,ac);return;}
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
                              if(!wasOn){setDrumCell(r,ac,true);painted.add(r+":"+ac);}
                              const onMove=ev=>{
                                const dx=ev.clientX-startX,dy=startY-ev.clientY;
                                if(mode===null){
                                  if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>cw*0.5){mode="paint";paint(r,ac);}
                                  else if(Math.abs(dy)>5){mode="vel";}
                                }
                                if(mode==="vel")setDrumVelCell(r,ac,Math.max(1,Math.min(127,Math.round(startVel+dy))));
                                else if(mode==="paint"){
                                  const cc=barOff+Math.max(0,Math.min(COLS-1,Math.floor((ev.clientX-ge.left)/cw)));
                                  const rr=Math.max(0,Math.min(DRUM_ROWS-1,Math.floor((ev.clientY-ge.top)/chh)));
                                  paint(rr,cc);
                                }
                              };
                              const onUp=()=>{
                                document.removeEventListener("pointermove",onMove);document.removeEventListener("pointerup",onUp);document.removeEventListener("pointercancel",onUp);
                                if(mode===null&&wasOn)setDrumCell(r,ac,false); // pure tap on existing note → clear
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
                  <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${_lenFrac*100}%`,background:"rgba(210,195,175,0.15)",borderRadius:"3px 0 0 3px"}}/>
                  <div style={{position:"absolute",right:0,top:0,bottom:0,width:`${(1-_lenFrac)*100}%`,background:"rgba(220,200,180,0.035)",borderRadius:"0 3px 3px 0"}}/>
                  {_lenFrac>0&&_lenFrac<1&&<div style={{position:"absolute",top:-3,bottom:-3,width:12,left:`calc(${_lenFrac*100}% - 6px)`,background:"rgba(255,255,255,0.8)",borderRadius:3,boxShadow:"0 0 6px rgba(255,255,255,0.4)"}}/>}
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
                      <div style={{width:"100%",height:8,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",cursor:"pointer",touchAction:"none"}}
                        onPointerDown={e=>{
                          e.stopPropagation();
                          const rect=e.currentTarget.getBoundingClientRect();
                          if(isDoubleTap(e)){setDrumMix(r,key,_drumDefMix()[key]);return;}
                          const dim=rect.width, range=maxVal-minVal; let cur=val, lx=e.clientX;
                          const update=ev=>{
                            const pd=ev.clientX-lx; lx=ev.clientX;
                            cur=Math.max(minVal,Math.min(maxVal,cur+ballisticDelta(pd,dim,range)));
                            onMixDrag(r,key,Math.round(cur));
                          };
                          const up=()=>{onMixUp(r,key);document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};
                          document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
                        }}
                        onDoubleClick={()=>setDrumMix(r,key,_drumDefMix()[key])}>
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
                            if(isDoubleTap(e)){setDrumMix(r,"level",DRUM_DEFAULT_LEVEL);return;}
                            const dim=rect.height; let cur=md.level!=null?md.level:100, ly=e.clientY;
                            const update=ev=>{
                              const pd=ly-ev.clientY; ly=ev.clientY; // drag up = louder
                              cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));
                              onMixDrag(r,"level",Math.round(cur));
                            };
                            const up=()=>{onMixUp(r,"level");document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};
                            document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
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
                      const up=()=>{document.removeEventListener("pointermove",upd);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};
                      document.addEventListener("pointermove",upd);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
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
                    {SliderRow({label:"RHYTHM",value:vRhythm,onChange:v=>setDrumVary("vRhythm",v),accent:"#c8a840"})}
                    {SliderRow({label:"VELOCITY",value:vVelocity,onChange:v=>setDrumVary("vVelocity",v),accent:"#7888d0"})}
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
                {barStrip}
                  {LANES.map(lane=>{
                    // StepLane is COLS-wide, so it gets THIS BAR's slice of the lane and its
                    // column indices are mapped back to absolute on the way out.
                    const vals=(activePat?(activePat.params||defaultStepParams(patW(activePat))):defaultStepParams()).map(sp=>sp[lane.key]??lane.def).slice(barOff,barOff+COLS);
                    // Only FLT/OCT/GLIDE actually animate mid-note (Bell.play's mods array
                    // schedules cutoff/pitch/transition style). Everything else (VEL, DUR,
                    // DLY, REV, RHY) is locked at note-start, so on tied-note extension
                    // cells those lanes stay locked.
                    const isMidNote=lane.key==="flt"||lane.key==="oct"||lane.key==="glide";
                    const colHasNote=Array.from({length:COLS},(_,vc)=>{
                      if(!activePat)return false;
                      const c=barOff+vc;
                      if(!isMidNote){
                        for(let r=0;r<ROWS;r++) if(activePat.grid[r]&&activePat.grid[r][c]) return true;
                        return false;
                      }
                      for(let r=0;r<ROWS;r++)for(let c2=0;c2<=c;c2++){
                        if(activePat.grid[r]&&activePat.grid[r][c2]){
                          const span=Math.max(1,activePat.durs?.[r]?.[c2]??1);
                          if(c<c2+span) return true;
                        }
                      }
                      return false;
                    });
                    const curVal=playing&&playId===activeId&&step>=barOff&&step<barOff+COLS?vals[step-barOff]:null;
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
                          activeStep={playing&&playId===activeId&&step>=barOff&&step<barOff+COLS?step-barOff:-1}
                          onChange={(col,val)=>setStepParam(barOff+col,lane.key,val)} onDragStart={pushHistory} onResetCol={c=>resetStepCol(barOff+c)}
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
            <button style={Object.assign({},S.loopBtnBottom,loopMode?S.loopOn:{})} onClick={()=>toggleLoop()}>LOOP</button>
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
                        else if(wasActive){ const k=activeLayer==="drums"?"bars":"pattern"; setActiveSheet(s=>s===k?null:k); }
                        else { isSynth?setActiveId(p.id):setActiveDrumId(p.id); setActiveSheet(null); }
                      }}>{p.name}</button>
                  );
                })}
                {(activeLayer==="drums"?drumPats:pats).length<8&&<button style={{flexShrink:0,padding:"7px 4px",borderRadius:14,border:"1px dashed "+(activeLayer==="synth"?"rgba(168,197,160,0.35)":activeLayer==="lead"?"rgba(108,154,214,0.35)":"rgba(196,114,122,0.35)"),background:"transparent",color:activeLayer==="synth"?"rgba(168,197,160,0.45)":activeLayer==="lead"?"rgba(108,154,214,0.45)":"rgba(196,114,122,0.45)",fontSize:12,cursor:"pointer",fontFamily:"inherit"}} onClick={()=>{activeLayer==="drums"?addDrumPat():addPat();}}>＋</button>}
              </div>
              {/* per-layer function pills — STEP / SOUND / VARY */}
              <div style={{height:1,background:"rgba(255,255,255,0.07)",flexShrink:0,margin:"1px 0"}}/>
              {[["step","STEP",activeSheet==="pattern"||activeSheet==="bars"],["sound","SOUND",activeSheet==="sound"],["vary","VARY",activeSheet==="vary"||activeVary]].map(([key,lbl,on])=>(
                <button key={key} onClick={()=>{ if(key==="step"){const k=activeLayer==="drums"?"bars":"pattern";setActiveSheet(s=>s===k?null:k);} else setActiveSheet(s=>s===key?null:key); }}
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
          {/* The pattern pills used to live here. Pattern selection moved to
              the SONG page — a pattern is now all three parts, so choosing one
              is a whole-arrangement decision rather than a per-layer one, and
              the part pages get the space back. The bar strip's handle shows
              which pattern you're in. */}
          {/* ── PER-LAYER FUNCTION PILLS — STEP / SOUND / VARY (portrait) ──
               First-class home-screen access to the pattern's step drawer, the
               layer's sound page, and per-layer variation. (These were formerly
               reached only by tapping the already-active layer/pattern.) */}
          {!isLandscape&&(
          <div style={{display:"flex",gap:6,flexShrink:0,padding:"2px 12px 8px"}}>
            {[["step","STEP",activeSheet==="pattern"||activeSheet==="bars"],["sound","SOUND",activeSheet==="sound"],["vary","VARY",activeSheet==="vary"||activeVary]].map(([key,lbl,on])=>(
              <button key={key} onClick={()=>{ if(key==="step"){const k=activeLayer==="drums"?"bars":"pattern";setActiveSheet(s=>s===k?null:k);} else setActiveSheet(s=>s===key?null:key); }}
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
          {/* ── CONTENT AREA — full height grid ── */}
          <div style={{flex:1,minHeight:0,overflow:"hidden",position:"relative"}}>

            {/* SONG page — pattern palette + one linear lane */}
            {songView&&songPage}

            {/* SYNTH EDIT grid */}
            {!songView&&activeLayer!=="drums"&&(
              <div style={{width:"100%",height:"100%",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:"6px 10px",boxSizing:"border-box"}}>
              <div style={{width:"min(100%,calc(100dvh - "+(isLandscape?32:150)+"px))",aspectRatio:"1",display:"flex",flexDirection:"column",flexShrink:0}}>
                  {barStrip}
                  <div ref={gridRef} data-grid="1" style={Object.assign({},S.gridWrap,shifting?S.gridShifting:{},{flex:1,display:"flex",flexDirection:"column"})}
                    onPointerDown={handleGridDown} onPointerMove={handleGridMove} onPointerUp={handleGridUp} onPointerCancel={handleGridUp}
                    onContextMenu={handleGridContextMenu}>
                    {Array.from({length:ROWS},(_,r)=>{
                      const fromBot=ROWS-1-r;const isOct=fromBot%SCALE_SPAN===0;const isFifth=!isOct&&fromBot%SCALE_SPAN===4;
                      const vSGrid=(varyMode[activeLayer]&&playing&&activePat)?variedGrids.current.get(activePat.id):null;
                      return(<div key={r} style={Object.assign({},S.gridRow,{background:isOct?"rgba(200,185,165,0.06)":isFifth?"rgba(160,190,170,0.03)":"transparent",position:"relative"})}>
                        {Array.from({length:COLS},(_,c)=>{
                          const ac=barOff+c;
                          const isCol=playing&&playId===activeId&&ac===step,isQ=c%4===0;
                          const on=activePat?!!(activePat.grid[r]&&activePat.grid[r][ac]):false;const inactive=ac>=gridLen;
                          return(<div key={c} data-row={r} data-col={c} style={Object.assign({},S.cell,{aspectRatio:"1",
                            background:inactive?"rgba(220,200,180,0.008)":isCol?"rgba(220,200,180,0.09)":isQ?"rgba(220,200,180,0.035)":"rgba(220,200,180,0.015)",
                            outline:isQ&&!on&&!inactive?"1px solid rgba(255,255,255,0.06)":"none",outlineOffset:"-1px"})}/>);
                        })}
                        {(()=>{const rects=[];const A0=barOff,A1=barOff+COLS;let ci=Math.max(0,A0-COLS);while(ci<A1){const on=activePat?!!(activePat.grid[r]&&activePat.grid[r][ci]):false;if(on){const p=activePat?.params?.[ci];const rhy=p?Math.round(p.rhy??1):1;const span=Math.max(1,activePat?.durs?.[r]?.[ci]??1);if(ci+span<=A0){ci+=span;continue;}const vs=Math.max(ci,A0)-A0,vw=Math.min(ci+span,A1)-A0-vs;const vel=p?(p.vel??100):100;const b=0.35+(vel/127)*0.65;const inactive=ci>=gridLen;const bright=inactive?`rgba(220,200,180,0.12)`:`rgba(230,215,195,${b})`;const glow=inactive?"none":`0 0 4px rgba(230,215,195,${b*0.5}),0 0 10px rgba(230,215,195,${b*0.22})`;const isActive=!inactive&&playing&&playId===activeId&&step>=ci&&step<ci+span;const L=`calc(${vs/COLS}*(100% + 2px))`;const W=`calc(${vw/COLS}*(100% + 2px) - 2px)`;rects.push(<div key={ci} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:span>1?3:2,background:isActive?bright:inactive?bright:`rgba(230,215,195,${b*0.75})`,boxShadow:isActive?glow:"none",pointerEvents:"none",display:"flex",alignItems:"center",justifyContent:"center",gap:"2px",padding:"0 2px"}}>{!inactive&&rhy===2&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}{!inactive&&rhy===3&&<><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/><div style={{flex:1,height:"72%",borderRadius:1,background:`rgba(0,0,0,0.25)`}}/></>}{!inactive&&rhy>=4&&<div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"3px",width:"100%",height:"86%"}}>{[0,1,2,3].map(i=><div key={i} style={{borderRadius:1,background:"rgba(0,0,0,0.25)"}}/>)}</div>}{!inactive&&(()=>{const octV=p?(p.oct??2):2,sh=octV-2;if(sh===0)return null;const n=Math.abs(sh),up=sh>0;const cols=rhy>=4?2:rhy>=2?rhy:1;return(<div style={{position:'absolute',left:0,right:0,[up?'top':'bottom']:0,display:'flex',flexDirection:up?'column':'column-reverse',gap:3,pointerEvents:'none',zIndex:1}}>{Array.from({length:n},(_,i)=>(<div key={i} style={{height:3,display:'flex',gap:rhy>=4?3:2,padding:'0 2px'}}>{Array.from({length:cols},(_,j)=>(<div key={j} style={{flex:1,background:'#6a5088'}}/>))}</div>))}</div>);})()}</div>);ci+=span;}else{ci++;}}return rects;})()}
                        {vSGrid&&Array.from({length:COLS},(_,c)=>{
                          const ac=barOff+c;
                          if(ac>=gridLen)return null;
                          const baseOn=activePat?!!(activePat.grid[r]&&activePat.grid[r][ac]):false;
                          const vOn=!!(vSGrid[r]&&vSGrid[r][ac]);
                          if(vOn===baseOn)return null;
                          const L=`calc(${c/COLS}*(100% + 2px))`;const W=`calc(${1/COLS}*(100% + 2px) - 2px)`;
                          return vOn
                            ? <div key={"va"+c} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:2,border:"1.5px solid "+C_VARY,boxShadow:"0 0 5px "+C_VARY+"aa",pointerEvents:"none"}}/>
                            : <div key={"vd"+c} style={{position:"absolute",left:L,width:W,top:1,bottom:1,borderRadius:2,background:"rgba(20,16,12,0.5)",pointerEvents:"none"}}/>;
                        })}
                      </div>);
                    })}
                  </div>
                  <div style={S.stepBar}>{Array.from({length:COLS},(_,c)=>{const ac=barOff+c;const isA=playing&&ac===step,isQ=c%4===0,inactive=ac>=gridLen;return(<div key={c} style={S.stepColWrap}><div style={Object.assign({},S.stepDot,{background:inactive?"rgba(220,200,180,0.06)":isA?"rgba(232,220,205,0.9)":isQ?"rgba(210,195,175,0.3)":"rgba(255,255,255,0.1)",transform:inactive?"scaleY(0.2)":isA?"scaleY(1)":isQ?"scaleY(0.6)":"scaleY(0.3)"})}/></div>);})}</div>
                  <div ref={lenSliderRef} style={S.lenSlider} onPointerDown={handleLenDown} onPointerMove={handleLenMove} onPointerUp={handleLenUp} onPointerCancel={handleLenUp}>
                    <div style={{position:"absolute",left:0,top:0,bottom:0,width:`${_lenFrac*100}%`,background:"rgba(210,195,175,0.15)",borderRadius:"3px 0 0 3px"}}/>
                    <div style={{position:"absolute",right:0,top:0,bottom:0,width:`${(1-_lenFrac)*100}%`,background:"rgba(220,200,180,0.035)",borderRadius:"0 3px 3px 0"}}/>
                    {_lenFrac>0&&_lenFrac<1&&<div style={{position:"absolute",top:-3,bottom:-3,width:3,left:`calc(${_lenFrac*100}% - 1px)`,background:"rgba(255,255,255,0.8)",borderRadius:2,boxShadow:"0 0 6px rgba(255,255,255,0.4)"}}/>}
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
                      <div style={{width:SIZE,flexShrink:0}}>{barStrip}</div>
                      <div style={{width:SIZE,display:"flex",flexDirection:"column",gap:GAP,flexShrink:0,touchAction:"none"}}>
                        {DRUM_VOICES.map((voice,r)=>{
                          const dc=drumColor(r,linkHat,linkTom);
                          return(
                          <div key={voice.key} style={{display:"flex",gap:GAP,position:"relative"}}>
                            <div style={{position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"space-around",pointerEvents:"none",zIndex:2,fontSize:10,fontWeight:700,color:dc,opacity:0.22,letterSpacing:1}}>{[0,1,2,3].map(i=><span key={i}>{voice.full||voice.label}</span>)}</div>
                            {Array.from({length:COLS},(_,step)=>{
                              // step = view column on this bar page; ac = absolute.
                              const ac=barOff+step;
                              const on=dPat?.grid[r]?.[ac]||false;
                              const cv=(dPat&&dPat.vel&&dPat.vel[r]&&dPat.vel[r][ac]!=null)?dPat.vel[r][ac]:100;
                              const rt=(dPat&&dPat.rat&&dPat.rat[r]&&dPat.rat[r][ac]!=null)?dPat.rat[r][ac]:1;
                              const isActive=playing&&ac===drumStep;
                              const inactive=ac>=dLen;
                              const isQ=step%4===0;
                              const varOn=vGridD?!!(vGridD[r]&&vGridD[r][ac]):on;
                              const vAdd=vGridD&&varOn&&!on&&ac<dLen, vDrop=vGridD&&!varOn&&on;
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
                                  const base={grid:dPat.grid.map(rw=>[...rw]),vel:toDrumVel2D(dPat.vel,gridW(dPat.grid)),rat:toDrumRat2D(dPat.rat,gridW(dPat.grid)),gridLen:dLen};
                                  pushHistory();
                                  const mv=ev=>applyDrumShift(Math.round((ev.clientX-sx)/cw),Math.round((ev.clientY-sy)/ch),base);
                                  const up=()=>{document.removeEventListener("pointermove",mv);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};
                                  document.addEventListener("pointermove",mv);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
                                  return;
                                }
                                e.preventDefault();e.stopPropagation();if(inactive)return;
                                // Ctrl/Cmd+click → cycle this cell's ratchet count.
                                if(e.ctrlKey||e.metaKey){pushHistory();cycleDrumRat(r,ac);return;}
                                // Horizontal drag = paint/erase a run; vertical drag
                                // = per-cell velocity; tap = toggle.
                                const ge=e.currentTarget.parentElement.parentElement.getBoundingClientRect();
                                const cw=ge.width/COLS||1,chh=ge.height/DRUM_ROWS||1;
                                const startX=e.clientX,startY=e.clientY,wasOn=on,startVel=cv,paintVal=!wasOn;
                                let mode=null;const painted=new Set();
                                const paint=(rr,cc)=>{const k=rr+":"+cc;if(painted.has(k))return;painted.add(k);if(cc<dLen)setDrumCell(rr,cc,paintVal);};
                                pushHistory();
                                if(!wasOn){setDrumCell(r,ac,true);painted.add(r+":"+ac);}
                                const onMove=ev=>{
                                  const dx=ev.clientX-startX,dy=startY-ev.clientY;
                                  if(mode===null){
                                    if(Math.abs(dx)>Math.abs(dy)&&Math.abs(dx)>cw*0.5){mode="paint";paint(r,ac);}
                                    else if(Math.abs(dy)>5){mode="vel";}
                                  }
                                  if(mode==="vel")setDrumVelCell(r,ac,Math.max(1,Math.min(127,Math.round(startVel+dy))));
                                  else if(mode==="paint"){
                                    const cc=barOff+Math.max(0,Math.min(COLS-1,Math.floor((ev.clientX-ge.left)/cw)));
                                    const rr=Math.max(0,Math.min(DRUM_ROWS-1,Math.floor((ev.clientY-ge.top)/chh)));
                                    paint(rr,cc);
                                  }
                                };
                                const onUp=()=>{
                                  document.removeEventListener("pointermove",onMove);document.removeEventListener("pointerup",onUp);document.removeEventListener("pointercancel",onUp);
                                  if(mode===null&&wasOn)setDrumCell(r,ac,false);
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
                          const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};
                          document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);
                        }}>
                        <div style={{position:"absolute",top:0,bottom:0,left:0,width:`${_lenFrac*100}%`,background:"rgba(210,195,175,0.18)",borderRadius:"5px 0 0 5px"}}/>
                        {_lenFrac>0&&_lenFrac<1&&<div style={{position:"absolute",top:-2,bottom:-2,width:6,left:`calc(${_lenFrac*100}% - 3px)`,background:"rgba(255,255,255,0.85)",borderRadius:3,boxShadow:"0 0 5px rgba(255,255,255,0.3)"}}/>}
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
                   stays on once enabled; LOOP holds the song's place rather than
                   overriding it. */}
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
              <button style={Object.assign({},S.loopBtnBottom,{flex:1,height:36},loopMode?S.loopOn:{})} onClick={()=>toggleLoop()}>LOOP</button>
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
              <button style={Object.assign({},S.loopBtnBottom,{width:"100%",height:30,flexShrink:0},loopMode?S.loopOn:{})} onClick={()=>toggleLoop()}>LOOP</button>
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
                {/* PATTERN + BARS sheet — opened by the bar-count handle beside
                    the chips. Deliberately separate from the STEP sheet: these
                    are edits to the pattern and its bars, not per-step params. */}
                {activeSheet==="bars"&&(
                  <div style={{paddingBottom:8}}>
                    {(()=>{
                      const isDrum=activeLayer==="drums";
                      const accent=activeLayer==="synth"?"#a8c5a0":activeLayer==="lead"?"#6c9ad6":"#c4727a";
                      const accentF=activeLayer==="synth"?"rgba(168,197,160,":activeLayer==="lead"?"rgba(108,154,214,":"rgba(196,114,122,";
                      const ops=isDrum
                        ?[["RAND",randDrumVel,false,false],["CLR",clearDrums,false,false],["DUP",dupDrumPat,drumPats.length>=MAX_PATTERNS,false],["DEL",delDrumPat,drumPats.length<=1,true],["CPY",copyDrumPatFn,false,false],["PST",pasteDrumPatFn,!drumClipboard,false],["MUT8",mutateDrumPat1,false,false]]
                        :[["RAND",()=>randPatId(activeId),false,false],["CLR",()=>clearPatId(activeId),false,false],["DUP",()=>dupPatId(activeId),pats.length>=MAX_PATTERNS,false],["DEL",()=>delPatId(activeId),pats.length<=1,true],["CPY",()=>copyPatId(activeId),false,false],["PST",()=>pastePatId(activeId),!clipboard,false],["MUT8",mutatePat1,false,false]];
                      // Bar controls sit with the pattern ops because they are
                      // the same kind of thing: edits to the pattern you're on.
                      // FOLLOW is NOT here — that's the transport's toggle.
                      const barOps=[
                        ["ADD BAR",  addBar,        barCount>=MAX_BARS,    false],
                        ["DUP BAR",  duplicateBar,  barCount>=MAX_BARS,    false],
                        ["DEL BAR",  removeBar,     barCount<=1,           true ],
                        // Doubles the whole pattern, copy and all — the fast way
                        // to get a second nearly-identical pass to vary.
                        ["×2",       doublePattern, barCount*2>MAX_BARS,   false],
                      ];
                      const opBtn=(d,danger)=>({padding:"13px 0",border:"1px solid "+(d?"rgba(200,185,165,0.06)":accentF+"0.3)"),borderRadius:8,background:"transparent",color:d?"rgba(200,185,165,0.2)":danger?"#c47a7a":accent,fontSize:10,letterSpacing:1,cursor:d?"default":"pointer",fontFamily:"inherit",fontWeight:600});
                      const grpLabel={fontSize:8,letterSpacing:2,color:"rgba(210,195,175,0.5)",fontWeight:600,marginBottom:5,display:"flex",alignItems:"center",gap:6};
                      return(
                        <div style={{marginBottom:12}}>
                          <div style={grpLabel}>PATTERN</div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5,marginBottom:12}}>
                            {ops.map(([l,f,d,danger])=>(
                              <button key={l} disabled={!!d} style={opBtn(d,danger)} onClick={d?undefined:f}>{l}</button>
                            ))}
                          </div>
                          <div style={grpLabel}>
                            <span>BARS</span>
                            <span style={{color:"rgba(210,195,175,0.32)",letterSpacing:1}}>{curBar+1} / {barCount}</span>
                          </div>
                          {/* The sheet covers the strip above the grid, so the
                              chips repeat here — ADD / DUP / DEL BAR act on
                              whichever bar is selected. */}
                          <div style={{display:"flex",marginBottom:7}}>{barChips}</div>
                          <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:5}}>
                            {barOps.map(([l,f,d,danger])=>(
                              <button key={l} disabled={!!d} style={opBtn(d,danger)} onClick={d?undefined:f}>{l}</button>
                            ))}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeSheet==="pattern"&&(
                  <div style={{paddingBottom:8}}>
                    {/* STEP lanes — per-step params for the visible bar */}
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
                        {/* The lanes show ONE bar at a time, and this sheet covers
                            the strip above the grid — so the chips come along, or
                            bar 3's step params would be unreachable from here. */}
                        <div style={{display:"flex",marginBottom:8}}>{barChips}</div>
                        {LANES.map(lane=>{
                          // StepLane is COLS-wide, so it gets THIS BAR's slice of the lane and its
                    // column indices are mapped back to absolute on the way out.
                    const vals=(activePat?(activePat.params||defaultStepParams(patW(activePat))):defaultStepParams()).map(sp=>sp[lane.key]??lane.def).slice(barOff,barOff+COLS);
                          // Only FLT/OCT/GLIDE animate mid-note via Bell.play's mods array.
                          // VEL/DUR/DLY/REV/RHY are locked at note-start, so tied-note
                          // extension cells stay locked for those lanes.
                          const isMidNote=lane.key==="flt"||lane.key==="oct"||lane.key==="glide";
                          const colHasNote=Array.from({length:COLS},(_,vc)=>{
                            if(!activePat)return false;
                            const c=barOff+vc;
                            if(!isMidNote){
                              for(let r=0;r<ROWS;r++) if(activePat.grid[r]&&activePat.grid[r][c]) return true;
                              return false;
                            }
                            for(let r=0;r<ROWS;r++)for(let c2=0;c2<=c;c2++){
                              if(activePat.grid[r]&&activePat.grid[r][c2]){
                                const span=Math.max(1,activePat.durs?.[r]?.[c2]??1);
                                if(c<c2+span) return true;
                              }
                            }
                            return false;
                          });
                          const curVal=playing&&playId===activeId&&step>=barOff&&step<barOff+COLS?vals[step-barOff]:null;
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
                                activeStep={playing&&playId===activeId&&step>=barOff&&step<barOff+COLS?step-barOff:-1}
                                onChange={(col,val)=>setStepParam(barOff+col,lane.key,val)} onDragStart={pushHistory} onResetCol={c=>resetStepCol(barOff+c)}
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
                            <div style={{width:"100%",height:10,background:"rgba(220,200,180,0.07)",borderRadius:3,position:"relative",touchAction:"none"}}
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){setDrumMix(r,key,_drumDefMix()[key]);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width,range=maxVal-minVal;let cur=val,lx=e.clientX;const u=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(minVal,Math.min(maxVal,cur+ballisticDelta(pd,dim,range)));onMixDrag(r,key,Math.round(cur));};const up=()=>{onMixUp(r,key);document.removeEventListener("pointermove",u);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};document.addEventListener("pointermove",u);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);}}
                              onDoubleClick={()=>setDrumMix(r,key,_drumDefMix()[key])}>
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
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){setDrumMix(r,"level",DRUM_DEFAULT_LEVEL);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.height;let cur=md.level!=null?md.level:100,ly=e.clientY;const u=ev=>{const pd=ly-ev.clientY;ly=ev.clientY;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));onMixDrag(r,"level",Math.round(cur));};const up=()=>{onMixUp(r,"level");document.removeEventListener("pointermove",u);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};document.addEventListener("pointermove",u);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);}}>
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
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){onChange(85);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));onChange(Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);}}
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
                          <button style={Object.assign({},S.menuSlotBtn,{color:has?"#c98a8a":undefined})} onClick={()=>clearSlot(slot)} disabled={!has}>CLEAR</button>
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
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){setter(VDEF[label]??0);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(max,cur+ballisticDelta(pd,dim,max)));setter(Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);}}>
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
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){setter(VDEF[label]??0);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(max,cur+ballisticDelta(pd,dim,max)));setter(Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);}}>
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
                              onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){setter(VDEF[label]??0);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));setter(Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);}}>
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
                            onPointerDown={e=>{e.stopPropagation();if(isDoubleTap(e)){setDrumVary(key,0);return;}const rect=e.currentTarget.getBoundingClientRect();const dim=rect.width;let cur=val,lx=e.clientX;const update=ev=>{const pd=ev.clientX-lx;lx=ev.clientX;cur=Math.max(0,Math.min(100,cur+ballisticDelta(pd,dim,100)));setDrumVary(key,Math.round(cur));};const up=()=>{document.removeEventListener("pointermove",update);document.removeEventListener("pointerup",up);document.removeEventListener("pointercancel",up);};document.addEventListener("pointermove",update);document.addEventListener("pointerup",up);document.addEventListener("pointercancel",up);}}>
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
                  {[["RAND",()=>act(()=>randPatId(targetId))],["CLR",()=>act(()=>clearPatId(targetId))],["CPY",()=>act(()=>copyPatId(targetId))],["PST",()=>act(()=>pastePatId(targetId)),!clipboard],["DUP",()=>act(()=>dupPatId(targetId)),pats.length>=MAX_PATTERNS],["DEL",()=>act(()=>delPatId(targetId)),isOnlyPat,true]].map(([label,fn,disabled,danger])=>(
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
                  {[["RAND",()=>act(randDrumVel)],["CLR",()=>act(clearDrums)],["CPY",()=>act(copyDrumPatFn)],["PST",()=>act(pasteDrumPatFn),!drumClipboard],["DUP",()=>act(dupDrumPat),drumPats.length>=MAX_PATTERNS],["DEL",()=>act(delDrumPat),isOnly,true]].map(([label,fn,disabled,danger])=>(
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
  /* Song-page bar dot: a quick swell on each quarter note. Restarted by giving
     the lit dot a key that changes every quarter, which remounts it. */
  @keyframes barpulse{0%{transform:scaleY(2.6);opacity:1}100%{transform:scaleY(1);opacity:.9}}
  .barpulse{animation:barpulse .26s ease-out;}
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
