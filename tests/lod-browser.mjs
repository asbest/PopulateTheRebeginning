import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {seedWorld} from './fixtures/seed-world.mjs';
import {useGraphicsTier} from './fixtures/graphics-tier.mjs';
import fs from 'node:fs/promises';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];
 await seedWorld(page,98217);page.on('pageerror',e=>errors.push(String(e)));
 await useGraphicsTier(page,'high');
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];
  const schedule=requestAnimationFrame;
  window.requestAnimationFrame=fn=>fn.name==='animate'?0:schedule(fn);
  await new Promise(resolve=>schedule(()=>schedule(resolve)));
  gameTestAPI.ResourceBudget.frame(0,true);
  const renderer=state.renderer,draw=renderer.render;renderer.setPixelRatio(.8);
  renderer.render=function(scene,...args){if(scene!==state.scene)return draw.call(this,scene,...args);};
  gameTestAPI.TerrainStream.disable('fixed terrain LOD fixture');
  const chunkCount=(2*gameTestAPI.CONFIG.TERRAIN.RENDER_DISTANCE+1)**2;
  for(let pass=0;pass<=chunkCount;pass++)gameTestAPI.updateChunks();
  if(Object.keys(state.chunks).length!==chunkCount)throw Error('Incomplete fixed terrain LOD fixture');
  state.viewScale=65;gameTestAPI.updateCameraZoom();updateCameraPosition();state.camera.updateMatrixWorld(true);
  const sources=Object.values(state.chunks).flatMap(c=>c.children.slice(0,2));
  const indices=sources.map(m=>m.geometry.index.array.slice()),bodies=state.units.map(u=>JSON.stringify(u.rigidBody.translation()));
  async function prepare(){for(let pass=0;pass<3;pass++){
   TerrainLod.update(state.camera,renderer);
   const start=performance.now();while(Art.resources.stats.queued){if(performance.now()-start>120000)throw Error('LOD preparation stalled');await new Promise(r=>setTimeout(r,20));}
  }}await prepare();
  renderer.render=draw;
  const gl=renderer.getContext(),pixels=()=>{const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  TerrainLod.enabled=false;draw.call(renderer,state.scene,state.camera);const full=renderer.info.render.triangles,a=pixels(),originalImage=renderer.domElement.toDataURL();
  TerrainLod.enabled=true;draw.call(renderer,state.scene,state.camera);const reduced=renderer.info.render.triangles,stats=JSON.parse(JSON.stringify(TerrainLod.stats)),b=pixels(),optimizedImage=renderer.domElement.toDataURL();
  let differing=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8)differing++;
  const pixelError=differing/(a.length/4);
  TerrainLod.update(state.camera,renderer);const reused=TerrainLod.stats.reusedFrames;
  TerrainLod.update(state.camera,renderer);
  if(TerrainLod.stats.updatedEntries||TerrainLod.stats.reusedFrames<=reused)throw Error('Unchanged terrain LOD was rebuilt');
  if(!stats.savedTriangles||reduced>=full)throw Error(JSON.stringify({full,reduced,stats,fpv:state.isFPV,camera:state.camera.position.toArray(),projection:state.camera.projectionMatrix.elements,focus:state.cameraLookAt.toArray(),first:sources[0].position.toArray(),last:sources.at(-1).position.toArray()}));
  for(let i=0;i<sources.length;i++)if(sources[i].geometry.index.array.some((v,j)=>v!==indices[i][j]))throw Error('LOD modified physics/raycast topology');
  if(state.units.some((u,i)=>JSON.stringify(u.rigidBody.translation())!==bodies[i]))throw Error('LOD changed physics');
  // Selection protects all packed details, even when zoomed far out.
  const {beginLod}=await import('./art/lod-policy.js');
  const selected=state.units.find(u=>u.type==='shaman');state.selectedUnits=[selected];beginLod(state.camera,renderer,state);
  selected.mesh.traverse(n=>{if(n.isLOD){n.update(state.camera);if(n.userData.activeLod!==0)throw Error('Selected unit lost detail');}});
  state.isFPV=true;
  state.camera=new THREE.PerspectiveCamera(65,800/600,.2,350);
  state.camera.position.copy(selected.mesh.position).add(new THREE.Vector3(0,3,0));
  state.camera.lookAt(selected.mesh.position.clone().add(new THREE.Vector3(70,4,45)));state.camera.updateMatrixWorld(true);
  renderer.render=function(scene,...args){if(scene!==state.scene)return draw.call(this,scene,...args);};
  await prepare();renderer.render=draw;
  TerrainLod.enabled=false;draw.call(renderer,state.scene,state.camera);const fpvFull=renderer.info.render.triangles,c=pixels(),fpvOriginalImage=renderer.domElement.toDataURL();
  TerrainLod.enabled=true;draw.call(renderer,state.scene,state.camera);const fpvReduced=renderer.info.render.triangles,d=pixels(),fpvOptimizedImage=renderer.domElement.toDataURL();
  let fpvDiffering=0;for(let i=0;i<c.length;i+=4)if(Math.max(Math.abs(c[i]-d[i]),Math.abs(c[i+1]-d[i+1]),Math.abs(c[i+2]-d[i+2]))>8)fpvDiffering++;
  const fpvPixelError=fpvDiffering/(c.length/4),fpvStats=JSON.parse(JSON.stringify(TerrainLod.stats));
  if(!fpvStats.reasons.firstPerson||!fpvStats.savedTriangles||fpvReduced>=fpvFull)throw Error('FPV near/far LOD policy failed '+JSON.stringify({fpvFull,fpvReduced,fpvStats}));
  for(const chunk of Object.values(state.chunks)){
   const source=chunk.children[0],p=source.getWorldPosition(new THREE.Vector3());
   if(Math.abs(p.x-state.camera.position.x)<45&&Math.abs(p.z-state.camera.position.z)<45){
    const proxy=chunk.children.find(n=>n.name==='Terrain render LOD');
    if(proxy.geometry.index!==source.geometry.index)throw Error('FPV close terrain lost detail');
   }
  }
  for(let i=0;i<sources.length;i++)if(sources[i].geometry.index.array.some((v,j)=>v!==indices[i][j]))throw Error('FPV LOD modified authoritative topology');
  const {OverviewDetails:grass,FirstPersonGrass:quadrants,FlowerOverview:flowers,CharacterBatches:characters}=gameTestAPI;
  const {measureLandscapeDraws}=await import('./art/landscape-draws.js');
  const render=()=>draw.call(renderer,state.scene,state.camera);
  const cover=()=>measureLandscapeDraws(renderer,state.scene,state.camera,render).main;
  grass.enabled=flowers.enabled=quadrants.enabled=false;render();const unoptimized=cover(),coverBefore=pixels();
  const size=gameTestAPI.CONFIG.TERRAIN.CHUNK_SIZE,p=state.camera.position;
  const nearGrass=state.chunks[`${Math.round(p.x/size)},${Math.round(p.z/size)}`]?.userData.groundCover.grass?.mesh;
  const nearIndex=nearGrass?.geometry.index;
  grass.enabled=flowers.enabled=true;
  render();render();
  if(flowers.stats.pending>2)throw Error('First-person flower preparation exceeded its in-flight budget');
  const warmStart=performance.now();
  // Advance only after the queued GPU work completes. More full landscape
  // draws while it is pending are especially expensive on CI's software GPU.
  for(let pass=0;pass<4;pass++){
   render();
   while(flowers.stats.pending){
    if(performance.now()-warmStart>60000)throw Error('First-person flower preparation stalled '+JSON.stringify({flowers:flowers.stats,budget:Art.resources.stats}));
    await new Promise(resolve=>setTimeout(resolve,20));
   }
  }
  const optimized=cover(),coverAfter=pixels();
  let changedCover=0;
  for(let i=0;i<coverBefore.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(coverBefore[i+c]-coverAfter[i+c])))>12)changedCover++;
  const coverError=changedCover/(coverBefore.length/4);
  if(!nearGrass||nearGrass.geometry.index!==nearIndex||!grass.stats.visibleSavedTriangles||
     optimized.grass.triangles>=unoptimized.grass.triangles||optimized.flowers.triangles>=unoptimized.flowers.triangles||coverError>.018)
   throw Error('FPV ground cover quality or savings failed '+JSON.stringify({unoptimized,optimized,coverError,grass:grass.stats,flowers:flowers.stats}));
  quadrants.enabled=true;
  // The first render may create a few small buffers. The next view keeps
  // the original material and blade topology, with fewer off-screen instances.
  render();const culledGrass=cover().grass,culledPixels=pixels(),grassCulling={...quadrants.stats};
  let cullingChanges=0;
  for(let i=0;i<culledPixels.length;i+=4)if(Math.max(...[0,1,2].map(j=>Math.abs(culledPixels[i+j]-coverAfter[i+j])))>12)cullingChanges++;
  if(!grassCulling.culledInstances||culledGrass.triangles>=optimized.grass.triangles||cullingChanges/(culledPixels.length/4)>.005)
   throw Error('FPV grass culling did not preserve the image or reduce work '+JSON.stringify({culledGrass,optimized,grassCulling,cullingChanges}));
  const textureRoots=gameTestAPI.firstPersonTextureRoots(p,18),nearChunks=textureRoots.filter(root=>root.userData.groundCover);
  if(!nearChunks.length||nearChunks.length>4||!textureRoots.includes(selected.mesh))throw Error('Unexpected first-person texture scan roots');
  Art.streamTextures(state.scene,p,18,textureRoots);
  if(Art.textureStatus.scopedRoots!==textureRoots.length||!Art.textureStatus.scopedMeshes)throw Error('Texture scan ignored the nearby roots');
  for(let i=0;i<32;i++){
   const distance=i<12?5+(i%4)*2:27+(i%6)*2,offset=(i%5-2)*1.2;
   const x=selected.mesh.position.x+.84*distance-.54*offset,z=selected.mesh.position.z+.54*distance+.84*offset;
   state.units.push(new Humanoid(i%2,'warrior',x,z));
  }
  // The fixture holds all poses still. Count a fresh pass in both cases,
  // including when the normal shadow cache would reuse the previous map.
  gameTestAPI.ShadowCache.enabled=false;
  const shadowDraws=enabled=>{
   characters.firstPersonBudget=enabled;render();
   return measureLandscapeDraws(renderer,state.scene,state.camera,render).shadows.characters;
  };
  characters.firstPersonShadowProxy=false;
  const originalShadows=shadowDraws(false),reducedShadows=shadowDraws(true);
  if(!reducedShadows.calls||reducedShadows.triangles>=originalShadows.triangles||!characters.stats.farShadows)
   throw Error('FPV shadows did not preserve local casters and fall back for distant figures '+JSON.stringify({originalShadows,reducedShadows}));
  characters.firstPersonShadowProxy=true;
  const proxyShadows=shadowDraws(true),proxyParts=characters.stats.shadowProxyParts;
  if(!proxyParts||!proxyShadows.calls||proxyShadows.calls>=reducedShadows.calls||proxyShadows.triangles>=reducedShadows.triangles)
   throw Error('FPV silhouettes did not improve the shadow pass '+JSON.stringify({reducedShadows,proxyShadows,proxyParts}));
  const silhouettes=state.scene.getObjectByName('Animated character shadow silhouettes');
  const beforePose=silhouettes.instanceMatrix.version;
  for(const unit of state.units)if(unit.type==='warrior')unit.armR.rotation.x+=.4;
  render();
  if(silhouettes.instanceMatrix.version<=beforePose)throw Error('Shadow silhouettes did not follow the animated rig');
  state.camera.translateZ(-3);state.camera.rotateY(.45);state.camera.updateMatrixWorld(true);
  quadrants.enabled=false;const grassAfterTurn=cover().grass.triangles;
  quadrants.enabled=true;render();const culledAfterTurn=cover().grass.triangles;
  if(culledAfterTurn>=grassAfterTurn)throw Error('Grass culling did not update during movement and rotation');
  setGraphicsQuality('ultra');render();
  if(grass.stats.visibleSavedTriangles||flowers.stats.blooms||quadrants.stats.culledInstances||characters.stats.shadowProxyParts)
   throw Error('Ultra first-person detail was reduced');
  return {full,reduced,stats,pixelError,originalImage,optimizedImage,fpvFull,fpvReduced,fpvPixelError,fpvStats,fpvOriginalImage,fpvOptimizedImage,physicsUnchanged:true,
   firstPersonCover:{grass:[unoptimized.grass.triangles,optimized.grass.triangles],flowers:[unoptimized.flowers.triangles,optimized.flowers.triangles],coverError},
   firstPersonShadows:{original:originalShadows,reduced:reducedShadows,proxy:proxyShadows,proxyParts},
   grassCulling:{before:optimized.grass,after:culledGrass,...grassCulling,cullingChanges,grassAfterTurn,culledAfterTurn},
   textureScan:{roots:textureRoots.length,chunks:nearChunks.length}};
 });
 await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 for(const name of ['original','optimized'])await fs.writeFile(new URL('../test-results/lod-'+name+'.png',import.meta.url),Buffer.from(result[name+'Image'].split(',')[1],'base64'));
 for(const name of ['Original','Optimized'])await fs.writeFile(new URL('../test-results/lod-fpv-'+name.toLowerCase()+'.png',import.meta.url),Buffer.from(result['fpv'+name+'Image'].split(',')[1],'base64'));
 delete result.originalImage;delete result.optimizedImage;
 delete result.fpvOriginalImage;delete result.fpvOptimizedImage;
 if(errors.length||result.pixelError>.01||result.fpvPixelError>.01)throw Error(JSON.stringify({errors,result}));console.log('PASS LOD reduces rendered triangles, preserves collision topology and selected/FPV detail '+JSON.stringify(result));
}finally{await browser.close();}
