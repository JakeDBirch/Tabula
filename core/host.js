/* LLCore — the web host for the DSP core (core/ll_core.wasm).
 *
 * Plain script, no JSX, no modules: build.mjs inlines it into index.html after
 * the generated LL_PARAMS table and before the app. Three things live here:
 *   1. packPattern — the pattern wire format (the JS twin of ll_pattern_load).
 *   2. CoreHost   — AudioContext + AudioWorklet + wasm, and the message
 *                   protocol to the processor. Everything set before the
 *                   worklet exists is queued and replayed, so the React effects
 *                   that fire before play-start all land.
 *   3. Bell / Drums facades — the surface of the old Bell and DrumEngine
 *                   classes that the app still calls (setRvSize, setVoiceMix,
 *                   play for an audition…), forwarded to the core. They exist
 *                   so the ~40 engine call sites in loudlight.jsx needed no
 *                   edits to switch engines.
 * The processor source is a string (WORKLET_SRC) loaded from a Blob URL —
 * the app is one static file and must stay that way.
 */
const LLCore=(()=>{
  const P=LL_PARAMS;
  const VOICES=["BD","SD","RM","CP","HT","MT","LT","CH","OH","CY","CL","SH","CB"];
  const MOTION=["level","pan","rvSend","dlySend","pitch","env","filtCut"];
  const LAYER={synth:0,lead:1,drums:2};
  const WAVE={sine:0,square:1,sawtooth:2,triangle:3};
  const FILT={off:0,lp:1,hp:2,bp:3};
  const clamp=(v,a,b)=>v<a?a:v>b?b:v;
  const u8c=(v,a,b)=>{v=Math.round(+v||0);return v<a?a:v>b?b:v;};

  // ── 1. wire format ───────────────────────────────────────────────────────
  // norm(part) → {bars, lens, mults} using the app's own partBars / partBarLens
  // / partBarMults, so the core sees exactly the lengths the JS scheduler did.
  function packPattern(pat,norm){
    const parts=[pat.parts.synth,pat.parts.lead,pat.parts.drums];
    const hs=parts.map(norm);
    let size=16;
    for(let l=0;l<2;l++){const W=hs[l].bars*16;size+=4+hs[l].bars*8+16*W*2+W*8;}
    const dm=parts[2].motion&&typeof parts[2].motion==="object"?parts[2].motion:null;
    {const W=hs[2].bars*16;size+=4+hs[2].bars*8+13*W*3+4+(dm?7*13*W*2:0);}
    const buf=new ArrayBuffer(size),dv=new DataView(buf),u8=new Uint8Array(buf);let o=0;
    const i32=v=>{dv.setInt32(o,v|0,true);o+=4;},f32=v=>{dv.setFloat32(o,+v||0,true);o+=4;},i16=v=>{dv.setInt16(o,v,true);o+=2;};
    i32(0x31504C4C);i32(pat.id|0);i32(Math.max(hs[0].bars,hs[1].bars,hs[2].bars));
    i32(pat.master==="synth"?1:pat.master==="lead"?2:pat.master==="drums"?3:0);
    for(let l=0;l<2;l++){
      const p=parts[l],h=hs[l],W=h.bars*16;
      i32(h.bars);for(let i=0;i<h.bars;i++)i32(h.lens[i]);for(let i=0;i<h.bars;i++)f32(h.mults[i]);
      for(let r=0;r<16;r++){const row=p.grid&&p.grid[r];for(let c=0;c<W;c++)u8[o++]=row&&row[c]?1:0;}
      for(let r=0;r<16;r++){const row=p.durs&&p.durs[r];for(let c=0;c<W;c++)u8[o++]=u8c(row&&row[c]!=null?row[c]:1,1,255);}
      for(let c=0;c<W;c++){
        const sp=(p.params&&p.params[c])||null;
        u8[o++]=u8c(sp?sp.vel:100,0,127);u8[o++]=u8c(sp?(sp.flt??50):50,0,100);u8[o++]=u8c(sp?sp.dly:0,0,100);u8[o++]=u8c(sp?(sp.rev??0):0,0,100);
        u8[o++]=u8c(sp?(sp.rhy??1):1,1,4);u8[o++]=u8c(sp?sp.dur:0,-100,100)&255;u8[o++]=u8c(sp?sp.oct:2,0,4);u8[o++]=sp&&sp.glide?1:0;
      }
    }
    {
      const p=parts[2],h=hs[2],W=h.bars*16;
      i32(h.bars);for(let i=0;i<h.bars;i++)i32(h.lens[i]);for(let i=0;i<h.bars;i++)f32(h.mults[i]);
      for(let r=0;r<13;r++){const row=p.grid&&p.grid[r];for(let c=0;c<W;c++)u8[o++]=row&&row[c]?1:0;}
      const vel2d=p.vel&&Array.isArray(p.vel[0]);
      for(let r=0;r<13;r++)for(let c=0;c<W;c++){const v=vel2d?(p.vel[r]&&p.vel[r][c]):(p.vel&&p.vel[c%p.vel.length]);u8[o++]=u8c(v!=null?v:100,1,127);}
      for(let r=0;r<13;r++){const row=p.rat&&p.rat[r];for(let c=0;c<W;c++)u8[o++]=u8c(row&&row[c]!=null?row[c]:1,1,4);}
      i32(dm?1:0);
      if(dm)for(let k=0;k<7;k++){const lane=dm[MOTION[k]];for(let r=0;r<13;r++){const row=lane&&lane[r];for(let c=0;c<W;c++){const v=row&&row[c]!=null?row[c]:null;i16(v==null?-32768:clamp(Math.round(v),-32767,32767));}}}
    }
    return u8;
  }

  // ── 2. the processor ─────────────────────────────────────────────────────
  const WORKLET_SRC=`
class LLProcessor extends AudioWorkletProcessor{
  constructor(){ super(); this.w=null; this.mem=null; this.started=false; this.queue=[];
    this.evBuf=new Int32Array(512);
    this.port.onmessage=(e)=>{ try{ this.onmsg(e.data); }catch(err){ this.port.postMessage({t:"err",what:"onmsg",msg:e.data&&e.data.t,error:String(err&&err.stack||err)}); } }; }
  views(){ if(this.mem!==this.w.memory.buffer){ this.mem=this.w.memory.buffer; this.f32=new Float32Array(this.mem); this.u8=new Uint8Array(this.mem); this.i32=new Int32Array(this.mem);} }
  onmsg(m){
    if(m.t==="init"){
      // Raw bytes, compiled HERE: a WebAssembly.Module does not survive the
      // structured clone into an AudioWorkletGlobalScope (the port fires
      // messageerror and the message is simply gone). Sync compile is fine
      // off the main thread and takes ~10ms for this module.
      const inst=new WebAssembly.Instance(new WebAssembly.Module(m.bytes),{});
      this.w=inst.exports; this.w.ll_init(sampleRate); this.views();
      this.outL=this.w.ll_out(0)>>2; this.outR=this.w.ll_out(1)>>2;
      const q=this.queue; this.queue=null; for(const x of q)this.onmsg(x);
      this.port.postMessage({t:"ready",sr:sampleRate});
      return;
    }
    if(!this.w){ this.queue.push(m); return; }
    const w=this.w;
    switch(m.t){
      case "set": w.ll_set(m.id,m.v); break;
      case "layer": w.ll_set_layer(m.l,m.id,m.v); break;
      case "drum": w.ll_set_drum(m.d,m.id,m.v); break;
      case "freqs": { const p=w.ll_scratch(64); this.views(); this.f32.set(m.f,p>>2); w.ll_set_freqs(p); break; }
      case "pat": { const p=w.ll_scratch(m.bytes.length); this.views(); this.u8.set(m.bytes,p); const rc=w.ll_pattern_load(m.slot,m.bytes.length); if(rc)this.port.postMessage({t:"err",what:"pattern",rc,slot:m.slot}); break; }
      case "patclear": w.ll_pattern_clear(m.slot); break;
      case "song": { const p=w.ll_scratch(m.ids.length*4+4); this.views(); this.i32.set(m.ids,p>>2); w.ll_song_set(p,m.ids.length); break; }
      case "play": w.ll_play(); break;
      case "stop": w.ll_stop(); break;
      case "note": w.ll_audition_note(m.l,m.hz,m.sec); break;
      case "hit": w.ll_audition_drum(m.d,m.vel); break;
      case "flush": w.ll_flush(); break;
      case "samples_clear": w.ll_samples_clear(); break;
      case "sample": { const p=w.ll_sample_alloc(m.d,m.kind,m.slot,m.data.length); if(p){ this.views(); this.f32.set(m.data,p>>2);} else this.port.postMessage({t:"err",what:"sample",voice:m.d}); break; }
      case "sample_commit": w.ll_sample_commit(m.d,m.kind,m.n); break;
      case "ping": this.port.postMessage({t:"pong",frame:currentFrame,playing:w.ll_playing(),coreFrame:w.ll_frame(),started:this.started}); break;
    }
  }
  process(inputs,outputs){
    if(!this.w)return true;
    try{ return this.render(outputs); }catch(err){ if(!this.reported){ this.reported=true; this.port.postMessage({t:"err",what:"process",error:String(err&&err.stack||err)}); } return true; }
  }
  render(outputs){
    const w=this.w, out=outputs[0], n=out[0].length;
    if(!this.started){ this.started=true; w.ll_set_frame(currentFrame); }
    w.ll_render_out(n);
    this.views();
    out[0].set(this.f32.subarray(this.outL,this.outL+n));
    if(out.length>1)out[1].set(this.f32.subarray(this.outR,this.outR+n));
    const p=w.ll_scratch(2048); this.views();
    const k=w.ll_events(p,512);
    if(k>0){ const ev=this.i32.slice(p>>2,(p>>2)+k); this.port.postMessage({t:"ev",ev,frame:currentFrame}); }
    return true;
  }
}
registerProcessor("loudlight-core",LLProcessor);
`;

  // The offline renderer. It runs the worklet processor's own message code
  // (shimmed: the port, sampleRate, currentFrame) so the bounce can never
  // drift from what the live core does with the same messages.
  const WORKER_SRC=`
self.onmessage=(e)=>{
  const m=e.data; if(m.t!=="render")return;
  try{
    self.sampleRate=m.sr; self.currentFrame=0;
    let Cls=null; self.registerProcessor=(n,c)=>{Cls=c;};
    self.AudioWorkletProcessor=class{constructor(){this.port={postMessage:()=>{},onmessage:null};}};
    (0,eval)(m.src);
    const P=new Cls();
    P.onmsg({t:"init",bytes:m.bytes});
    for(const x of m.msgs)P.onmsg(x);
    const w=P.w, sr=m.sr;
    w.ll_play();
    const outL=w.ll_out(0)>>2, outR=w.ll_out(1)>>2;
    const maxFrames=Math.ceil(m.maxSec*sr), CH=128*256;
    const Ls=[],Rs=[]; let cl=new Float32Array(CH), cr=new Float32Array(CH), ci=0, frames=0, tail=-1, nextProg=0;
    let mem=null,f32=null;
    while(frames<maxFrames){
      w.ll_render_out(128);
      if(mem!==w.memory.buffer){mem=w.memory.buffer;f32=new Float32Array(mem);}
      cl.set(f32.subarray(outL,outL+128),ci); cr.set(f32.subarray(outR,outR+128),ci); ci+=128; frames+=128;
      if(ci>=CH){Ls.push(cl);Rs.push(cr);cl=new Float32Array(CH);cr=new Float32Array(CH);ci=0;}
      if(tail<0){ if(!w.ll_playing())tail=Math.ceil(m.tailSec*sr); }
      else { tail-=128; if(tail<=0)break; }
      if(frames>=nextProg){ nextProg+=sr>>1; self.postMessage({t:"prog",sec:frames/sr}); }
    }
    if(ci>0){Ls.push(cl.subarray(0,ci));Rs.push(cr.subarray(0,ci));}
    const cat=(a)=>{let n=0;for(const c of a)n+=c.length;const o=new Float32Array(n);let p=0;for(const c of a){o.set(c,p);p+=c.length;}return o;};
    const L=cat(Ls),R=cat(Rs);
    self.postMessage({t:"done",L,R},[L.buffer,R.buffer]);
  }catch(err){ self.postMessage({t:"err",error:String(err&&err.stack||err)}); }
};
`;

  // ── 3. the host ──────────────────────────────────────────────────────────
  class CoreHost{
    constructor(){
      this.ctx=null;this.node=null;this.master=null;this.ready=false;this.pending=[];
      this.onEvents=null;this.sr=48000;this.initP=null;this._wasm=null;
    }
    // wasm bytes: base64 from window.__LL_CORE_WASM (inlined by build.mjs).
    static wasmBytes(){
      const b64=(typeof window!=="undefined"&&window.__LL_CORE_WASM)||"";
      const bin=atob(b64);const u=new Uint8Array(bin.length);for(let i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);return u.buffer;
    }
    // Every message also lands in a SHADOW of the core's state, so an offline
    // render (the MP3 bounce) can start from exactly what the live core holds.
    post(m,transfer){
      this.shadow(m);
      if(this.node)this.node.port.postMessage(m,transfer||[]); else this.pending.push([m,transfer]);
    }
    shadow(m){
      const s=this._sh||(this._sh={p:{},l:[{},{}],d:[],freqs:null,pat:{},song:null});
      switch(m.t){
        case "set": s.p[m.id]=m.v; break;
        case "layer": (s.l[m.l]||(s.l[m.l]={}))[m.id]=m.v; break;
        case "drum": (s.d[m.d]||(s.d[m.d]={}))[m.id]=m.v; break;
        case "freqs": s.freqs=Float32Array.from(m.f); break;
        case "pat": s.pat[m.slot]=m.bytes.slice(); break;
        case "patclear": delete s.pat[m.slot]; break;
        case "song": s.song=Int32Array.from(m.ids); break;
      }
    }
    // The shadow as a message list for a fresh core at sample rate `sr`.
    snapshot(sr){
      const s=this._sh||{p:{},l:[{},{}],d:[],freqs:null,pat:{},song:null}, out=[];
      for(const id in s.p)out.push({t:"set",id:+id,v:s.p[id]});
      s.l.forEach((L,l)=>{for(const id in L)out.push({t:"layer",l,id:+id,v:L[id]});});
      s.d.forEach((D,d)=>{if(D)for(const id in D)out.push({t:"drum",d,id:+id,v:D[id]});});
      if(s.freqs)out.push({t:"freqs",f:Float32Array.from(s.freqs)});
      for(const slot in s.pat)out.push({t:"pat",slot:+slot,bytes:s.pat[slot].slice()});
      if(s.song)out.push({t:"song",ids:Int32Array.from(s.song)});
      out.push({t:"samples_clear"});
      const map=this._samples||{};
      for(const key of VOICES){
        const smp=map[key];if(!smp)continue;
        let kind=0,bufs=[];
        if(smp.numberOfChannels!=null)bufs=[smp]; else if(smp.rr&&smp.rr.length){kind=1;bufs=smp.rr;} else if(smp.vel&&smp.vel.length){kind=2;bufs=smp.vel;}
        bufs=bufs.slice(0,8); const d=VOICES.indexOf(key);
        bufs.forEach((b,slot)=>out.push({t:"sample",d,kind,slot,data:CoreHost.mono(b,sr)}));
        if(bufs.length)out.push({t:"sample_commit",d,kind,n:bufs.length});
      }
      return out;
    }
    // Render a bounce OFFLINE, faster than real time, in a Worker: a fresh core
    // fed the snapshot plus `msgs`, played until it stops itself
    // (LL_P_STOP_AFTER) and then `tailSec` more for the tails. Resolves
    // {L,R,sr,frames}. `onProgress(sec)` reports rendered audio seconds.
    renderOffline({sr,msgs,tailSec,maxSec,onProgress}){
      return new Promise((resolve,reject)=>{
        const url=URL.createObjectURL(new Blob([WORKER_SRC],{type:"application/javascript"}));
        const wk=new Worker(url);
        const done=()=>{wk.terminate();URL.revokeObjectURL(url);};
        wk.onerror=(e)=>{done();reject(new Error("bounce worker: "+(e.message||e)));};
        wk.onmessage=(e)=>{
          const m=e.data;
          if(m.t==="prog"){ if(onProgress)onProgress(m.sec); }
          else if(m.t==="done"){ done(); resolve({L:m.L,R:m.R,sr,frames:m.L.length}); }
          else if(m.t==="err"){ done(); reject(new Error("bounce: "+m.error)); }
        };
        const bytes=CoreHost.wasmBytes();
        const transfer=[bytes]; for(const m of msgs)if(m.t==="sample")transfer.push(m.data.buffer);
        wk.postMessage({t:"render",bytes,sr,msgs,tailSec,maxSec,src:WORKLET_SRC},transfer);
      });
    }
    async init(){
      if(this.initP)return this.initP;
      this.initP=(async()=>{
        const AC=window.AudioContext||window.webkitAudioContext;
        this.ctx=new AC();
        try{await this.ctx.resume();}catch(e){}
        this.sr=this.ctx.sampleRate;
        const url=URL.createObjectURL(new Blob([WORKLET_SRC],{type:"application/javascript"}));
        await this.ctx.audioWorklet.addModule(url);
        const bytes=CoreHost.wasmBytes();
        // Post-core master: the core already applies the 0.55 master gain and
        // the limiter, so this sits at unity. It exists as the export tap.
        this.master=this.ctx.createGain();this.master.gain.value=1;
        this.node=new AudioWorkletNode(this.ctx,"loudlight-core",{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[2]});
        this.node.port.onmessage=(e)=>{
          const m=e.data;
          if(m.t==="ev"){ if(this.onEvents)this.onEvents(m.ev,m.frame); }
          else if(m.t==="pong"){ if(this.onPong)this.onPong(m); }
          else if(m.t==="err")console.warn("core:",m);
        };
        // A processor that throws is silently replaced by silence; say so.
        this.node.onprocessorerror=(e)=>console.error("core: processor error",e);
        this.node.connect(this.master);this.master.connect(this.ctx.destination);
        this.node.port.onmessageerror=(e)=>console.error("core: message could not be delivered to the worklet",e);
        this.node.port.postMessage({t:"init",bytes},[bytes]);
        for(const [m,tr] of this.pending)this.node.port.postMessage(m,tr||[]);
        this.pending=[];
        this.ready=true;
      })();
      return this.initP;
    }
    async resume(){ if(this.ctx&&this.ctx.state!=="running"){try{await this.ctx.resume();}catch(e){}} }
    set(id,v){ this.post({t:"set",id,v:+v}); }
    setLayer(layer,id,v){ this.post({t:"layer",l:LAYER[layer]??layer,id,v:+v}); }
    setDrum(voice,id,v){ const d=typeof voice==="number"?voice:VOICES.indexOf(voice); if(d>=0)this.post({t:"drum",d,id,v:+v}); }
    setFreqs(f){ this.post({t:"freqs",f:Float32Array.from(f)}); }
    loadPattern(slot,bytes){ this.post({t:"pat",slot,bytes}); }
    clearPattern(slot){ this.post({t:"patclear",slot}); }
    setSong(ids){ this.post({t:"song",ids:Int32Array.from(ids)}); }
    play(){ this.post({t:"play"}); }
    stop(){ this.post({t:"stop"}); }
    note(layer,hz,sec){ this.post({t:"note",l:LAYER[layer]??0,hz,sec}); }
    hit(voice,vel){ const d=typeof voice==="number"?voice:VOICES.indexOf(voice); if(d>=0)this.post({t:"hit",d,vel}); }
    flush(){ this.post({t:"flush"}); }
    ping(){ return new Promise(r=>{ this.onPong=(m)=>{this.onPong=null;r(m);}; this.post({t:"ping"}); }); }
    // Push a whole set of layer params / a drum mix row / the globals.
    pushLayer(layer,lp){
      const L=P.L,s=(k,v)=>this.setLayer(layer,L[k],v);
      s("WAVE",WAVE[lp.waveform]??2);s("DETUNE",lp.detune??8);s("ATTACK",lp.attack??8);s("DECAY",lp.decay??400);s("SUSTAIN",lp.sustain??40);
      s("CUTOFF",lp.vcfCutoff??80);s("RES",lp.vcfRes??15);s("FENV",lp.filterEnvAmt??0);s("OCTAVE",lp.octave??0);s("DLYSEND",lp.dlySend??50);s("RVSEND",lp.rvSend??30);
      s("MIX",lp.mix??85);s("FXTRIM",lp.fxTrim??100);s("SUB",lp.subLevel??0);s("SPREAD",lp.spread??50);s("GLIDE",lp.glide??0);s("MONO",lp.monoSingle?1:0);
      s("VELAMP",lp.velAmp??100);s("VELAMP_INV",lp.velAmpInv?1:0);s("VELFLT",lp.velFlt??100);s("VELFLT_INV",lp.velFltInv?1:0);s("VELENV",lp.velEnv??0);s("VELENV_INV",lp.velEnvInv?1:0);
    }
    pushDrumMix(voice,mix){
      const D=P.D;
      if(mix.level!=null)this.setDrum(voice,D.LEVEL,mix.level);
      if(mix.pan!=null)this.setDrum(voice,D.PAN,mix.pan);
      if(mix.rvSend!=null)this.setDrum(voice,D.RVSEND,mix.rvSend);
      if(mix.dlySend!=null)this.setDrum(voice,D.DLYSEND,mix.dlySend);
      if(mix.pitch!=null)this.setDrum(voice,D.PITCH,mix.pitch);
      if(mix.env!=null)this.setDrum(voice,D.ENV,mix.env);
      if(mix.sat!=null)this.setDrum(voice,D.SAT,mix.sat);
      if(mix.filt!=null)this.setDrum(voice,D.FILT,FILT[mix.filt]??0);
      if(mix.filtCut!=null)this.setDrum(voice,D.FILTCUT,mix.filtCut);
    }
    // Samples: an AudioBuffer, {rr:[...]} or {vel:[...]} per voice, as the app
    // keeps them. Downmixed to mono and resampled to the engine rate if a
    // buffer was decoded through a 44.1k OfflineAudioContext before the live
    // context existed.
    pushSamples(map){
      this._samples=map||{};
      this.post({t:"samples_clear"});
      for(const key of VOICES){
        const s=map&&map[key];if(!s)continue;
        let kind=0,bufs=[];
        if(s.numberOfChannels!=null)bufs=[s];
        else if(s.rr&&s.rr.length){kind=1;bufs=s.rr;}
        else if(s.vel&&s.vel.length){kind=2;bufs=s.vel;}
        bufs=bufs.slice(0,8);
        const d=VOICES.indexOf(key);
        bufs.forEach((b,slot)=>{const data=CoreHost.mono(b,this.sr);this.post({t:"sample",d,kind,slot,data},[data.buffer]);});
        if(bufs.length)this.post({t:"sample_commit",d,kind,n:bufs.length});
      }
    }
    static mono(b,sr){
      const n=b.length,ch=b.numberOfChannels;let m=new Float32Array(n);
      for(let c=0;c<ch;c++){const x=b.getChannelData(c);for(let i=0;i<n;i++)m[i]+=x[i]/ch;}
      if(b.sampleRate&&Math.abs(b.sampleRate-sr)>1){
        const r=b.sampleRate/sr,on=Math.floor(n/r);const o=new Float32Array(on);
        for(let i=0;i<on;i++){const p=i*r,k=Math.floor(p),f=p-k;o[i]=m[k]+((m[k+1]??m[k])-m[k])*f;}
        m=o;
      }
      return m;
    }
  }

  // ── 4. facades ───────────────────────────────────────────────────────────
  // What loudlight.jsx calls on bell.current / drumEngine.current. `ctx`,
  // `master` and `limiter` are what the export tap and the resume watchdog
  // read; `masterLevel` is the gain the JS master node sits at (the core's own
  // 0.55 is inside the wasm, so the node is at unity).
  class Bell{
    constructor(host){this.host=host;this.p={};this.stepDur=0.125;this.masterLevel=1;this.limiter=null;this.rev=null;this.dly=null;}
    get ready(){return this.host.ready;} get ctx(){return this.host.ctx;} get master(){return this.host.master;}
    async init(dlyT,fbv,sendPct,dlyHpV,dlyLpV){ await this.host.init(); this.setDlyTime(dlyT);this.setDlyFb(fbv);this.setDlyHp(dlyHpV);this.setDlyLp(dlyLpV); }
    async resume(){ await this.host.resume(); }
    // Only the audition path calls this now (the sequencer runs in the core).
    play(freq,at,sp,noteDur,globalSend,prevFreq,glideTime,layerP,layer){ this.host.note(layer||"synth",freq,noteDur!=null?noteDur:this.stepDur); }
    setRvSize(v){this.host.set(P.P.RV_SIZE,v);} setRvDamp(v){this.host.set(P.P.RV_DAMP,v);} setRvLfDamp(v){this.host.set(P.P.RV_LFDAMP,v);}
    setRvPreDelay(v){this.host.set(P.P.RV_PREDELAY,v);} setRvMod(v){this.host.set(P.P.RV_MOD,v);} setDlyToRev(v){this.host.set(P.P.DLY_TO_REV,v);}
    setDlyTime(s){this.host.set(P.P.DLY_TIME,s);} setDlyFb(v){this.host.set(P.P.DLY_FB,v);} setDlyHp(v){this.host.set(P.P.DLY_HP,v);} setDlyLp(v){this.host.set(P.P.DLY_LP,v);}
    setDelaySend(){} 
    setLayerGain(layer,v){this.host.setLayer(layer,P.L.AUDIBLE,v);}
    flushTail(){this.host.flush();}
  }
  class Drums{
    constructor(host){this.host=host;this.fxTrim=1;}
    get ready(){return this.host.ready;} get ctx(){return this.host.ctx;}
    async init(){ await this.host.init(); }
    async resume(){ await this.host.resume(); }
    play(voice,t,vel){ this.host.hit(voice,vel); }
    setVoiceMix(voice,mix){ this.host.pushDrumMix(voice,mix); }
    setMasterLevel(pct){this.host.set(P.P.DRUM_LEVEL,pct);}
    setFxTrim(pct){this.host.set(P.P.DRUM_FXTRIM,pct);}
    setMute(v){this.host.set(P.P.DRUM_AUDIBLE,v);}
    chokeOH(){}
  }
  return {packPattern,CoreHost,Bell,Drums,VOICES,MOTION,LAYER,WAVE,FILT,WORKLET_SRC,WORKER_SRC,P};
})();
if(typeof module!=="undefined")module.exports=LLCore;
