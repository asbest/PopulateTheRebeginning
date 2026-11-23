import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {seedWorld,startManualSimulation} from './fixtures/seed-world.mjs';
import {useGraphicsTier} from './fixtures/graphics-tier.mjs';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 await seedWorld(page,98217);
 await useGraphicsTier(page,'high');
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 await startManualSimulation(page,98217);
 const result=await page.evaluate(async()=>{
  const {CharacterBatches:batch,BakedStatics:baked}=gameTestAPI,renderer=state.renderer,gl=renderer.getContext();
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
  const chunks=Object.values(state.chunks);
  const trees=chunks.flatMap(chunk=>(chunk.userData.trees||[]).map(tree=>tree.mesh));
  const palms=chunks.flatMap(chunk=>chunk.userData.palms?.mesh||[]);
  function casterCount(roots){
   let count=0;
   for(const root of roots)root.traverse(part=>{if(part.isMesh&&part.castShadow)count++;});
   return count;
  }
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
   const staticShadows={...baked.stats,trees:casterCount(trees),palms:casterCount(palms),buildings:casterCount(houses.map(h=>h.mesh))};
   const dynamic=tier==='ultra';
   if(dynamic?(staticShadows.tiles||!staticShadows.trees||!staticShadows.palms||!staticShadows.buildings):
      (!staticShadows.tiles||staticShadows.trees||staticShadows.palms||staticShadows.buildings||staticShadows.rebuilt))
    throw Error('Static shadow tier mismatch '+JSON.stringify({tier,staticShadows}));
   snapshots.push({tier,p95:times[Math.ceil(times.length*.95)-1],calls:renderer.info.render.calls,
    triangles:renderer.info.render.triangles,pixels:renderer.domElement.width*renderer.domElement.height,
    shadows:renderer.shadowMap.enabled,shadowSize:state.sunLight.shadow.mapSize.width,maxPixelRatio:state.graphicsQuality.maxPixelRatio,
    normal:!!material.normalMap,lodThreshold:lod.userData.lodPixelThreshold,staticShadows});
  }
  const [high,medium,low,ultra,restored]=snapshots;
  if(low.shadows||!medium.shadows||medium.normal||low.normal||!high.normal||
     low.pixels>=medium.pixels||medium.maxPixelRatio>=high.maxPixelRatio||high.maxPixelRatio>=ultra.maxPixelRatio||
     low.triangles>=high.triangles||medium.lodThreshold<=high.lodThreshold||
     restored.lodThreshold!==high.lodThreshold||!restored.normal)
   throw Error('Quality budgets or restoration failed '+JSON.stringify(snapshots));
  if(units.some((u,i)=>JSON.stringify(u.rigidBody.translation())!==originalBodies[i]))
   throw Error('Rendering changed physics');
  const closeMesh=units[0].torso.getObjectByName('AnatomicalBody'),closeGeometry=closeMesh.geometry;
  const previousScale=state.viewScale;
  state.selectedUnits=[units[0]];state.viewScale=13;
  gameTestAPI.updateCameraZoom();updateCameraPosition();
  setGraphicsQuality('medium');
  renderer.render(state.scene,state.camera);
  const mediumLod={triangles:renderer.info.render.triangles,units:batch.stats.simplifiedUnits,
   localShadowParts:batch.stats.shadowProxyParts,contactShadows:batch.stats.farShadows};
  batch.crowdDetail=false;
  renderer.render(state.scene,state.camera);
  const fullMediumTriangles=renderer.info.render.triangles;
  batch.crowdDetail=true;
  if(mediumLod.triangles>=fullMediumTriangles||!mediumLod.units||!mediumLod.localShadowParts||mediumLod.localShadowParts>192||
     !mediumLod.contactShadows||closeMesh.geometry!==closeGeometry)
   throw Error('Medium did not preserve the selected rig and reduce detail for the crowd '+JSON.stringify({mediumLod,fullMediumTriangles}));
  state.selectedUnits=[];state.viewScale=previousScale;
  gameTestAPI.updateCameraZoom();updateCameraPosition();
  setGraphicsQuality('high');
  renderer.render(state.scene,state.camera);
  const shadowTiles=state.scene.children.filter(mesh=>mesh.name==='Baked tree and building shadows');
  const pixels=()=>{
   const image=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
   gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,image);
   return image;
  };
  const shaded=pixels();
  for(const tile of shadowTiles)tile.visible=false;
  renderer.render(state.scene,state.camera);
  const unshaded=pixels();
  for(const tile of shadowTiles)tile.visible=true;
  let darkened=0;
  for(let i=0;i<shaded.length;i+=4)if(unshaded[i]-shaded[i]>8)darkened++;
  if(darkened<20)throw Error('Baked shadows did not darken the visible terrain');

  const decals=baked.stats.decals;
  const temporary=gameTestAPI.createBuilding('hut',origin.x,origin.z,0,false,true);
  renderer.render(state.scene,state.camera);
  if(baked.stats.decals!==decals+1)throw Error('New building did not receive a baked shadow');
  temporary.underConstruction=false;
  renderer.render(state.scene,state.camera);
  if(baked.stats.rebuilt!==1)throw Error('Completing construction did not update the shadow');
  temporary.destroy(false);
  renderer.render(state.scene,state.camera);
  if(baked.stats.decals!==decals)throw Error('Destroyed building left a baked shadow');
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
  const quality={},load={quality,calls:800,triangles:1500000,overview:true};
  if(adaptGraphicsBudget(21,1,load)!==1||quality.vegetationPixelLimit<=2)throw Error('Dense overview did not prioritize vegetation');
  if(adaptGraphicsBudget(21,1,load)!==1||adaptGraphicsBudget(21,1,load)!==.9)throw Error('Resolution probe did not follow the vegetation budget');
  if(adaptGraphicsBudget(21,.9,load)!==1||quality.adaptationReason!=='resolution-probe-no-gain')
   throw Error('Unhelpful resolution probe did not restore quality');
  const lightLoad={quality:{},calls:160,triangles:90000,overview:false};
  if(adaptGraphicsBudget(23,1,lightLoad)!==.9||adaptGraphicsBudget(28,.9,lightLoad)!==.9||
     lightLoad.quality.adaptationReason!=='resolution-probe-improved')throw Error('Useful resolution probe did not keep its gain');
  setGraphicsQuality('high');
  if(batch.stats.fallback||gameTestAPI.SceneryBatches.stats.fallback)throw Error('Instancing fallback');
  const contactShadows=state.scene.getObjectByName('Distant unit contact shadows');
  if(!contactShadows||contactShadows.instanceColor.count!==contactShadows.instanceMatrix.count)
   throw Error('Contact-shadow color buffer does not cover the instance capacity');
  return {units:units.length,buildings:houses.length,snapshots,mediumLod,fullMediumTriangles,darkened,battle};
 });
 const low=await browser.newPage({viewport:{width:960,height:600}});
 low.on('pageerror',error=>errors.push(String(error)));
 await useGraphicsTier(low,'low');
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
