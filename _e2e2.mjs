import http from "node:http"; import fs from "node:fs"; import path from "node:path";
import { chromium } from "playwright";
const ROOT="ios/www";
const MIME={".html":"text/html",".js":"text/javascript",".json":"application/json",".woff2":"font/woff2",".wav":"audio/wav",".aiff":"audio/aiff",".svg":"image/svg+xml"};
const srv=http.createServer((q,s)=>{const f=path.join(ROOT,decodeURIComponent(q.url.split("?")[0]).replace(/^\/+/,"")||"index.html");
  fs.readFile(f,(e,b)=>e?(s.writeHead(404),s.end()):(s.writeHead(200,{"Content-Type":MIME[path.extname(f)]||"application/octet-stream"}),s.end(b)));});
await new Promise(r=>srv.listen(8147,r));
const b=await chromium.launch({executablePath:"/opt/pw-browsers/chromium"});
const pg=await (await b.newContext({viewport:{width:1440,height:900}})).newPage();
const errs=[]; pg.on("pageerror",e=>errs.push(e.message));
await pg.goto("http://127.0.0.1:8147/index.html",{waitUntil:"networkidle"});
await pg.waitForTimeout(1500);

const strip=()=>pg.evaluate(()=>{const d=[...document.querySelectorAll("div")].find(x=>x.style.cursor==="pointer"&&x.style.touchAction==="none"&&x.style.height==="22px");
  const b=d.getBoundingClientRect(); return {x:b.left,y:b.top+b.height/2,w:b.width,n:d.children.length};});
// curBar = the chip with the light fill; loopChip = the chip carrying LOOP's underline.
const chips=()=>pg.evaluate(()=>{const d=[...document.querySelectorAll("div")].find(x=>x.style.cursor==="pointer"&&x.style.touchAction==="none"&&x.style.height==="22px");
  const kids=[...d.children];
  return { n:kids.length,
    cur:kids.findIndex(c=>/0\.55/.test(c.style.background)),
    loopUnderline:kids.findIndex(c=>c.querySelector("div")) };});
const tapBar=async(bar)=>{const s=await strip();await pg.mouse.click(s.x+(s.w*(bar+0.5))/s.n,s.y);await pg.waitForTimeout(300);};
const btn=(name)=>pg.getByRole("button",{name,exact:true}).first();
const isOn=async(name)=>await btn(name).evaluate(el=>/122,\s*170,\s*150/.test(el.getAttribute("style")||""));
const saved=async()=>{ await pg.waitForTimeout(1400); return pg.evaluate(async()=>{
  const raw=await window.storageGet("autosave"); if(!raw) return {err:"no autosave"};
  const p=window.unpackProject(JSON.parse(raw));
  return {loopMode:p.loopMode, loopBar:p.loopBar, loopPat:p.loopPat};});};

// fixture: 4 bars
for(let i=0;i<3;i++){ await btn("+BAR").click(); await pg.waitForTimeout(300); }

const T=[];
// ── 1. FOLLOW turns off when you pick a bar ───────────────────────────────
await btn("FOLLOW").click(); await pg.waitForTimeout(200);
T.push(["FOLLOW is on before the tap", await isOn("FOLLOW"), ""]);
await tapBar(1);
const c1=await chips();
T.push(["tapping a chip jumps to that bar", c1.cur===1, `cur=${c1.cur}`]);
T.push(["tapping a chip clears FOLLOW", !(await isOn("FOLLOW")), "FOLLOW still on"]);

// ── 2. LOOP follows the bar selection ─────────────────────────────────────
await btn("LOOP").click(); await pg.waitForTimeout(200);
const s0=await saved();
T.push(["LOOP pins to the visible bar when switched on", s0.loopMode===true&&s0.loopBar===1, JSON.stringify(s0)]);
await tapBar(3);
const s1=await saved(), c2=await chips();
T.push(["tapping a new bar moves the loop", s1.loopBar===3, JSON.stringify(s1)]);
T.push(["the loop underline moved with it", c2.loopUnderline===3 && c2.cur===3, JSON.stringify(c2)]);
await tapBar(0);
const s2=await saved();
T.push(["and moves back again", s2.loopBar===0, JSON.stringify(s2)]);

// ── 3. ADD BAR lands on the new bar and takes the loop ────────────────────
await btn("+BAR").click(); await pg.waitForTimeout(400);
const s3=await saved(), c3=await chips();
T.push(["ADD BAR lands on the new bar", c3.cur===4 && c3.n===5, JSON.stringify(c3)]);
T.push(["ADD BAR takes the loop with it", s3.loopBar===4, JSON.stringify(s3)]);

// ── 4. LOOP still off = nothing pinned ────────────────────────────────────
await btn("LOOP").click(); await pg.waitForTimeout(200);
await tapBar(2);
const s4=await saved();
T.push(["with LOOP off, paging pins nothing", s4.loopMode===false && s4.loopBar===-1, JSON.stringify(s4)]);

T.push(["no page errors", errs.length===0, errs.join(" | ")]);
let bad=0; for(const [n,ok,d] of T){ if(!ok)bad++; console.log(`${ok?"PASS":"FAIL"}  ${n}${ok?"":"\n        → "+d}`); }
console.log(bad?`\n${bad} FAILED`:"\nall assertions passed");
await b.close(); srv.close(); process.exit(bad?1:0);
