import puppeteer from 'puppeteer-core';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
function findChrome(){const b=path.join(process.env.HOME,'.cache/puppeteer/chrome');
 for(const v of readdirSync(b).sort().reverse()){const p=path.join(b,v,'chrome-mac-arm64','Google Chrome for Testing.app','Contents/MacOS/Google Chrome for Testing');if(existsSync(p))return p;}return null;}
const browser = await puppeteer.launch({ executablePath: findChrome(), headless:'new', args:['--no-sandbox'] });
const page = await browser.newPage();
page.on('pageerror', e=>console.log('PAGEERROR', String(e).slice(0,200)));
page.on('console', m=>{ const t=m.text(); if(/abort|error|missing|bridge|socket|HTTP|GET|Exception|jvm/i.test(t)) console.log('C>',t.slice(0,200)); });
await page.goto('http://localhost:8130/',{waitUntil:'load'});
await page.select('#template','http');
await page.click('#run');
await new Promise(r=>setTimeout(r, 150000));
const txt = await page.evaluate(()=>document.getElementById('console').innerText);
console.log('=== FULL CONSOLE (last 40 lines) ===');
console.log(txt.split('\n').slice(-25).join('\n'));
await browser.close();
