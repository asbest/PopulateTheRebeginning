import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const tier=process.argv.find(a=>a.startsWith('--tier='))?.slice(7)||'high';
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{}),
 ...(process.argv.includes('--software-gl')?{args:['--use-gl=angle','--use-angle=swiftshader']}:{})});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(tier=>localStorage.setItem('graphics-quality',tier),tier);
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;window.enemyAIs=[];
  const {SpellWindup,FireballFxManager}=gameTestAPI,caster=state.shaman;
  // Freeze unrelated world streaming while retaining real browser presentation
  // frames. Otherwise new chunks/models can compile shaders during the spell
  // measurement and be wrongly attributed to lightning.
  const browserFrame=requestAnimationFrame.bind(window);window.requestAnimationFrame=()=>0;
  await Promise.all(state.buildings.map(b=>Art.blender.ensure('building/'+b.type+'/root')));
  await new Promise(resolve=>setTimeout(resolve,0));
  const tree=Object.values(state.chunks).flatMap(c=>c.userData?.trees||[]).filter(t=>!t.burned)
   .sort((a,b)=>a.mesh.position.distanceToSquared(state.cameraLookAt)-b.mesh.position.distanceToSquared(state.cameraLookAt))[0];
  if(!tree)throw Error('No forest fixture for first lightning');
  const p=tree.mesh.position;
  gameTestAPI.SceneryBatches.enabled=false;
  state.scene.updateMatrixWorld(true);
  const frame=()=>{const start=performance.now();return new Promise(resolve=>browserFrame(()=>resolve(performance.now()-start)));};
  const render=()=>{
   const start=performance.now();state.renderer.render(state.scene,state.camera);state.renderer.getContext().finish();
   let lights=0;state.scene.traverse(n=>{if(n.isPointLight&&n.visible)lights++;});
   const lightningLit=FireballFxManager.lights.some(l=>l.visible&&l.intensity>0&&l.color.getHex()===0xffffff);
   return {ms:performance.now()-start,lights,lightningLit,calls:state.renderer.info.render.calls,geometries:state.renderer.info.memory.geometries,keys:state.renderer.info.programs.map(p=>p.cacheKey)};
  };
  const tick=dt=>{
   for(let i=state.particles.length-1;i>=0;i--)if(!state.particles[i].update(dt))state.particles.splice(i,1);
   gameTestAPI.updateTreeRegrowth(dt);gameTestAPI.updateLightningSky(dt);FireballFxManager.update(dt);
  };
  // Remove startup transients before recording the stable quality-tier budget.
  tick(10);
  const setupFrames=[];for(let i=0;i<4;i++)setupFrames.push(await frame());
  render();await frame();const allocations=gameTestAPI.LightningFx.stats.created;
  const frames=[{phase:'idle',...render()}];
  for(let cast=0;cast<3;cast++){
   const start=performance.now();SpellWindup.queue('lightning',p.x,p.z,caster);const queueMs=performance.now()-start;
   const windupFrameMs=await frame();frames.push({phase:`windup-${cast}`,frameMs:windupFrameMs,queueMs,...render()});
   const impactStart=performance.now();SpellWindup.update(.5);gameTestAPI.updateTreeRegrowth(.01);FireballFxManager.update(0);const impactMs=performance.now()-impactStart;
   const impactFrameMs=await frame();frames.push({phase:`impact-${cast}`,frameMs:impactFrameMs,impactMs,...render()});
   tick(.6);const sustainFrameMs=await frame();frames.push({phase:`sustain-${cast}`,frameMs:sustainFrameMs,...render()});
  }
  tick(3.1);await frame();frames.push({phase:'expired',...render()});
  const initial=new Set(frames[0].keys);
  const gl=state.renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {setupFrames,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):null,tier:state.graphicsQuality.tier,forestBurned:state.treeBurns.has(tree.id),boltAllocations:gameTestAPI.LightningFx.stats.created-allocations,frames:frames.map(({keys,...f})=>({...f,newPrograms:keys.filter(k=>!initial.has(k)).length}))};
 });
 console.log(JSON.stringify({errors,...result}));
 const litTier=['high','ultra'].includes(result.tier);
 if(errors.length||!result.forestBurned||result.boltAllocations||result.frames.some(f=>f.lights!==result.frames[0].lights||f.newPrograms>0)||
    result.frames.filter(f=>f.phase.startsWith('impact')).some(f=>f.lightningLit!==litTier)||result.frames.at(-1).lightningLit)
  throw new Error('First forest lightning initialized cold shaders, allocated bolts or changed the light budget');
}finally{await browser.close();}
