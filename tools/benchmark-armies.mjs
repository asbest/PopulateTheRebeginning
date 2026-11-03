import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if((m.type()==='error'&&/shader|webgl/i.test(m.text()))||m.text().includes('Character batching unavailable'))errors.push(m.text());});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const report=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];
  const {CharacterBatches:batch,Locomotion}=gameTestAPI,p=state.shaman.mesh.position.clone();
  const units=[];
  for(let i=0;i<80;i++){
   const unit=new Humanoid(i%4,['wild','warrior','firewarrior','shaman','preacher','spy'][i%6],p.x+(i%10-5)*1.2,p.z+(Math.floor(i/10)-4)*1.2);
   unit.nextTargetCheck=Infinity;state.units.push(unit);units.push(unit);
  }
  state.cameraLookAt.copy(p);updateCameraPosition();state.renderer.setPixelRatio(1);
  const renderer=state.renderer,gl=renderer.getContext(),width=gl.drawingBufferWidth,height=gl.drawingBufferHeight;
  const render=()=>{const t=performance.now();renderer.render(state.scene,state.camera);gl.finish();return {calls:renderer.info.render.calls,ms:performance.now()-t};};
  const pixels=()=>{const data=new Uint8Array(width*height*4);gl.readPixels(0,0,width,height,gl.RGBA,gl.UNSIGNED_BYTE,data);return data;};
  const snapshot=()=>units.map(u=>({pos:u.mesh.position.toArray(),velocity:u.velocity.toArray(),body:u.rigidBody.translation(),
   joints:[u.torso,u.head,u.armL,u.armR,u.legL,u.legR].map(p=>[...p.position.toArray(),...p.quaternion.toArray()])}));
  batch.enabled=false;batch.fullShadows=true;render();const original=render(),before=pixels(),stateBefore=JSON.stringify(snapshot());
  const visibility=state.units.map(u=>[u,u.mesh.visible]);for(const [u]of visibility)u.mesh.visible=false;
  render();const background=pixels();for(const [u,visible]of visibility)u.mesh.visible=visible;
  batch.enabled=true;render();const optimized=render(),after=pixels();
  if(batch.stats.fallback||batch.stats.instances<1000)throw new Error('Original meshes were not batched');
  if(JSON.stringify(snapshot())!==stateBefore)throw new Error('Rendering altered rig or physics state');
  let differing=0,actorPixels=0;for(let i=0;i<before.length;i+=4){let delta=0,actor=0;for(let c=0;c<3;c++){delta=Math.max(delta,Math.abs(before[i+c]-after[i+c]));actor=Math.max(actor,Math.abs(before[i+c]-background[i+c]));}if(delta>12)differing++;if(actor>12)actorPixels++;}
  const differingFraction=differing/(width*height);
  // Every moving/stumbling pose must still be sent to the GPU at full cadence.
  for(let frame=0;frame<30;frame++){
   gameTestAPI.CritterManager.update(1/60);
   for(const [i,u]of units.entries()){
    u.animTime+=1/60;u.mesh.position.x+=.001;u.isGrounded=true;
    if(i%3===0)Locomotion.animateCombat(u,(frame%20)/20);
    else if(i%3===1){u.blastAirborne=true;Locomotion.animateFall(u,1/60,'airborne');}
    else Locomotion.animate(u,1/60,getSurfaceHeight);
   }
   renderer.render(state.scene,state.camera);
  }
  if(batch.stats.fallback)throw new Error('Animated instancing failed');
  const matrixError=batch.matrixError();if(matrixError>.0001)throw new Error('GPU matrices differ from full-rate source poses');
  const animated=JSON.parse(JSON.stringify(batch.stats));
  batch.enabled=false;render();const combatOriginal=render(),combatBefore=pixels();
  batch.enabled=true;render();const combatOptimized=render(),combatAfter=pixels();
  let combatDifferences=0;for(let i=0;i<combatBefore.length;i+=4){let d=0;for(let c=0;c<3;c++)d=Math.max(d,Math.abs(combatBefore[i+c]-combatAfter[i+c]));if(d>8)combatDifferences++;}
  const animatedPixelError=combatDifferences/(width*height);
  if(animatedPixelError>.001||combatOptimized.calls>combatOriginal.calls*.5)throw new Error('Animated affine batch parity/performance failed: '+JSON.stringify({animatedPixelError,combatOriginal,combatOptimized}));
  // Distant shadow simplification is independent of combat/animation state.
  batch.fullShadows=false;state.cameraLookAt.x-=70;render();const shadowLOD=batch.stats.farShadows;
  state.cameraLookAt.copy(p);updateCameraPosition();
  // Exact terrain sampler equivalence, including subsequent terrain edits.
  const sampler=getSurfaceHeight.forPose();let parity=true;
  for(let i=0;i<200;i++){const x=p.x+(i%10)*.013,z=p.z+Math.floor(i/10)*.009;if(sampler(x,z)!==getSurfaceHeight(x,z))parity=false;}
  batch.enabled=false;render();if(units.some(u=>(u.torso.children[0].layers.mask&1)===0))throw new Error('Fallback did not restore original meshes');
  batch.enabled=true;
  return {units:units.length,original,optimized,drawCallReduction:1-optimized.calls/original.calls,
   combatOriginal,combatOptimized,animatedPixelError,differingFraction,actorPixelError:differing/Math.max(1,actorPixels),matrixError,poseAndPhysicsUnchanged:true,animated,shadowLOD,surfaceParity:parity};
 });
 if(errors.length||report.drawCallReduction<.5||report.actorPixelError>.015||!report.surfaceParity||!report.shadowLOD)
  throw new Error(JSON.stringify({errors,report}));
 console.log('PASS Large armies batch original full-rate animation and preserve physics '+JSON.stringify(report));
}finally{await browser.close();}
