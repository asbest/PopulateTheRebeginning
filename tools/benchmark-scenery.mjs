import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(/Scenery batching unavailable|Error compiling|VALIDATE_STATUS/.test(m.text()))errors.push(m.text());});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];
  const {SceneryBatches:batch,createBuilding}=gameTestAPI,p=state.shaman.mesh.position.clone();
  const houses=[];for(let i=0;i<12;i++){
   const b=createBuilding(['hut','warrior','fire'][i%3],p.x+(i%4-1.5)*8,p.z+(Math.floor(i/4)-1)*8,i%4,false,true);
   b.underConstruction=false;b.visualMesh.scale.y=1;houses.push(b);
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
  const cameraPosition=state.camera.position.clone(),cameraRotation=state.camera.quaternion.clone(),views=[];
  for(const offset of [[4,3,5],[-12,18,-9]]){
   state.camera.position.copy(houses[5].mesh.position).add(new THREE.Vector3(...offset));
   state.camera.lookAt(houses[5].mesh.position.clone().add(new THREE.Vector3(0,2,0)));
   views.push(compare());
  }
  state.camera.position.copy(cameraPosition);state.camera.quaternion.copy(cameraRotation);
  // Construction, visible flags/fire, changing materials and destruction keep
  // using the original live sources, with no frame-rate reduction.
  houses[0].visualMesh.scale.y=.4;houses[1].visualMesh.visible=false;
  houses[2].visualMesh.position.y+=.15;houses[3].hp=houses[3].maxHp*.4;houses[3].damageVisual.visible=true;
  const dynamic=compare();houses[0].destroy(false);const destroyed=compare();
  batch.dispose();batch.enabled=false;render();const fallbackPixels=pixels();batch.enabled=true;render();const recovered=pixels();
  let recoveryError=0;for(let i=0;i<recovered.length;i++)if(Math.abs(fallbackPixels[i]-recovered[i])>8)recoveryError++;
  return {steady,views,stats,matrixError,unchangedUploads,dynamic,destroyed,recoveryError:recoveryError/(w*h*4),fallback:batch.stats.fallback};
 });
 // Background streaming differs between native GPUs and software CI; require
 // actual eliminated calls rather than a percentage of unrelated scenery.
 if(errors.length||result.fallback||result.steady.original.calls-result.steady.optimized.calls<150||result.stats.instances<200||
  [result.steady,...result.views,result.dynamic,result.destroyed].some(r=>r.pixelError>.005)||result.matrixError>.0001||result.unchangedUploads||result.recoveryError>.005)
  throw new Error(JSON.stringify({errors,result}));
 console.log('PASS scenery preserves pixels, construction, destruction and fallback '+JSON.stringify(result));
}finally{await browser.close();}
