import fs from 'node:fs/promises';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createRequire} from 'node:module';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const results=[],errors=[],root=path.resolve(import.meta.dirname,'..');
async function check(name,fn){try{const detail=await fn();results.push({name,pass:true,detail});console.log('PASS '+name);}catch(e){results.push({name,pass:false,detail:String(e)});console.log('FAIL '+name+' '+e);}}
try{
 const p=await browser.newPage();p.on('pageerror',e=>errors.push(String(e)));p.on('dialog',d=>d.accept());
 async function fresh(){await p.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');await p.waitForFunction(()=>window.gameTestAPI&&state.shaman);await p.evaluate(()=>{state.isPaused=true;window.enemyAIs=[];state.campaignLevel=0;state.mana=1000;state.isGodMode=false;state.cheatUnlimitedRange=false;state.selectedUnits=[state.shaman];state.cameraLookAt.copy(state.shaman.mesh.position);gameTestAPI.updateChunks(true);window.fixture={caster:state.shaman,x:state.shaman.mesh.position.x+2,z:state.shaman.mesh.position.z};for(const [key,faction] of [['enemy',1],['ally',0]]){const u=new Humanoid(faction,'warrior',fixture.x,fixture.z);u.hp=u.maxHp=1000;u.nextTargetCheck=Infinity;state.units.push(u);fixture[key]=u;}gameTestAPI.SpatialHash.update();});}
 await check('All referenced configuration fields exist',async()=>{
  await fresh();const source=await fs.readFile(path.join(root,'PopulateTheRebeginning.html'),'utf8');
  const refs=[...new Set(source.match(/CONFIG(?:\.[A-Za-z_][A-Za-z_0-9]*){2,}/g))];
  return p.evaluate(refs=>{const missing=refs.filter(r=>r.split('.').slice(1).reduce((v,k)=>v?.[k],gameTestAPI.CONFIG)===undefined);if(missing.length)throw new Error(missing.join(', '));return refs.length;},refs);
 });
 const spells=['blast','lightning','raise','lower','flatten','landbridge','swamp','invisibility','shield','hypnotise','swarm','tornado','firestorm','volcano','heal','teleport','create','phantom','blink'];
 for(const spell of spells)await check('Spell effect and exact mana: '+spell,async()=>{await fresh();return p.evaluate(spell=>{
  const {caster,enemy,ally,x,z}=fixture,expect=(yes,msg)=>{if(!yes)throw new Error(msg);};
  const cost={blast:10,lightning:50,raise:5,lower:5,flatten:10,landbridge:20,swamp:80,invisibility:20,shield:20,hypnotise:50,swarm:40,tornado:60,firestorm:80,volcano:90,heal:10,teleport:90,create:50,phantom:30,blink:20}[spell];
  ally.hp=500;const before={h:getHeight(x,z),hp:enemy.hp,units:state.units.length,mods:state.terrainMods.size};
  const sample=()=>{const a=[];for(let dx=-2;dx<=2;dx++)for(let dz=-2;dz<=2;dz++)a.push(getHeight(x+dx,z+dz));return Math.max(...a)-Math.min(...a);};const spread=sample();
  const sound=gameTestAPI.SoundManager,playSound=sound.playSound;
  let castingSounds=0;
  sound.playSound=function(name){castingSounds++;return playSound.call(this,name);};
  gameTestAPI.performAction(x,z,spell);
  sound.playSound=playSound;
  expect(state.mana===1000-cost,'Mana '+state.mana);
  if(spell!=='lightning')expect(castingSounds>0,'No casting sound for '+spell);
  if(['teleport','blink'].includes(spell)){for(let i=0;i<30;i++){state.physicsWorld.timestep=1/60;state.physicsWorld.step();caster.update(1/60);}expect(Math.hypot(caster.mesh.position.x-x,caster.mesh.position.z-z)<.2,'Teleport snapped back');}
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
 await check('Loading a save removes active firestorm illumination',async()=>{
  await fresh();return p.evaluate(()=>{
   const {x,z}=fixture;
   gameTestAPI.performAction(x,z,'firestorm');
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
  await fresh();return p.evaluate(()=>{const {enemy,x,z}=fixture;const spy=new Humanoid(0,'spy',x,z);state.units.push(spy);state.selectedUnits=[spy];gameTestAPI.performAction(x+6,z,'hypnotise');if(state.mana!==1000)throw new Error('Spy ignored range');gameTestAPI.performAction(x,z,'hypnotise');if(enemy.faction!==0||state.mana!==950)throw new Error('Spy cast failed');state.selectedUnits=[state.shaman];state.campaignLevel=12;state.mana=0;const count=state.units.length;gameTestAPI.performAction(x,z,'create');if(state.mana!==0||state.units.length!==count+1)throw new Error('Divine free spell failed');});
 });
 await check('No spell runtime errors',()=>{if(errors.length)throw new Error(errors.join('\n'));});
}finally{await browser.close();await fs.mkdir(path.join(root,'test-results'),{recursive:true});await fs.writeFile(path.join(root,'test-results/spells-report.json'),JSON.stringify({date:new Date().toISOString(),results,errors},null,2));}
console.log(JSON.stringify({passed:results.filter(x=>x.pass).length,failed:results.filter(x=>!x.pass).length}));process.exitCode=results.some(x=>!x.pass)?1:0;
