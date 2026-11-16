import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {seedWorld} from './fixtures/seed-world.mjs';
import fs from 'node:fs/promises';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:800,height:600}}),errors=[];
 await seedWorld(page,98217);page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];
  const renderer=state.renderer,draw=renderer.render;renderer.setPixelRatio(.8);
  renderer.render=function(scene,...args){if(scene!==state.scene)return draw.call(this,scene,...args);};
  state.viewScale=65;gameTestAPI.updateCameraZoom();updateCameraPosition();state.camera.updateMatrixWorld(true);
  const sources=Object.values(state.chunks).flatMap(c=>c.children.slice(0,2));
  const indices=sources.map(m=>m.geometry.index.array.slice()),bodies=state.units.map(u=>JSON.stringify(u.rigidBody.translation()));
  for(let pass=0;pass<3;pass++){
   TerrainLod.update(state.camera,renderer);
   const start=performance.now();while(Art.resources.stats.queued){if(performance.now()-start>120000)throw Error('LOD preparation stalled');await new Promise(r=>setTimeout(r,20));}
  }
  renderer.render=draw;
  const gl=renderer.getContext(),pixels=()=>{const data=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  TerrainLod.enabled=false;draw.call(renderer,state.scene,state.camera);const full=renderer.info.render.triangles,a=pixels(),originalImage=renderer.domElement.toDataURL();
  TerrainLod.enabled=true;draw.call(renderer,state.scene,state.camera);const reduced=renderer.info.render.triangles,stats={...TerrainLod.stats},b=pixels(),optimizedImage=renderer.domElement.toDataURL();
  let differing=0;for(let i=0;i<a.length;i+=4)if(Math.max(Math.abs(a[i]-b[i]),Math.abs(a[i+1]-b[i+1]),Math.abs(a[i+2]-b[i+2]))>8)differing++;
  const pixelError=differing/(a.length/4);
  if(!stats.savedTriangles||reduced>=full)throw Error(JSON.stringify({full,reduced,stats,fpv:state.isFPV,camera:state.camera.position.toArray(),projection:state.camera.projectionMatrix.elements,focus:state.cameraLookAt.toArray(),first:sources[0].position.toArray(),last:sources.at(-1).position.toArray()}));
  for(let i=0;i<sources.length;i++)if(sources[i].geometry.index.array.some((v,j)=>v!==indices[i][j]))throw Error('LOD modified physics/raycast topology');
  if(state.units.some((u,i)=>JSON.stringify(u.rigidBody.translation())!==bodies[i]))throw Error('LOD changed physics');
  // Selection protects all packed details, even when zoomed far out.
  const {beginLod}=await import('./art/lod-policy.js');
  const selected=state.units.find(u=>u.type==='shaman');state.selectedUnits=[selected];beginLod(state.camera,renderer,state);
  selected.mesh.traverse(n=>{if(n.isLOD){n.update(state.camera);if(n.userData.activeLod!==0)throw Error('Selected unit lost detail');}});
  state.isFPV=true;draw.call(renderer,state.scene,state.camera);if(TerrainLod.stats.medium||TerrainLod.stats.far)throw Error('FPV terrain was simplified');
  return {full,reduced,stats,pixelError,originalImage,optimizedImage,physicsUnchanged:true};
 });
 await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
 for(const name of ['original','optimized'])await fs.writeFile(new URL('../test-results/lod-'+name+'.png',import.meta.url),Buffer.from(result[name+'Image'].split(',')[1],'base64'));
 delete result.originalImage;delete result.optimizedImage;
 if(errors.length||result.pixelError>.01)throw Error(JSON.stringify({errors,result}));console.log('PASS LOD reduces rendered triangles, preserves collision topology and selected/FPV detail '+JSON.stringify(result));
}finally{await browser.close();}
