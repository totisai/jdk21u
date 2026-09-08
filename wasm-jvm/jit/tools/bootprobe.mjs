import puppeteer from 'puppeteer-core';
import { readdirSync, existsSync } from 'node:fs'; import path from 'node:path';
function fc(){const b=path.join(process.env.HOME,'.cache/puppeteer/chrome');for(const v of readdirSync(b).sort().reverse()){const p=path.join(b,v,'chrome-mac-arm64','Google Chrome for Testing.app','Contents/MacOS/Google Chrome for Testing');if(existsSync(p))return p;}return null;}
const JIT = process.env.JIT === '1';
const URL = process.env.URL || 'http://localhost:8131/poc/index.html';
const b=await puppeteer.launch({executablePath:fc(),headless:'new',protocolTimeout:200000,args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:1000,height:700});
const t0=Date.now();
const stamp=()=>((Date.now()-t0)/1000).toFixed(1).padStart(6);
p.on('console', m => { const t=m.text(); console.log(stamp(), t.slice(0,200)); });
p.on('pageerror', e => console.log(stamp(),'PAGEERR', (e && e.stack ? e.stack : String(e)).slice(0,400)));
p.on('requestfailed', r => console.log(stamp(),'REQFAIL', r.url().slice(-80), r.failure()?.errorText));
p.on('response', r => { if(r.status()>=400) console.log(stamp(),'HTTP'+r.status(), r.url().slice(-80)); });
let fullData=new Set(), rangeData=new Set();
p.on('request', r => { const u=r.url(); if(!u.endsWith('.data')) return;
  const rng = r.headers()['range']; const n=u.split('/').pop();
  if(rng) rangeData.add(n); else fullData.add(n); });
globalThis.__report = () => console.log(stamp(),`[net] full .data packs=${fullData.size} [${[...fullData].join(',')}]  |  module-info range-fetches=${rangeData.size}`);
await p.goto(URL,{waitUntil:'load'});
console.log(stamp(),'== loaded, jit=',JIT,' clicking demo ==');
await p.evaluate((jit)=>{ document.querySelector('#jit').checked=jit; document.querySelector('#demo').click(); }, JIT);
// poll the on-screen log every 2s; report last line + whether main thread responds
let lastLen=-1, stuckSince=0;
for(let i=0;i<70;i++){
  await new Promise(r=>setTimeout(r,2000));
  let snap;
  try { snap = await Promise.race([
    p.evaluate(()=>({ len:(document.querySelector('#log')||{}).textContent?.length||0,
                      tail:((document.querySelector('#log')||{}).textContent||'').slice(-160),
                      running: !!(window.__running) })),
    new Promise((_,rej)=>setTimeout(()=>rej(new Error('MAIN-FROZEN')),3000)) ]); }
  catch(e){ console.log(stamp(),'[probe] main-thread not responding ('+e.message+')'); continue; }
  console.log(stamp(),'[probe] logLen='+snap.len+' tail="'+snap.tail.replace(/\n/g,'\\n').slice(-90)+'"');
  if(/renderer|frame|window shown|JarApp|main\(\) returned|Exception|Error/i.test(snap.tail)){ console.log(stamp(),'[probe] milestone reached'); }
  if(i===6) globalThis.__report();
  if(i>=Number(process.env.POLLS||8)) break;
}
globalThis.__report();
try{ await p.screenshot({path:'out/bootprobe.png'}); console.log(stamp(),'shot -> out/bootprobe.png'); }catch(e){}
await b.close();
