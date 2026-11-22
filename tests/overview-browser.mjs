import fs from 'node:fs/promises';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {seedWorld} from './fixtures/seed-world.mjs';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];await seedWorld(page,98217);
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:120000});
 const results=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;state.clock.autoStart=false;state.clock.stop();
  const schedule=requestAnimationFrame;window.requestAnimationFrame=fn=>fn.name==='animate'?0:schedule(fn);
  await new Promise(r=>schedule(()=>schedule(r)));
  const renderer=state.renderer,draw=renderer.render,details=gameTestAPI.OverviewDetails,gl=renderer.getContext();renderer.setPixelRatio(.8);
  renderer.render=function(scene,...args){if(scene!==state.scene)return draw.call(this,scene,...args);};
  gameTestAPI.TerrainStream.disable('fixed overview fixture');
  for(let pass=0;pass<(2*gameTestAPI.CONFIG.TERRAIN.RENDER_DISTANCE+1)**2+1;pass++)gameTestAPI.updateChunks();
  if(Object.keys(state.chunks).length!==121)throw Error('Incomplete fixed overview fixture');
  const render=()=>draw.call(renderer,state.scene,state.camera),read=()=>{const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  async function settle(){const start=performance.now();for(let pass=0;pass<4;pass++){
   render();while(Art.resources.stats.queued||gameTestAPI.BuildingBatches.stats.pending||Art.textureStatus.pending||Art.textureStatus.previewPending||Art.textureStatus.upgrading){
    if(performance.now()-start>180000)throw Error('Overview preparation stalled');await new Promise(r=>setTimeout(r,20));
   }
  }}
  const result=[];
  const {measureLandscapeDraws}=await import('./art/landscape-draws.js');
  const grassBatches=gameTestAPI.GrassBatches;
  const {SceneryBatches:scenery,FlowerOverview:flowers,BakedStatics:baked,ShadowCache}=gameTestAPI;
  for(const zoom of [25,35,65,110]){
   state.viewScale=zoom;gameTestAPI.updateCameraZoom();updateCameraPosition();
   TerrainLod.overviewEnabled=false;details.enabled=false;flowers.enabled=false;await settle();render();const before=renderer.info.render.triangles,a=read(),original=renderer.domElement.toDataURL();
   const counts=Object.values(state.chunks).map(c=>c.userData.groundCover.grass?.mesh.count||0);
   TerrainLod.overviewEnabled=true;details.enabled=true;flowers.enabled=true;await settle();render();const after=renderer.info.render.triangles,b=read(),optimized=renderer.domElement.toDataURL();
   let differing=0,total=0;for(let i=0;i<a.length;i+=4){let max=0;for(let c=0;c<3;c++){const d=Math.abs(a[i+c]-b[i+c]);max=Math.max(max,d);total+=d;}if(max>12)differing++;}
   const pixelError=differing/(a.length/4),meanError=total/(a.length/4*3*255);
   if(pixelError>.015||meanError>.0035)throw Error('Overview appearance changed '+JSON.stringify({zoom,pixelError,meanError}));
   if(zoom>=65&&after>before*.9)throw Error('Insufficient overview savings '+JSON.stringify({zoom,before,after}));
   if(zoom===35&&!details.stats.visibleSavedTriangles)throw Error('Grass still uses all narrow faces at strategy zoom');
   if(zoom===35&&!flowers.stats.savedTriangles)throw Error('Flower detail did not simplify at strategy zoom');
   if(Object.values(state.chunks).some((c,i)=>(c.userData.groundCover.grass?.mesh.count||0)!==counts[i]))throw Error('Plant density changed');
   const draws=measureLandscapeDraws(renderer,state.scene,state.camera,render);
   if(!draws.main.grass.calls||!draws.main.terrain.calls||!draws.main.water.calls)
    throw Error('Incomplete landscape attribution '+JSON.stringify(draws));
   const entry={zoom,before,after,pixelError,meanError,details:{...details.stats},terrain:JSON.parse(JSON.stringify(TerrainLod.stats)),original,optimized,draws};
   if(zoom===110){
    function compareVegetation(){
     ShadowCache.enabled=false;
     scenery.treeOptimization=false;
     flowers.enabled=false;
     render();render();
     const original=read();
     const baseline=measureLandscapeDraws(renderer,state.scene,state.camera,render);
     scenery.treeOptimization=true;
     flowers.enabled=true;
     for(let i=0;i<65;i++)render();
     const optimized=read();
     const grouped=measureLandscapeDraws(renderer,state.scene,state.camera,render);
     const flowerStats={...flowers.stats};
     if(grouped.main.trees.calls>=baseline.main.trees.calls||grouped.shadows.trees.calls||baseline.shadows.trees.calls||
        !flowerStats.blooms||grouped.main.flowers.triangles>=baseline.main.flowers.triangles)
      throw Error('Vegetation draw work did not improve '+JSON.stringify({baseline,grouped,flowerStats,scenery:scenery.stats}));
     const diff=(a,b)=>{
      let changed=0;
      for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>12)changed++;
      return changed/(a.length/4);
     };
     const vegetationError=diff(original,optimized);
     if(vegetationError>.015)throw Error('Vegetation lost image detail '+vegetationError);
     const timings={original:[],grouped:[]};
     for(const enabled of [false,true,true,false]){
      scenery.treeOptimization=flowers.enabled=enabled;
      for(let i=0;i<3;i++)render();
      gl.finish();
      for(let i=0;i<6;i++){
       const start=performance.now();render();gl.finish();
       timings[enabled?'grouped':'original'].push(performance.now()-start);
      }
     }
     const summary=values=>{values.sort((a,b)=>a-b);return {median:values[6],p95:values.at(-1)};};
     const renderMs={original:summary(timings.original),grouped:summary(timings.grouped)};
     scenery.treeOptimization=flowers.enabled=true;
     for(let i=0;i<3;i++)render();
     const tree=Object.values(state.chunks).flatMap(chunk=>chunk.userData.trees).find(candidate=>
      candidate.mesh.children.some(part=>part.isMesh&&part.layers.mask===(1<<30)));
     if(!tree)throw Error('No grouped tree available for burn/regrowth');
     const {x,z}=tree.mesh.position,decals=baked.stats.decals;
     gameTestAPI.burnTreesAt(x,z,.1);
     gameTestAPI.updateTreeRegrowth(8);
     render();const burned=read();
     if(baked.stats.decals!==decals-1||!baked.stats.rebuilt)throw Error('Baked tree shadow survived the fire');
     scenery.treeOptimization=false;render();
     if(!tree.burned||tree.mesh.children[1].visible||diff(burned,read())>.001)
      throw Error('Burned tree or its shadow survived in a batch');
     gameTestAPI.updateTreeRegrowth(gameTestAPI.CONFIG.TERRAIN_VEGETATION.TREE_REGROW_SECONDS);
     scenery.treeOptimization=true;
     for(let i=0;i<7;i++)render();
     if(tree.burned||!tree.mesh.children[1].visible||baked.stats.decals!==decals)
      throw Error('Regrowth did not restore the baked tree shadow');
     ShadowCache.enabled=true;
     return {baseline,grouped,vegetationError,flowerStats,staticShadows:{...baked.stats},renderMs};
    }
    entry.vegetation=compareVegetation();
    const stats=()=>({...grassBatches.stats,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles});
    render();const originalGrass=read(),base=stats();
    grassBatches.enabled=true;render();render();const batchedGrass=read(),batched=stats();
    if(!batched.savedCalls||batched.uploads||batched.calls+batched.savedCalls!==base.calls||batched.triangles!==base.triangles)
     throw Error('Grass batching changed draw coverage '+JSON.stringify({base,batched}));
    let changed=0;
    for(let i=0;i<originalGrass.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(originalGrass[i+c]-batchedGrass[i+c])))>8)changed++;
    if(changed/(originalGrass.length/4)>.001)throw Error('Grass batch pixels differ '+changed);
    const timings={baseline:[],batched:[]};
    for(const enabled of [false,true,true,false]){
     grassBatches.enabled=enabled;render();gl.finish();
     for(let i=0;i<8;i++){const start=performance.now();render();gl.finish();timings[enabled?'batched':'baseline'].push(performance.now()-start);}
    }
    grassBatches.enabled=false;render();
    const median=values=>values.sort((a,b)=>a-b)[Math.floor(values.length/2)];
    entry.grassPrototype={base,batched,changed,baselineMedianMs:median(timings.baseline),batchedMedianMs:median(timings.batched)};
   }
   result.push(entry);
  }
  const grass=Object.values(state.chunks).find(c=>c.userData.groundCover.grass?.mesh.count)?.userData.groundCover.grass.mesh;
  const reducedIndex=grass.geometry.index;details.release(grass);
  if(grass.geometry.index.count!==768||reducedIndex.array.length===0)throw Error('Chunk cleanup did not detach the shared grass index');
  details.enabled=false;render();
  state.isFPV=true;details.enabled=true;details.update(state.camera,renderer);
  if(details.stats.savedTriangles)throw Error('First-person grass lost geometry');
  flowers.update(state.camera,renderer);
  if(flowers.stats.blooms)throw Error('First-person flower geometry was simplified');
  return result;
 });
 if(errors.length)throw Error(errors.join('\n'));
 await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 for(const r of results)for(const key of ['original','optimized']){
  await fs.writeFile(new URL('../test-results/overview-'+r.zoom+'-'+key+'.png',import.meta.url),Buffer.from(r[key].split(',')[1],'base64'));delete r[key];
 }
 await fs.writeFile(new URL('../test-results/overview-rendering.json',import.meta.url),JSON.stringify(results,null,2));
 console.log('PASS overview saves geometry, preserves plant density and image appearance, and restores first-person grass '+JSON.stringify(results));
}finally{await browser.close();}
