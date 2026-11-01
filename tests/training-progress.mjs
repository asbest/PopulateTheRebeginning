import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];
  if(CONFIG.BUILDING.TRAINING_TIME!==10)throw new Error('Training duration is not ten seconds');
  const p=state.shaman.mesh.position,report=[];
  for(const [i,type] of ['warrior','fire','preacher','spy'].entries()){
   const b=gameTestAPI.createBuilding(type,p.x+12+i*12,p.z,0,false,true);b.update(b.totalBuildTime+1);gameTestAPI.BuildingSpatialHash.update();
   const worker=new Humanoid(0,'wild',b.mesh.position.x,b.mesh.position.z);state.units.push(worker);worker.updateTicker=9;worker.update(0);
   if(b.trainingQueue.length!==1||b.trainingQueue[0].timer!==10||b.trainingQueue[0].duration!==10)throw new Error('Worker did not enter ten-second training: '+type);
   const expected={warrior:'warrior',fire:'firewarrior',preacher:'preacher',spy:'spy'}[type];
   const count=()=>state.units.filter(u=>u.faction===0&&u.type===expected&&u.state!=='dead').length,before=count();
   b.update(5);
   if(!b.trainingProgress.group.visible||Math.abs(b.trainingProgress.fill.scale.x-.5)>.0001||count()!==before)throw new Error('Halfway training progress is wrong');
   b.update(4.99);if(count()!==before)throw new Error('Training finished before ten seconds');
   b.update(.01);if(count()!==before+1||b.trainingProgress.group.visible)throw new Error('Training did not finish at ten seconds');
   report.push({type,duration:10});
  }
  const b=state.buildings.find(b=>b.type==='warrior');b.trainingQueue=[{timer:10,duration:10,type:'warrior',faction:0},{timer:10,duration:10,type:'warrior',faction:0}];
  b.update(5);if(b.trainingQueue[1].timer!==10)throw new Error('Waiting trainee started too early');
  const id=b.id;saveGame(1);loadGame(1);state.isPaused=true;
  const loaded=state.buildings.find(b=>b.id===id);
  if(loaded.trainingQueue[0].timer!==5||!loaded.trainingProgress.group.visible||loaded.trainingProgress.fill.scale.x!==.5)throw new Error('Save/load lost training progress');
  const role=state.network.role;state.network.role='client';loaded.update(3);state.network.role=role;
  if(loaded.trainingQueue[0].timer!==5)throw new Error('Client independently advanced training');
  loaded.update(5);if(loaded.trainingQueue.length!==1||loaded.trainingQueue[0].timer!==10)throw new Error('Sequential training queue failed');
  const key=CONFIG.SAVED_KEYS.SAVE_DATA,data=JSON.parse(localStorage.getItem(key));
  data.buildings.find(b=>b.id===id).trainingQueue=[{timer:1,type:'warrior',faction:0}];localStorage.setItem(key,JSON.stringify(data));loadGame(1);state.isPaused=true;
  const migrated=state.buildings.find(b=>b.id===id);if(migrated.trainingQueue[0].timer!==5||migrated.trainingProgress.fill.scale.x!==.5)throw new Error('Old training progress was not migrated');
  state.cameraLookAt.copy(migrated.mesh.position);state.viewScale=12;gameTestAPI.updateCameraZoom();updateCameraPosition();
  migrated.update(0);
  return report;
 });
 await page.screenshot({path:'test-results/training-progress.png'});
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS ten-second training, overhead progress, FIFO queue, save/load, old saves and client authority '+JSON.stringify(result));
}finally{await browser.close();}
