import {seedWorld} from '../tests/fixtures/seed-world.mjs';
import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 await seedWorld(page,98217);
 const tier=process.argv.find(arg=>arg.startsWith('--tier='))?.slice(7)||'high';
 await page.addInitScript(tier=>localStorage.setItem('graphics-quality',tier),tier);
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error'&&/Shader|WebGL|THREE/.test(m.text()))errors.push(m.text());});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];
  const api=gameTestAPI,renderer=state.renderer,draw=renderer.render,origin=state.shaman.mesh.position.clone();
  // Build the CPU fixture without unrelated landscape software-rendering stalls.
  // Preparation still draws every GPU warmup into its off-screen target.
  renderer.render=function(scene,...args){if(scene!==state.scene)return draw.call(this,scene,...args);};
  state.viewScale=8;state.cameraLookAt.copy(origin).add(new THREE.Vector3(40,0,0));updateCameraPosition();
  const city=origin.clone().add(new THREE.Vector3(140,0,0)),buildings=[];
  for(const [i,type] of ['hut','tower','warrior','fire','temple','shipyard'].entries()){
   const b=api.createBuilding(type,city.x+(i%3-1)*8,city.z+(Math.floor(i/3)-1)*8,i%3,false,true);
   b.underConstruction=false;b.visualMesh.scale.y=1;buildings.push(b);
  }
  await Promise.all(buildings.map(b=>Art.blender.ensure(Art.buildingAssetKey(b.type))));
  await new Promise(r=>setTimeout(r,0));
  const start=performance.now();
  await Promise.all(buildings.map(b=>api.SettlementPreparation.prepareRoot(b.visualMesh,true)));
  // Loaded landscape also casts shadows from beyond the destination view.
  const chunks=Object.values(state.chunks);
  await Promise.all(chunks.map(c=>api.SettlementPreparation.prepareRoot(c,false,true)));
  while(Art.textureStatus.upgrading||Art.textureStatus.pending||Art.textureStatus.previewPending||api.ResourceBudget.stats.queued){
   if(performance.now()-start>120000)throw Error('Preparation did not drain: '+JSON.stringify({textures:Art.textureStatus,budget:api.ResourceBudget.stats}));
   await new Promise(r=>setTimeout(r,20));
  }
  renderer.render=draw;
  state.cameraLookAt.copy(city);updateCameraPosition();
  const sunOffset=state.sunLight.position.clone().sub(state.sunLight.target.position);
  state.sunLight.target.position.copy(city);state.sunLight.position.copy(city).add(sunOffset);state.sunLight.target.updateMatrixWorld();
  renderer.setPixelRatio(1);
  const gl=renderer.getContext(),keys=new Set(renderer.info.programs.map(p=>p.cacheKey));
  let textureUploads=0,largeStaticUploads=0;const textureSources=[];
  const originals={};
  for(const name of ['texImage2D','compressedTexImage2D','texSubImage2D']){
   originals[name]=gl[name];gl[name]=function(...args){
    textureUploads++;const image=args.at(-1);
    if(textureSources.length<10)textureSources.push({src:image?.src,width:image?.width,height:image?.height});
    return originals[name].apply(this,args);
   };
  }
  originals.bufferData=gl.bufferData;gl.bufferData=function(target,data,usage){
   if(usage===gl.STATIC_DRAW&&(typeof data==='number'?data:data?.byteLength)>16384)largeStaticUploads++;
   return originals.bufferData.apply(this,arguments);
  };
  const render=()=>{const start=performance.now();renderer.render(state.scene,state.camera);gl.finish();return performance.now()-start;};
  const read=()=>{const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  const firstMs=render(),a=read(),firstUploads={textureUploads,largeStaticUploads};
  const secondMs=render(),b=read();for(const [name,original]of Object.entries(originals))gl[name]=original;
  let differing=0;for(let i=0;i<a.length;i+=4)if(Math.max(...[0,1,2].map(c=>Math.abs(a[i+c]-b[i+c])))>8)differing++;
  return {firstMs,secondMs,firstUploads,textureSources,newPrograms:renderer.info.programs.filter(p=>!keys.has(p.cacheKey)).length,
   addedPrograms:renderer.info.programs.filter(p=>!keys.has(p.cacheKey)).map(p=>p.cacheKey),
   pixelError:differing/(gl.drawingBufferWidth*gl.drawingBufferHeight),textures:{...Art.textureStatus},
   budget:{...api.ResourceBudget.stats},preparation:{...api.SettlementPreparation.stats},chunks:chunks.length};
 });
 console.log(JSON.stringify({errors,...result}));
 if(errors.length||result.firstUploads.textureUploads||result.firstUploads.largeStaticUploads||result.newPrograms>0||result.pixelError>.001||result.preparation.errors)
  throw Error('First settlement entry still initialized unprepared resources');
}finally{await browser.close();}
