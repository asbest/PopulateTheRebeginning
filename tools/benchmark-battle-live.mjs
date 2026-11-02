import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const firstFrameDelayMs=Number(process.argv.find(a=>a.startsWith('--first-frame-delay-ms='))?.split('=')[1]||0);
if(!Number.isFinite(firstFrameDelayMs)||firstFrameDelayMs<0||firstFrameDelayMs>60000)throw new Error('Invalid first-frame delay');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(async ({original,firstFrameDelayMs})=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];state.matchSettings.peaceTimeMinutes=0;
  // Keep terrain streaming/loading out of the combat measurement.
  const settle=performance.now();
  while(performance.now()-(state.lastTerrainBuildAt||0)<1600&&performance.now()-settle<15000)
   await new Promise(r=>requestAnimationFrame(r));
  const p=state.shaman.mesh.position.clone(),fighters=[];
  for(let i=0;i<64;i++){
   const unit=new Humanoid(i%2,i%5===0?'firewarrior':'warrior',p.x+(i%8-4)*1.3,p.z+(Math.floor(i/8)-4)*1.3);
   unit.maxHp=unit.hp=100000;unit.nextTargetCheck=Infinity;state.units.push(unit);fighters.push(unit);
  }
  for(let i=0;i<fighters.length;i++){fighters[i].state='combat';fighters[i].attackTarget=fighters[i^1];}
  state.selectedUnits=[];state.cameraLookAt.copy(p);updateCameraPosition();gameTestAPI.SpatialHash.update();
  gameTestAPI.CharacterBatches.enabled=!original;
  for(let frame=0;frame<20;frame++)await new Promise(r=>requestAnimationFrame(r));
  state.renderer.render(state.scene,state.camera);gameTestAPI.BattleProfiler.reset();
  const frames=[];let before=performance.now(),start=before,lastSalvo=before,peakCalls=0,peakBacklog=0,peakParticles=0,shots=0;
  state.isPaused=false;
  // Software WebGL on CI can spend longer than the target window in its first
  // draw. Still collect a real sample population; retain that stall in timings.
  const minimumFrames=60,targetDurationMs=5000,maximumDurationMs=120000;
  while(performance.now()-start<maximumDurationMs&&(performance.now()-start<targetDurationMs||frames.length<minimumFrames)){
   await new Promise(r=>requestAnimationFrame(r));
   if(!frames.length&&firstFrameDelayMs)await new Promise(r=>setTimeout(r,firstFrameDelayMs));
   const now=performance.now();frames.push(now-before);before=now;
   if(now-lastSalvo>=500){
    lastSalvo=now;
    for(let i=0;i<8;i++){
     const target=fighters[1+i*2].mesh.position.clone().add(new THREE.Vector3(0,1,0));
     state.projectiles.push(new gameTestAPI.Fireball(p.clone().add(new THREE.Vector3(-8,4,i*.15)),target,0,2,0,false,true));shots++;
    }
   }
   peakCalls=Math.max(peakCalls,state.renderer.info.render.calls);peakBacklog=Math.max(peakBacklog,gameTestAPI.BattleWork.stats.queued);
   peakParticles=Math.max(peakParticles,state.particles.length);
  }
  state.isPaused=true;frames.sort((a,b)=>a-b);
  return {mode:original?'original':'optimized',fighters:fighters.length,shots,frames:frames.length,minimumFrames,
   durationMs:performance.now()-start,maxFrameMs:frames.at(-1),timedOut:frames.length<minimumFrames,
   medianFrameMs:frames[Math.floor(frames.length*.5)],p95FrameMs:frames[Math.floor(frames.length*.95)],
   peakCalls,peakBacklog,peakParticles,phases:gameTestAPI.BattleProfiler.report(),
   work:{...gameTestAPI.BattleWork.stats},batch:{...gameTestAPI.CharacterBatches.stats},
   survivors:fighters.filter(u=>u.state!=='dead').length};
 },{original:process.argv.includes('--original'),firstFrameDelayMs});
 if(errors.length||result.survivors!==64||result.frames<result.minimumFrames||result.timedOut||result.shots<8)throw new Error(JSON.stringify({errors,result}));
 console.log(JSON.stringify(result));
}finally{await browser.close();}
