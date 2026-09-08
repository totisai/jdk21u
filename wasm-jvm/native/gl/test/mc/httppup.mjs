import puppeteer from 'puppeteer-core';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
function findChrome(){const b=path.join(process.env.HOME,'.cache/puppeteer/chrome');
 for(const v of readdirSync(b).sort().reverse()){const p=path.join(b,v,'chrome-mac-arm64','Google Chrome for Testing.app','Contents/MacOS/Google Chrome for Testing');if(existsSync(p))return p;}return null;}
const secs = parseInt(process.argv[2]||'50',10);
const browser = await puppeteer.launch({ executablePath: findChrome(), headless:'new',
  args:['--no-sandbox','--enable-features=SharedArrayBuffer'] });
const page = await browser.newPage();
page.on('console', m=>{ const t=m.text(); if(/\[jvm\]|HTTP|GET |Server:|fetched|socket|bridge|Exception|error|\| /i.test(t)) console.log(' >',t.slice(0,200)); });
await page.goto('http://localhost:8130/',{waitUntil:'load'});
await page.select('#template','http');
await page.click('#run');
console.log(`running http for ${secs}s...`);
await new Promise(r=>setTimeout(r, secs*1000));
const consoleText = await page.evaluate(()=>document.getElementById('console').innerText);
console.log('=== CONSOLE PANEL ===');
console.log(consoleText.split('\n').filter(l=>/HTTP|GET|Server|fetched|\||socket|bridge|Exception|error|Compiled|ran in/i.test(l)).slice(-25).join('\n'));
await browser.close();
