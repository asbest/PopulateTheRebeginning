import {seedWorld,startManualSimulation} from './fixtures/seed-world.mjs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage(),errors=[];await seedWorld(page,98217);
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 await page.evaluate(()=>{gameTestAPI.TerrainStream.disable();gameTestAPI.PathWorker.disable();});
 await startManualSimulation(page,98217);
 const result=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();window.enemyAIs=[];
  for(const u of state.units){u.die();state.scene.remove(u.mesh);}state.units=[];
  for(const b of state.buildings)state.scene.remove(b.mesh);state.buildings=[];
  gameTestAPI.BuildingSpatialHash.markDirty();state.simplex={noise2D:()=>0};
  const results=[];
  for(const dt of [1/60,.1])for(const basin of [true,false]){
   state.terrainMods.clear();state.heightCache.clear();
   for(let x=-15;x<=15;x++)for(let z=-15;z<=15;z++){
    const height=x>=3?3:basin&&x>=0?-1.5:-.2;
    state.terrainMods.set(`${x},${z}`,height-gameTestAPI.getBaseHeight(x,z));
   }
   state.heightCache.clear();gameTestAPI.updateChunks(true);
   for(const chunk of Object.values(state.chunks)){
    for(const tree of chunk.userData.trees||[])tree.mesh.visible=false;
    chunk.userData.trees=[];
   }
   const unit=new Humanoid(1,'shaman',-3,0);state.units.push(unit);
   const destination=basin?6:2.65;
   unit.aiWaterEscape=true;unit.seekShore=()=>{unit.goto(destination,0);return unit.state==='move';};
   unit.seekShore();let frames=0;const samples=[];
   const finalWaypoint=unit.path.at(-1)?.x;
   for(;frames<24/dt&&getHeight(unit.mesh.position.x,unit.mesh.position.z)<gameTestAPI.aiDryHeight();frames++){
    gameTestAPI.SpatialHash.update();state.physicsWorld.timestep=1/60;
    for(let i=0;i<Math.round(dt*60);i++)state.physicsWorld.step();unit.nextTargetCheck=Infinity;unit.update(dt);
    if(frames%180===0)samples.push({frames,state:unit.state,p:unit.mesh.position.toArray(),v:unit.velocity.toArray(),grounded:unit.isGrounded,sinking:unit.isSinking,escape:unit.aiWaterEscape});
   }
   const detail={dt,basin,frames,hp:unit.hp,position:unit.mesh.position.toArray(),destination,finalWaypoint,target:unit.target?.toArray(),ground:gameTestAPI.getSurfaceHeight(unit.mesh.position.x,unit.mesh.position.z),grounded:unit.isGrounded,sinking:unit.isSinking,velocity:unit.velocity.toArray(),offset:unit.groundBodyOffset};
   if(unit.state==='dead'||getHeight(unit.mesh.position.x,unit.mesh.position.z)<gameTestAPI.aiDryHeight())
    throw Error('Water rescue stalled '+JSON.stringify({...detail,samples}));
   results.push(detail);unit.die();state.scene.remove(unit.mesh);
  }
  return results;
 });
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS water rescue crosses deeper terrain and reaches the exact dry shore '+JSON.stringify(result));
}finally{await browser.close();}
