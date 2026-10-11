import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):require('playwright');
const root=path.resolve(import.meta.dirname,'..'),dir=path.join(root,'test-results','motion-frames');await fs.mkdir(dir,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:540}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:8765/art/characters.html');await page.waitForFunction(()=>window.characterGallery?.ready&&characterGallery.units[0].gait);
 const phase=await page.evaluate(()=>characterGallery.units[0].gait.phase);
 for(let i=0;i<56;i++){
  if(i===14)await page.locator('#view').click();
  if(i===28)await page.locator('#pace').click();
  if(i===42){await page.locator('#pace').click();await page.locator('#view').click();await page.locator('#slope').click();}
  await page.waitForTimeout(90);await page.screenshot({path:path.join(dir,String(i).padStart(3,'0')+'.png')});
 }
 const after=await page.evaluate(()=>characterGallery.units[0].gait.phase);
 await page.locator('#walk').click();await page.waitForTimeout(800);
 const stopped=await page.evaluate(()=>characterGallery.units[0].gait.speed);
 if(after<=phase||stopped>.01||errors.length)throw new Error(JSON.stringify({phase,after,stopped,errors}));
 console.log(JSON.stringify({frames:56,phase,after,stopped,errors}));
}finally{await browser.close();}
