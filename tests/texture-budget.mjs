import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{}),
 ...(process.argv.includes('--software-gl')?{args:['--use-gl=angle','--use-angle=swiftshader']}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=false;
  const budget=Art.resources,frame=budget.frame,wasPaused=state.isPaused;
  const start=performance.now(),deferred=budget.stats.deferred;
  let complete=false;
  // Model the runner's persistently expensive software-rendered frames on any GPU.
  budget.frame=(cpuMs,paused,...rest)=>frame(40,paused,...rest);
  budget.frame(40,false);
  const promotion=Art.promoteTextures().then(()=>{complete=true;});
  const diagnostic=()=>JSON.stringify({textures:Art.textureStatus,budget:budget.stats,paused:state.isPaused});
  const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(resolve));
  try{
   while(!budget.stats.queued||!Art.textureStatus.loaded){
    if(performance.now()-start>60000)throw Error('HD download did not reach the GPU queue: '+diagnostic());
    await nextFrame();
   }
   for(let i=0;i<5;i++)await nextFrame();
   if(complete||budget.stats.deferred<=deferred)throw Error('Busy play did not defer HD uploads: '+diagnostic());
   // A deterministic asset inspection must pause before awaiting the GPU queue.
   state.isPaused=true;
   while(!complete){
    if(performance.now()-start>120000)throw Error('Paused HD preparation did not finish: '+diagnostic());
    await nextFrame();
   }
   await promotion;
   return {deferred:budget.stats.deferred-deferred,promoted:Art.textureStatus.promoted,
    dimensions:Object.fromEntries(Object.entries(Characters.tiles).map(([key,t])=>[key,t.image.width]))};
  }finally{budget.frame=frame;state.isPaused=wasPaused;}
 });
 assert.deepEqual(errors,[]);
 assert(result.deferred>0&&result.promoted>0);
 assert(result.dimensions.skin>=1024&&result.dimensions.cloth>=1024);
 console.log('PASS busy gameplay defers HD uploads; paused asset inspection finishes with full-resolution textures '+JSON.stringify(result));
}finally{await browser.close();}
