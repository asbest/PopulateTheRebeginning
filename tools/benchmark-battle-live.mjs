import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const firstFrameDelayMs=Number(process.argv.find(a=>a.startsWith('--first-frame-delay-ms='))?.split('=')[1]||0);
if(!Number.isFinite(firstFrameDelayMs)||firstFrameDelayMs<0||firstFrameDelayMs>60000)throw new Error('Invalid first-frame delay');
const ciRendering=process.argv.includes('--ci-rendering')||process.env.GITHUB_ACTIONS==='true';
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{}),
 ...(process.argv.includes('--software-gl')?{args:['--use-gl=angle','--use-angle=swiftshader']}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(async ({original,firstFrameDelayMs,ciRendering,gpuTiming})=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];state.matchSettings.peaceTimeMinutes=0;
  // The hosted runner uses software WebGL. Bound pixel/shadow fill, while
  // retaining all actors, actor geometry, animation, physics, PBR and battle effects.
  // Full-resolution image parity/draw budgets are checked by benchmark-armies.
  if(ciRendering){
   state.graphicsQuality.maxPixelRatio=.25;state.graphicsQuality.dynamicScale=1;
   state.renderer.setPixelRatio(.25);
   const shadow=state.sunLight.shadow;shadow.mapSize.set(512,512);
   if(shadow.map){shadow.map.dispose();shadow.map=null;}
   const beforeRender=state.scene.onBeforeRender;
   state.scene.onBeforeRender=function(...args){
    // Keep the live battle fixture focused on actors/effects rather than
    // millions of decorative grass/flower triangles across the full island.
    const focus=state.cameraLookAt;
    for(const [key,chunk] of Object.entries(state.chunks)){
     const [cx,cz]=key.split(',').map(Number),chunkSize=chunk.children[0].geometry.parameters.width;
     chunk.visible=Math.abs(cx-Math.round(focus.x/chunkSize))<=1&&Math.abs(cz-Math.round(focus.z/chunkSize))<=1;
     for(const layer of Object.values(chunk.userData?.groundCover||{}))if(layer?.mesh)layer.mesh.visible=false;
     const flowers=chunk.userData?.flowers;
     if(flowers&&!Array.isArray(flowers))for(const key of ['stems','centers','petals','tulips'])if(flowers[key])flowers[key].visible=false;
     if(chunk.userData?.palms?.mesh)chunk.userData.palms.mesh.visible=false;
     for(const tree of chunk.userData?.trees||[])if(tree.mesh)tree.mesh.visible=false;
    }
    beforeRender?.apply(this,args);
   };
  }
  // Keep terrain streaming/loading out of the combat measurement.
  state.cameraLookAt.copy(state.shaman.mesh.position);updateCameraPosition();
  const terrainReady=()=>{
   const {CHUNK_SIZE,RENDER_DISTANCE:r}=gameTestAPI.CONFIG.TERRAIN;
   const cx=Math.round(state.cameraLookAt.x/CHUNK_SIZE),cz=Math.round(state.cameraLookAt.z/CHUNK_SIZE);
   for(let x=-r;x<=r;x++)for(let z=-r;z<=r;z++)if(!state.chunks[`${cx+x},${cz+z}`])return false;
   return true;
  };
  const settle=performance.now();
  const draw=state.renderer.render;
  // CPU fixture preparation must not compete with software WebGL or turn a
  // finished Worker job into a false timeout while the main thread is drawing.
  // All rendering is restored for the warmup, measured battle and A/B checks.
  if(ciRendering)state.renderer.render=()=>{};
  try{
   while((!terrainReady()||performance.now()-(state.lastTerrainBuildAt||0)<1600)&&performance.now()-settle<30000)
    await new Promise(r=>requestAnimationFrame(r));
  }finally{state.renderer.render=draw;}
  const terrainSettled=terrainReady(),terrainSetupMs=performance.now()-settle;
  const p=state.shaman.mesh.position.clone(),fighters=[];
  for(let i=0;i<64;i++){
   const unit=new Humanoid(i%2,i%5===0?'firewarrior':'warrior',p.x+(i%8-4)*1.3,p.z+(Math.floor(i/8)-4)*1.3);
   unit.maxHp=unit.hp=100000;unit.nextTargetCheck=Infinity;state.units.push(unit);fighters.push(unit);
  }
  for(let i=0;i<fighters.length;i++){fighters[i].state='combat';fighters[i].attackTarget=fighters[i^1];}
  state.selectedUnits=[];state.cameraLookAt.copy(p);updateCameraPosition();gameTestAPI.SpatialHash.update();
  gameTestAPI.CharacterBatches.enabled=!original;
  for(let frame=0;frame<20;frame++)await new Promise(r=>requestAnimationFrame(r));
  state.renderer.render(state.scene,state.camera);gameTestAPI.BattleProfiler.reset();gameTestAPI.GpuTimer.enabled=gpuTiming;gameTestAPI.GpuTimer.reset();
  const frames=[];let before=performance.now(),start=before,lastSalvo=before,peakCalls=0,peakTriangles=0,peakBacklog=0,peakParticles=0,shots=0;
  state.isPaused=false;
  // Software WebGL on CI can spend longer than the target window in its first
  // draw. Still collect a real sample population; retain that stall in timings.
  const minimumFrames=60,targetDurationMs=5000,maximumDurationMs=ciRendering?300000:120000;
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
   peakTriangles=Math.max(peakTriangles,state.renderer.info.render.triangles);
   peakCalls=Math.max(peakCalls,state.renderer.info.render.calls);peakBacklog=Math.max(peakBacklog,gameTestAPI.BattleWork.stats.queued);
   peakParticles=Math.max(peakParticles,state.particles.length);
  }
  state.isPaused=true;frames.sort((a,b)=>a-b);
  const durationMs=performance.now()-start,scenery={...gameTestAPI.SceneryBatches.stats};
  // Compare the very same frozen battle pose/effects at identical resolution.
  // Synchronization is confined to this diagnostic, never the real game loop.
  const compareScenery=enabled=>{
   gameTestAPI.SceneryBatches.enabled=enabled;
   const times=[];let calls=0;
   for(let i=0;i<4;i++){
    const start=performance.now();state.renderer.render(state.scene,state.camera);state.renderer.getContext().finish();
    if(i)times.push(performance.now()-start);calls=state.renderer.info.render.calls;
   }
   times.sort((a,b)=>a-b);return {medianMs:times[1],calls};
  };
  const sameBattle={sceneryOff:compareScenery(false),sceneryOn:compareScenery(true)};
  const gl=state.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
   backgroundVegetation:ciRendering?'omitted':'full',terrainDrawRadiusChunks:ciRendering?1:null,mode:original?'original':'optimized',renderingProfile:ciRendering?'ci-bounded':'native',
   renderWidth:state.renderer.domElement.width,renderHeight:state.renderer.domElement.height,shadowSize:state.sunLight.shadow.mapSize.width,
   terrainSettled,terrainSetupMs,fighters:fighters.length,shots,frames:frames.length,minimumFrames,
   durationMs,maximumDurationMs,maxFrameMs:frames.at(-1),timedOut:frames.length<minimumFrames,
   medianFrameMs:frames[Math.floor(frames.length*.5)],p95FrameMs:frames[Math.floor(frames.length*.95)],
   sameBattle,gpuTime:{enabled:gpuTiming,...gameTestAPI.GpuTimer.report()},scenery,terrainWorker:{...gameTestAPI.TerrainStream.stats},
   peakCalls,peakTriangles,peakBacklog,peakParticles,phases:gameTestAPI.BattleProfiler.report(),
   work:{...gameTestAPI.BattleWork.stats},batch:{...gameTestAPI.CharacterBatches.stats},
   survivors:fighters.filter(u=>u.state!=='dead').length};
 },{original:process.argv.includes('--original'),firstFrameDelayMs,ciRendering,gpuTiming:process.argv.includes('--gpu-timing')});
 if(errors.length||!result.terrainSettled||result.survivors!==64||result.frames<result.minimumFrames||result.timedOut||result.shots<8||result.sameBattle.sceneryOn.calls>result.sameBattle.sceneryOff.calls)throw new Error(JSON.stringify({errors,result}));
 console.log(JSON.stringify(result));
}finally{await browser.close();}
