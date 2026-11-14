import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
const arg=process.argv.find(value=>value.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const base=process.env.GAME_URL||'http://127.0.0.1:8765';
async function ready(page){await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});}
try{
 for(const mode of ['low','unreachable','local']){
  const context=await browser.newContext(),page=await context.newPage(),errors=[],images=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>{if(/\.(png|webp|ktx2)(\?|$)/.test(request.url())&&!request.url().includes('key-art'))images.push(request.url());});
  if(mode==='low')await page.addInitScript(()=>localStorage.setItem('graphics-quality','low'));
  if(mode==='unreachable')await page.route(/\.(png|webp|ktx2)(\?|$)/,route=>route.abort('connectionrefused'));
  const url=mode==='local'?pathToFileURL(path.resolve(import.meta.dirname,'../PopulateTheRebeginning.html')).href:base+'/PopulateTheRebeginning.html';
  await page.goto(url+'?test=1',{waitUntil:'load',timeout:90000});await ready(page);
  const result=await page.evaluate(()=>{
   const surface=Art.textures.wood;
   if(!surface.userData.procedural||surface.image.width!==64)throw Error('Procedural surface was not selected');
   const pixels=surface.image.getContext('2d').getImageData(0,0,64,64).data;
   const values=new Set();for(let i=0;i<pixels.length;i+=4)values.add(pixels[i]);
   if(values.size<4)throw Error('Surface is a flat placeholder');
   const unit=new Humanoid(0,'warrior',state.shaman.mesh.position.x+2,state.shaman.mesh.position.z);
   state.units.push(unit);
   if(!unit.legL||!state.physicsWorld)throw Error('Gameplay or physics failed');
   return {surfacePixels:surface.image.width,tones:values.size,units:state.units.length};
  });
  if(mode==='low'&&images.length)throw Error('Low fetched image surfaces '+images.join(','));
  if(errors.length)throw Error(mode+': '+errors.join('\n'));
  console.log('PASS procedural '+mode,result);
  await context.close();
 }
 const context=await browser.newContext(),page=await context.newPage();
 await page.goto(base+'/PopulateTheRebeginning.html?test=1&cache=1');await ready(page);
 await page.evaluate(async()=>{
  await navigator.serviceWorker.ready;
  await new Promise(resolve=>navigator.serviceWorker.controller?resolve():navigator.serviceWorker.addEventListener('controllerchange',resolve,{once:true}));
  const {cacheCurrentAssets}=await import('./art/asset-cache.js');
  await cacheCurrentAssets();
 });
 await page.waitForFunction(async()=>{
  for(const name of await caches.keys()){
   const cache=await caches.open(name),keys=await cache.keys();
   if(keys.some(key=>key.url.includes('PopulateTheRebeginning.html'))&&keys.some(key=>key.url.includes('vendor/three.module.js')))return true;
  }
  return false;
 },null,{timeout:60000});
 await context.setOffline(true);
 await page.reload({waitUntil:'load',timeout:90000});await ready(page);
 if(!await page.evaluate(()=>window.POPULATE_OFFLINE&&Art.textures.wood.userData.procedural))throw Error('Offline reload did not select procedural materials');
 console.log('PASS cached game starts offline with procedural surfaces');
 await context.close();
}finally{await browser.close();}
