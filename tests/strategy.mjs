import {seedWorld} from './fixtures/seed-world.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const b=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});const results=[],errors=[],root=path.resolve(import.meta.dirname,'..');
const workflowEscape=value=>String(value).replaceAll('%','%25').replaceAll('\r','%0D').replaceAll('\n','%0A');
function reportFailure(name,error){if(process.env.GITHUB_ACTIONS==='true')console.log(`::error title=${workflowEscape(name)}::${workflowEscape(error?.stack||error)}`);}
async function check(name,fn){try{results.push({name,pass:true,detail:await fn()});console.log('PASS '+name);}catch(e){results.push({name,pass:false,detail:String(e)});console.log('FAIL '+name+' '+e);reportFailure(name,e);}}
try{const p=await b.newPage({viewport:{width:1280,height:800}});await seedWorld(p,98217);p.on('pageerror',e=>errors.push(String(e)));await p.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',{waitUntil:'load',timeout:60000});await p.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
await p.evaluate(()=>{closeHelp();closeStoryOverlay();state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;gameTestAPI.PathWorker.disable();const AI=enemyAIs[0].constructor;for(const u of state.units){u.die();state.scene.remove(u.mesh);}state.units=[];for(const b of state.buildings){state.scene.remove(b.mesh);}state.buildings=[];gameTestAPI.BuildingSpatialHash.markDirty();
for(let x=-55;x<=55;x++)for(let z=-45;z<=45;z++){const key=`${x},${z}`;state.terrainMods.set(key,(state.terrainMods.get(key)||0)+6-getHeight(x,z));}state.heightCache.clear();state.cameraLookAt.set(0,6,0);gameTestAPI.updateChunks(true);
window.testAI=new AI(2);testAI.init(-15,0);window.enemyAIs=[testAI];state.shaman=new Humanoid(0,'shaman',35,0);state.units.push(state.shaman);state.selectedUnits=[state.shaman];state.shaman.hp=1000000;state.shaman.maxHp=1000000;state.shaman.setShield(true);state.aiTime=0;state.clock.getElapsedTime=()=>state.aiTime;
window.aiStep=(duration)=>{for(let k=0;k<duration*10;k++){state.aiTime+=.1;gameTestAPI.SpatialHash.update();gameTestAPI.BuildingSpatialHash.update();testAI.update(.1);state.physicsWorld.timestep=1/60;for(let i=0;i<6;i++)state.physicsWorld.step();for(const u of [...state.units]){u.nextTargetCheck=Infinity;u.update(.1);}for(const b of [...state.buildings])if(!b.dead)b.update(.1);for(let i=state.projectiles.length-1;i>=0;i--)if(!state.projectiles[i].update(.1))state.projectiles.splice(i,1);for(let i=state.activeEffects.length-1;i>=0;i--)if(!state.activeEffects[i].update(.1))state.activeEffects.splice(i,1);for(const v of state.particles)state.scene.remove(v.mesh);state.particles=[];}};
});
await check('Four-minute economy expands its own faction and physically trains mixed classes',()=>p.evaluate(()=>{aiStep(240);const own=state.units.filter(u=>u.faction===2&&u.state!=='dead'),buildings=state.buildings.filter(b=>b.faction===2&&!b.dead),classes=Object.fromEntries(['wild','warrior','firewarrior','spy'].map(t=>[t,own.filter(u=>u.type===t).length]));const detail={classes,buildings:buildings.map(b=>b.type),plan:testAI.lastPlan};if(buildings.length<5||classes.wild<2||!classes.warrior||!classes.firewarrior||!classes.spy||state.buildings.some(b=>b.faction===1))throw new Error(JSON.stringify(detail));return detail;}));
await check('Attack force leaves defenders and builders at home',()=>p.evaluate(()=>{if(state.shaman.state!=='dead')state.shaman.die();state.shaman=new Humanoid(0,'shaman',35,0);state.shaman.hp=1000000;state.shaman.maxHp=1000000;state.units.push(state.shaman);for(const type of ['warrior','warrior','warrior','firewarrior','spy','warrior','firewarrior'])state.units.push(new Humanoid(2,type,-10,0));state.units.filter(u=>u.faction===2&&['warrior','firewarrior','spy'].includes(u.type)&&u.state!=='dead').forEach((u,i)=>u.placeOnGround(24+(i%5)*1.5,-16+Math.floor(i/5)*1.5));testAI.think();const own=state.units.filter(u=>u.faction===2&&u.state!=='dead'),attack=own.filter(u=>u.aiRole==='attack'),guard=own.filter(u=>u.aiRole==='guard');if(!attack.length||guard.length<2||own.filter(u=>u.aiRole==='builder').length<2)throw new Error(JSON.stringify({attack:attack.length,guard:guard.length,plan:testAI.lastPlan}));const probe=attack.find(u=>u.type==='warrior');const before=probe.mesh.position.clone();aiStep(4);if(probe.mesh.position.distanceTo(before)<.5)throw new Error('Attack order did not move '+JSON.stringify({p:probe.mesh.position,before,state:probe.state,path:probe.path,target:probe.target,attack:probe.attackTarget?.mesh.position,v:probe.velocity,ground:probe.isGrounded,role:probe.aiRole}));return {attack:attack.length,guard:guard.length};}));
await check('Combat troops pass a stationary ally in a narrow formation',()=>p.evaluate(()=>{
 const mover=new Humanoid(2,'warrior',45,-30),blocker=new Humanoid(2,'warrior',45,-28.8),target=new Humanoid(0,'warrior',45,-19);
 const probes=[mover,blocker,target];
 try{
  for(const u of probes)state.units.push(u);
  blocker.rigidBody.setBodyType(RAPIER.RigidBodyType.Fixed,true);
  target.rigidBody.setBodyType(RAPIER.RigidBodyType.Fixed,true);
  mover.attackTarget=target;mover.state='combat';mover.aiRole='attack';
  const start=mover.mesh.position.clone();let maxSideStep=0;
  for(let frame=0;frame<240;frame++){
   gameTestAPI.SpatialHash.update();state.physicsWorld.timestep=1/60;state.physicsWorld.step();
   mover.nextTargetCheck=Infinity;mover.update(1/60);
   maxSideStep=Math.max(maxSideStep,Math.abs(mover.mesh.position.x-start.x));
  }
  const progress=mover.mesh.position.z-start.z;
  if(progress<2||maxSideStep<.4)throw new Error(JSON.stringify({progress,maxSideStep,position:mover.mesh.position,state:mover.state,pathIndex:mover.pathIndex,path:mover.path?.slice(0,3),target:mover.attackTarget?.mesh.position,velocity:mover.rigidBody.linvel(),grounded:mover.isGrounded}));
  return {progress,maxSideStep};
 }finally{
  for(const u of probes){if(u.rigidBody)state.physicsWorld.removeRigidBody(u.rigidBody);state.rigidBodies.delete(u.id);state.scene.remove(u.mesh);const i=state.units.indexOf(u);if(i>=0)state.units.splice(i,1);}
 }
}));
await check('Raid recalls troops and shelters workers',()=>p.evaluate(()=>{const intruder=new Humanoid(0,'warrior',testAI.baseX+5,testAI.baseZ+3);state.units.push(intruder);testAI.think();const own=state.units.filter(u=>u.faction===2&&u.state!=='dead');if(testAI.state!=='defend'||!own.some(u=>u.aiRole==='defend'&&u.attackTarget)||!own.some(u=>u.aiRole==='shelter'))throw new Error('No defense response');intruder.die();return testAI.lastPlan;}));
await check('Wounded shaman and troops retreat instead of charging',()=>p.evaluate(()=>{const u=state.units.find(u=>u.faction===2&&u.type==='warrior'&&u.state!=='dead');u.hp=u.maxHp*.2;const sh=testAI.myShaman;sh.hp=sh.maxHp*.2;testAI.think();if(u.aiRole!=='retreat'||sh.aiRole!=='retreat'||u.attackTarget||sh.attackTarget)throw new Error('Retreat missing');return {soldier:u.aiRole,shaman:sh.aiRole};}));
await check('Lost economy recovers followers',()=>p.evaluate(()=>{for(const u of state.units)if(u.faction===2&&u.type==='wild')u.die();testAI.spellCooldown=0;testAI.myShaman.hp=testAI.myShaman.maxHp;testAI.myShaman.placeOnGround(testAI.baseX,testAI.baseZ);testAI.think();if(!state.units.some(u=>u.faction===2&&u.type==='wild'&&u.state!=='dead'))throw new Error('No economic recovery');}));
await check('Units leave building footprints and shed obsolete roles after conversion',()=>p.evaluate(()=>{
 gameTestAPI.createBuilding('hut',45,-30,0);gameTestAPI.BuildingSpatialHash.update();
 const u=new Humanoid(0,'warrior',45,-30);state.units.push(u);u.goto(52,-30);aiStep(4);
 if(Math.hypot(u.mesh.position.x-45,u.mesh.position.z+30)<3)throw new Error('Unit trapped inside building');
 u.aiRole='guard';u.aiTrainingTarget=123;u.setFaction(2);
 if(u.aiRole||u.aiTrainingTarget)throw new Error('Conversion retained old AI orders');
}));
await check('After heavy losses a surviving tribe recruits, trains and attacks again without its shaman',()=>p.evaluate(()=>{
 if(!testAI.hasLaunchedAttack)throw Error('The tribe never launched its first attack');
 for(const u of state.units)if(u.faction===2&&u.state!=='dead')u.die();
 for(const building of state.buildings)state.scene.remove(building.mesh);
 state.buildings=[];
 gameTestAPI.BuildingSpatialHash.markDirty();
 testAI.pendingBuild=null;
 testAI.blockedBuildSites=[];
 state.shaman.placeOnGround(35,0);
 for(const [type,x] of [['hut',-31],['warrior',-18]]){
  const building=gameTestAPI.createBuilding(type,x,-10,2,false,true);
  building.underConstruction=false;
 }
 const survivor=new Humanoid(2,'warrior',-26,-14);
 survivor.aiRole='attack';
 state.units.push(survivor);
 testAI.think();
 if(survivor.aiRole!=='attack')throw Error('A surviving attacker was recalled after casualties');
 const waves=[];
 for(let wave=0;wave<2;wave++){
  const oldTroops=new Set(state.units);
  let attacker;
  for(let elapsed=0;elapsed<160&&!attacker;elapsed+=5){
   aiStep(5);
   attacker=state.units.find(u=>!oldTroops.has(u)&&u.faction===2&&u.type==='warrior'&&u.state!=='dead'&&u.aiRole==='attack');
  }
  if(!attacker)throw Error('No replacement attack wave '+(wave+1)+': '+JSON.stringify(testAI.lastPlan));
  const start=attacker.mesh.position.clone();
  aiStep(4);
  if(attacker.mesh.position.distanceTo(start)<.5)throw Error('Replacement attacker did not advance');
  waves.push(attacker.id);
  for(const u of state.units)if(u.faction===2&&u!==survivor&&u.state!=='dead')u.die();
  survivor.placeOnGround(-26,-14);
  state.shaman.placeOnGround(35,0);
 }
 survivor.die();
 const before=state.units.length;
 testAI.update(CONFIG.AI.RECRUIT_INTERVAL+2);
 if(state.units.length!==before)throw Error('An eliminated tribe recruited new workers');
 return {waves:waves.length};
}));
await check('Scouts report contacts, counter production and last known positions',()=>p.evaluate(async()=>{
 const {counterWeights}=await import('./art/enemy-tactics.js');
 const ai=new testAI.constructor(2),spy=new Humanoid(2,'spy',-15,0);
 const enemies=[new Humanoid(0,'preacher',20,0),new Humanoid(0,'preacher',21,0)];
 state.units.push(spy,...enemies);
 ai.gatherIntel([],[]);
 if(ai.contacts.size)throw Error('Unobserved units entered intelligence');
 ai.gatherIntel([spy],[]);
 if(enemies.some(unit=>!ai.visibleEnemies.has(unit.id)))throw Error('Scout did not reveal opponents');
 const weights=counterWeights(ai.personality,ai.contacts.values());
 if(weights.firewarrior<=counterWeights(ai.personality,[]).firewarrior)throw Error('Priests did not change production');
 enemies.forEach(unit=>unit.placeOnGround(48,35));
 spy.placeOnGround(-45,0);
 ai.gatherIntel([spy],[]);
 if(ai.visibleEnemies.has(enemies[0].id)||ai.contacts.get(enemies[0].id)?.position.x!==20)
  throw Error('Out-of-sight unit overwrote last known position');
 for(let i=0;i<24;i++)ai.gatherIntel([spy],[]);
 if(ai.contacts.has(enemies[0].id))throw Error('Old contact never expired');
 for(const unit of [spy,...enemies])unit.die();
 return weights;
}));
await check('An assault rallies, keeps a reserve and regroups when outmatched',()=>p.evaluate(()=>{
 const ai=new testAI.constructor(2),home=new THREE.Vector3(-20,6,-15),goal={kind:'recon',position:{x:40,z:0}};
 const group=Array.from({length:7},(_,i)=>new Humanoid(2,i%2?'firewarrior':'warrior',-43,-20+i));
 state.units.push(...group);
 ai.squadOrder(group,home,[],2,true,goal);
 if(ai.squad?.phase!=='rally'||group.slice(0,2).some(unit=>unit.aiRole!=='guard')||
    group.slice(2).some(unit=>unit.aiRole!=='rally'))throw Error('The wave departed without assembling or reserving guards');
 ai.squadOrder(group,home,[],2,true,goal);
 if(ai.squad.phase!=='rally')throw Error('An unassembled assault departed on the second planning tick');
 const rally=ai.squad.rally;
 group.slice(2).forEach((unit,i)=>unit.placeOnGround(rally.x,rally.z+i));
 ai.squadOrder(group,home,[],2,true,goal);
 if(!ai.hasLaunchedAttack||group.slice(2).some(unit=>unit.aiRole!=='attack'))throw Error('Assembled troops did not advance');
 const reinforcement=new Humanoid(2,'warrior',home.x,home.z);
 state.units.push(reinforcement);group.push(reinforcement);
 ai.squadOrder(group,home,[],2,true,goal);
 if(ai.squad.ids.has(reinforcement.id))throw Error('A fresh recruit split an assault already underway');
 const foes=Array.from({length:10},()=>({type:'warrior',hp:100,maxHp:100,mesh:{position:rally}}));
 ai.squadOrder(group,home,foes,2,true,goal);
 if(ai.squad?.phase!=='retreat'||group.slice(2,7).some(unit=>unit.aiRole!=='regroup'||unit.attackTarget))
  throw Error('An outmatched squad did not withdraw together');
 ai.squadOrder(group,home,[],2,true,null);
 if(ai.squad?.phase!=='retreat')throw Error('Losing contact interrupted the regrouping order');
 group.forEach(unit=>unit.die());
 return {attackers:5,reserve:2};
}));
await check('Battle spells score groups and campaign AI guards or intercepts objectives',()=>p.evaluate(async()=>{
 const {chooseBattleSpell}=await import('./art/enemy-tactics.js');
 const unit=(x,z,hp=100)=>({hp,maxHp:100,type:'warrior',mesh:{position:new THREE.Vector3(x,6,z)}});
 const allies=[unit(0,0),unit(1,0),unit(2,0)],foes=[unit(12,0),unit(12,1),unit(13,0),unit(13,1)];
 const cast=(friends,enemies,otherTribe)=>chooseBattleSpell(friends,enemies,()=>true,otherTribe)?.type;
 if(cast(allies,foes)!=='blast'||cast(allies,foes,[unit(12,0)])==='blast')throw Error('Fireball cluster or allied safety was ignored');
 const mage={...unit(10,0),type:'firewarrior'};
 if(cast(allies,[mage])!=='shield'||cast(allies,[unit(10,0)])==='shield'||
    cast([unit(0,0,20),unit(1,0,20)],[])!=='heal')
  throw Error('Support spells ignored damage type or group injuries');
 const ai=new testAI.constructor(2),home={x:-20,z:0};
 state.isCampaign=true;
 state.campaignMission={rule:{kind:'capture'},sites:[{x:-17,z:0,captured:true},{x:-12,z:0,progress:5},{x:-10,z:0}]};
 if(ai.missionTarget(home,[])?.position.x!==-12)throw Error('Active ritual site was ignored');
 const escort=unit(10,0);escort.id='escort-probe';
 state.campaignMission={rule:{kind:'escort'},destination:{x:32,z:0},escortIds:[escort.id],arrivedIds:[]};
 const interception=ai.missionTarget(home,[escort]);
 if(interception?.kind!=='intercept'||interception.position.x<=10||interception.position.x>=32||
    ai.missionTarget(home,[]).position.x!==32)throw Error('Escort interception ignored scouting or the destination');
 return {blast:'cluster',shield:'exposed group',heal:'wounded group',objective:'intercept'};
}));
await p.close();
await check('Enemy routes stay dry and troops climb steep banks from water and land',async()=>{
 const water=await b.newPage();water.on('pageerror',e=>errors.push(String(e)));
 try {
  await water.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',{waitUntil:'load',timeout:60000});
  await water.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
  return await water.evaluate(()=>{
   closeHelp();closeStoryOverlay();state.isPaused=true;
   for(const u of state.units){u.die();state.scene.remove(u.mesh);}state.units=[];
   for(const building of state.buildings)state.scene.remove(building.mesh);
   state.buildings=[];gameTestAPI.BuildingSpatialHash.markDirty();
   // These fixtures measure banks and water escape, independently of the
   // trees left behind by the randomly generated startup landscape.
   const clearFixtureTrees=()=>{
    for(const chunk of Object.values(state.chunks)){
     for(const tree of chunk.userData.trees||[])tree.mesh.visible=false;
     chunk.userData.trees=[];
    }
   };
   // Controlled banks must be flat between integer modification samples too.
   state.simplex={noise2D:()=>0};state.heightCache.clear();
   for(let x=-35;x<=35;x++)for(let z=-28;z<=28;z++){
    const height=Math.min(6,Math.max(0,Math.abs(x)-1,Math.abs(z)-6));
    state.terrainMods.set(`${x},${z}`,height-gameTestAPI.getBaseHeight(x,z));
   }
   state.heightCache.clear();gameTestAPI.updateChunks(true);clearFixtureTrees();
   const start=new THREE.Vector3(-12,0,0),end=new THREE.Vector3(12,0,0);
   const route=Pathfinder.findPath(start,end,false,1.5,true);
   if(!route?.length)throw new Error('No dry detour around the water channel');
   let previous=start,minHeight=Infinity;
   for(const waypoint of route){
    const distance=Math.hypot(waypoint.x-previous.x,waypoint.z-previous.z);
    for(let d=0;d<=distance;d+=.25){
     const t=distance?d/distance:0;
     const h=getHeight(previous.x+(waypoint.x-previous.x)*t,previous.z+(waypoint.z-previous.z)*t);
     minHeight=Math.min(minHeight,h);
     if(h<gameTestAPI.aiDryHeight()-.05)throw new Error('Dry route crosses water at '+JSON.stringify({h,previous,waypoint}));
    }
    previous=waypoint;
   }
   const walker=new Humanoid(1,'warrior',-12,0);state.units.push(walker);walker.goto(12,0);
   if(walker.state!=='move')throw new Error('Enemy could not take the dry detour');
   let lowestWalk=Infinity;
   for(let k=0;k<320;k++){
    state.physicsWorld.timestep=1/60;for(let i=0;i<6;i++)state.physicsWorld.step();walker.update(.1);
    lowestWalk=Math.min(lowestWalk,getHeight(walker.mesh.position.x,walker.mesh.position.z));
    if(lowestWalk<gameTestAPI.aiDryHeight()-.12)throw new Error('Moving enemy entered the water: '+lowestWalk);
    if(Math.hypot(walker.mesh.position.x-12,walker.mesh.position.z)<2)break;
   }
   if(Math.hypot(walker.mesh.position.x-12,walker.mesh.position.z)>2)throw new Error('Enemy stalled on the shore: '+JSON.stringify({position:walker.mesh.position,role:walker.aiRole,state:walker.state,
    dry:getHeight(walker.mesh.position.x,walker.mesh.position.z),grid:getHeight(Math.round(walker.mesh.position.x/2)*2,Math.round(walker.mesh.position.z/2)*2),
    reroute:Pathfinder.findPath(walker.mesh.position,end,false,walker.height,true)?.slice(0,3),
    direct:gameTestAPI.findNearestLand(walker.mesh.position.x,walker.mesh.position.z,5,gameTestAPI.aiDryHeight())}));
   const stranded=new Humanoid(1,'warrior',0,0);state.units.push(stranded);
   const ai=new enemyAIs[0].constructor(1);ai.think();
   if(!stranded.aiWaterEscape||stranded.aiRole!=='escape-water'||stranded.state!=='move'||
      getHeight(stranded.finalDest.x,stranded.finalDest.z)<gameTestAPI.aiDryHeight())
     throw new Error('No safe shore recovery: '+JSON.stringify({role:stranded.aiRole,state:stranded.state,dest:stranded.finalDest}));
   const shore=stranded.finalDest.clone();
   for(let k=0;k<200&&getHeight(stranded.mesh.position.x,stranded.mesh.position.z)<gameTestAPI.aiDryHeight();k++){
    state.physicsWorld.timestep=1/60;for(let i=0;i<6;i++)state.physicsWorld.step();stranded.update(.1);
   }
   if(getHeight(stranded.mesh.position.x,stranded.mesh.position.z)<gameTestAPI.aiDryHeight())
     throw new Error('Stranded enemy did not leave the water: '+JSON.stringify({position:stranded.mesh.position,state:stranded.state,shore,target:stranded.target,path:stranded.path?.slice(0,4),swimming:stranded.isSwimming,grounded:stranded.isGrounded,velocity:stranded.velocity,waterExposure:stranded.waterExposure}));
   const player=new Humanoid(0,'warrior',0,3);state.units.push(player);
   for(let k=0;k<200&&getHeight(player.mesh.position.x,player.mesh.position.z)<gameTestAPI.aiDryHeight();k++){
    state.physicsWorld.timestep=1/60;for(let i=0;i<6;i++)state.physicsWorld.step();player.update(.1);
   }
   if(getHeight(player.mesh.position.x,player.mesh.position.z)<gameTestAPI.aiDryHeight()||player.isSwimming)
    throw new Error('Player did not walk to shore: '+JSON.stringify({position:player.mesh.position,state:player.state,health:player.hp}));
   const drowning=new Humanoid(0,'warrior',0,0);state.units.push(drowning);drowning.seekShore=()=>false;
   for(let k=0;k<40;k++){state.physicsWorld.timestep=1/60;for(let i=0;i<6;i++)state.physicsWorld.step();drowning.update(.1);}
   if(!drowning.isUnderwater||drowning.isSwimming||Math.abs(drowning.mesh.position.y-getSurfaceHeight(drowning.mesh.position.x,drowning.mesh.position.z))>.1||drowning.hp>=drowning.maxHp||drowning.hp<drowning.maxHp*.85)
    throw new Error('Drowning should be gradual: '+JSON.stringify({health:drowning.hp,max:drowning.maxHp,exposure:drowning.waterExposure,position:drowning.mesh.position}));
   state.waterState='frozen';drowning.update(.1);
   if(drowning.isSwimming||drowning.aiWaterEscape)throw new Error('Swimming continued after water froze');
   state.waterState='liquid';
   // A near-vertical bank must remain reachable both from open water and on foot.
   for(const u of state.units){u.die();state.scene.remove(u.mesh);}state.units=[];
   for(let x=-12;x<=12;x++)for(let z=-8;z<=8;z++){
    const height=x<0?-1:x<1?-1+9*x:8;
    state.terrainMods.set(`${x},${z}`,height-gameTestAPI.getBaseHeight(x,z));
   }
   state.heightCache.clear();gameTestAPI.updateChunks(true);clearFixtureTrees();
   const mountainUp=gameTestAPI.terrainSpeedFactor(.5,3,1,0);
   const mountainDown=gameTestAPI.terrainSpeedFactor(1.5,3,-1,0);
   const mountainFlat=gameTestAPI.terrainSpeedFactor(3,3,1,0);
   if(Math.abs(mountainUp-1/6)>.001||mountainDown<.7||Math.abs(mountainFlat-1)>.01)
    throw new Error('Mountain ascent did not double to one sixth of flat speed on the steep bank: '+
     JSON.stringify({mountainUp,mountainDown,mountainFlat}));
   const waterClimber=new Humanoid(1,'warrior',-3,0);state.units.push(waterClimber);
   waterClimber.aiWaterEscape=true;waterClimber.goto(4,0);
   if(waterClimber.state!=='move')throw new Error('Steep water exit has no route');
   let waterFrames=0;
   for(;waterFrames<480&&getHeight(waterClimber.mesh.position.x,waterClimber.mesh.position.z)<gameTestAPI.aiDryHeight();waterFrames++){
    state.physicsWorld.timestep=1/60;state.physicsWorld.step();waterClimber.nextTargetCheck=Infinity;waterClimber.update(1/60);
   }
   if(getHeight(waterClimber.mesh.position.x,waterClimber.mesh.position.z)<gameTestAPI.aiDryHeight())
    throw new Error('Steep water exit stalled: '+JSON.stringify({position:waterClimber.mesh.position,target:waterClimber.target,state:waterClimber.state,velocity:waterClimber.velocity}));
   const manualClimber=new Humanoid(0,'warrior',-3,-3);state.units.push(manualClimber);
   manualClimber.update(1/60);
   if(!manualClimber.aiWaterEscape)throw new Error('The swimmer did not start automatic rescue');
   manualClimber.seekShore=()=>{throw new Error('Automatic rescue replaced manual swimming');};
   let manualFrames=0;
   for(;manualFrames<480&&manualClimber.mesh.position.x<3;manualFrames++){
    manualClimber.manualMove(new THREE.Vector3(1,0,0),1/60);
    state.physicsWorld.timestep=1/60;state.physicsWorld.step();manualClimber.update(1/60);
    if(manualClimber.state!=='manual'||manualClimber.target)
     throw new Error('Manual swim direction was overridden');
   }
   if(manualClimber.mesh.position.x<3||manualClimber.isSwimming||
      Math.abs(manualClimber.mesh.position.y-getSurfaceHeight(manualClimber.mesh.position.x,manualClimber.mesh.position.z))>.35)
    throw new Error('Manual water exit stalled: '+JSON.stringify({position:manualClimber.mesh.position,state:manualClimber.state,swimming:manualClimber.isSwimming,velocity:manualClimber.velocity,grounded:manualClimber.isGrounded,manualFrames}));
   const hillClimber=new Humanoid(0,'warrior',.25,3);state.units.push(hillClimber);hillClimber.goto(4,3);
   if(hillClimber.state!=='move')throw new Error('Steep uphill route was rejected');
   let hillFrames=0,maxGroundGap=0;
   for(;hillFrames<480&&hillClimber.mesh.position.x<3;hillFrames++){
    state.physicsWorld.timestep=1/60;state.physicsWorld.step();hillClimber.nextTargetCheck=Infinity;hillClimber.update(1/60);
    maxGroundGap=Math.max(maxGroundGap,Math.abs(hillClimber.mesh.position.y-getSurfaceHeight(hillClimber.mesh.position.x,hillClimber.mesh.position.z)));
   }
   if(hillClimber.mesh.position.x<3||maxGroundGap>.35)
    throw new Error('Steep uphill walk failed: '+JSON.stringify({position:hillClimber.mesh.position,target:hillClimber.target,state:hillClimber.state,velocity:hillClimber.velocity,maxGroundGap}));
   return {waypoints:route.length,minHeight,lowestWalk,shore,playerShore:player.mesh.position,remainingAir:drowning.hp/drowning.maxHp,waterFrames,manualFrames,hillFrames,maxGroundGap};
  });
 } finally {await water.close();}
});
await check('Natural starting landscape supports mixed troops and an offensive within eight minutes',async()=>{
 const natural=await b.newPage();natural.on('pageerror',e=>errors.push(String(e)));
 await seedWorld(natural,98217);
 try{await natural.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',{waitUntil:'load',timeout:60000});await natural.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 return await natural.evaluate(()=>{state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;state.isGodMode=true;let time=0,sawAttack=false,firstAttackAt=null,firstContactAt=null,sawSpy=false;state.clock.getElapsedTime=()=>time;
  for(let k=0;k<4800;k++){time+=.1;gameTestAPI.SpatialHash.update();gameTestAPI.BuildingSpatialHash.update();for(const ai of enemyAIs)ai.update(.1);sawAttack ||= state.units.some(u=>u.faction===1&&u.aiRole==='attack');if(sawAttack&&firstAttackAt===null)firstAttackAt=time;if(firstContactAt===null&&enemyAIs[0].visibleEnemies.has(state.shaman.id))firstContactAt=time;sawSpy ||= state.units.some(u=>u.faction===1&&u.type==='spy');state.physicsWorld.timestep=1/60;for(let i=0;i<6;i++)state.physicsWorld.step();for(const u of [...state.units])u.update(.1);for(const b of [...state.buildings])if(!b.dead)b.update(.1);for(let i=state.projectiles.length-1;i>=0;i--)if(!state.projectiles[i].update(.1))state.projectiles.splice(i,1);for(let i=state.activeEffects.length-1;i>=0;i--)if(!state.activeEffects[i].update(.1))state.activeEffects.splice(i,1);for(const e of state.particles)state.scene.remove(e.mesh);state.particles=[];}
  const own=state.units.filter(u=>u.faction===1&&u.state!=='dead'),buildings=state.buildings.filter(b=>b.faction===1&&!b.dead);const detail={units:own.map(u=>u.type),buildings:buildings.map(b=>b.type),plan:enemyAIs[0].lastPlan,pending:enemyAIs[0].pendingBuild,workers:own.filter(u=>u.type==='wild').map(u=>({p:u.mesh.position,role:u.aiRole,state:u.state,dest:u.finalDest})),sawAttack,firstAttackAt,firstContactAt,sawSpy};
  if(!sawAttack||firstContactAt===null||!sawSpy||!own.some(u=>u.isShaman)||buildings.length<4||!own.some(u=>u.type==='warrior')||!own.some(u=>u.type==='firewarrior'))throw new Error(JSON.stringify(detail));return detail;
 });}finally{await natural.close();}
});
await check('No AI runtime errors',()=>{if(errors.length)throw new Error(errors.join('\n'));});
}finally{await b.close();await fs.mkdir(path.join(root,'test-results'),{recursive:true});await fs.writeFile(path.join(root,'test-results/strategy-report.json'),JSON.stringify({results,errors},null,2));}process.exitCode=results.some(r=>!r.pass)?1:0;

