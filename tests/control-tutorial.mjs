import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{}),
 ...(process.argv.includes('--software-rendering')?{args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']}:{})});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 // This suite exercises controls; high-resolution rendering is covered separately.
 // Keep software WebGL on CI from starving the input and animation-frame loop.
 await page.addInitScript(()=>localStorage.setItem('graphics-quality','low'));
 async function click(selector){
  await page.waitForFunction(selector=>{
   const element=document.querySelector(selector),rect=element?.getBoundingClientRect();
   return element&&!element.disabled&&rect.width>0&&rect.height>0&&getComputedStyle(element).visibility!=='hidden';
  },selector,{timeout:60000,polling:100});
  const point=await page.evaluate(selector=>{
   const element=document.querySelector(selector);element.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'});
   const rect=element.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
   if(!element.contains(document.elementFromPoint(x,y)))throw new Error('Control is obscured: '+selector);
   return {x,y};
  },selector);
  // Avoid Playwright's animation-frame stability/navigation waits; keep actual
  // pointer input and explicit assertions of every resulting tutorial state.
  await page.mouse.click(point.x,point.y);
 }
 page.on('pageerror',e=>errors.push(String(e)));
 const url=(process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1&tutorial=1';
 await page.goto(url);await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 await click('#story-close');
 const step=n=>page.waitForFunction(n=>{state.controlTutorial?.update();return state.controlTutorial?.step===n;},n,{timeout:60000,polling:100}).catch(async e=>{const diagnostic=await page.evaluate(()=>({step:state.controlTutorial.step,paused:state.isPaused,heading:document.querySelector('#control-tutorial h2')?.textContent,shaman:state.shaman.mesh.position.toArray(),mana:state.mana,lastUnit:state.units.at(-1)?.type,selected:state.selectedUnits.map(u=>u.type)}));throw new Error('Tutorial step '+n+': '+e+' '+JSON.stringify(diagnostic));});
 await step(0);
 await page.reload();await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});await click('#story-close');
 if(await page.locator('#control-tutorial').count())throw new Error('Unfinished introduction automatically appeared on second start');
 await page.evaluate(()=>showHelp());await click('#help-replay-tutorial');await step(0);
 await click('#unit-list .unit-item[aria-label^="shaman, tribe 0,"]');await step(1);
 await page.mouse.move(800,550);await page.mouse.down();await page.mouse.move(950,600,{steps:8});await page.mouse.up();await step(2);
 await page.mouse.wheel(0,-120);await step(3);
 const ground=async()=>page.evaluate(()=>{
  const p=state.shaman.mesh.position,target=gameTestAPI.findNearestLand(p.x+2,p.z+1);
  const projected=new THREE.Vector3(target.x,getSurfaceHeight(target.x,target.z),target.z).project(state.camera);
  return {x:(projected.x+1)*innerWidth/2,y:(1-projected.y)*innerHeight/2};
 });
 // Bring the controlled unit back into view after practicing camera movement.
 await page.evaluate(()=>{state.cameraLookAt.copy(state.shaman.mesh.position);updateCameraPosition();state.camera.updateMatrixWorld(true);});
 let point=await ground();await page.mouse.click(point.x,point.y,{button:'right'});await step(4);
 await click('#btn-heal');await step(5);
 point=await ground();await page.mouse.click(point.x,point.y);await step(6);
 // The controls above use real pointer input. The economy fixture below uses
 // real action handlers with deterministic simulation ticks, without waiting
 // for dozens of construction seconds or redrawing an idle software-GPU world.
 await page.evaluate(()=>{
  state.renderer.render=()=>{};window.requestAnimationFrame=()=>0;window.enemyAIs=[];state.mana=1000;
  const p=state.shaman.mesh.position.clone().add(new THREE.Vector3(70,0,0));
  for(let x=Math.floor(p.x)-20;x<=p.x+20;x++)for(let z=Math.floor(p.z)-20;z<=p.z+20;z++)
   state.terrainMods.set(`${x},${z}`,8-gameTestAPI.getBaseHeight(x,z));
  state.heightCache.clear();gameTestAPI.updateChunks(true);state.shaman.placeOnGround(p.x,p.z);
  state.cameraLookAt.copy(state.shaman.mesh.position);updateCameraPosition();
  window.tutorialEconomy={x:p.x,z:p.z};
 });
 await click('#btn-create');await step(7);
 await page.evaluate(()=>{
  const {x,z}=tutorialEconomy;state.mana=0;gameTestAPI.performAction(x+2,z+2,'create');state.controlTutorial.update();
  if(state.controlTutorial.step!==7)throw Error('Unaffordable creation advanced the introduction');
  state.mana=1000;gameTestAPI.performAction(x+2,z+2,'create');gameTestAPI.SpellWindup.update(1);
  tutorialEconomy.worker=state.units.at(-1);
 });await step(8);
 const selectWorker=async()=>{
  const id=await page.evaluate(()=>tutorialEconomy.worker.id);await click(`.unit-item[data-unit-id="${id}"]`);
 };
 await page.evaluate(()=>gameTestAPI.updateUnitList());await selectWorker();await step(9);
 await click('#btn-build_warrior');await step(10);
 await page.evaluate(()=>{
  const {x,z}=tutorialEconomy;
  const before=state.buildings.length;state.mana=0;gameTestAPI.performAction(x+7,z+2,'build_warrior');state.controlTutorial.update();
  if(state.controlTutorial.step!==10||state.buildings.length!==before)throw Error('Failed placement advanced the introduction');
  state.mana=1000;gameTestAPI.performAction(x+7,z+2,'build_warrior');tutorialEconomy.school=state.buildings.at(-1);
 });await step(11);
 await page.evaluate(()=>{
  state.controlTutorial.update();if(state.controlTutorial.step!==11)throw Error('Unfinished school passed the construction lesson');
  tutorialEconomy.school.update(tutorialEconomy.school.totalBuildTime+1);
 });await step(12);
 await page.setViewportSize({width:390,height:320});
 const longCard=await page.locator('#control-tutorial').boundingBox();
 if(longCard.x<0||longCard.y<0||longCard.x+longCard.width>390||longCard.y+longCard.height>320)
  throw Error('Long training instructions are clipped on a short phone screen');
 await page.screenshot({path:'test-results/tutorial-training-mobile.png'});
 await page.setViewportSize({width:1200,height:800});
 await page.evaluate(()=>{
  const {worker,school}=tutorialEconomy;worker.placeOnGround(school.mesh.position.x,school.mesh.position.z);
  gameTestAPI.BuildingSpatialHash.update();worker.updateTicker=9;worker.update(0);state.controlTutorial.update();
  if(state.controlTutorial.step!==12||school.trainingQueue.length)throw Error('Proximity alone advanced training');
  gameTestAPI.performAction(school.mesh.position.x,school.mesh.position.z,'move');
 });await step(13);
 await page.evaluate(()=>{
  const {worker,school}=tutorialEconomy;worker.updateTicker=9;worker.update(0);state.controlTutorial.update();
  if(!school.trainingQueue.length)throw Error('Explicit school order did not start training: '+JSON.stringify({state:worker.state,target:worker.aiTrainingTarget,school:school.id,position:worker.mesh.position.toArray(),schoolPosition:school.mesh.position.toArray(),tick:worker.updateTicker}));
  school.update(9.9);state.controlTutorial.update();
  if(state.controlTutorial.step!==13)throw Error('Training lesson finished too soon');
  school.update(.1);
 });await step(14);
 // With the trainee consumed, selecting the Shaman must point back to Create Brave.
 await click('#unit-list .unit-item[aria-label^="shaman, tribe 0,"]');
 await page.evaluate(()=>{
  state.controlTutorial.update();
  // Other workers may exist in this campaign; the hint may point to their portraits.
  if(!document.querySelector('.tutorial-highlight'))throw Error('Replacement builder has no highlighted guidance');
 });
 await click('#btn-create');
 await page.evaluate(()=>{
  const {x,z}=tutorialEconomy;gameTestAPI.performAction(x-2,z+2,'create');gameTestAPI.SpellWindup.update(1);
  tutorialEconomy.worker=state.units.at(-1);gameTestAPI.updateUnitList();
 });
 await selectWorker();await step(15);await click('#btn-build_shipyard');await step(16);
 await page.evaluate(()=>{
  const {x,z}=tutorialEconomy;gameTestAPI.performAction(x-7,z+2,'build_shipyard');tutorialEconomy.dock=state.buildings.at(-1);
 });await step(17);
 await page.evaluate(()=>tutorialEconomy.dock.update(tutorialEconomy.dock.totalBuildTime+1));await step(18);
 await click('#btn-build_airship');await step(19);
 await page.evaluate(()=>{
  const {x,z}=tutorialEconomy;gameTestAPI.performAction(x-4,z+4,'build_airship');
  if(state.units.at(-1).type!=='airship')throw Error('Airship was not actually built');
 });await step(20);
 if(await page.locator('#control-tutorial button').textContent()!=='Finish')throw Error('Economy tutorial did not reach completion');
 await click('#control-tutorial button');
 await page.reload();await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});await click('#story-close');
 if(await page.locator('#control-tutorial').count())throw new Error('Finished introduction appeared again');
 await page.evaluate(()=>showHelp());await click('#help-replay-tutorial');await step(0);
 await page.evaluate(()=>showHelp());await click('#help-replay-tutorial');await step(0);
 await page.setViewportSize({width:390,height:700});await page.screenshot({path:'test-results/tutorial-mobile.png'});
 const bounds=await page.locator('#control-tutorial').boundingBox();if(bounds.x<0||bounds.x+bounds.width>390||bounds.y+bounds.height>700)throw new Error('Mobile tutorial is clipped');
 await click('#control-tutorial button');
 await page.evaluate(()=>{state.matchSettings.noFlyers=true;state.controlTutorial.start(true);});
 if(!(await page.locator('#control-tutorial small').textContent()).endsWith('/ 14'))
  throw Error('No Flyers still requires unavailable Airship actions');
 if(!await page.evaluate(()=>state.matchSettings.noFlyers))throw Error('Tutorial changed the match rules');
 await click('#control-tutorial button');
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS interactive controls, worker creation, real building orders, explicit ten-second Warrior training, replacement worker and Airship production; completion, replay and mobile layout');
}finally{await browser.close();}
