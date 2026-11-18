import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {seedWorld} from './fixtures/seed-world.mjs';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];await seedWorld(page,98217);
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;state.clock.autoStart=false;state.clock.stop();
  const schedule=requestAnimationFrame;window.requestAnimationFrame=fn=>fn.name==='animate'?0:schedule(fn);
  await new Promise(r=>schedule(()=>schedule(r)));
  const renderer=state.renderer,draw=renderer.render,api=gameTestAPI.BuildingBatches,gl=renderer.getContext();
  renderer.render=function(scene,...args){if(scene!==state.scene)return draw.call(this,scene,...args);};
  renderer.setPixelRatio(.75);const width=renderer.domElement.width,height=renderer.domElement.height;
  const render=()=>draw.call(renderer,state.scene,state.camera);
  const pixels=()=>{const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  const diff=(a,b)=>{let n=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8)n++;return n/(a.length/4);};
  async function settle(){const start=performance.now();for(let pass=0;pass<4;pass++){
   render();while(Art.resources.stats.queued||api.stats.pending||Art.textureStatus.previewPending||Art.textureStatus.pending||Art.textureStatus.upgrading){
    if(performance.now()-start>180000)throw Error('Batch preparation stalled '+JSON.stringify(api.stats));await new Promise(r=>setTimeout(r,20));
   }
  }render();}
  for(const b of state.buildings)b.mesh.visible=false;
  state.buildings=[];const houses=[],p=state.shaman.mesh.position;
  await Art.blender.ensure(Art.buildingAssetKey('hut'));
  for(let i=0;i<6;i++){
   const b=gameTestAPI.createBuilding('hut',p.x+(i%3-1)*9,p.z+(Math.floor(i/3)-.5)*9,i%3,false,true);
   b.underConstruction=false;b.visualMesh.scale.y=1;b.constructionRig.visible=false;if(b.pathVisual)b.pathVisual.visible=true;houses.push(b);
  }
  state.viewScale=26;state.cameraLookAt.copy(p);gameTestAPI.updateCameraZoom();updateCameraPosition();
  api.enabled=true;await settle();
  if(!api.stats.batches||!api.stats.sourceParts||api.stats.pending)throw Error('No ready material batches');
  let part;houses[0].visualMesh.traverseVisible(n=>{if(!part&&n.isMesh&&n.layers.mask===(1<<29))part=n;});
  if(!part)throw Error('No owned source part');
  const source=part.geometry,position=source.attributes.position.array.slice(),index=source.index?.array.slice();
  const checks=[];
  async function compare(name,change){
   change();render();const immediate=pixels();await settle();const prepared=pixels();
   api.enabled=false;render();render();const reference=pixels();
   const firstError=diff(immediate,reference),pixelError=diff(prepared,reference);
   if(firstError>.005||pixelError>.005)throw Error('Batch invalidation differs '+JSON.stringify({name,firstError,pixelError,stats:api.stats}));
   api.enabled=true;await settle();checks.push({name,firstError,pixelError});
  }
  await compare('leaf transform',()=>{part.position.x+=.15;});
  await compare('material',()=>{part.material=part.material.clone();part.material.color.multiplyScalar(.7);part.material.roughness=.6;});
  await compare('visibility',()=>{part.visible=false;});
  await compare('restored visibility',()=>{part.visible=true;});
  await compare('external layers',()=>{part.layers.set(2);});
  await compare('restored layers',()=>{part.layers.set(0);});
  await compare('mirrored source fallback',()=>{part.scale.x=-1;});
  await compare('positive source restored',()=>{part.scale.x=1;});
  await compare('LOD/camera',()=>{state.viewScale=55;gameTestAPI.updateCameraZoom();updateCameraPosition();});
  await compare('construction fallback',()=>{const b=houses[0];b.underConstruction=true;b.visualMesh.scale.y=.4;b.constructionRig.visible=true;b.constructionRig.scale.y=.5;});
  await compare('completion',()=>{const b=houses[0];b.underConstruction=false;b.visualMesh.scale.y=1;b.constructionRig.visible=false;});
  await compare('destruction',()=>{houses[1].destroy(false);});
  if(source.attributes.position.array.some((v,i)=>v!==position[i])||index&&source.index.array.some((v,i)=>v!==index[i]))throw Error('Original collision/selection geometry mutated');
  if(api.stats.errors)throw Error('Building batching reported errors '+JSON.stringify(api.stats));
  return {checks,stats:{...api.stats},originalGeometryUnchanged:true};
 });
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS static building batches preserve immediate fallback, source edits, materials, layers, LOD, construction, destruction and original buffers '+JSON.stringify(result));
}finally{await browser.close();}
