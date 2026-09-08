import puppeteer from 'puppeteer-core';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
function findChrome(){const b=path.join(process.env.HOME,'.cache/puppeteer/chrome');
 for(const v of readdirSync(b).sort().reverse()){const p=path.join(b,v,'chrome-mac-arm64','Google Chrome for Testing.app','Contents/MacOS/Google Chrome for Testing');if(existsSync(p))return p;}return null;}
const mode = process.argv[2]||'minecraft';
const secs = parseInt(process.argv[3]||'90',10);
const out = process.argv[4]||`out/page_${mode}.png`;
const browser = await puppeteer.launch({ executablePath: findChrome(), headless:'new',
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--use-gl=angle','--no-sandbox','--enable-features=SharedArrayBuffer'] });
const page = await browser.newPage();
await page.setViewport({width:1000,height:700});
page.on('console', m=>{ const t=m.text(); if(/\[jvm\]|error|Exception|render|frames|wgl|lwjgl/i.test(t)) console.log('  page>',t.slice(0,160)); });
await page.goto('http://localhost:8130/',{waitUntil:'load'});
await page.select('#template', mode);
await page.click('#run');
console.log(`running ${mode} for ${secs}s...`);
await new Promise(r=>setTimeout(r, secs*1000));
// screenshot whichever canvas is visible
const shot = await page.evaluate(()=>{ const g=document.getElementById('glsurface'), a=document.getElementById('awtcanvas');
  const el = (g && g.style.display!=='none')?g:a; return el? el.id : 'none'; });
console.log('visible canvas:', shot);
await page.screenshot({path: out});
console.log('screenshot ->', out);
await browser.close();
