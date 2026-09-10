// The wasm build must render the smoke pattern BIT-IDENTICALLY to the native
// build (same C, no libm, -ffp-contract=off on both). This is the property that
// lets the native test binary stand in for what the phone will play.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
const here=dirname(fileURLToPath(import.meta.url));
const ctx={module:{exports:{}},atob:(s)=>Buffer.from(s,"base64").toString("binary")};
vm.runInNewContext(readFileSync(join(here,"../ll_params.js"),"utf8")+"\n"+readFileSync(join(here,"../host.js"),"utf8"),ctx);
const LL=ctx.module.exports, P=LL.P;
const bytes=readFileSync(join(here,"../ll_core.wasm"));
const {instance}=await WebAssembly.instantiate(bytes,{});
const w=instance.exports; const SR=48000;
w.ll_init(SR);
let mem=w.memory.buffer, f32=new Float32Array(mem), u8=new Uint8Array(mem);
const views=()=>{ if(mem!==w.memory.buffer){mem=w.memory.buffer;f32=new Float32Array(mem);u8=new Uint8Array(mem);} };
// The same pattern smoke.c builds.
const W=16,g=()=>Array.from({length:16},()=>new Array(W).fill(false)),d13=(v)=>Array.from({length:13},()=>new Array(W).fill(v));
const sp=()=>Array.from({length:W},()=>({vel:100,flt:50,dly:0,rev:0,rhy:1,dur:0,oct:2,glide:0}));
const pat={id:7,parts:{synth:{grid:g(),durs:Array.from({length:16},()=>new Array(W).fill(1)),params:sp()},lead:{grid:g(),durs:Array.from({length:16},()=>new Array(W).fill(1)),params:sp()},drums:{grid:d13(false),vel:d13(100),rat:d13(1)}}};
const s=pat.parts.synth,l=pat.parts.lead,d=pat.parts.drums;
s.grid[8][0]=s.grid[10][4]=s.grid[12][8]=s.grid[8][12]=true; s.durs[12][8]=4; s.params[12].rhy=3;
l.grid[14][0]=l.grid[13][2]=l.grid[11][4]=true; l.params[2].glide=1;
const V=LL.VOICES.reduce((o,k,i)=>(o[k]=i,o),{});
d.grid[V.BD][0]=d.grid[V.BD][8]=d.grid[V.SD][4]=d.grid[V.SD][12]=d.grid[V.CH][2]=d.grid[V.CH][6]=d.grid[V.OH][10]=d.grid[V.CH][14]=d.grid[V.CP][12]=true; d.rat[V.CH][14]=2;
const packed=LL.packPattern(pat,()=>({bars:1,lens:[16],mults:[1]}));
const p=w.ll_scratch(packed.length); views(); u8.set(packed,p);
const rc=w.ll_pattern_load(0,packed.length);
let fail=0; const ck=(o,m)=>{ if(!o)fail++; console.log((o?"ok   ":"FAIL ")+m); };
ck(rc===0,"wasm loads the JS-packed pattern (rc "+rc+")");
w.ll_set(P.P.ACTIVE_PAT,7); w.ll_play();
const N=SR*4, L=new Float32Array(N), R=new Float32Array(N);
const oL=w.ll_out(0)>>2, oR=w.ll_out(1)>>2;
for(let off=0;off<N;off+=128){ w.ll_render_out(128); views(); L.set(f32.subarray(oL,oL+128),off); R.set(f32.subarray(oR,oR+128),off); }
const nat=new Float32Array(readFileSync(join(here,"build/smoke.f32")).buffer);
let diff=0,maxd=0; for(let i=0;i<N;i++){ const a=Math.abs(L[i]-nat[i]),b=Math.abs(R[i]-nat[N+i]); if(a||b)diff++; if(a>maxd)maxd=a; if(b>maxd)maxd=b; }
ck(diff===0,`wasm render is bit-identical to the native render (${diff} differing samples, max |Δ| ${maxd.toExponential(2)})`);
let rms=0; for(let i=0;i<N;i++)rms+=L[i]*L[i]; rms=Math.sqrt(rms/N);
ck(rms>0.01,"wasm render is not silent (rms "+rms.toFixed(4)+")");
console.log(fail?"WASM FAIL":"WASM PASS"); process.exit(fail?1:0);
