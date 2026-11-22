import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {seedWorld} from './fixtures/seed-world.mjs';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];await seedWorld(page,98217);page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:120000});
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;state.clock.autoStart=false;state.clock.stop();
  const schedule=requestAnimationFrame;window.requestAnimationFrame=fn=>fn.name==='animate'?0:schedule(fn);await new Promise(r=>schedule(()=>schedule(r)));
  const renderer=state.renderer,draw=renderer.render,api=gameTestAPI.LodVisibility,gl=renderer.getContext();renderer.setPixelRatio(.8);gameTestAPI.ShadowCache.enabled=false;
  // Flower batches are tested separately. Their incremental appearance must
  // not change the scene between the two model-visibility captures.
  gameTestAPI.FlowerOverview.enabled=false;
  renderer.render=function(scene,...args){if(scene!==state.scene)return draw.call(this,scene,...args);};
  gameTestAPI.TerrainStream.disable('fixed render management fixture');
  for(let pass=0;pass<(2*gameTestAPI.CONFIG.TERRAIN.RENDER_DISTANCE+1)**2+1;pass++)gameTestAPI.updateChunks();
  if(Object.keys(state.chunks).length!==121)throw Error('Incomplete fixed render fixture');
  const render=()=>draw.call(renderer,state.scene,state.camera),read=()=>{const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  async function settle(){const start=performance.now();for(let pass=0;pass<4;pass++){
   render();while(Art.resources.stats.queued||gameTestAPI.BuildingBatches.stats.pending||Art.textureStatus.pending||Art.textureStatus.previewPending||Art.textureStatus.upgrading){
    if(performance.now()-start>180000)throw Error('Render management preparation stalled');await new Promise(r=>setTimeout(r,20));
   }
  }}
  setCameraView('strategy');state.viewScale=70;gameTestAPI.updateCameraZoom();updateCameraPosition();api.enabled=false;await settle();render();const original=read(),before={...state.modelLodStats};
  api.enabled=true;await settle();render();const optimized=read(),after={...state.modelLodStats},visibility={...api.stats};
  let differences=0;for(let i=0;i<original.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(original[i+c]-optimized[i+c])))>8)differences++;
  const pixelError=differences/(original.length/4);
  if(pixelError>.0001||!after.culled||after.checked>=before.checked)throw Error(JSON.stringify({pixelError,before,after,visibility}));
  for(const u of state.units)u.mesh.position.x+=.01;render();const translated={...state.modelLodStats};
  if(translated.updated)throw Error('Orthographic actor translation recomputed LOD '+JSON.stringify({translated,after,camera:state.camera.type}));
  return {pixelError,before,after,visibility,translated,scenery:{...gameTestAPI.SceneryBatches.stats}};
 });
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS static off-screen LOD filtering preserves rendered objects and full-rate shadows; translated actors reuse LOD '+JSON.stringify(result));
}finally{await browser.close();}
