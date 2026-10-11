import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1920,height:1080},deviceScaleFactor:1});
    const errors=[];
    page.on('pageerror',e=>errors.push(String(e)));
    await page.goto('http://127.0.0.1:8765/art/characters.html?static',{waitUntil:'load'});
    await page.waitForFunction(()=>window.characterGallery?.ready,{},{timeout:60000});
    await page.waitForTimeout(400);
    const destination=path.resolve('test-results/characters-preview.png');
    await fs.mkdir(path.dirname(destination),{recursive:true});
    await page.screenshot({path:destination});
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(destination);
} finally {await browser.close();}
