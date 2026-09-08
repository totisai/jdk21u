import puppeteer from 'puppeteer-core';
import { readdirSync, existsSync } from 'node:fs'; import path from 'node:path';
function fc(){const b=path.join(process.env.HOME,'.cache/puppeteer/chrome');for(const v of readdirSync(b).sort().reverse()){const p=path.join(b,v,'chrome-mac-arm64','Google Chrome for Testing.app','Contents/MacOS/Google Chrome for Testing');if(existsSync(p))return p;}return null;}
const b=await puppeteer.launch({executablePath:fc(),headless:'new',protocolTimeout:180000,args:['--no-sandbox']});
const p=await b.newPage(); await p.setViewport({width:520,height:520});
await p.goto('http://localhost:8130/jit-swing.html',{waitUntil:'load'});
await new Promise(r=>setTimeout(r,45000));
const st=await p.evaluate(()=>({jit:window.__jit||0, frames:window.__frames||0}));
console.log('jit-compiled methods:', st.jit, ' frames rendered:', st.frames);
await p.screenshot({path:'out/jit_swing.png'}); console.log('shot -> out/jit_swing.png');
await b.close();
