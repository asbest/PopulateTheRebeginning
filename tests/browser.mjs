import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require = createRequire(import.meta.url);
const modulePath = process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium} = modulePath ? await import(pathToFileURL(modulePath).href) : require('playwright');
const root = path.resolve(import.meta.dirname, '..');
await fs.mkdir(path.join(root,'test-results'),{recursive:true});
const browser = await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const context = await browser.newContext({viewport:{width:1440,height:900}});
const page = await context.newPage();
const errors=[], requests=[], results=[];
page.on('pageerror',e=>{errors.push(e.stack||String(e));console.log('RUNTIME '+(e.stack||String(e)));});
page.on('console',m=>{if(m.type()==='error' && /THREE|Shader|WebGL|Init failed|RAPIER|Uncaught/i.test(m.text()))errors.push(m.text());});
page.on('requestfailed',r=>requests.push({url:r.url(),reason:r.failure()?.errorText}));
page.on('response',r=>{if(r.status()>=400)requests.push({url:r.url(),reason:`HTTP ${r.status()}`});});
page.on('dialog',d=>d.accept());
const workflowEscape=value=>String(value).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
function reportFailure(name,error){if(process.env.GITHUB_ACTIONS==='true')console.log(`::error title=${workflowEscape(name)}::${workflowEscape(error?.stack||error)}`);}
async function check(name,fn){try{const detail=await fn();results.push({name,pass:true,detail});console.log('PASS '+name);}catch(e){results.push({name,pass:false,detail:String(e)});console.log('FAIL '+name+' '+String(e));reportFailure(name,e);}}
async function controlCenter(target,selector){
 return target.evaluate(selector=>{
  const element=document.querySelector(selector);
  if(!element)throw new Error('Missing control: '+selector);
  element.scrollIntoView({block:'nearest',inline:'nearest'});
  const rect=element.getBoundingClientRect();
  if(rect.width<1||rect.height<1)throw new Error('Hidden control: '+selector);
  return {x:rect.left+rect.width/2,y:rect.top+rect.height/2};
 },selector);
}
async function watchSpellPress(target){
 await target.evaluate(()=>{
  const button=document.getElementById('btn-blast');
  window.__heldSpellButton=button;
  window.__spellPressEvents=[];
  for(const type of ['pointerdown','pointerup','pointerleave','pointercancel'])
   button.addEventListener(type,event=>window.__spellPressEvents.push({type,pointerType:event.pointerType,button:event.button}));
 });
}
async function waitForSpellName(target){
 try{await target.locator('#spell-name-tooltip[aria-hidden="false"]').waitFor({state:'visible',timeout:15000});}
 catch(error){
  const diagnostic=await target.evaluate(()=>({events:window.__spellPressEvents,
   oldButtonConnected:window.__heldSpellButton?.isConnected,
   sameButton:window.__heldSpellButton===document.getElementById('btn-blast'),
   tooltip:document.getElementById('spell-name-tooltip')?.outerHTML,
   currentAction:window.state?.currentAction})).catch(()=>null);
  throw new Error(`${error}; spell press diagnostic: ${JSON.stringify(diagnostic)}`);
 }
}
const url=process.env.GAME_URL || 'http://127.0.0.1:8765';
try {
 await page.goto(url+'/?test=1',{waitUntil:'load',timeout:60000});
 await page.waitForURL(current=>current.pathname.endsWith('/PopulateTheRebeginning.html') && current.searchParams.has('test'),{timeout:60000});
 await page.waitForFunction(()=>window.gameTestAPI && window.state?.shaman && window.state.renderer,null,{timeout:90000});
 await check('Local entry point and WebGL renderer',async()=>{
  const data=await page.evaluate(()=>({url:location.href,renderer:state.renderer.getContext().getParameter(state.renderer.getContext().VERSION),physics:!!state.physicsWorld,units:state.units.length}));
  if(!data.url.startsWith(url)||!new URL(data.url).searchParams.has('test')||!data.physics||data.units<2)throw new Error(JSON.stringify(data));return data;
 });
 await page.evaluate(()=>{window.closeHelp();window.closeStoryOverlay();if(state.isPaused)window.togglePause();});
 await page.waitForTimeout(1200);
 await check('First fireball avoids bulk shader compilation',async()=>page.evaluate(()=>{
  if(!state.fireballShadersReady)throw new Error('Fireball shaders were not warmed during loading');
  const start=state.shaman.mesh.position.clone().add(new THREE.Vector3(0,3,0));
  const projectile=new gameTestAPI.Fireball(start,start.clone().add(new THREE.Vector3(8,0,0)),0);
  const before=state.renderer.info.programs.map(program=>program.cacheKey);
  try{state.renderer.render(state.scene,state.camera);}finally{state.scene.remove(projectile.mesh);if(projectile.light)projectile.light.dispose();}
  const after=state.renderer.info.programs.map(program=>program.cacheKey);
  if(after.length-before.length>2)throw new Error(`First fireball compiled ${after.length-before.length} shader programs: ${JSON.stringify({tier:state.graphicsQuality.tier,added:after.filter(key=>!before.includes(key))})}`);
  return {tier:state.graphicsQuality.tier,programsBefore:before.length,programsAfter:after.length};
 }));
 await check('Six detailed faction-colored building meshes',async()=>page.evaluate(()=>{
  const report=[];
  for(const kind of ['hut','tower','warrior','fire','spy','shipyard']){const model=Art.building(kind,0xff4500);let meshes=0,banner=false;model.traverse(n=>{if(n.isMesh)meshes++;if(n.userData.isFactionBanner)banner=true;});if(meshes<10||!banner)throw new Error(kind+' incomplete');report.push({kind,meshes});}
  return report;
 }));
 await check('Cinematic camera and instanced coastal scenery remain interactive',async()=>{
  const report=await page.evaluate(()=>{
   const palms=Object.values(state.chunks).flatMap(chunk=>chunk.userData?.palms?.data||[]).length;
   const shoreRocks=Object.values(state.chunks).flatMap(chunk=>chunk.userData?.groundCover?.stones?.data||[]).filter(d=>d.shore).length;
   state.cameraLookAt.copy(state.shaman.mesh.position);
   window.setCameraView('cinematic');
   state.camera.updateMatrixWorld();
   const target=state.shaman.mesh.position.clone().add(new THREE.Vector3(0,1.3,0)).project(state.camera);
   state.currentAction='select';
   return {view:state.cameraView,perspective:state.camera===state.cinematicCamera,
    palms,shoreRocks,stored:localStorage.getItem('camera-view'),
    target:{x:(target.x+1)*window.innerWidth/2,y:(1-target.y)*window.innerHeight/2}};
  });
  if(report.target.x>80&&report.target.x<1280&&report.target.y>35&&report.target.y<850)
   await page.mouse.click(report.target.x,report.target.y);
  report.selected=await page.evaluate(()=>state.selectedUnits.includes(state.shaman));
  const movePoint=await page.evaluate(()=>{
   const meshes=Object.values(state.chunks).map(chunk=>chunk.children[0]).filter(Boolean);
   const p=state.shaman.mesh.position;
   for(let dy=-100;dy<=140;dy+=40)for(let dx=-160;dx<=160;dx+=40){
    const x=window.innerWidth/2+dx,y=window.innerHeight/2+dy;
    state.raycaster.setFromCamera(new THREE.Vector2(x/window.innerWidth*2-1,1-y/window.innerHeight*2),state.camera);
    const hit=state.raycaster.intersectObjects(meshes)[0];
    if(hit&&hit.point.y>CONFIG.TERRAIN.WATER_LEVEL+.5&&Math.hypot(hit.point.x-p.x,hit.point.z-p.z)>3&&Math.hypot(hit.point.x-p.x,hit.point.z-p.z)<25)
     return {x,y};
   }
   return null;
  });
  if(movePoint)await page.mouse.click(movePoint.x,movePoint.y,{button:'right'});
  report.ordered=!!movePoint&&await page.evaluate(()=>!!(state.shaman.finalDest||state.shaman.target));
  await page.screenshot({path:path.join(root,'test-results','browser-cinematic.png')});
  await page.keyboard.press('c');
  report.shortcut=await page.evaluate(()=>state.cameraView==='strategy'&&state.camera===state.orthoCamera&&
   document.getElementById('btn-camera-view').textContent.includes('Strategy'));
  if(report.view!=='cinematic'||!report.perspective||!report.selected||!report.ordered||report.palms<1||report.shoreRocks<1||report.stored!=='cinematic')
   throw new Error(JSON.stringify(report));
  if(!report.shortcut)throw new Error('Camera shortcut did not restore strategy view: '+JSON.stringify(report));
  return report;
 });
 await check('All six unit types retain animation rig and statistics',async()=>page.evaluate(()=>{
  const p=state.shaman.mesh.position;const report=[];
  for(const kind of ['wild','warrior','firewarrior','spy','shaman','airship']){const u=new Humanoid(0,kind,p.x+3,p.z+3);state.units.push(u);if(!u.mesh||u.hp<=0||(!u.isVehicle&&!u.legL))throw new Error(kind);report.push({kind,hp:u.hp});}
  return report;
 }));
 await check('Replacement character meshes, HD materials, pivots and conversion',async()=>page.evaluate(async()=>{
  await Characters.ready;
  const dimensions=Object.fromEntries(Object.entries(Characters.tiles).map(([k,t])=>[k,[t.image.width,t.image.height]]));
  if(dimensions.skin[0]<1024||dimensions.cloth[0]<1024)throw new Error('HD textures missing');
  const roles=[];
  for(const type of ['wild','shaman','warrior','firewarrior','spy','airship']){
   const u=state.units.find(u=>u.type===type);if(u.mesh.userData.characterVersion!==2)throw new Error('Old model: '+type);
   if(type!=='airship'){
    if(!u.armR.userData.lower||!u.legL.userData.lower||!u.head.getObjectByName('SculptedFace'))throw new Error('Rig missing: '+type);
    const beforeState=u.state;u.state='idle';u.isGrounded=true;u.updateWalkAnim(10,.8,.1);u.mesh.position.x+=.1;u.updateWalkAnim(10,.8,.1);u.mesh.position.x-=.1;u.state=beforeState;if(!Number.isFinite(u.legL.rotation.x)||Math.abs(u.legL.rotation.x)<.001)throw new Error('Walking animation missing');
   }
   const cloth=[];u.mesh.traverse(n=>{if(n.userData.characterFaction)cloth.push(n);});
   u.setFaction(1);const before=cloth.map(n=>n.material.color.getHex());u.setFaction(0);
   if(!cloth.length||cloth.some((n,i)=>n.material.color.getHex()===before[i]))throw new Error('Faction cloth failed: '+type);
   roles.push(type);
  }
  return {dimensions,roles};
 }));
 await check('New character combat animations retain damage, fireballs and spy conversion',async()=>page.evaluate(()=>{
  const p=state.shaman.mesh.position,victim=new Humanoid(1,'warrior',p.x+1,p.z+1);state.units.push(victim);
  victim.hp=victim.maxHp=1000;const clock=state.clock.getElapsedTime;state.clock.getElapsedTime=()=>100;
  const report=[];
  try{for(const type of ['wild','warrior','shaman','firewarrior','spy']){
   const u=state.units.find(u=>u.type===type&&u.faction===0);u.attackTarget=victim;u.lastAttackTime=100-.6/u.attackSpeed;u.attackFired=false;
   const hp=victim.hp,projectiles=state.projectiles.length;u.attack();
   if(!u.attackFired||!Number.isFinite(u.armR.rotation.x))throw new Error(type+' animation/impact missing');
   if(['wild','warrior','shaman'].includes(type)&&victim.hp>=hp)throw new Error(type+' damage missing');
   if(type==='firewarrior'){
    if(state.projectiles.length!==projectiles+1)throw new Error('Fireball missing');
    const shot=state.projectiles.at(-1);
    if(!shot.unitShot||shot.light)throw new Error('Firewarrior shot allocated a costly dynamic light');
   }
   if(type==='spy'&&victim.faction!==0)throw new Error('Spy conversion missing');
   report.push({type,damage:hp-victim.hp});u.attackTarget=null;u.attackFired=false;u.lastAttackTime=0;u.resetAnim();
  }}finally{state.clock.getElapsedTime=clock;victim.hp=0;victim.die();}
  return report;
 }));
 await check('Move command establishes a reachable destination',async()=>page.evaluate(()=>{
  const u=state.shaman; const p=u.mesh.position; const target=gameTestAPI.findNearestLand(p.x+4,p.z+2);state.selectedUnits=[u];gameTestAPI.performAction(target.x,target.z,'move');if(!u.target&&!u.finalDest)throw new Error('No destination');return {target:u.finalDest||u.target};
 }));
 await check('Spell mana cost and visual effects',async()=>page.evaluate(()=>{
  const u=state.shaman,p=u.mesh.position;state.mana=500;const before=state.activeEffects.length+state.particles.length+state.projectiles.length;gameTestAPI.performAction(p.x+2,p.z,'blast');if(state.mana!==490)throw new Error('Wrong blast cost '+state.mana);const after=state.activeEffects.length+state.particles.length+state.projectiles.length;if(after<=before)throw new Error('Missing effects');return {mana:state.mana,effects:after-before};
 }));
 await check('Fireballs reuse geometry and bound trail draw calls',async()=>page.evaluate(()=>{
  const p=state.shaman.mesh.position,start=new THREE.Vector3(p.x,p.y+2,p.z),end=start.clone().add(new THREE.Vector3(30,0,0));
  const a=new gameTestAPI.Fireball(start,end,0),b=new gameTestAPI.Fireball(start,end,0),before=state.particles.length;
  if(a.mesh.geometry!==b.mesh.geometry||a.corona.geometry!==b.corona.geometry)throw new Error('Projectile geometry duplicated');
  const cameraPos=state.camera.position.clone();state.camera.position.copy(start).add(new THREE.Vector3(0,10,10));
  for(let i=0;i<28;i++){a.update(1/60);b.update(1/60);}
  state.camera.position.copy(cameraPos);
  const trails=state.particles.slice(before).filter(e=>e.mesh.userData.sharedGeometry);
  if(trails.length>14||trails.length<2||new Set(trails.map(e=>e.mesh.geometry)).size!==1)throw new Error('Excessive or unshared trails: '+trails.length);
  state.scene.remove(a.mesh);state.scene.remove(b.mesh);a.light?.dispose();b.light?.dispose();a.active=b.active=false;
  return {trails:trails.length,shared:true};
 }));
 await check('Wheel zoom responds to gesture acceleration',async()=>page.evaluate(()=>{
  const event={deltaY:120,deltaMode:0,preventDefault(){}};state.viewScale=35;state.wheelSpeed=0;state.lastWheelAt=0;
  gameTestAPI.onWheel(event);const slow=state.viewScale-35;
  state.viewScale=35;state.wheelSpeed=1.5;state.lastWheelAt=performance.now()-16;
  gameTestAPI.onWheel(event);const fast=state.viewScale-35;
  if(fast<=slow||slow<=0)throw new Error(JSON.stringify({slow,fast}));
  return {slow,fast};
 }));
 await check('Fast mouse and finger gestures scroll and zoom farther',async()=>page.evaluate(()=>{
  const center=state.cameraLookAt.clone();state.viewScale=35;state.isFPV=false;gameTestAPI.updateCameraZoom();window.updateCameraPosition();
  const drag=(elapsed,touch)=>{
   state.cameraLookAt.copy(center);window.updateCameraPosition();state.dragStart={x:100,y:100};
   state.dragSpeed=0;state.lastDragAt=performance.now()-elapsed;state.isDragging=true;state.dragButton=0;state.selectionStart=null;
   const point={clientX:120,clientY:100};
   if(touch)gameTestAPI.onTouchMove({target:state.renderer.domElement,targetTouches:[point],preventDefault(){}});
   else gameTestAPI.onPointerMove(point);
   return state.cameraLookAt.distanceTo(center);
  };
  const slowMouse=drag(100,false),fastMouse=drag(16,false);
  const slowTouch=drag(100,true),fastTouch=drag(16,true);
  const pinch=elapsed=>{
   state.viewScale=35;state.pinchStartDist=100;state.pinchLastDist=100;
   state.pinchLastAt=performance.now()-elapsed;state.pinchSpeed=0;state.pinchStartAngle=0;state.rotateStartCamera=state.cameraRotation;
   gameTestAPI.onTouchMove({target:state.renderer.domElement,targetTouches:[{clientX:0,clientY:0},{clientX:110,clientY:0}],preventDefault(){}});
   return 35-state.viewScale;
  };
  const slowPinch=pinch(100),fastPinch=pinch(16);
  state.isDragging=false;state.pinchStartDist=0;state.cameraLookAt.copy(center);state.viewScale=35;gameTestAPI.updateCameraZoom();window.updateCameraPosition();
  if(slowMouse<=0||fastMouse<=slowMouse||fastTouch<=slowTouch||fastPinch<=slowPinch)
   throw new Error(JSON.stringify({slowMouse,fastMouse,slowTouch,fastTouch,slowPinch,fastPinch}));
  return {slowMouse,fastMouse,slowTouch,fastTouch,slowPinch,fastPinch};
 }));
 await check('Terrain deformation updates ground height',async()=>page.evaluate(()=>{
  const p=state.shaman.mesh.position;const before=getHeight(p.x+3,p.z);state.mana=500;gameTestAPI.performAction(p.x+3,p.z,'raise');const after=getHeight(p.x+3,p.z);if(after<=before||state.mana!==495)throw new Error('Raise failed');return {before,after};
 }));
 await check('Building construction keeps original mana cost',async()=>page.evaluate(()=>{
  const p=state.shaman.mesh.position;const point=gameTestAPI.findNearestLand(p.x+5,p.z+5);const worker=new Humanoid(0,'wild',point.x,point.z);state.units.push(worker);const before=state.buildings.length;state.mana=500;gameTestAPI.performAction(point.x,point.z,'build_hut');if(state.mana!==485||state.buildings.length!==before+1)throw new Error('Build failed');const b=state.buildings.at(-1);if(!b.underConstruction||b.totalBuildTime!==15)throw new Error('Construction changed');return {mana:state.mana,time:b.totalBuildTime};
 }));
 await check('Building rally point and training queue',async()=>page.evaluate(()=>{
  const p=state.shaman.mesh.position;const b=gameTestAPI.createBuilding('warrior',p.x+9,p.z,0,false,true);b.update(b.totalBuildTime+1);b.setRallyPoint(p.x+3,p.z+2);b.trainingQueue.push({timer:0.01,type:'warrior',faction:0});const before=state.units.length;b.update(0.1);if(state.units.length!==before+1||!b.rallyPoint)throw new Error('Training or rally failed');return {rally:b.rallyPoint};
 }));
 await check('Save and reload keeps tribe, world and buildings',async()=>{
  const before=await page.evaluate(()=>{state.isPaused=true;const r={units:state.units.filter(u=>u.state!=='dead').length,buildings:state.buildings.length,mana:state.mana};window.saveGame();return r;});
  await page.evaluate(()=>{window.loadGame();state.isPaused=true;});
  const after=await page.evaluate(()=>({units:state.units.length,buildings:state.buildings.length,mana:state.mana}));
  if(before.units!==after.units||before.buildings!==after.buildings||before.mana!==after.mana)throw new Error(JSON.stringify({before,after}));return after;
 });
 await check('Finished houses load without scaffolding while unfinished houses retain progress',async()=>{
  const before=await page.evaluate(()=>{
   state.isPaused=true;
   const p=state.shaman.mesh.position;
   const finished=gameTestAPI.createBuilding('tower',p.x+7,p.z+7,0,false,true);
   const unfinished=gameTestAPI.createBuilding('spy',p.x+12,p.z+7,0,false,true);
   finished.update(finished.totalBuildTime+1);
   unfinished.update(unfinished.totalBuildTime*.4);
   const positions=[finished,unfinished].map(b=>({type:b.type,x:b.mesh.position.x,z:b.mesh.position.z}));
   window.saveGame();return positions;
  });
  await page.evaluate(()=>{window.loadGame();state.isPaused=true;});
  const after=await page.evaluate(positions=>positions.map(({type,x,z})=>{
   const b=state.buildings.find(b=>b.type===type&&Math.abs(b.mesh.position.x-x)<.01&&Math.abs(b.mesh.position.z-z)<.01);
   const vertices=b?.pathVisual?.geometry.attributes.position;
   let pathFlat=true;
   if(vertices)for(let i=0;i<vertices.count;i+=8)for(let j=1;j<8;j++)
    if(Math.abs(vertices.getY(i+j)-vertices.getY(i))>.001)pathFlat=false;
   return b&&{type,underConstruction:b.underConstruction,meshScale:b.visualMesh.scale.y,scaffolding:b.constructionRig.visible,scaffoldScale:b.constructionRig.scale.y,path:!!b.pathVisual,pathVisible:b.pathVisual?.visible,pathFlat};
  }),before);
  if(!after[0]||after[0].underConstruction||after[0].scaffolding||after[0].meshScale!==1||
     (after[0].path&&(!after[0].pathVisible||!after[0].pathFlat))||
     !after[1]||!after[1].underConstruction||!after[1].scaffolding||
     (after[1].path&&after[1].pathVisible)||after[1].meshScale<.35||after[1].meshScale>.45||after[1].scaffoldScale<.45||after[1].scaffoldScale>.55)
   throw new Error(JSON.stringify(after));
  return after;
 });
 await check('SVG unit portraits and spell symbols render as graphics',async()=>{
  await page.evaluate(()=>{state.selectedUnits=[state.shaman];gameTestAPI.updateUnitList();gameTestAPI.updateContextMenus();});
  if(await page.locator('#unit-list .unit-item svg').count()<2||await page.locator('#right-menu svg').count()<10)throw new Error('SVG icons missing');
  if((await page.locator('#unit-list').innerText()).includes('<svg'))throw new Error('SVG markup is visible as text');
  const actions=await page.evaluate(()=>Array.from(document.querySelectorAll('#right-menu .action-btn'),button=>({
   label:button.getAttribute('aria-label'),title:button.title,text:button.textContent.trim(),icon:!!button.querySelector('svg')
  })));
  if(actions.length<19||actions.some(action=>!action.icon||!action.label||!action.title||action.text))throw new Error('Spell icons are obscured or missing accessible labels: '+JSON.stringify(actions));
 });
 await check('Holding a spell reveals its full name',async()=>{
  const point=await controlCenter(page,'#btn-blast');
  const before=await page.evaluate(()=>state.currentAction);
  await watchSpellPress(page);
  await page.mouse.move(point.x,point.y);
  await page.mouse.down();
  try{
   await waitForSpellName(page);
   const shown=await page.evaluate(()=>({name:document.getElementById('spell-name-tooltip').textContent,
    icon:!!document.querySelector('#btn-blast svg'),action:state.currentAction,
    tip:document.getElementById('spell-name-tooltip').getBoundingClientRect().toJSON(),
    button:document.getElementById('btn-blast').getBoundingClientRect().toJSON()}));
   if(shown.name!=='Blast (Fireball)'||!shown.icon||shown.action!==before||
      shown.tip.right>shown.button.left||shown.tip.left<0||shown.tip.bottom>900)
    throw new Error(JSON.stringify(shown));
  }finally{await page.mouse.up();}
  if(await page.locator('#spell-name-tooltip').isVisible())throw new Error('Spell name remained visible after release');
  await page.evaluate(()=>window.selectAction('move'));
  await page.mouse.click(point.x,point.y);
  if(await page.evaluate(()=>state.currentAction)!=='blast'||await page.locator('#spell-name-tooltip').isVisible())
   throw new Error('A short click did not select Blast cleanly');
  await page.evaluate(()=>window.selectAction('move'));
  await page.mouse.move(point.x,point.y);
  await page.mouse.down();
  await page.mouse.move(point.x-100,point.y);
  await page.waitForTimeout(550);
  if(await page.locator('#spell-name-tooltip').isVisible())throw new Error('Moving away did not cancel the spell name');
  await page.mouse.up();
 });
 await check('Airship cargo, upgrades, rally points and campaign survive save/load',async()=>{
  const before=await page.evaluate(()=>{
   state.isPaused=true;const p=state.shaman.mesh.position;
   const ship=new Humanoid(0,'airship',p.x+2,p.z);state.units.push(ship);ship.mesh.position.y=18;
   const passenger=new Humanoid(0,'warrior',p.x,p.z);state.units.push(passenger);passenger.upgrade();ship.loadUnit(passenger);
   const b=state.buildings.find(b=>b.faction===0);b.setRallyPoint(p.x+4,p.z+4);b.trainingQueue=[{timer:1.5,type:'warrior',faction:0}];
   state.isCampaign=true;state.campaignLevel=4;state.matchSettings.suddenDeath=true;
   const result={units:state.units.filter(u=>u.state!=='dead').length,ship:ship.id,passenger:passenger.id,building:b.type,level:4};window.saveGame();return result;
  });
  await page.evaluate(()=>{window.loadGame();state.isPaused=true;});
  const after=await page.evaluate(({ship,passenger,building})=>{
   state.isPaused=true;const s=state.units.find(u=>u.id===ship),p=state.units.find(u=>u.id===passenger),b=state.buildings.find(b=>b.faction===0&&b.type===building);
   return {units:state.units.filter(u=>u.state!=='dead').length,passengers:s?.passengers.length,upgrades:p?.upgradeLevel,transported:p?.state,y:s?.mesh.position.y,rally:!!b?.rallyPoint,training:b?.trainingQueue.length,level:state.campaignLevel,suddenDeath:state.matchSettings.suddenDeath};
  },before);
  if(after.units!==before.units||after.passengers!==1||after.upgrades!==1||after.transported!=='transported'||after.y!==18||!after.rally||after.training!==1||after.level!==4||!after.suddenDeath)throw new Error(JSON.stringify({before,after}));return after;
 });
 await check('Keyboard selection, action hotkeys and pointer controls',async()=>{
  await page.evaluate(()=>{state.isPaused=true;window.closeStoryOverlay();document.getElementById('pause-menu').style.display='none';gameTestAPI.updateUnitList();});
  await page.keyboard.press('Control+a');
  if(await page.evaluate(()=>state.selectedUnits.length)<2)throw new Error('Select all failed');
  await page.keyboard.press('Escape');
  if(await page.evaluate(()=>state.selectedUnits.length)!==0)throw new Error('Escape failed');
  const stableList=await page.evaluate(()=>{
   const first=document.querySelector('#unit-list .unit-item'),id=first?.dataset.unitId;
   gameTestAPI.updateUnitList();const sameRefresh=first===document.querySelector(`[data-unit-id="${id}"]`);
   const probe={id:'ui-stability-probe',isShaman:false,faction:1,type:'wild',hp:1,maxHp:1,state:'idle',selectRing:{visible:false},mesh:{position:new THREE.Vector3()}};
   state.units.push(probe);gameTestAPI.updateUnitList();const sameRosterChange=first===document.querySelector(`[data-unit-id="${id}"]`);
   state.units.pop();gameTestAPI.updateUnitList();return {sameRefresh,sameRosterChange,connected:first?.isConnected};
  });
  if(!stableList.sameRefresh||!stableList.sameRosterChange||!stableList.connected)throw new Error('Unit list replaced an active pointer target: '+JSON.stringify(stableList));
  const unitPoint=await controlCenter(page,'#unit-list .unit-item');
  await page.mouse.click(unitPoint.x,unitPoint.y);
  if(await page.evaluate(()=>state.selectedUnits.length)!==1)throw new Error('Pointer unit selection failed');
  await page.keyboard.press('1');
  if(await page.evaluate(()=>state.currentAction)!=='blast')throw new Error('Spell hotkey failed');
  await page.keyboard.press('Space');
  const zoom=await page.evaluate(()=>state.viewScale);await page.mouse.move(720,450);await page.mouse.wheel(0,-120);
  if(await page.evaluate(()=>state.viewScale)===zoom)throw new Error('Mouse wheel zoom failed');
  await page.evaluate(()=>{window.selectAction('move');});
 });
 await check('Desktop HUD screenshot renders without shader errors',async()=>{
  await page.evaluate(()=>{window.closeHelp();window.closeStoryOverlay();document.getElementById('pause-menu').style.display='none';state.selectedUnits=[state.shaman];gameTestAPI.updateContextMenus();state.isPaused=false;});
  await page.waitForTimeout(1800);
  await page.screenshot({path:path.join(root,'test-results','browser-desktop.png')});
  if(errors.length)throw new Error(errors.join('\n'));return {errors:errors.length};
 });
 await check('Mobile viewport keeps touch controls and actions visible',async()=>{
  await page.setViewportSize({width:390,height:844});await page.waitForTimeout(600);
  const data=await page.evaluate(()=>{const r=document.getElementById('right-menu').getBoundingClientRect();const j=document.getElementById('joystick-area').getBoundingClientRect();const icons=Array.from(document.querySelectorAll('#right-menu .action-btn'),button=>{const b=button.getBoundingClientRect(),s=button.querySelector('svg')?.getBoundingClientRect();return {button:{x:b.x,y:b.y,right:b.right,bottom:b.bottom},icon:s&&{x:s.x,y:s.y,right:s.right,bottom:s.bottom}};});return {right:{x:r.x,width:r.width},joystick:{x:j.x,y:j.y},canvas:!!document.querySelector('canvas'),icons};});
  if(data.right.x<0||data.right.x+data.right.width>390||!data.canvas)throw new Error(JSON.stringify(data));
  if(data.icons.some(({button,icon})=>!icon||icon.x<button.x||icon.y<button.y||icon.right>button.right||icon.bottom>button.bottom))throw new Error('Mobile spell icon escapes its button: '+JSON.stringify(data.icons));
  await page.screenshot({path:path.join(root,'test-results','browser-mobile.png')});return data;
 });
 await check('Touch selection and spell targeting on a phone viewport',async()=>{
  const mobile=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
  const phone=await mobile.newPage();phone.on('dialog',d=>d.accept());phone.on('pageerror',e=>errors.push(String(e)));
  try {
   await phone.goto(url+'/PopulateTheRebeginning.html?test=1',{waitUntil:'load',timeout:60000});
   await phone.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
   await phone.evaluate(()=>{window.closeHelp();window.closeStoryOverlay();document.getElementById('pause-menu').style.display='none';state.mana=500;state.isPaused=true;gameTestAPI.updateUnitList();});
   const unitPoint=await controlCenter(phone,'#unit-list .unit-item');
   await phone.touchscreen.tap(unitPoint.x,unitPoint.y);
   if(await phone.evaluate(()=>state.selectedUnits.length)!==1)throw new Error('Touch unit selection failed');
   const blastPoint=await controlCenter(phone,'#btn-blast');
   await watchSpellPress(phone);
   const touch=await mobile.newCDPSession(phone);
   await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:blastPoint.x,y:blastPoint.y}]});
   try{
    await waitForSpellName(phone);
    const shown=await phone.evaluate(()=>({name:document.getElementById('spell-name-tooltip').textContent,
     tip:document.getElementById('spell-name-tooltip').getBoundingClientRect().toJSON(),
     button:document.getElementById('btn-blast').getBoundingClientRect().toJSON()}));
    if(shown.name!=='Blast (Fireball)'||shown.tip.left<0||shown.tip.right>390||
       shown.tip.right>shown.button.left||shown.tip.top<0||shown.tip.bottom>844)
     throw new Error('Touch spell name is clipped or misplaced: '+JSON.stringify(shown));
   }finally{
    await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await touch.detach();
   }
   if(await phone.locator('#spell-name-tooltip').isVisible())throw new Error('Touch release did not hide the spell name');
   await phone.evaluate(()=>window.selectAction('move'));
   await phone.touchscreen.tap(blastPoint.x,blastPoint.y);
   if(await phone.evaluate(()=>state.currentAction)!=='blast'||await phone.locator('#spell-name-tooltip').isVisible())
    throw new Error('Short touch did not select Blast cleanly');
   const point=await phone.evaluate(()=>{const p=state.shaman.mesh.position.clone();p.x+=1;const v=p.project(state.camera);return {x:(v.x+1)*innerWidth/2,y:(1-v.y)*innerHeight/2};});
   await phone.touchscreen.tap(point.x,point.y);
   const mana=await phone.evaluate(()=>state.mana);
   if(mana>499||mana<480)throw new Error('Touch spell did not consume mana: '+mana);
    await phone.screenshot({path:path.join(root,'test-results','browser-touch.png'),animations:'disabled',timeout:120000});return {mana};
  }finally{await mobile.close();}
 });
 await page.setViewportSize({width:1440,height:900});
 // Each campaign startup is checked independently, including its biome and AI roster.
 for(let level=1;level<=12;level++){
  await check('Campaign '+level+' startup',async()=>{
   await page.evaluate(level=>{localStorage.setItem(CONFIG.SAVED_KEYS.START_CAMPAIGN,String(level));},level);
   await page.goto(url+'/PopulateTheRebeginning.html?test=1',{waitUntil:'load',timeout:60000});
   await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
   const data=await page.evaluate(()=>({level:state.campaignLevel,isCampaign:state.isCampaign,biome:state.matchSettings.biome,ai:window.enemyAIs.length,units:state.units.length}));
   if(data.level!==level||!data.isCampaign||data.ai<1||data.units<2)throw new Error(JSON.stringify(data));return data;
  });
 }
  await check('No runtime errors or failed local asset requests',async()=>{const failed=requests.filter(r=>r.url.startsWith(url)&&!r.url.endsWith('.map')&&r.reason!=='net::ERR_ABORTED');if(errors.length||failed.length)throw new Error(JSON.stringify({errors,failed}));return {errors:0,failed:0};});
} catch(e) {results.push({name:'Test harness',pass:false,detail:String(e)});console.error(e);reportFailure('Browser test harness',e);}
finally{await browser.close();await fs.writeFile(path.join(root,'test-results','browser-report.json'),JSON.stringify({date:new Date().toISOString(),results,errors,requests},null,2));}
console.log(JSON.stringify({passed:results.filter(r=>r.pass).length,failed:results.filter(r=>!r.pass).length}));
process.exitCode=results.some(r=>!r.pass)?1:0;
