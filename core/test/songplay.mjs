// The song must actually ADVANCE. This is the behavioural guard the oracle
// cannot be: the oracle proves the two engines agree, and it caught this one
// only because the core was right and the JS was wrong. If both had frozen,
// only "does the playhead move" would have noticed.
//
// It froze because songModeR — the ref the scheduler reads — was filled in by
// an effect whose dependency array was evaluated ABOVE the derived const it
// depended on, so the dep was `[undefined]` forever and the ref kept the first
// render's value: false, before the project restore had landed.
import { chromium } from 'playwright';
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium',args:['--autoplay-policy=no-user-gesture-required']});
let fail=0; const ck=(o,m)=>{if(!o)fail++;console.log((o?'ok   ':'FAIL ')+m);};

for(const core of [0,1]){
  const ctx=await b.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const p=await ctx.newPage(); const errs=[];
  p.on('pageerror',e=>errs.push(e.message));
  p.on('console',m=>{if(m.type()==='error'&&!/Failed to load resource|404/.test(m.text()))errs.push(m.text());});
  await p.goto('http://localhost:8139/index.html?core='+core); await p.waitForTimeout(1200);
  console.log(`\n=== ${core?'core':'JS engine'} ===`);

  const grid=async(r,c)=>{const g=await p.evaluate(()=>{const e=document.querySelector('[data-grid]');const q=e.getBoundingClientRect();
    return {x:q.x,y:q.y,w:q.width,h:q.height};});
    await p.mouse.click(g.x+(c+0.5)*g.w/16,g.y+(r+0.5)*g.h/16); await p.waitForTimeout(160);};
  const slot=async(i)=>{const s=await p.evaluate(i=>{const e=document.querySelector(`[data-song-bar="${i}"]`);
    const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};},i);
    await p.mouse.click(s.x,s.y); await p.waitForTimeout(220);};
  const addPat=()=>p.evaluate(()=>{const e=[...document.querySelectorAll('[role=button]')]
    .find(x=>(x.getAttribute('aria-label')||'').startsWith('New pattern'));e.click();});
  const cursor=()=>p.evaluate(()=>{const e=document.querySelector('[data-song-cursor="1"]');
    return e?+e.dataset.songBar:-1;});

  // Two one-bar patterns, one after the other in the song.
  await grid(8,0); await grid(10,4);
  await slot(0);
  await addPat(); await p.waitForTimeout(300);
  await grid(5,2); await grid(6,10);
  await slot(1);
  const filled=await p.evaluate(()=>[...document.querySelectorAll('[data-song-cell="1"]')].filter(c=>c.textContent.trim()).length);
  ck(filled===2,`two patterns placed in the song (${filled})`);

  await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.title==='Hold to export');b.click();});
  // One bar is 2s at 120bpm, so ~6s covers several entries either way.
  const seen=new Set();
  for(let i=0;i<28;i++){ await p.waitForTimeout(220); const c=await cursor(); if(c>=0)seen.add(c); }
  await p.evaluate(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.title==='Hold to export');b.click();});
  await p.waitForTimeout(200);
  ck(seen.size>=2,`the playhead moved through the song (slots seen: ${JSON.stringify([...seen])})`);
  ck(seen.has(0)&&seen.has(1),'  and visited both entries');
  ck(errs.length===0,'no page errors'+(errs.length?': '+errs[0]:''));
  await ctx.close();
}
await b.close(); console.log(fail?`\nFAIL: ${fail}`:'\nPASS'); process.exit(fail?1:0);
