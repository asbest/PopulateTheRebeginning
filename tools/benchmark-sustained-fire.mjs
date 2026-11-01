import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/shader|webgl/i.test(m.text()))errors.push(m.text());});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.fireballShadersReady,null,{timeout:90000});
 const report=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;window.enemyAIs=[];
  const fx=gameTestAPI.FireballFxManager,center=state.shaman.mesh.position.clone(),units=[],buildings=[];
  const render=()=>{state.renderer.render(state.scene,state.camera);return state.renderer.info.render.calls;};
  fx.clear();const baseline=render(),programs=state.renderer.info.programs.length;
  const shots=Array.from({length:80},(_,i)=>new gameTestAPI.Fireball(center.clone().add(new THREE.Vector3(i*.01,3,0)),center.clone().add(new THREE.Vector3(10,1,0)),0,0,0,false,i%2===0));
  state.projectiles.push(...shots);fx.update(0);
  const flightCalls=render()-baseline,flightPrograms=state.renderer.info.programs.length-programs;
  if(fx.projectileMeshes.some(mesh=>!mesh.visible||mesh.count!==80)||shots.some(shot=>shot.mesh.visible))throw new Error('Volley was not batched');
  const first=shots[0],matrix=new THREE.Matrix4(),position=new THREE.Vector3(),scale=new THREE.Vector3();
  first.update(.01);fx.update(0);fx.projectileMeshes[0].getMatrixAt(0,matrix);
  position.setFromMatrixPosition(matrix);scale.setFromMatrixScale(matrix);
  if(position.distanceTo(first.mesh.position)>.0001||Math.abs(scale.x-.5)>.0001)throw new Error('Batch lost projectile position or firewarrior size');
  first.mesh.position.copy(first.target);first.explode();fx.update(0);
  if(fx.projectileMeshes[0].count!==79)throw new Error('Exploded projectile remained visible');
  for(const shot of shots.slice(1,-8)){state.scene.remove(shot.mesh);shot.active=false;}
  fx.update(0);
  if(fx.projectileMeshes.some(mesh=>mesh.visible)||shots.slice(-8).some(shot=>!shot.mesh.visible))
   throw new Error('Small volleys did not return to normal rendering');
  for(const shot of shots){state.scene.remove(shot.mesh);shot.active=false;}
  state.projectiles=state.projectiles.filter(shot=>!shots.includes(shot));fx.clear();
  gameTestAPI.SpatialHash.update();
  const hitBefore=state.shaman.hp;
  const target=state.shaman.mesh.position.clone();
  const hit=new gameTestAPI.Fireball(target.clone().add(new THREE.Vector3(8,3,0)),target,1,1,0);
  hit.mesh.position.copy(target);hit.explode();
  if(state.shaman.hp>=hitBefore)throw new Error('Batch change disabled damage');
  fx.clear();
  for(let i=0;i<40;i++){
   const unit=new Humanoid(0,'warrior',center.x+(i%8)*.7,center.z+Math.floor(i/8)*.7);
   unit.maxHp=100000;unit.hp=99000;unit.findTarget=()=>null;state.units.push(unit);unit.update(0);units.push(unit);
  }
  for(let i=0;i<4;i++){
   const building=gameTestAPI.createBuilding('warrior',center.x+12+i*9,center.z,0,false,true);
   building.update(building.totalBuildTime+1);building.hp-=1;building.update(0);buildings.push(building);
  }
  for(const particle of state.particles)state.scene.remove(particle.mesh);state.particles.length=0;fx.clear();
  const beforeBurn=render(),health=units[0].hp;
  for(const owner of [...units,...buildings])owner.burnTimer=10;
  let peakParticles=0,peakGlow=0,peakSmoke=0;
  const start=performance.now();
  for(let frame=0;frame<180;frame++){
   if(frame%15===0)for(let i=0;i<16;i++){
    const end=center.clone().add(new THREE.Vector3(i*.05,1,0));
    const shot=new gameTestAPI.Fireball(end.clone().add(new THREE.Vector3(-8,3,0)),end,0,0,0,false,true);
    shot.mesh.position.copy(end);shot.explode();
   }
   gameTestAPI.updateTreeRegrowth(1/60);
   for(const unit of units)unit.update(1/60);
   for(const building of buildings)building.update(1/60);
   for(let i=state.particles.length-1;i>=0;i--)if(!state.particles[i].update(1/60))state.particles.splice(i,1);
   fx.update(1/60);
   peakParticles=Math.max(peakParticles,state.particles.length);
   peakGlow=Math.max(peakGlow,fx.layers.glow.items.length);peakSmoke=Math.max(peakSmoke,fx.layers.smoke.items.length);
  }
  const burnCpuMs=performance.now()-start,burnCalls=render()-beforeBurn;
  const burnDamage=health-units[0].hp;
  if(burnDamage<=0)throw new Error('Burn damage stopped');
  for(const owner of [...units,...buildings])owner.burnTimer=0;
  fx.update(3);render();
  const expired=Object.values(fx.layers).every(layer=>!layer.mesh.visible&&layer.items.length===0)&&fx.projectileMeshes.every(mesh=>!mesh.visible);
  return {projectiles:80,flightCalls,burningUnits:40,burningBuildings:4,burnCalls,peakParticles,peakGlow,peakSmoke,burnCpuMs,burnDamage,flightPrograms,salvos:12,expired};
 });
 if(errors.length||report.flightCalls>2||report.flightPrograms>2||report.burnCalls>4||report.peakParticles>8||report.peakGlow>384||report.peakSmoke>160||!report.expired)throw new Error(JSON.stringify({errors,report}));
 console.log('PASS sustained fire keeps projectile and afterburn rendering bounded '+JSON.stringify(report));
}finally{await browser.close();}
