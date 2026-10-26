import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const results=[],errors=[],root=path.resolve(import.meta.dirname,'..');
async function check(name,fn){try{const detail=await fn();results.push({name,pass:true,detail});console.log('PASS '+name);}catch(e){results.push({name,pass:false,detail:String(e)});console.log('FAIL '+name+' '+e);}}
try{
 const p=await browser.newPage();p.on('pageerror',e=>errors.push(String(e)));p.on('dialog',d=>d.accept());
 async function fresh(){await p.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');await p.waitForFunction(()=>window.gameTestAPI&&state.shaman);await p.evaluate(()=>{state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;window.enemyAIs=[];state.campaignLevel=0;state.mana=1000;state.isGodMode=false;state.cheatUnlimitedRange=false;state.selectedUnits=[state.shaman];state.cameraLookAt.copy(state.shaman.mesh.position);gameTestAPI.updateChunks(true);window.fixture={caster:state.shaman,x:state.shaman.mesh.position.x+2,z:state.shaman.mesh.position.z};for(const [key,faction] of [['enemy',1],['ally',0]]){const u=new Humanoid(faction,'warrior',fixture.x,fixture.z);u.hp=u.maxHp=1000;u.nextTargetCheck=Infinity;state.units.push(u);fixture[key]=u;}gameTestAPI.SpatialHash.update();});}
 await check('All referenced configuration fields exist',async()=>{
  await fresh();const source=await fs.readFile(path.join(root,'PopulateTheRebeginning.html'),'utf8');
  const refs=[...new Set(source.match(/CONFIG(?:\.[A-Za-z_][A-Za-z_0-9]*){2,}/g))];
  return p.evaluate(refs=>{const missing=refs.filter(r=>r.split('.').slice(1).reduce((v,k)=>v?.[k],gameTestAPI.CONFIG)===undefined);if(missing.length)throw new Error(missing.join(', '));return refs.length;},refs);
 });
 await check('Fireball blast throws nearby enemies away from its impact',async()=>{
  await fresh();return p.evaluate(()=>{
   const {x,z,enemy,ally}=fixture,y=getHeight(x,z),damage=gameTestAPI.CONFIG.COMBAT.FIREBALL_UNIT_DAMAGE;
   const east=new Humanoid(1,'warrior',x+2,z),west=new Humanoid(1,'warrior',x-2,z),far=new Humanoid(1,'warrior',x+6,z),above=new Humanoid(1,'warrior',x,z+2);
   state.units.push(east,west,far,above);
   const place=(u,px,py,pz)=>{
    u.mesh.position.set(px,py,pz);u.rigidBody.setTranslation({x:px,y:py+u.height/2,z:pz},true);
    u.rigidBody.setLinvel({x:0,y:0,z:0},true);u.hp=1000;u.maxHp=1000;u.hitImpulseCooldown=0;
   };
   place(enemy,x,y,z);place(east,x+2,y,z);place(west,x-2,y,z);place(far,x+6,y,z);place(above,x,y+10,z+2);place(ally,x,y,z+2);
   gameTestAPI.SpatialHash.update();
   const ball=new gameTestAPI.Fireball(new THREE.Vector3(x-4,y+2,z),new THREE.Vector3(x,y,z),0);
   ball.mesh.position.set(x,y,z);ball.explode();
   const v=u=>u.rigidBody.linvel();
   const report={centre:v(enemy),east:v(east),west:v(west),far:v(far),above:v(above),ally:v(ally),health:[enemy.hp,east.hp,west.hp,far.hp,above.hp,ally.hp]};
   if(!(v(enemy).x>8&&v(enemy).y>0&&v(east).x>6&&v(west).x< -6&&v(far).x>0&&v(east).x>v(far).x*1.5))
    throw new Error('Blast direction or distance falloff: '+JSON.stringify(report));
   const expected=(u)=>{
    const d=Math.hypot(u.mesh.position.x-x,u.mesh.position.y+Math.min(u.height||2,2)*.5-y,u.mesh.position.z-z);
    return damage*(1-(d/8)**2);
   };
   if(Math.abs((1000-enemy.hp)-expected(enemy))>.01||Math.abs((1000-east.hp)-expected(east))>.01||
      Math.abs((1000-west.hp)-expected(west))>.01||Math.abs((1000-far.hp)-expected(far))>.01||
      !(enemy.hp<east.hp&&east.hp<far.hp)||above.hp!==1000||ally.hp!==1000||
      Math.hypot(v(above).x,v(above).y,v(above).z)>.01||Math.hypot(v(ally).x,v(ally).y,v(ally).z)>.01)
    throw new Error('Blast height, faction or damage: '+JSON.stringify(report));
   return report;
  });
 });
 await check('Shaman endures three times a warrior and takes swamp and volcano damage',async()=>{
  await fresh();return p.evaluate(()=>{
   const {x,z,enemy}=fixture;
   const warrior=new Humanoid(1,'warrior',x,z),shaman=new Humanoid(1,'shaman',x,z);
   state.units.push(warrior,shaman);
   if(shaman.maxHp!==3*warrior.maxHp)throw new Error(`Wrong endurance: ${shaman.maxHp}/${warrior.maxHp}`);
   gameTestAPI.SpatialHash.update();
   gameTestAPI.performAction(x,z,'swamp');
   gameTestAPI.SpellWindup.update(1);
   const swamp=state.activeEffects.at(-1),beforeSwamp=shaman.hp;
   swamp.update(.5);
   const swampLoss=beforeSwamp-shaman.hp;
   if(swampLoss<=0||swampLoss>=shaman.maxHp||Math.abs((1000-enemy.hp)-swampLoss)>.01)
    throw new Error(`Swamp damage or shaman immunity: ${swampLoss}, ${enemy.hp}`);
   shaman.hp=beforeSwamp;enemy.hp=1000;
   for(let i=0;i<30;i++)swamp.update(1/60);
   if(Math.abs((beforeSwamp-shaman.hp)-swampLoss)>.01)
    throw new Error('Swamp damage depends on frame rate');
   gameTestAPI.performAction(x,z,'volcano');
   gameTestAPI.SpellWindup.update(1);
   const volcano=state.activeEffects.at(-1),beforeVolcano=shaman.hp;
   volcano.update(.21);
   const volcanoLoss=beforeVolcano-shaman.hp;
   if(volcanoLoss<=0||volcanoLoss>=shaman.maxHp)
    throw new Error(`Volcano still ignores the shaman: ${volcanoLoss}`);
   return {shamanHp:shaman.maxHp,warriorHp:warrior.maxHp,swampLoss,volcanoLoss};
  });
 });
 await check('Older saves preserve the shaman health fraction after the balance change',async()=>{
  await fresh();return p.evaluate(()=>{
   const key=gameTestAPI.CONFIG.SAVED_KEYS.SAVE_DATA;
   window.saveGame();
   const save=JSON.parse(localStorage.getItem(key));
   const shaman=save.units.find(unit=>unit.type==='shaman'&&unit.faction===0);
   shaman.hp=250;delete shaman.maxHp;
   localStorage.setItem(key,JSON.stringify(save));
   window.loadGame();
   const restored=state.shaman.hp;
   if(Math.abs(restored-300)>.01)throw new Error(`Legacy shaman health ratio changed: ${restored}`);
   window.saveGame();window.loadGame();
   if(Math.abs(state.shaman.hp-restored)>.01)
    throw new Error(`Current save changed the shaman's health: ${state.shaman.hp}`);
   return {legacyHp:250,restoredHp:restored,maxHp:state.shaman.maxHp};
  });
 });
 await check('Lightning weakens with distance and chains to each target once',async()=>{
  await fresh();return p.evaluate(()=>{
   const {caster,enemy,ally,x,z}=fixture;
   const near=new Humanoid(1,'warrior',x+1,z),edge=new Humanoid(1,'warrior',x+3.5,z);
   const chain=[5,9,13].map(offset=>new Humanoid(1,'warrior',x+offset,z));
   state.units=[caster,enemy,ally,near,edge,...chain];
   for(const unit of state.units.filter(u=>u.faction===1))unit.hp=unit.maxHp=1000;
   gameTestAPI.SpatialHash.update();
   state.campaignLevel=gameTestAPI.CONFIG.CAMPAGIN.CHAIN_LIGHTNING_LEVEL;
   gameTestAPI.performAction(x,z,'lightning');
   gameTestAPI.SpellWindup.update(1);
   const losses=[enemy,near,edge].map(unit=>1000-unit.hp),chained=chain.map(unit=>1000-unit.hp);
   if(!(losses[0]>losses[1]&&losses[1]>losses[2]&&losses[2]>0)||
      chained.some(loss=>loss<=0||loss>gameTestAPI.CONFIG.COMBAT.LIGHTNING_CHAIN_DAMAGE)||ally.hp!==1000)
    throw new Error(JSON.stringify({losses,chained,ally:ally.hp}));
   return {losses,chained};
  });
 });
 await check('Fireball knockback visibly moves a struck person and recovers',async()=>{
  await fresh();return p.evaluate(()=>{
   const {x,z,enemy}=fixture,y=getHeight(x,z),startX=x+1.5,startY=getHeight(startX,z);
   state.units=[enemy];enemy.mesh.position.set(startX,startY,z);
   enemy.rigidBody.setTranslation({x:startX,y:startY+enemy.height/2,z},true);
   enemy.rigidBody.setLinvel({x:0,y:0,z:0},true);enemy.hp=enemy.maxHp=1000;enemy.hitImpulseCooldown=0;enemy.nextTargetCheck=Infinity;
   gameTestAPI.SpatialHash.update();
   const ball=new gameTestAPI.Fireball(new THREE.Vector3(x-4,y+2,z),new THREE.Vector3(x,y,z),0);
   ball.mesh.position.set(x,y,z);ball.explode();
   const launch={...enemy.rigidBody.linvel()};let travel=0,rise=0,worldRise=0,airborneFrames=0,swirl=0,tilt=0,proneFrames=0;
   const flight=[];
   for(let i=0;i<300;i++){
    state.physicsWorld.timestep=1/60;state.physicsWorld.step();enemy.update(1/60);
    travel=Math.max(travel,enemy.mesh.position.x-startX);
    rise=Math.max(rise,enemy.mesh.position.y-getSurfaceHeight(enemy.mesh.position.x,enemy.mesh.position.z));
    worldRise=Math.max(worldRise,enemy.mesh.position.y-startY);
    if(!enemy.isGrounded){
     airborneFrames++;swirl=Math.max(swirl,Math.abs(enemy.torso.rotation.z));
     tilt=Math.max(tilt,Math.abs(enemy.mesh.rotation.z));
     const v=enemy.rigidBody.linvel();flight.push({y:enemy.mesh.position.y,x:enemy.mesh.position.x,vx:v.x,vy:v.y});
    }
    if(enemy.isGrounded&&enemy.state==='stunned'&&enemy.fallRig.rotation.x>1.3)proneFrames++;
   }
   const apex=flight.reduce((best,sample,i)=>sample.y>flight[best].y?i:best,0);
   const apexVelocity=flight[apex],beforeApex=flight[Math.max(0,apex-8)],afterApex=flight[Math.min(flight.length-1,apex+8)];
   const report={launch,travel,rise,worldRise,airborneFrames,swirl,tilt,proneFrames,finalProne:enemy.fallRig.rotation.x,apexVelocity,beforeApex,afterApex,state:enemy.state,
    gravityScale:enemy.rigidBody.gravityScale(),groundGap:enemy.mesh.position.y-getSurfaceHeight(enemy.mesh.position.x,enemy.mesh.position.z)};
   if(launch.x<8||launch.x>16||launch.y<18||launch.y>23||travel<20||travel>40||
      rise<8||rise>18||worldRise<6||worldRise>15||airborneFrames<85||swirl<.12||tilt<.35||proneFrames<12||Math.abs(report.finalProne)>.01||
      apexVelocity.vx<launch.x*.7||beforeApex.vy<.5||afterApex.vy>-.5||
      enemy.state==='stunned'||enemy.state==='getting_up'||report.gravityScale!==1||Math.abs(report.groundGap)>.35)
    throw new Error('Fireball failed to launch or recover: '+JSON.stringify(report));
   return report;
  });
 });
 await check('Blast gravity stays constant through a long fall',async()=>{
  await fresh();return p.evaluate(()=>{
   const u=fixture.enemy,x=u.mesh.position.x,z=u.mesh.position.z;
   u.mesh.position.y+=100;
   u.rigidBody.setTranslation({x,y:u.mesh.position.y+u.height/2,z},true);
   u.rigidBody.setLinvel({x:0,y:0,z:0},true);
   u.applyForce(new THREE.Vector3(5,8,0),5,8,.6);
   let minGravity=Infinity,maxGravity=-Infinity,maxTilt=0;
   for(let i=0;i<240;i++){
    state.physicsWorld.timestep=1/60;state.physicsWorld.step();u.update(1/60);
    const gravity=u.rigidBody.gravityScale();minGravity=Math.min(minGravity,gravity);maxGravity=Math.max(maxGravity,gravity);
    maxTilt=Math.max(maxTilt,Math.abs(u.mesh.rotation.z));
   }
   const report={height:u.mesh.position.y-getSurfaceHeight(u.mesh.position.x,u.mesh.position.z),minGravity,maxGravity,maxTilt,airborne:u.blastAirborne};
   if(report.height<5||!report.airborne||Math.abs(minGravity-.6)>.001||Math.abs(maxGravity-.6)>.001||maxTilt<.35)
    throw new Error(JSON.stringify(report));
   return report;
  });
 });
 const spells=['blast','lightning','raise','lower','flatten','landbridge','swamp','invisibility','shield','hypnotise','swarm','tornado','firestorm','volcano','heal','teleport','create','phantom'];
 for(const spell of spells)await check('Spell effect and exact mana: '+spell,async()=>{await fresh();return p.evaluate(spell=>{
  const {caster,enemy,ally,x,z}=fixture,expect=(yes,msg)=>{if(!yes)throw new Error(msg);};
  const cost={blast:10,lightning:50,raise:5,lower:5,flatten:10,landbridge:20,swamp:80,invisibility:20,shield:20,hypnotise:50,swarm:40,tornado:60,firestorm:80,volcano:90,heal:10,teleport:90,create:50,phantom:30}[spell];
  ally.hp=500;const before={h:getHeight(x,z),hp:enemy.hp,units:state.units.length,mods:state.terrainMods.size};
  const sample=()=>{const a=[];for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)a.push(getHeight(x+dx,z+dz));return Math.max(...a)-Math.min(...a);};const spread=sample();
  const sound=gameTestAPI.SoundManager,playSound=sound.playSound;
  const castingSounds=[];
  sound.playSound=function(name,volume){castingSounds.push(name);return playSound.call(this,name,volume);};
  gameTestAPI.performAction(x,z,spell);
  if(gameTestAPI.SpellWindup.pending.length)gameTestAPI.SpellWindup.update(1);
  sound.playSound=playSound;
  expect(state.mana===1000-cost,'Mana '+state.mana);
  const expectedSound={blast:'fireball',lightning:'lightning',raise:'raise',lower:'lower',flatten:'flatten',
   landbridge:'landbridge',swamp:'swamp',invisibility:'invisibility',shield:'shield',hypnotise:'hypnotise',
   swarm:'swarm',tornado:'tornado',firestorm:'firestorm',volcano:'volcano',heal:'heal',teleport:'teleport',
   create:'create',phantom:'phantom'}[spell];
  expect(castingSounds.includes(expectedSound),'Wrong or missing casting sound for '+spell+': '+castingSounds);
  if(spell==='teleport'){for(let i=0;i<30;i++){state.physicsWorld.timestep=1/60;state.physicsWorld.step();caster.update(1/60);}expect(Math.hypot(caster.mesh.position.x-x,caster.mesh.position.z-z)<.2,'Teleport snapped back');}
  if(spell==='heal')expect(ally.hp===1000&&enemy.hp===1000,'Heal faction/health');
  if(spell==='shield'){expect(ally.shielded&&!enemy.shielded,'Shield faction');ally.takeDamage(100,true);expect(ally.hp===500,'Shield did not block damage');}
  if(spell==='invisibility')expect(ally.invisible&&!enemy.invisible,'Invisibility faction');
  if(spell==='hypnotise'){expect(enemy.faction===0&&enemy.originalFaction===1,'Conversion failed');enemy.conversionTimer=.01;enemy.update(.02);expect(enemy.faction===1,'Conversion did not revert');}
  if(spell==='create')expect(state.units.length===before.units+1&&state.units.at(-1).faction===0,'Create failed');
  if(spell==='phantom')expect(state.units.length===before.units+3&&state.units.slice(-3).every(u=>u.isPhantom&&u.damage===0&&u.hp===1),'Phantoms missing');
  if(spell==='raise')expect(getHeight(x,z)>before.h,'Ground did not rise');
  if(spell==='lower')expect(getHeight(x,z)<before.h,'Ground did not lower');
  if(spell==='flatten')expect(sample()<spread*.2,'Ground did not flatten');
  if(spell==='landbridge')expect(Math.abs(getHeight(x,z)-getHeight(caster.mesh.position.x,caster.mesh.position.z))<.1,'Bridge height mismatch');
  if(spell==='lightning')expect(enemy.hp<before.hp&&ally.hp===500,'Lightning damage/faction');
  if(['swamp','swarm','tornado','volcano','firestorm'].includes(spell)){
   const effect=state.activeEffects.at(-1);expect(!!effect,'No effect');
   if(spell==='firestorm'){
    const n=state.projectiles.length,stormLight=effect.light;
    effect.update(1.1);
    expect(state.projectiles.length===n+1,'No raining fireball');
    const projectile=state.projectiles.at(-1);
    expect(projectile.stormShot&&!projectile.light,'Firestorm projectile allocated an extra light');
    if(stormLight)expect(stormLight.parent===state.scene,'Firestorm light missing');
   }
   else{for(let i=0;i<90;i++)effect.update(1/60);expect(enemy.hp<before.hp,'Hazard has no damage');expect(ally.hp===500,'Friendly hazard damage');}
   if(spell==='volcano')expect(getHeight(x,z)>before.h,'Volcano terrain unchanged');
   effect.timer=0;expect(effect.update(.01)===false,'Effect does not expire');
   if(effect.mesh)expect(!effect.mesh.parent,'Expired effect remains visible');
   if(spell==='firestorm')expect(!effect.light,'Expired firestorm light remains');
  }
  if(spell==='blast'){
   expect(state.projectiles.length>0,'No projectile');const projectile=state.projectiles.at(-1);
   for(let i=0;i<180&&projectile.active;i++){state.physicsWorld.timestep=1/60;state.physicsWorld.step();projectile.update(1/60);}
   expect(!projectile.active&&enemy.hp<before.hp&&ally.hp===500,'Projectile impact/damage/faction');
  }
  return {cost,enemyHealth:enemy.hp,unitCount:state.units.length};
 },spell);});
 await check('Winged swarm animates in three draw calls and releases GPU resources',async()=>{
  await fresh();return p.evaluate(()=>{
   const {x,z}=fixture;
   state.units=[fixture.caster];gameTestAPI.SpatialHash.update();
   gameTestAPI.performAction(x,z,'swarm');
   gameTestAPI.SpellWindup.update(1);
   const swarm=state.activeEffects.at(-1),count=CONFIG.EFFECTS.SWARM_PARTICLE_COUNT;
   if(!swarm?.bodies?.isInstancedMesh||!swarm.heads?.isInstancedMesh||!swarm.wings?.isInstancedMesh||
      swarm.bodies.count!==count||swarm.heads.count!==count||swarm.wings.count!==count*2||swarm.mesh.children.length!==3)
    throw new Error('Swarm has missing insects or excessive draw calls');
   const beforeBody=swarm.bodies.instanceMatrix.array.slice(0,16);
   const beforeWing=swarm.wings.instanceMatrix.array.slice(0,16);
   const particleCount=state.particles.length;
   for(let i=0;i<60;i++)swarm.update(1/60);
   if(beforeBody.every((value,i)=>value===swarm.bodies.instanceMatrix.array[i])||
      beforeWing.every((value,i)=>value===swarm.wings.instanceMatrix.array[i]))throw new Error('Swarm flight or wing beat is static');
   if(state.particles.length!==particleCount)throw new Error('Swarm animation allocated particles');
   if(!Array.from(swarm.bodies.instanceMatrix.array).every(Number.isFinite))throw new Error('Invalid swarm transforms');
   let disposals=0;
   for(const part of [swarm.bodies,swarm.heads,swarm.wings])part.geometry.addEventListener('dispose',()=>disposals++);
   saveGame();loadGame();
   if(swarm.mesh.parent||state.activeEffects.includes(swarm)||disposals!==3)
    throw new Error('Swarm meshes survived save reload: '+disposals);
   return {insects:count,draws:swarm.mesh.children.length,disposals};
  });
 });
 await check('Swamp and tornado visuals stay bounded and release resources',async()=>{
  await fresh();return p.evaluate(()=>{
   const caster=fixture.caster;
   state.units=[caster];gameTestAPI.SpatialHash.update();
   const x=caster.mesh.position.x,z=caster.mesh.position.z;
   gameTestAPI.performAction(x+2,z,'swamp');
   gameTestAPI.SpellWindup.update(1);
   gameTestAPI.performAction(x+5,z,'tornado');
   gameTestAPI.SpellWindup.update(1);
   const [swamp,tornado]=state.activeEffects.slice(-2);
   if(swamp?.constructor.name!=='Swamp'||tornado?.constructor.name!=='Tornado')throw new Error('Missing hazard visuals');
   if(!swamp.surface?.geometry?.index?.count||!swamp.ripples?.isInstancedMesh||!swamp.bubbles?.isInstancedMesh||
      !tornado.ribbons?.geometry?.index?.count||!tornado.debris?.isInstancedMesh||
      swamp.mesh.children.length>3||tornado.mesh.children.length>5)throw new Error('Unbounded hazard draw calls');
   const positions=swamp.surface.geometry.attributes.position,index=swamp.surface.geometry.index;
   for(let i=0;i<index.count;i+=3){
    const ys=[positions.getY(index.getX(i)),positions.getY(index.getX(i+1)),positions.getY(index.getX(i+2))];
    if(Math.max(...ys)-Math.min(...ys)>=0.81)throw new Error('Swamp spans a cliff face');
   }
   const particleCount=state.particles.length;
   const firstMatrix=tornado.debris.instanceMatrix.array.slice(0,16);
   for(let i=0;i<90;i++){swamp.update(1/60);tornado.update(1/60);}
   if(state.particles.length!==particleCount)throw new Error('Hazard animation allocates particles every frame');
   if(firstMatrix.every((value,i)=>value===tornado.debris.instanceMatrix.array[i]))throw new Error('Tornado debris is static');
   let disposals=0;
   for(const resource of [swamp.surface.geometry,swamp.surface.material,tornado.funnel.geometry,tornado.ribbons.geometry])
    resource.addEventListener('dispose',()=>disposals++);
   swamp.timer=0;tornado.timer=0;
   if(swamp.update(.01)!==false||tornado.update(.01)!==false||swamp.mesh.parent||tornado.mesh.parent||disposals!==4)
    throw new Error('Hazard GPU resources survived expiration: '+disposals);
   return {swampDraws:swamp.mesh.children.length,tornadoDraws:tornado.mesh.children.length,disposals};
  });
 });
 await check('Loading a save disposes active swamp and tornado meshes',async()=>{
  await fresh();return p.evaluate(()=>{
   const {x,z}=fixture;
   gameTestAPI.performAction(x,z,'swamp');
   gameTestAPI.SpellWindup.update(1);
   gameTestAPI.performAction(x,z,'tornado');
   gameTestAPI.SpellWindup.update(1);
   const [swamp,tornado]=state.activeEffects.slice(-2);
   let disposals=0;
   swamp.surface.geometry.addEventListener('dispose',()=>disposals++);
   tornado.ribbons.geometry.addEventListener('dispose',()=>disposals++);
   saveGame();loadGame();
   if(swamp.mesh.parent||tornado.mesh.parent||disposals!==2||state.activeEffects.includes(swamp)||state.activeEffects.includes(tornado))
    throw new Error('Hazard meshes survived load: '+disposals);
   return {disposals};
  });
 });
 await check('Loading a save removes active firestorm illumination',async()=>{
  await fresh();return p.evaluate(()=>{
   const {x,z}=fixture;
   gameTestAPI.performAction(x,z,'firestorm');
   gameTestAPI.SpellWindup.update(1);
   const storm=state.activeEffects.at(-1),light=storm.light;
   saveGame();loadGame();
   if(state.activeEffects.includes(storm)||light?.parent||storm.light)throw new Error('Firestorm light survived load');
   return {lightRemoved:true};
  });
 });
 await check('Every spell rejects insufficient mana, out-of-range targets and a dead caster',async()=>{await fresh();return p.evaluate(spells=>{const {caster,x,z}=fixture;for(const spell of spells){state.mana=0;gameTestAPI.performAction(x,z,spell);if(state.mana!==0)throw new Error(spell+' overdraft');state.mana=1000;gameTestAPI.performAction(x+1000,z,spell);if(state.mana!==1000)throw new Error(spell+' ignored range');caster.state='dead';gameTestAPI.performAction(x,z,spell);if(state.mana!==1000)throw new Error(spell+' dead caster');caster.state='idle';}return spells.length;},spells);});
 await check('Airship unload action synchronizes physics and does not charge mana',async()=>{await fresh();return p.evaluate(()=>{const {ally,x,z}=fixture,ship=new Humanoid(0,'airship',x+5,z);state.units.push(ship);ship.loadUnit(ally);if(ship.loadUnit(ally))throw new Error('Duplicate cargo');state.selectedUnits=[ship];gameTestAPI.performAction(x,z,'unload');if(ship.passengers.length||!ally.mesh.visible||ally.state==='transported'||state.mana!==1000)throw new Error('Unload action failed');for(let i=0;i<30;i++){state.physicsWorld.step();ally.update(1/60);}if(Math.hypot(ally.mesh.position.x-ship.mesh.position.x,ally.mesh.position.z-ship.mesh.position.z)>.5)throw new Error('Passenger snapped back');});});
 await check('No shipyard means no airship mana charge',async()=>{await fresh();return p.evaluate(()=>{const {x,z}=fixture;const u=new Humanoid(0,'wild',x,z);state.units.push(u);gameTestAPI.performAction(x,z,'build_airship');if(state.mana!==1000)throw new Error('Invalid construction charged mana');});});
 await check('Shield/invisibility refresh, expire on simulation time and survive save/load',async()=>{
  await fresh();return p.evaluate(()=>{
   let {ally,x,z}=fixture;const id=ally.id;
   for(const spell of ['shield','invisibility'])gameTestAPI.performAction(x,z,spell);
   ally.shieldTimer=.05;ally.invisibilityTimer=.05;
   for(const spell of ['shield','invisibility'])gameTestAPI.performAction(x,z,spell);
   ally.update(.1);if(!ally.shielded||!ally.invisible)throw new Error('Refresh expired early');
   saveGame();loadGame();state.isPaused=true;ally=state.units.find(u=>u.id===id);
   if(!ally.shielded||!ally.invisible||ally.shieldTimer<19||ally.invisibilityTimer<29)throw new Error('Saved status lost');
   ally.shieldTimer=.05;ally.invisibilityTimer=.05;ally.update(.1);
   if(ally.shielded||ally.invisible||ally.originalMats.size)throw new Error('Status/visuals failed to expire');
  });
 });
 await check('Phantoms expire even when shielded and are not permanent after loading',async()=>{
  await fresh();return p.evaluate(()=>{const {x,z}=fixture;gameTestAPI.performAction(x,z,'phantom');const id=state.units.at(-1).id;let u=state.units.at(-1);u.setShield(true);u.phantomTimer=.05;saveGame();loadGame();state.isPaused=true;u=state.units.find(u=>u.id===id);if(!u.isPhantom||u.damage!==0||u.phantomTimer<=0)throw new Error('Phantom save state');u.update(.1);if(u.state!=='dead')throw new Error('Phantom did not expire');});
 });
 await check('Spy hypnotise uses its short range and divine campaign spells remain free',async()=>{
  await fresh();return p.evaluate(()=>{const {enemy,x,z}=fixture;const spy=new Humanoid(0,'spy',x,z);state.units.push(spy);state.selectedUnits=[spy];gameTestAPI.performAction(x+6,z,'hypnotise');if(state.mana!==1000)throw new Error('Spy ignored range');gameTestAPI.performAction(x,z,'hypnotise');gameTestAPI.SpellWindup.update(1);if(enemy.faction!==0||state.mana!==950)throw new Error('Spy cast failed');state.selectedUnits=[state.shaman];state.campaignLevel=12;state.mana=0;const count=state.units.length;gameTestAPI.performAction(x,z,'create');if(state.mana!==0||state.units.length!==count+1)throw new Error('Divine free spell failed');});
 });
 await check('No spell runtime errors',()=>{if(errors.length)throw new Error(errors.join('\n'));});
}finally{await browser.close();await fs.mkdir(path.join(root,'test-results'),{recursive:true});await fs.writeFile(path.join(root,'test-results/spells-report.json'),JSON.stringify({date:new Date().toISOString(),results,errors},null,2));}
console.log(JSON.stringify({passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length}));process.exitCode=results.some(x=>!x.pass)?1:0;
