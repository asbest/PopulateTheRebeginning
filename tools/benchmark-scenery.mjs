import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {seedWorld,startManualSimulation} from '../tests/fixtures/seed-world.mjs';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 await seedWorld(page,98217);
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(/Scenery batching unavailable|Error compiling|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 await startManualSimulation(page,98217);
 const result=await page.evaluate(async()=>{
  await Promise.all(['hut','warrior','fire'].map(kind=>Art.blender.ensure(Art.buildingAssetKey(kind))));
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];
  const {SceneryBatches:batch,createBuilding}=gameTestAPI,p=state.shaman.mesh.position.clone();
  const houses=[];for(let i=0;i<12;i++){
   const b=createBuilding(['hut','warrior','fire'][i%3],p.x+(i%4-1.5)*8,p.z+(Math.floor(i/4)-1)*8,i%4,false,true);
   b.underConstruction=false;b.visualMesh.scale.y=1;b.constructionRig.visible=false;
   if(b.pathVisual)b.pathVisual.visible=true;if(b.roofFlame)b.roofFlame.visible=true;houses.push(b);
  }
  state.cameraLookAt.copy(p);updateCameraPosition();state.renderer.setPixelRatio(1);
  const renderer=state.renderer,gl=renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight;
  const render=()=>{const start=performance.now();renderer.render(state.scene,state.camera);gl.finish();return {ms:performance.now()-start,calls:renderer.info.render.calls,triangles:renderer.info.render.triangles};};
  const pixels=()=>{const a=new Uint8Array(w*h*4);gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
  function compare(){
   batch.enabled=false;render();const original=render(),a=pixels();
   batch.enabled=true;render();const optimized=render(),b=pixels();
   let differences=0,max=0;for(let i=0;i<a.length;i+=4){let delta=0;for(let c=0;c<3;c++)delta=Math.max(delta,Math.abs(a[i+c]-b[i+c]));max=Math.max(max,delta);if(delta>8)differences++;}
   return {original,optimized,pixelError:differences/(w*h),max};
  }
  const steady=compare(),stats={...batch.stats},matrixError=batch.matrixError();
  render();const unchangedUploads=batch.stats.uploads;
  for(let i=0;i<12;i++)render();
  const reused={...batch.stats},cachedPixels=pixels();
  if(!reused.reused||!reused.cacheHits||reused.uploads)throw Error('Unchanged scenery did not reuse batches '+JSON.stringify(reused));
  batch.cacheEnabled=false;render();const uncached=pixels();batch.cacheEnabled=true;
  let cacheDifferences=0;for(let i=0;i<cachedPixels.length;i++)if(Math.abs(cachedPixels[i]-uncached[i])>8)cacheDifferences++;
  if(cacheDifferences)throw Error('Batch reuse changed pixels');
  const cacheChanges=[];let part;
  houses[4].visualMesh.traverse(n=>{if(!part&&n.isMesh&&n.layers.mask===(1<<30))part=n;});
  if(!part)throw Error('No batched source available for cache invalidation');
  for(const kind of ['transform','material','visibility','layers']){
   for(let i=0;i<12;i++)render();
   if(!batch.stats.reused)throw Error('Cache did not settle before '+kind);
   const position=part.position.x,material=part.material,visible=part.visible;
   if(kind==='transform')part.position.x+=.125;
   if(kind==='material'){part.material=material.clone();part.material.transparent=true;part.material.opacity=.6;}
   if(kind==='visibility')part.visible=false;
   if(kind==='layers')part.layers.set(2);
   render();if(batch.stats.reused)throw Error('Cache ignored source '+kind);
   const edited=compare();cacheChanges.push({kind,pixelError:edited.pixelError});
   if(edited.pixelError>.005)throw Error('Cached '+kind+' differs from originals');
   if(kind==='material')part.material.dispose();
   part.position.x=position;part.material=material;part.visible=visible;part.layers.set(0);
  }
  const cameraPosition=state.camera.position.clone(),cameraRotation=state.camera.quaternion.clone(),views=[];
  for(const offset of [[4,3,5],[-12,18,-9]]){
   state.camera.position.copy(houses[5].mesh.position).add(new THREE.Vector3(...offset));
   state.camera.lookAt(houses[5].mesh.position.clone().add(new THREE.Vector3(0,2,0)));
   views.push(compare());
  }
  state.camera.position.copy(cameraPosition);state.camera.quaternion.copy(cameraRotation);
  // Construction, visible flags/fire, changing materials and destruction keep
  // using the original live sources, with no frame-rate reduction.
  houses[0].visualMesh.scale.y=.4;houses[0].constructionRig.visible=true;houses[0].constructionRig.scale.y=.5;houses[0].constructionRig.rotation.y=.2;
  houses[1].visualMesh.visible=false;
  houses[2].visualMesh.position.y+=.15;houses[3].hp=houses[3].maxHp*.4;houses[3].damageVisual.visible=true;
  const dynamic=compare();houses[0].destroy(false);const destroyed=compare();
  batch.dispose();batch.enabled=false;render();const fallbackPixels=pixels();batch.enabled=true;render();const recovered=pixels();
  let recoveryError=0;for(let i=0;i<recovered.length;i++)if(Math.abs(fallbackPixels[i]-recovered[i])>8)recoveryError++;
  return {steady,views,stats,reused,cacheChanges,matrixError,unchangedUploads,dynamic,destroyed,recoveryError:recoveryError/(w*h*4),fallback:batch.stats.fallback};
 });
 // Finished, premerged buildings contain fewer source parts. Verify actual
 // renderer savings and building instancing rather than the old raw-part count.
 if(errors.length||result.fallback||result.steady.original.calls-result.steady.optimized.calls<64||!result.stats.buildingInstances||
  [result.steady,...result.views,result.dynamic,result.destroyed].some(r=>r.pixelError>.005)||!result.stats.skippedRoots||result.matrixError>.0001||result.unchangedUploads||result.recoveryError>.005)
  throw new Error(JSON.stringify({errors,result}));
 console.log('PASS scenery preserves pixels, construction, destruction and fallback '+JSON.stringify(result));
}finally{await browser.close();}
