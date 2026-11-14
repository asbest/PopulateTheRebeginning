import {createRequire} from 'node:module';
import {seedWorld,startManualSimulation} from './fixtures/seed-world.mjs';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{}),
 ...(process.argv.includes('--software-gl')?{args:['--use-gl=angle','--use-angle=swiftshader']}:{})});
try{
 const page=await browser.newPage(),errors=[];await seedWorld(page,98217);page.on('pageerror',e=>errors.push(String(e)));
 const cpuRate=Number(process.argv.find(arg=>arg.startsWith('--cpu-throttle='))?.split('=')[1]||1);
 if(cpuRate>1){const session=await page.context().newCDPSession(page);await session.send('Emulation.setCPUThrottlingRate',{rate:cpuRate});}
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 await startManualSimulation(page,98217);
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;
  // This fixture checks Worker transport, exact paths and unchanged physics,
  // not rendering. Do not let software-GPU redraws consume Worker deadlines.
  state.renderer.render=()=>{};window.requestAnimationFrame=()=>0;
  const {BattleWork:work,PathWorker:worker}=gameTestAPI,p=state.shaman.mesh.position;
  for(let x=Math.floor(p.x)-20;x<=p.x+20;x++)for(let z=Math.floor(p.z)-20;z<=p.z+20;z++)state.terrainMods.set(`${x},${z}`,8-gameTestAPI.getBaseHeight(x,z));
  state.heightCache.clear();gameTestAPI.updateChunks(true);
  // The Worker deliberately omits trees; tree conflicts use the tested main-
  // thread fallback. Isolate building navigation for this exact-path comparison.
  for(const chunk of Object.values(state.chunks))for(const tree of chunk.userData?.trees||[])tree.mesh.visible=false;
  const school=gameTestAPI.createBuilding('warrior',p.x+6,p.z,0,false,true);school.update(school.totalBuildTime+1);gameTestAPI.BuildingSpatialHash.update();
  const unit=new Humanoid(0,'warrior',p.x,p.z),target=new Humanoid(1,'warrior',p.x+12,p.z);
  state.units.push(unit,target);unit.state='combat';unit.attackTarget=target;
  const reference=()=>Pathfinder.findPath(unit.mesh.position,target.mesh.position,false,unit.height,false,false)?.map(p=>[p.x,p.z])??null;
  const expected=reference();if(!expected?.length)throw new Error('No reference route around the building');
  // Prime the actual Worker with a real round trip before measuring combat's
  // 500 ms decision budget. Module import time is not path computation time.
  await new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>finish(new Error('Worker startup round trip timed out')),10000);
   const tick=setInterval(()=>worker.update(),20);
   function finish(error){clearTimeout(timer);clearInterval(tick);error?reject(error):resolve();}
   if(!worker.request(p,p,false,false,false,(_path,fallback)=>finish(fallback?new Error('Worker startup used fallback'):null)))
    finish(new Error('Worker unavailable during startup'));
  });
  let requests=0;const original=worker.request;
  worker.request=function(...args){requests++;return original.apply(this,args);};
  const body=JSON.stringify(unit.rigidBody.translation());
  work.request(unit,target);work.begin();work.end();
  const started=performance.now();
  while(!unit.path?.length&&unit.state==='combat'){
   await new Promise(r=>setTimeout(r,20));worker.update();work.begin();work.end();
   if(performance.now()-started>12000)throw new Error('Combat Worker never returned: '+JSON.stringify({work:work.stats,disabled:worker.disabled,pending:worker.pending.size,state:unit.state}));
  }
  if(!requests||work.stats.workerPaths<1||worker.disabled||JSON.stringify(unit.path.map(p=>[p.x,p.z]))!==JSON.stringify(expected))throw new Error('Worker path differs from original pathfinder: '+JSON.stringify({requests,stats:work.stats,disabled:worker.disabled,actual:unit.path.map(p=>[p.x,p.z]),expected}));
  if(JSON.stringify(unit.rigidBody.translation())!==body)throw new Error('Path worker changed physics body');
  const workerPaths=work.stats.workerPaths;
  worker.disable();worker.update();work.clear();unit.path=[];unit.state='combat';unit.attackTarget=target;
  work.request(unit,target);work.begin();work.end();
  if(JSON.stringify(unit.path.map(p=>[p.x,p.z]))!==JSON.stringify(reference()))throw new Error('Worker fallback changed the combat route');
  return {requests,workerPaths,fallbackPaths:work.stats.fallbackPaths,pathPoints:unit.path.length,physicsUnchanged:body===JSON.stringify(unit.rigidBody.translation())};
 });
 if(errors.length||!result.physicsUnchanged)throw new Error(JSON.stringify({errors,result}));
 console.log('PASS Actual combat Worker and synchronous fallback match the original pathfinder without touching physics '+JSON.stringify(result));
}finally{await browser.close();}
