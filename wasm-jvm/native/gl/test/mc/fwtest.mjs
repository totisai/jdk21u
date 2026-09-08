import puppeteer from 'puppeteer-core';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
function findChrome(){const b=path.join(process.env.HOME,'.cache/puppeteer/chrome');
 for(const v of readdirSync(b).sort().reverse()){const p=path.join(b,v,'chrome-mac-arm64','Google Chrome for Testing.app','Contents/MacOS/Google Chrome for Testing');if(existsSync(p))return p;}return null;}
const page_name = process.argv[2], secs = parseInt(process.argv[3]||'40',10), clickSel = process.argv[4]||'', shot = process.argv[5]||'';
const browser = await puppeteer.launch({ executablePath: findChrome(), headless:'new',
  args:['--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox'] });
const page = await browser.newPage(); await page.setViewport({width:1000,height:700});
page.on('pageerror', e=>console.log('PAGEERR', String(e).slice(0,160)));
await page.goto(`http://localhost:8130/examples/${page_name}`, {waitUntil:'load'});
if (clickSel) { await new Promise(r=>setTimeout(r,1500)); await page.click(clickSel); }
await new Promise(r=>setTimeout(r, secs*1000));
const outText = await page.evaluate(()=>{const o=document.getElementById('out');return o?o.innerText:'';});
if (outText) console.log('=== #out ===\n'+outText.split('\n').slice(-14).join('\n'));
if (shot) { await page.screenshot({path: shot}); console.log('shot -> '+shot); }
await browser.close();
