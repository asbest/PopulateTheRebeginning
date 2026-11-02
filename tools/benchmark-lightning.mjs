import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const tier=process.argv.find(a=>a.startsWith('--tier='))?.slice(7)||'high';
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(tier=>localStorage.setItem('graphics-quality',tier),tier);
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;window.enemyAIs=[];
  const {SpellWindup,FireballFxManager}=gameTestAPI,caster=state.shaman,p=caster.mesh.position;
  const render=()=>{
   const start=performance.now();state.renderer.render(state.scene,state.camera);state.renderer.getContext().finish();
   let lights=0;state.scene.traverse(n=>{if(n.isPointLight&&n.visible)lights++;});
   const lightningLit=FireballFxManager.lights.some(l=>l.visible&&l.intensity>0&&l.color.getHex()===0xffffff);
   return {ms:performance.now()-start,lights,lightningLit,keys:state.renderer.info.programs.map(p=>p.cacheKey)};
  };
  const tick=dt=>{
   for(let i=state.particles.length-1;i>=0;i--)if(!state.particles[i].update(dt))state.particles.splice(i,1);
   gameTestAPI.updateLightningSky(dt);FireballFxManager.update(dt);
  };
  // Remove startup transients before recording the stable quality-tier budget.
  tick(10);
  const frames=[{phase:'idle',...render()}];
  for(let cast=0;cast<3;cast++){
   SpellWindup.queue('lightning',p.x+2,p.z,caster);
   frames.push({phase:`windup-${cast}`,...render()});
   SpellWindup.update(.5);FireballFxManager.update(0);
   frames.push({phase:`impact-${cast}`,...render()});
   tick(.6);frames.push({phase:`sustain-${cast}`,...render()});
  }
  tick(3.1);frames.push({phase:'expired',...render()});
  const initial=new Set(frames[0].keys);
  return {tier:state.graphicsQuality.tier,frames:frames.map(({keys,...f})=>({...f,newPrograms:keys.filter(k=>!initial.has(k)).length}))};
 });
 console.log(JSON.stringify({errors,...result}));
 const litTier=['high','ultra'].includes(result.tier);
 if(errors.length||result.frames.some(f=>f.lights!==result.frames[0].lights||f.newPrograms>2)||
    result.frames.filter(f=>f.phase.startsWith('impact')).some(f=>f.lightningLit!==litTier)||result.frames.at(-1).lightningLit)
  throw new Error('Lightning changed the light budget or bulk-compiled shaders');
}finally{await browser.close();}
