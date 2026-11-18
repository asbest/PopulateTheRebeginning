import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
import {seedWorld} from '../tests/fixtures/seed-world.mjs';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];await seedWorld(page,98217);
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 await Promise.all(['hut','temple','warrior','fire','tower','shipyard'].map(kind=>page.evaluate(kind=>Art.blender.ensure(Art.buildingAssetKey(kind)),kind)));
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;
  state.clock.autoStart=false;state.clock.stop();
  const renderer=state.renderer,gl=renderer.getContext(),optimizer=Art.buildingGeometry,buildingBatches=gameTestAPI.BuildingBatches,draw=renderer.render;
  buildingBatches.enabled=false;
  renderer.render=function(scene,...args){if(scene!==state.scene)return draw.call(this,scene,...args);};
  const render=()=>draw.call(renderer,state.scene,state.camera);
  async function drain(){const start=performance.now();
   while(Art.resources.stats.queued||Art.textureStatus.previewPending||Art.textureStatus.pending||Art.textureStatus.upgrading){
    if(performance.now()-start>120000)throw Error('Asset preparation stalled');await new Promise(r=>setTimeout(r,20));
   }
  }
  // Freeze presentation as well as simulation, but keep the original RAF
  // scheduler for cooperative buffer/GPU work. Weather/exposure must not drift
  // while comparing a synchronous baseline with asynchronously prepared batches.
  const prepareFrame=requestAnimationFrame;
  window.requestAnimationFrame=callback=>callback.name==='animate'?0:prepareFrame(callback);
  await new Promise(r=>prepareFrame(()=>prepareFrame(r)));await drain();
  renderer.setPixelRatio(.75);const w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
  const pixels=()=>{const data=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  const difference=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8)n++;return n/(a.length/4);};
  const modelScene=new THREE.Scene();modelScene.background=new THREE.Color(0xa7d8ed);
  modelScene.add(new THREE.AmbientLight(0xffffff,.7));
  const sun=new THREE.DirectionalLight(0xffffff,1.1);sun.position.set(9,14,7);sun.castShadow=true;
  sun.shadow.mapSize.set(512,512);sun.shadow.camera.left=sun.shadow.camera.bottom=-10;sun.shadow.camera.right=sun.shadow.camera.top=10;
  modelScene.add(sun);modelScene.add(sun.target);
  const floor=new THREE.Mesh(new THREE.BoxGeometry(40,.1,40),new THREE.MeshStandardMaterial({color:0x89ac73}));floor.position.y=-.16;floor.receiveShadow=true;modelScene.add(floor);
  const camera=new THREE.PerspectiveCamera(45,960/600,.1,100),models=[];
  for(const kind of ['hut','temple','warrior','fire','tower','shipyard']){
   optimizer.enabled=false;const original=Art.building(kind,getFactionColor(2));
   optimizer.enabled=true;const merged=Art.building(kind,getFactionColor(2)),other=Art.building(kind,getFactionColor(3));
   for(const part of merged.children.filter(n=>n.userData.mergedBuildingStatic)){
    if(!other.children.some(n=>n.material===part.material&&n.geometry===part.geometry))throw Error('Merged geometry is not shared across factions: '+kind);
   }
   const count=root=>{let meshes=0,triangles=0;root.traverse(n=>{if(n.isMesh){meshes++;triangles+=(n.geometry.index?.count||n.geometry.attributes.position.count)/3;}});return {meshes,triangles};};
   const before=count(original),after=count(merged);
   if(after.meshes>=before.meshes||after.triangles!==before.triangles)throw Error('Model detail changed '+JSON.stringify({kind,before,after}));
   let worst=0;
   for(const scale of [1,.35])for(const offset of [[9,7,11],[-10,5,-8]]){
    original.scale.y=merged.scale.y=scale;camera.position.set(...offset);camera.lookAt(0,2,0);camera.updateMatrixWorld(true);
    for(const root of [original,merged]){root.updateMatrixWorld(true);root.traverse(n=>{if(n.isLOD)n.update(camera);});}
    modelScene.add(original);Art.uniforms.windTime.value=1;renderer.render(modelScene,camera);renderer.render(modelScene,camera);const a=pixels();modelScene.remove(original);
    modelScene.add(merged);renderer.render(modelScene,camera);renderer.render(modelScene,camera);worst=Math.max(worst,difference(a,pixels()));modelScene.remove(merged);
   }
   if(worst>.005)throw Error('Merged model differs '+JSON.stringify({kind,worst}));
   models.push({kind,before,after,pixelError:worst});
  }
  const p=state.shaman.mesh.position.clone(),previous=state.buildings.slice();for(const b of previous)b.mesh.visible=false;
  const sets=[];
  for(const enabled of [false,true]){
   optimizer.enabled=enabled;const buildings=[];
   for(let i=0;i<32;i++){
    const b=gameTestAPI.createBuilding(['hut','warrior','fire','temple'][i%4],p.x+(i%8-3.5)*7,p.z+(Math.floor(i/8)-1.5)*8,i%4,false,true);
    b.mesh.visible=false;buildings.push(b);
   }sets.push(buildings);
  }
  optimizer.enabled=true;state.cameraLookAt.copy(p);state.viewScale=42;gameTestAPI.updateCameraZoom();updateCameraPosition();
  Art.uniforms.windTime.value=state.clock.elapsedTime;
  await drain();
  async function settle(){
   const start=performance.now();
   for(let pass=0;pass<4;pass++){
    render();
    while(Art.resources.stats.queued||buildingBatches.stats.pending){
     if(performance.now()-start>180000)throw Error('Building preparation stalled '+JSON.stringify({budget:Art.resources.stats,batches:buildingBatches.stats}));
     await new Promise(r=>setTimeout(r,20));
    }
   }
   render();
  }
  const results=[];
  for(const phase of ['finished','construction','damaged']){
   const measurements=[];let a;
   for(let index=0;index<3;index++){
    const buildings=sets[index===0?0:1];buildingBatches.enabled=index===2;
    for(const set of sets)for(const b of set)b.mesh.visible=false;
    state.buildings=buildings;
    for(const b of buildings){
     b.mesh.visible=true;b.underConstruction=phase==='construction';b.visualMesh.scale.y=b.underConstruction ? .45 : 1;
     b.constructionRig.visible=b.underConstruction;b.constructionRig.scale.y=.55;b.constructionRig.rotation.y=.3;
     b.damageVisual.visible=phase==='damaged';if(b.roofFlame)b.roofFlame.visible=!b.underConstruction;
     if(b.pathVisual)b.pathVisual.visible=!b.underConstruction;
    }
    if(index===2)await settle();
    for(let i=0;i<14;i++)render();
    const samples=[];for(let i=0;i<12;i++){const start=performance.now();render();gl.finish();samples.push(performance.now()-start);}
    samples.sort((a,b)=>a-b);
    const measurement={calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,medianMs:samples[6],batch:{...gameTestAPI.SceneryBatches.stats},staticBatch:{...buildingBatches.stats}};
    measurements.push(measurement);
    if(index===0)a=pixels();else{
     measurement.pixelError=difference(a,pixels());
     if(measurement.pixelError>.005)throw Error('Settlement differs '+JSON.stringify({phase,measurement}));
    }
   }
   if(measurements[2].calls>measurements[1].calls)throw Error('Material batching increased draw calls '+JSON.stringify({phase,measurements}));
   if(!measurements[1].batch.buildingBatches)throw Error('Merged buildings were not instanced');
   if(phase!=='construction'&&!measurements[2].staticBatch.batches)throw Error('Static material batches never became active');
   results.push({phase,original:measurements[0],merged:measurements[1],optimized:measurements[2]});
  }
  if(!results.some(r=>r.original.calls-r.optimized.calls>=100))throw Error('No substantial building draw-call reduction');
  return {models,results,mergeStats:{...optimizer.stats}};
 });
 if(errors.length)throw Error(errors.join('\n'));
 await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 await fs.writeFile(new URL('../test-results/building-rendering.json',import.meta.url),JSON.stringify(result,null,2));
 console.log('PASS merged buildings preserve pixels, triangles, faction sharing, construction and damage '+JSON.stringify(result));
}finally{await browser.close();}
