import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {seedWorld,startManualSimulation} from './fixtures/seed-world.mjs';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 await seedWorld(page,98217);
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 await startManualSimulation(page,98217);
 const result=await page.evaluate(async()=>{
  const {CharacterBatches:batch}=gameTestAPI,renderer=state.renderer,gl=renderer.getContext();
  const origin=state.shaman.mesh.position.clone();
  state.selectedUnits=[];state.viewScale=24;
  gameTestAPI.updateCameraZoom();state.cameraLookAt.copy(origin);updateCameraPosition();
  const units=[];
  for(let i=0;i<60;i++){
   const unit=new Humanoid(i%3,['warrior','firewarrior','preacher'][i%3],
    origin.x+(i%10-5)*1.5,origin.z+(Math.floor(i/10)-3)*1.5);
   units.push(unit);state.units.push(unit);
  }
  const houses=[];
  for(let i=0;i<18;i++){
   const building=gameTestAPI.createBuilding(['hut','warrior','fire','temple','tower','shipyard'][i%6],
    origin.x+(i%6-3)*9,origin.z+12+Math.floor(i/6)*8,i%3,false,true);
   building.underConstruction=false;building.visualMesh.scale.y=1;houses.push(building);
  }
  await Art.blender.loadAll();
  await new Promise(resolve=>setTimeout(resolve,0));
  const originalBodies=units.map(u=>JSON.stringify(u.rigidBody.translation()));
  const snapshots=[];
  let material;
  houses[0].visualMesh.traverse(node=>{if(!material&&node.material?.normalMap)material=node.material;});
  if(!material)throw Error('No detailed building material');
  const lod=houses[0].visualMesh.getObjectByProperty('type','LOD');
  for(const tier of ['high','medium','low','ultra','high']){
   setGraphicsQuality(tier);
   renderer.render(state.scene,state.camera);gl.finish();
   const times=[];
   for(let frame=0;frame<18;frame++){
    const start=performance.now();
    renderer.render(state.scene,state.camera);gl.finish();
    if(frame>=3)times.push(performance.now()-start);
   }
   times.sort((a,b)=>a-b);
   snapshots.push({tier,p95:times[Math.ceil(times.length*.95)-1],calls:renderer.info.render.calls,
    triangles:renderer.info.render.triangles,pixels:renderer.domElement.width*renderer.domElement.height,
    shadows:renderer.shadowMap.enabled,shadowSize:state.sunLight.shadow.mapSize.width,maxPixelRatio:state.graphicsQuality.maxPixelRatio,
    normal:!!material.normalMap,lodDistance:lod.levels[1].distance});
  }
  const [high,medium,low,ultra,restored]=snapshots;
  if(low.shadows||!medium.shadows||medium.normal||low.normal||!high.normal||
     low.pixels>=medium.pixels||medium.maxPixelRatio>=high.maxPixelRatio||high.maxPixelRatio>=ultra.maxPixelRatio||
     low.triangles>=high.triangles||medium.lodDistance>=high.lodDistance||
     restored.lodDistance!==high.lodDistance||!restored.normal)
   throw Error('Quality budgets or restoration failed '+JSON.stringify(snapshots));
  if(units.some((u,i)=>JSON.stringify(u.rigidBody.translation())!==originalBodies[i]))
   throw Error('Rendering changed physics');
  setGraphicsQuality('low');
  const frames=[];
  state.matchSettings.peaceTimeMinutes=0;state.matchElapsed=999;
  for(const [i,unit] of units.entries()){
   unit.hp=unit.maxHp=100000;
   unit.attackTarget=units[(i+1)%units.length];unit.state='combat';
   unit.nextTargetCheck=Infinity;
  }
  for(let frame=0;frame<90;frame++){
   const start=performance.now(),dt=1/60;
   gameTestAPI.BattleWork.begin();
   gameTestAPI.SpatialHash.update();gameTestAPI.BuildingSpatialHash.update();
   state.physicsWorld.timestep=dt;state.physicsWorld.step();
   for(const unit of units)unit.update(dt);
   state.preacherConversion.update(dt);
   for(const building of houses)building.update(dt);
   for(let i=state.projectiles.length-1;i>=0;i--)
    if(!state.projectiles[i].update(dt))state.projectiles.splice(i,1);
   for(let i=state.particles.length-1;i>=0;i--)
    if(!state.particles[i].update(dt))state.particles.splice(i,1);
   gameTestAPI.FireballFxManager.update(dt);gameTestAPI.BattleWork.end();
   renderer.render(state.scene,state.camera);gl.finish();
   if(frame>15)frames.push(performance.now()-start);
  }
  frames.sort((a,b)=>a-b);
  const battle={frames:frames.length,p95:frames[Math.ceil(frames.length*.95)-1],
   median:frames[Math.floor(frames.length*.5)]};
  const before=Art.textureStatus.promoted;
  Art.streamTextures(state.scene,origin,100);
  await new Promise(resolve=>setTimeout(resolve,100));
  if(Art.textureStatus.promoted!==before)throw Error('Low tier requested HD textures');
  const {adaptGraphicsBudget,graphicsSettings}=await import('./art/graphics-settings.js');
  let scale=1;
  for(let i=0;i<10;i++)scale=adaptGraphicsBudget(20,scale);
  if(scale!==graphicsSettings.profile.minScale||graphicsSettings.detailScale!==.3)
   throw Error('Adaptive budgets did not bound slow frames');
  for(let i=0;i<40;i++)scale=adaptGraphicsBudget(60,scale);
  if(scale!==1||graphicsSettings.detailScale!==1)throw Error('Adaptive budgets did not recover');
  setGraphicsQuality('high');
  if(batch.stats.fallback||gameTestAPI.SceneryBatches.stats.fallback)throw Error('Instancing fallback');
  return {units:units.length,buildings:houses.length,snapshots,battle};
 });
 const low=await browser.newPage({viewport:{width:960,height:600}});
 low.on('pageerror',error=>errors.push(String(error)));
 await low.addInitScript(()=>localStorage.setItem('graphics-quality','low'));
 await low.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await low.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 await low.evaluate(()=>{
  if(state.graphicsQuality.tier!=='low'||state.renderer.getContext().getContextAttributes().antialias||
     state.renderer.shadowMap.enabled||!state.fireballShadersReady)
   throw Error('Low graphics did not start with its renderer budget');
  closeHelp();closeStoryOverlay();state.isPaused=true;
 });
 await low.screenshot({path:'test-results/graphics-low.png'});
 await low.close();
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS graphics budgets, reversible materials, LOD, shadows, HD policy and physics',JSON.stringify(result));
}finally{await browser.close();}
