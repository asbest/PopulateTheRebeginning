import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):require('playwright');
const root=path.resolve(import.meta.dirname,'..'),results=[],errors=[];await fs.mkdir(path.join(root,'test-results'),{recursive:true});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
async function check(name,fn){try{results.push({name,pass:true,detail:await fn()});console.log('PASS '+name);}catch(e){results.push({name,pass:false,detail:String(e)});console.log('FAIL '+name+' '+e);}}
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}});page.on('pageerror',e=>errors.push(String(e)));page.on('dialog',d=>d.accept());
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');await page.waitForFunction(()=>window.gameTestAPI&&state.shaman);await page.evaluate(()=>{state.isPaused=true;state.cameraLookAt.copy(state.shaman.mesh.position);gameTestAPI.updateChunks(true);});
 await check('Player and enemy follow real terrain routes in both directions through Rapier simulation',async()=>{
  try{
   const routes=await page.evaluate(()=>{
    closeHelp();closeStoryOverlay();window.setGraphicsQuality('low');state.isPaused=true;
    // Isolate route following from strategic orders while retaining production pathfinding, physics and unit updates.
    window.savedMovementAIs=window.enemyAIs;window.enemyAIs=[];
    window.movementProbes=[state.shaman,state.units.find(u=>u.faction===1&&u.isShaman)].map(u=>{
     if(!u)throw new Error('Missing faction');u.nextTargetCheck=Infinity;
     const start=u.mesh.position.clone();let end;
     for(const [dx,dz] of [[8,0],[0,-8],[-8,0],[0,8]]){u.goto(start.x+dx,start.z+dz);if(u.state==='move'&&u.target){end={x:start.x+dx,z:start.z+dz};break;}}
     if(!end)throw new Error('No reachable route for faction '+u.faction);
     if(u.faction===0){state.selectedUnits=[u];gameTestAPI.performAction(end.x,end.z,'move');}
     return {u,start,end};
    });
    return movementProbes.map(({u,start,end})=>({faction:u.faction,start,end}));
   });
   const outward=await page.evaluate(()=>{
    const advance=(targetKey)=>{
     const samples=movementProbes.map(()=>({last:null,pause:0,maxPause:0}));
     for(let frame=1;frame<=2700;frame++){
      gameTestAPI.SpatialHash.update();state.physicsWorld.timestep=1/60;state.physicsWorld.step();
      movementProbes.forEach(({u})=>{u.nextTargetCheck=Infinity;u.update(1/60);});
      movementProbes.forEach(({u,...probe},i)=>{
       const s=samples[i],p=u.mesh.position,distance=Math.hypot(p.x-probe[targetKey].x,p.z-probe[targetKey].z);
       if(frame>15&&distance>2&&s.last&&Math.hypot(p.x-s.last.x,p.z-s.last.z)<.001)s.pause++;
       else s.pause=0;
       s.maxPause=Math.max(s.maxPause,s.pause);s.last={x:p.x,z:p.z};
      });
      // Pathfinder can finish at the nearest walkable grid point beside the click.
      if(movementProbes.every(probe=>Math.hypot(probe.u.mesh.position.x-probe[targetKey].x,probe.u.mesh.position.z-probe[targetKey].z)<1.75))return {frame,pauses:samples.map(s=>s.maxPause)};
     }
     throw new Error('Route did not finish: '+JSON.stringify(movementProbes.map(probe=>({faction:probe.u.faction,state:probe.u.state,grounded:probe.u.isGrounded,path:probe.u.path?.length,distance:Math.hypot(probe.u.mesh.position.x-probe[targetKey].x,probe.u.mesh.position.z-probe[targetKey].z)}))));
    };
    const movement=advance('end');
    return {frames:movement.frame,maxPauses:movement.pauses,units:movementProbes.map(({u,start})=>({faction:u.faction,distance:Math.hypot(u.mesh.position.x-start.x,u.mesh.position.z-start.z)}))};
   });
   if(outward.maxPauses.some(frames=>frames>3))throw new Error('Unit repeatedly stops en route: '+JSON.stringify(outward));
   await page.evaluate(()=>movementProbes.forEach(({u,start})=>u.goto(start.x,start.z)));
   const returnMove=await page.evaluate(()=>{
    const samples=movementProbes.map(()=>({last:null,pause:0,maxPause:0}));
    for(let frame=1;frame<=2700;frame++){
     gameTestAPI.SpatialHash.update();state.physicsWorld.timestep=1/60;state.physicsWorld.step();
     movementProbes.forEach(({u})=>{u.nextTargetCheck=Infinity;u.update(1/60);});
     movementProbes.forEach(({u,start},i)=>{
      const s=samples[i],p=u.mesh.position,distance=Math.hypot(p.x-start.x,p.z-start.z);
      if(frame>15&&distance>2&&s.last&&Math.hypot(p.x-s.last.x,p.z-s.last.z)<.001)s.pause++;
      else s.pause=0;
      s.maxPause=Math.max(s.maxPause,s.pause);s.last={x:p.x,z:p.z};
     });
     if(movementProbes.every(({u,start})=>Math.hypot(u.mesh.position.x-start.x,u.mesh.position.z-start.z)<1.75))return {frames:frame,maxPauses:samples.map(s=>s.maxPause)};
    }
    throw new Error('Return route did not finish: '+JSON.stringify(movementProbes.map(({u,start})=>({faction:u.faction,state:u.state,grounded:u.isGrounded,path:u.path?.length,distance:Math.hypot(u.mesh.position.x-start.x,u.mesh.position.z-start.z)}))));
   });
   if(returnMove.maxPauses.some(frames=>frames>3))throw new Error('Unit repeatedly stops on return: '+JSON.stringify(returnMove));
   return {routes,outward,returnMove,returnedBoth:true};
  }finally{await page.evaluate(()=>{state.isPaused=true;if(window.savedMovementAIs)window.enemyAIs=window.savedMovementAIs;delete window.savedMovementAIs;});}
 });
 await check('Terrain collider matches render triangles across the whole chunk',()=>page.evaluate(()=>{
  const p=state.shaman.mesh.position,cx=Math.round(p.x/40),cz=Math.round(p.z/40),collider=state.terrainColliders.get(`${cx},${cz}`),samples=[];
  for(const x of [-16,-7,3,16])for(const z of [-15,-4,8,15]){
   const wx=cx*40+x,wz=cz*40+z,h=getSurfaceHeight(wx,wz),ray=new RAPIER.Ray({x:wx,y:h+30,z:wz},{x:0,y:-1,z:0});
   const hit=collider.castRay(ray,100,true);if(hit<0||Math.abs(h+30-hit-h)>.015)throw new Error(JSON.stringify({wx,wz,h,hit}));samples.push(Math.abs(30-hit));
  }return {samples:samples.length,maxError:Math.max(...samples)};
 }));
 await check('Heading survives physics synchronization and wraps without snapping',()=>page.evaluate(()=>{
  const Locomotion=gameTestAPI.Locomotion,u=new Humanoid(0,'warrior',state.shaman.mesh.position.x,state.shaman.mesh.position.z);state.units.push(u);state.selectedUnits=[u];u.nextTargetCheck=Infinity;
  u.mesh.rotation.y=3.12;u.turnTarget=-3.12;
  for(let i=0;i<60;i++){Locomotion.turn(u,-3.12,1/60);state.physicsWorld.timestep=1/60;state.physicsWorld.step();u.update(1/60);}
  const error=Math.abs(Math.atan2(Math.sin(u.mesh.rotation.y+3.12),Math.cos(u.mesh.rotation.y+3.12)));
  if(error>.03)throw new Error('Heading overwritten: '+JSON.stringify({error,yaw:u.mesh.rotation.y,state:u.state,pose:u.rigidBody?.rotation(),hp:u.hp}));return {error};
 }));
 await check('Foot soles follow flat ground, uphill, downhill and stopped stance',()=>page.evaluate(()=>{
  const Locomotion=gameTestAPI.Locomotion,report=[];
  for(const slope of [0,.15,-.15])for(const type of ['wild','shaman','warrior','firewarrior','spy']){
   const u={mesh:new THREE.Group(),type,isShaman:type==='shaman',state:'move',isGrounded:true,moveSpeed:6,animTime:0,updateTicker:0};Characters.build(u,0x377abc);
   const height=(x,z)=>slope*z;let maxError=0,stanceCount=0;
   for(let i=0;i<180;i++){
    u.mesh.position.z=i/60*2;u.mesh.position.y=height(0,u.mesh.position.z);u.animTime+=1/60;Locomotion.animate(u,1/60,height);u.mesh.updateMatrixWorld(true);
    for(let j=0;j<2;j++)if(u.gait.feet[j].wasStance){
     const leg=j?u.legR:u.legL,sandal=leg.userData.lower.getObjectByName('Sandal'),center=sandal.localToWorld(new THREE.Vector3(0,.01,.034));
     const normal=new THREE.Vector3(0,1,-slope).normalize(),rotation=sandal.getWorldQuaternion(new THREE.Quaternion());
     const axes=[new THREE.Vector3(1,0,0),new THREE.Vector3(0,1,0),new THREE.Vector3(0,0,1)],radii=[.055,.032,.108];
     const support=Math.sqrt(axes.reduce((sum,a,k)=>sum+(a.applyQuaternion(rotation).dot(normal)*radii[k]*u.mesh.scale.y)**2,0));
     maxError=Math.max(maxError,Math.abs((center.y-height(center.x,center.z))/Math.sqrt(1+slope*slope)-support));stanceCount++;
    }
   }
   if(maxError>.025*u.mesh.scale.y)throw new Error(type+' slope '+slope+' sole error '+maxError);
   u.state='idle';for(let i=0;i<90;i++)Locomotion.animate(u,1/60,height);
   if(u.gait.speed>.01||stanceCount<20)throw new Error('No settled stance');report.push({type,slope,maxError});
  }return report;
 }));
 await check('Full sandal meshes and hips stay above steep terrain in every human role',()=>page.evaluate(()=>{
  const report=[];
  for(const type of ['wild','warrior','shaman','firewarrior','spy'])for(const [sx,sz] of [[0,2],[0,-2],[2,0],[-2,0],[.75,.75]]){
   const u={mesh:new THREE.Group(),type,isShaman:type==='shaman',state:'move',isGrounded:true,moveSpeed:6};Characters.build(u,0x377abc);
   const height=(x,z)=>sx*x+sz*z;let minSole=Infinity,minHip=Infinity;
   for(let k=0;k<120;k++){
    u.mesh.position.z=k/60*1.2;u.mesh.position.y=height(0,u.mesh.position.z);gameTestAPI.Locomotion.animate(u,1/60,height);u.mesh.updateMatrixWorld(true);
    minHip=Math.min(minHip,u.gait.pelvis);
    for(const leg of [u.legL,u.legR]){
     const sandal=leg.getObjectByName('SandalMesh'),vertices=sandal.geometry.attributes.position;
     for(let v=0;v<vertices.count;v++){const point=sandal.localToWorld(new THREE.Vector3().fromBufferAttribute(vertices,v));minSole=Math.min(minSole,(point.y-height(point.x,point.z))/u.mesh.scale.y);}
    }
   }
   const data={type,sx,sz,minHip,minSole};if(minHip<.519||minSole<-.025)throw new Error(JSON.stringify(data));report.push(data);
  }return report;
 }));
 await check('Walking lands ahead, keeps a connected pelvis and swings opposite arms at 30/60/120 FPS',()=>page.evaluate(()=>{
  const report=[];
  for(const fps of [30,60,120]){
   const u={mesh:new THREE.Group(),type:'warrior',state:'move',isGrounded:true,moveSpeed:6,animTime:0};Characters.build(u,0x377abc);
   let contacts=0,minLanding=Infinity,minPelvis=Infinity,maxKnee=0,armProduct=0;
   for(let i=0;i<fps*5;i++){
    const was=u.gait?.feet.map(f=>f.wasStance)||[true,true];u.mesh.position.z=i/fps*1.2;
    gameTestAPI.Locomotion.animate(u,1/fps,()=>0);
    minPelvis=Math.min(minPelvis,u.gait.pelvis);
    if(i<fps)continue;
    for(let j=0;j<2;j++)if(!was[j]&&u.gait.feet[j].wasStance){contacts++;minLanding=Math.min(minLanding,u.gait.feet[j].z);}
    minPelvis=Math.min(minPelvis,u.gait.pelvis);maxKnee=Math.max(maxKnee,u.legL.userData.lower.rotation.x,u.legR.userData.lower.rotation.x);
    armProduct+=u.armL.rotation.x*u.gait.feet[1].z+u.armR.rotation.x*u.gait.feet[0].z;
    if(Math.abs(u.legL.position.y-u.legR.position.y)>.0001)throw new Error('Disconnected hips');
   }
   const data={fps,contacts,minLanding,minPelvis,maxKnee,armProduct};
   if(contacts<5||minLanding<.15||minPelvis<.52||maxKnee>1.75||armProduct>=0)throw new Error(JSON.stringify(data));report.push(data);
  }return report;
 }));
 await check('Real Rapier movement follows terrain and brakes at idle',()=>page.evaluate(()=>{
  const origin=state.shaman.mesh.position;let start;
  outer:for(let x=-12;x<=12;x+=2)for(let z=-12;z<=12;z+=2){const p={x:origin.x+x,z:origin.z+z};let dry=true;for(let i=0;i<=14;i++){const qz=p.z+i*.5;if(getSurfaceHeight(p.x,qz)<gameTestAPI.aiDryHeight()+.2||isBlocked(p.x,qz)){dry=false;break;}}if(dry){start=p;break outer;}}
  if(!start)throw new Error('No land fixture');const u=new Humanoid(0,'warrior',start.x,start.z);state.units=[u];state.selectedUnits=[u];u.nextTargetCheck=Infinity;
  let maxGap=0;for(let i=0;i<120;i++){u.manualMove(new THREE.Vector3(0,0,1),1/60);state.physicsWorld.timestep=1/60;state.physicsWorld.step();u.update(1/60);maxGap=Math.max(maxGap,Math.abs(u.mesh.position.y-getSurfaceHeight(u.mesh.position.x,u.mesh.position.z)));}
  const travelled=u.mesh.position.z-start.z;if(travelled<.8||maxGap>.3)throw new Error(JSON.stringify({travelled,maxGap}));
  u.state='idle';for(let i=0;i<90;i++){state.physicsWorld.step();u.update(1/60);}
  const v=u.rigidBody.linvel();if(Math.hypot(v.x,v.z)>.05)throw new Error('Idle slides '+JSON.stringify(v));return {travelled,maxGap,stoppedSpeed:Math.hypot(v.x,v.z)};
 }));
 await check('Releasing direct control stops within two steps and accepts a new command',()=>page.evaluate(()=>{
  const u=state.units[0],direction=new THREE.Vector3(0,0,-1),dt=1/60;
  for(let i=0;i<35;i++){
   state.manualInputFrame=(state.manualInputFrame||0)+1;
   u.manualMove(direction,dt);state.physicsWorld.timestep=dt;state.physicsWorld.step();u.update(dt);
  }
  const start=u.mesh.position.clone(),speed=Math.hypot(u.velocity.x,u.velocity.z);
  let maxTravel=0,stoppedAt=-1;
  for(let i=0;i<90;i++){
   state.manualInputFrame++;
   state.physicsWorld.step();u.update(dt);
   maxTravel=Math.max(maxTravel,Math.hypot(u.mesh.position.x-start.x,u.mesh.position.z-start.z));
   if(u.state==='idle'){stoppedAt=i;break;}
  }
  const limit=1.02*u.mesh.scale.y;
  if(speed<1||stoppedAt<0||stoppedAt>45||maxTravel>limit+.08||Math.hypot(u.velocity.x,u.velocity.z)>.05)
   throw new Error(JSON.stringify({speed,stoppedAt,maxTravel,limit,state:u.state}));
  state.manualInputFrame++;u.manualMove(direction,dt);
  if(u.state!=='manual')throw new Error('A new manual command did not resume movement');
  u.state='idle';u.velocity.set(0,0,0);
  if(u.rigidBody)u.rigidBody.setLinvel({x:0,y:0,z:0},true);
  return {speed,stoppedAt,maxTravel,limit};
 }));
 await check('Knockback remains physical and does not trigger ground adhesion',()=>page.evaluate(()=>{
  const u=state.units[0];u.applyForce(new THREE.Vector3(0,6,0));const before=u.mesh.position.y;
  for(let i=0;i<8;i++){state.physicsWorld.step();u.update(1/60);}
  if(u.state!=='stunned'||u.mesh.position.y<=before+.1)throw new Error('Knockback suppressed '+JSON.stringify({rise:u.mesh.position.y-before,state:u.state,velocity:u.rigidBody?.linvel(),mass:u.rigidBody?.mass()}));return {rise:u.mesh.position.y-before,state:u.state};
 }));
 await check('Spell impact braces in flight, lands upright and recovers promptly',()=>page.evaluate(()=>{
  const u=state.units[0];let peak=u.mesh.position.y,airKnee=u.legL.userData.lower.rotation.x,maxTilt=0,groundedAt=-1;
  for(let i=0;i<300;i++){
   state.physicsWorld.timestep=1/60;state.physicsWorld.step();u.update(1/60);
   peak=Math.max(peak,u.mesh.position.y);maxTilt=Math.max(maxTilt,Math.abs(u.mesh.rotation.x),Math.abs(u.mesh.rotation.z));
   if(!u.isGrounded)airKnee=Math.max(airKnee,u.legL.userData.lower.rotation.x);
   if(groundedAt<0&&u.isGrounded)groundedAt=i;
   if(groundedAt>=0&&i-groundedAt>75)break;
  }
  const report={peak,airKnee,maxTilt,groundedAt,state:u.state,groundGap:u.mesh.position.y-getSurfaceHeight(u.mesh.position.x,u.mesh.position.z)};
  if(airKnee<.2||maxTilt>.2||groundedAt<0||u.state==='stunned'||u.state==='getting_up'||Math.abs(report.groundGap)>.3)throw new Error(JSON.stringify(report));
  return report;
 }));
 await check('Saving and rebuilding terrain keeps the physics solver usable',()=>page.evaluate(()=>{
  const retired=[...state.units];gameTestAPI.SpatialHash.update();
  window.saveGame();window.loadGame();state.isPaused=true;
  if(retired.some(u=>u.rigidBody||u.state!=='dead'))throw new Error('Retired physics handles remain');
  const current=new Set(state.units);
  for(const u of state.units)if(gameTestAPI.SpatialHash.query(u.mesh.position.x,u.mesh.position.z,20).some(v=>!current.has(v)))throw new Error('Spatial lookup returns retired units');
  for(let i=0;i<480;i++){state.physicsWorld.timestep=1/60;state.physicsWorld.step();for(const u of state.units){u.nextTargetCheck=Infinity;u.update(1/60);}}
  return {seconds:8,bodies:state.rigidBodies.size,colliders:state.terrainColliders.size};
 }));
 await check('No movement runtime errors',async()=>{if(errors.length)throw new Error(errors.join('\n'));});
}finally{await browser.close();await fs.writeFile(path.join(root,'test-results','locomotion-report.json'),JSON.stringify({results,errors},null,2));}
process.exitCode=results.some(r=>!r.pass)?1:0;
