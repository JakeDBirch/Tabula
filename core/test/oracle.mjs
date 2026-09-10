// The equivalence oracle: the SAME project, played by the JS scheduler in the
// browser (Bell.play / DrumEngine.play stubbed to record every attack) and by
// the core (the app's own messages, replayed through the real worklet code
// into the wasm in Node). Every attack must match in layer, time, length,
// pitch and velocity. Needs the built index.html served on :8139 (see
// _serve.sh) and playwright installed with --no-save.
//   node core/test/oracle.mjs
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
const here=dirname(fileURLToPath(import.meta.url));
const URL0='http://localhost:8139/index.html';
let fail=0; const ck=(o,m)=>{if(!o)fail++;console.log((o?'ok   ':'FAIL ')+m);};
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--autoplay-policy=no-user-gesture-required']});

// ── the fixture, built WITH the app's constructors and packed by the app ──
const buildFixture=(scenario)=>({
  fn:`(()=>{
    const A=mkPattern('A',2), B=mkPattern('B',1);
    // Pattern A — synth: two bars, [16,14], bar 2 at half speed; ties with mods, a ratchet, a glide.
    let s=A.parts.synth; s=setBarLen(s,1,14); s=setBarMult(s,1,2); A.parts.synth=s;
    s.grid[8][0]=true; s.grid[10][3]=true; s.durs[10][3]=4; s.params[4]={...s.params[4],oct:3}; s.params[5]={...s.params[5],oct:1,glide:1};
    s.grid[12][8]=true; s.params[8]={...s.params[8],rhy:3,vel:90};
    s.grid[9][16]=true; s.grid[11][20]=true; s.params[20]={...s.params[20],glide:1,flt:80}; s.grid[7][29]=true; s.params[29]={...s.params[29],dur:-50};
    // lead: one bar, loops to fill
    const l=A.parts.lead; l.grid[14][0]=true; l.grid[13][2]=true; l.grid[12][4]=true; l.grid[12][6]=true; l.params[2]={...l.params[2],glide:1};
    // drums: two bars
    const d=A.parts.drums; const V={BD:0,SD:1,RM:2,CP:3,HT:4,MT:5,LT:6,CH:7,OH:8,CY:9,CL:10,SH:11,CB:12};
    for(const c of [0,8,16,24])d.grid[V.BD][c]=true; for(const c of [4,12,20,28])d.grid[V.SD][c]=true;
    for(let c=0;c<32;c+=2)d.grid[V.CH][c]=true; d.grid[V.OH][10]=true; d.grid[V.OH][26]=true;
    d.grid[V.CP][12]=true; d.rat[V.CP][12]=2; d.grid[V.CB][30]=true; d.vel[V.CB][30]=60; d.vel[V.SD][12]=110;
    A.master='synth';
    // Pattern B — one bar
    const s2=B.parts.synth; s2.grid[5][0]=true; s2.grid[6][8]=true; s2.durs[6][8]=2;
    const d2=B.parts.drums; d2.grid[V.BD][0]=true; d2.grid[V.SD][8]=true; d2.grid[V.CH][14]=true; d2.rat[V.CH][14]=4;
    const patterns=[syncPatBars(A),syncPatBars(B)];
    const song=new Array(64).fill(null); song[0]=A.id; song[1]=B.id; const songRep=new Array(64).fill(1); songRep[1]=2;
    const sc=${JSON.stringify(scenario)};
    const state=packProject({ver:PROJ_VER,bpm:120,scale:'major',userMask:USER_MASK_DEF,userRoot:0,transpose:sc.transpose||0,swing:sc.swing||0,speedMult:1,
      layerParams:{synth:{waveform:'sawtooth',detune:8,attack:8,decay:400,sustain:40,vcfCutoff:80,vcfRes:15,filterEnvAmt:40,octave:0,dlySend:50,rvSend:30,mix:85,fxTrim:100,subLevel:0,spread:50,glide:0,velAmp:100,velFlt:100,velEnv:0},
                   lead:{waveform:'square',detune:0,attack:8,decay:300,sustain:40,vcfCutoff:70,vcfRes:10,filterEnvAmt:20,octave:1,dlySend:30,rvSend:20,mix:85,fxTrim:100,subLevel:50,spread:0,glide:sc.leadGlide||0,monoSingle:true}},
      dlyIdx:3,dlyFbPct:45,dlyHpVal:8,dlyLpVal:78,rvSize:50,rvDamp:40,rvLfDamp:0,rvPreDelay:0,rvMod:0,dlyToRev:0,drumLevel:85,drumFxTrim:100,
      drumMix:defaultDrumMix(),trackMute:{synth:false,lead:false,drums:false},trackSolo:{synth:false,lead:false,drums:false},activeKit:'808-kit',
      loopMode:!!sc.loop,loopBar:sc.loopBar??-1,loopPat:sc.loop?A.id:null,varyMode:{synth:false,lead:false,drums:false},
      patterns,activePatId:A.id,song,songRep,songMode:!!sc.song,songView:false,activeLayer:'synth'});
    localStorage.setItem('tnori-autosave',JSON.stringify(state));
    return {A:A.id,B:B.id};
  })()`});

const openWith=async(core,scenario)=>{
  const ctx=await b.newContext({viewport:{width:1280,height:900}});
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  await p.goto(URL0+'?core='+core); await p.waitForTimeout(700);
  await p.evaluate(buildFixture(scenario).fn);
  await p.goto(URL0+'?core='+core); await p.waitForTimeout(1500);
  return {p,errs};
};
const clickPlay=(p)=>p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.title==='Hold to export');b.click();});

// ── JS engine capture ──
const captureJS=async(scenario,seconds)=>{
  const {p,errs}=await openWith(0,scenario);
  await p.evaluate(()=>{
    window.__att=[];
    const bp=Bell.prototype.play;
    Bell.prototype.play=function(freq,at,sp,noteDur,gs,prevF,glide,lp,layer){
      const oct=(sp?(sp.oct-2):0)+((lp&&lp.octave)||0);
      window.__att.push({l:layer==='lead'?1:0,t:at,hz:freq*Math.pow(2,oct),dur:noteDur});
      return bp.apply(this,arguments);
    };
    const dp=DrumEngine.prototype.play;
    DrumEngine.prototype.play=function(voice,t,vel){
      const V=["BD","SD","RM","CP","HT","MT","LT","CH","OH","CY","CL","SH","CB"];
      window.__att.push({l:2,t,row:V.indexOf(voice),vel});
      return dp.apply(this,arguments);
    };
  });
  await clickPlay(p); await p.waitForTimeout(seconds*1000+200);
  const sr=await p.evaluate(()=>window.__bellSR=document.querySelector('body')&&(window.__att.length,undefined)||null);
  const out=await p.evaluate(()=>window.__att);
  const rate=await p.evaluate(()=>{const c=[...document.querySelectorAll('*')];return 0;});
  await clickPlay(p); await p.waitForTimeout(100);
  await p.context().close();
  return {att:out,errs};
};
// ── core message capture ──
const captureCore=async(scenario,seconds)=>{
  const {p,errs}=await openWith(1,scenario);
  await p.evaluate(()=>{
    const h=window.__LL_CORE_HOST;
    const copy=m=>m.t==='sample'?{...m,data:m.data.slice()}:m.t==='pat'?{...m,bytes:Array.from(m.bytes)}:m.t==='freqs'?{...m,f:Array.from(m.f)}:m.t==='song'?{...m,ids:Array.from(m.ids)}:m;
    window.__log=h.pending.map(x=>copy(x[0]));
    const orig=h.post.bind(h); h.post=(m,tr)=>{window.__log.push(copy(m));return orig(m,tr);};
  });
  await clickPlay(p); await p.waitForTimeout(400);
  const sr=await p.evaluate(()=>window.__LL_CORE_HOST.sr);
  await clickPlay(p); await p.waitForTimeout(100);
  const log=await p.evaluate(()=>window.__log.map(m=>m.t==='sample'?{...m,data:Array.from(m.data)}:m));
  await p.context().close();
  return {log,sr,errs};
};
// ── replay the messages through the real worklet code into the wasm ──
const replay=async(log,sr,seconds)=>{
  const ctx={module:{exports:{}},atob:(s)=>Buffer.from(s,'base64').toString('binary')};
  vm.runInNewContext(readFileSync(join(here,'../ll_params.js'),'utf8')+'\n'+readFileSync(join(here,'../host.js'),'utf8'),ctx);
  const LL=ctx.module.exports;
  let proc=null, frame=0;
  const wctx={sampleRate:sr,WebAssembly,Int32Array,Float32Array,Uint8Array,registerProcessor:(n,cls)=>{proc=cls;},
    AudioWorkletProcessor:class{constructor(){this.port={postMessage:()=>{},onmessage:null};}},get currentFrame(){return frame;}};
  vm.runInNewContext(LL.WORKLET_SRC,wctx);
  const P=new proc();
  P.onmsg({t:'init',bytes:readFileSync(join(here,'../ll_core.wasm'))});
  const w=P.w;
  // everything up to and including play, then whatever followed except stop
  let played=false;
  for(const m of log){
    if(m.t==='stop')continue;
    const mm=m.t==='sample'?{...m,data:Float32Array.from(m.data)}:m.t==='pat'?{...m,bytes:Uint8Array.from(m.bytes)}:m.t==='freqs'?{...m,f:Float32Array.from(m.f)}:m.t==='song'?{...m,ids:Int32Array.from(m.ids)}:m;
    if(mm.t==='play'){played=true;}
    P.onmsg(mm);
  }
  if(!played)throw new Error('no play in the log');
  const N=Math.ceil(seconds*sr/128)*128;
  const outputs=[[new Float32Array(128),new Float32Array(128)]];
  const att=[];
  const drain=()=>{ const p=w.ll_scratch(4096*4); const i32=new Int32Array(w.memory.buffer); const n=w.ll_debug_attacks(p,4096); const u=new Uint32Array(w.memory.buffer);
    for(let i=0;i<n;i+=5){ const l=i32[(p>>2)+i],row=i32[(p>>2)+i+1],fr=i32[(p>>2)+i+2],dur=i32[(p>>2)+i+3],bits=u[(p>>2)+i+4];
      const f=new Float32Array(new Uint32Array([bits]).buffer)[0]; att.push(l===2?{l,t:fr,row,vel:f}:{l,t:fr,hz:f,dur}); } };
  for(let off=0;off<N;off+=128){ P.process([],outputs); frame+=128; drain(); }
  return att;
};
// ── compare ──
const compare=(js,core,sr,horizon,label)=>{
  const jsT0=Math.min(...js.map(a=>a.t)); const cT0=Math.min(...core.map(a=>a.t));
  const J=js.map(a=>({...a,f:Math.round((a.t-jsT0)*sr)})).filter(a=>a.f<horizon*sr).sort((a,b)=>a.f-b.f||a.l-b.l);
  const C=core.map(a=>({...a,f:a.t-cT0})).filter(a=>a.f<horizon*sr).sort((a,b)=>a.f-b.f||a.l-b.l);
  const key=a=>a.l===2?`D r${a.row} v${a.vel}`:`S${a.l} ${a.hz.toFixed(1)}Hz d${a.l===2?0:Math.round(a.dur*(a.dur<50?sr:1))}`;
  let matched=0; const used=new Array(C.length).fill(false); const miss=[];
  for(const a of J){
    let ok=-1;
    for(let i=0;i<C.length;i++){ if(used[i])continue; const c=C[i];
      if(c.l!==a.l||Math.abs(c.f-a.f)>2)continue;
      if(a.l===2){ if(c.row!==a.row||Math.abs(c.vel-a.vel)>0.5)continue; }
      else { if(Math.abs(c.hz-a.hz)/a.hz>2e-4)continue; const jd=Math.round(a.dur*sr); if(Math.abs(c.dur-jd)>2)continue; }
      ok=i;break; }
    if(ok>=0){used[ok]=true;matched++;} else miss.push('js-only '+key(a)+' @'+a.f);
  }
  const extra=C.filter((c,i)=>!used[i]).map(c=>'core-only '+(c.l===2?`D r${c.row} v${c.vel}`:`S${c.l} ${c.hz.toFixed(1)}Hz d${c.dur}`)+' @'+c.f);
  ck(miss.length===0&&extra.length===0,`${label}: ${matched}/${J.length} JS attacks matched, ${C.length} core attacks (${miss.length} missing, ${extra.length} extra)`);
  for(const m of [...miss,...extra].slice(0,12))console.log('     '+m);
};

const SCENARIOS=[
  {name:'song, swing 30, transpose 2',song:true,swing:30,transpose:2,seconds:11,horizon:10},
  {name:'pattern A free-running, lead glide',song:false,leadGlide:40,seconds:7,horizon:6},
  {name:'LOOP bar 2 of A',loop:true,loopBar:1,seconds:5,horizon:4},
];
for(const sc of SCENARIOS){
  console.log('\n── '+sc.name+' ──');
  const c=await captureCore(sc,1);
  const j=await captureJS(sc,sc.seconds);
  ck(j.errs.length===0&&c.errs.length===0,'no page errors'+((j.errs[0]||c.errs[0])?': '+(j.errs[0]||c.errs[0]):''));
  const core=await replay(c.log,c.sr,sc.seconds);
  console.log(`   sr ${c.sr}, JS attacks ${j.att.length}, core attacks ${core.length}`);
  compare(j.att,core,c.sr,sc.horizon,sc.name);
}
await b.close(); console.log(fail?`\nORACLE FAIL: ${fail}`:'\nORACLE PASS'); process.exit(fail?1:0);
