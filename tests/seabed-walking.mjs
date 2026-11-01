import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage();
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const report=await page.evaluate(()=>{
  state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;window.enemyAIs=[];
  for(const u of state.units){u.die();state.scene.remove(u.mesh);}state.units=[];
  for(const b of state.buildings)state.scene.remove(b.mesh);state.buildings=[];gameTestAPI.BuildingSpatialHash.markDirty();
  for(let x=80;x<=125;x++)for(let z=-15;z<=15;z++){
   const h=Math.min(4,-5+Math.max(0,x-104)*1.5);
   state.terrainMods.set(`${x},${z}`,h-gameTestAPI.getBaseHeight(x,z));
  }
  state.heightCache.clear();state.cameraLookAt.set(104,0,0);gameTestAPI.updateChunks(true);
  const results=[];
  for(const physics of [true,false]){
   const u=new Humanoid(0,'warrior',100,0);state.units.push(u);u.hp=u.maxHp=10000;u.nextTargetCheck=Infinity;
   u.mesh.position.y=CONFIG.TERRAIN.VISUAL_WATER_LEVEL;u.groundBodyOffset=.02;u.isGrounded=false;
   if(physics)u.rigidBody.setTranslation({x:100,y:u.mesh.position.y+u.height/2+.02,z:0},true);
   else{state.physicsWorld.removeRigidBody(u.rigidBody);state.rigidBodies.delete(u.id);u.rigidBody=null;}
   u.seekShore=()=>false;
   const tick=()=>{if(physics){state.physicsWorld.timestep=1/60;state.physicsWorld.step();}u.update(1/60);};
   let previous=u.mesh.position.y,largestDrop=0;
   for(let i=0;i<180;i++){tick();largestDrop=Math.max(largestDrop,previous-u.mesh.position.y);previous=u.mesh.position.y;}
   const depth=u.mesh.position.y;
   if(!u.isGrounded||u.isSwimming||!u.isUnderwater||Math.abs(depth+5)>.12||largestDrop>1)
    throw new Error('Unit did not physically settle on seabed: '+JSON.stringify({physics,depth,largestDrop,grounded:u.isGrounded}));
   let bottomWalkFrames=0;
   for(let i=0;i<1800&&u.mesh.position.x<109;i++){
    u.manualMove(new THREE.Vector3(1,0,0),1/60);tick();
    if(u.isUnderwater&&u.isGrounded&&u.gait?.speed>.1)bottomWalkFrames++;
   }
   if(u.mesh.position.x<109||bottomWalkFrames<10||u.isSwimming||Math.abs(u.mesh.position.y-getSurfaceHeight(u.mesh.position.x,u.mesh.position.z))>.15)
    throw new Error('Seabed walking/shore exit failed: '+JSON.stringify({physics,position:u.mesh.position,bottomWalkFrames,grounded:u.isGrounded}));
   results.push({physics,seabed:depth,bottomWalkFrames,shoreX:u.mesh.position.x});
   u.die();state.scene.remove(u.mesh);state.units=state.units.filter(unit=>unit!==u);
  }
  return results;
 });
 console.log('PASS sinking and walking from a five-metre seabed to shore '+JSON.stringify(report));
}finally{await browser.close();}
