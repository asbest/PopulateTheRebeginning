import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const results=[],errors=[],root=path.resolve(import.meta.dirname,'..');
const selectedPersonality=process.argv.find(arg=>arg.startsWith('--personality='))?.slice('--personality='.length);
try {
 for(const [personality,seed,minutes,raid] of [['default',84721,20,false],['swarmer',29107,15,true],['sorcerer',71283,15,false],['fortress',41827,15,false]].filter(([name])=>!selectedPersonality||selectedPersonality===name)) {
  const page=await browser.newPage();
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(seed=>{Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};},seed);
  try {
   await page.goto('http://127.0.0.1:8765/PopulateTheRebeginning.html?test=1');
   await page.waitForFunction(()=>window.gameTestAPI&&state.shaman);
   await page.evaluate(({personality,raid})=>{
    state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;state.isGodMode=false;gameTestAPI.PathWorker.disable();
    state.shaman.hp=1000000;state.shaman.maxHp=1000000;
    for(const ai of enemyAIs)ai.personality=personality;
    window.longRun={time:0,classes:{},attackDistance:0,defended:false,recovered:false,raidUnits:[],raid,peakBuildings:0,peakPopulation:0};
    state.clock.getElapsedTime=()=>longRun.time;
    window.advanceLongRun=seconds=>{
     for(let k=0;k<seconds*10;k++){
      longRun.time+=.1;
      const ai=enemyAIs[0];
      if(raid&&longRun.time>=360&&!longRun.raidStarted){
       longRun.raidStarted=true;
       for(let i=0;i<3;i++){const p=gameTestAPI.findNearestLand(ai.baseX+7+i,ai.baseZ+3);const u=new Humanoid(0,'warrior',p.x,p.z);state.units.push(u);longRun.raidUnits.push(u);}
      }
      if(raid&&longRun.time>=600&&!longRun.lossStarted){
       longRun.lossStarted=true;for(const u of state.units)if(u.faction===1&&u.type==='wild')u.die();
      }
      gameTestAPI.SpatialHash.update();gameTestAPI.BuildingSpatialHash.update();
      for(const enemy of enemyAIs)enemy.update(.1);
      state.physicsWorld.timestep=1/60;
      for(let i=0;i<6;i++)state.physicsWorld.step();
      for(const u of [...state.units]){
       const x=u.mesh.position.x,z=u.mesh.position.z;u.update(.1);
       if(!Number.isFinite(u.mesh.position.lengthSq()))throw new Error('Non-finite unit position');
       if(u.faction===1&&u.state!=='dead'){
        longRun.classes[u.type]=true;
        if(u.aiRole==='attack')longRun.attackDistance+=Math.hypot(u.mesh.position.x-x,u.mesh.position.z-z);
        if(u.aiRole==='defend')longRun.defended=true;
        if(longRun.lossStarted&&u.type==='wild'&&longRun.time<720)longRun.recovered=true;
       }
      }
      for(const b of [...state.buildings])if(!b.dead)b.update(.1);
      for(let i=state.projectiles.length-1;i>=0;i--)if(!state.projectiles[i].update(.1))state.projectiles.splice(i,1);
      for(let i=state.activeEffects.length-1;i>=0;i--)if(!state.activeEffects[i].update(.1))state.activeEffects.splice(i,1);
      for(const particle of state.particles)state.scene.remove(particle.mesh);state.particles=[];
      longRun.peakBuildings=Math.max(longRun.peakBuildings,state.buildings.filter(b=>b.faction===1&&!b.dead).length);
      longRun.peakPopulation=Math.max(longRun.peakPopulation,state.units.filter(u=>u.faction===1&&u.state!=='dead').length);
     }
    };
   },{personality,raid});
   for(let elapsed=0;elapsed<minutes*60;elapsed+=60){await page.evaluate(()=>advanceLongRun(60));if(elapsed%300===0)console.log(`${personality}: ${elapsed+60}/${minutes*60} simulated seconds`);}
   const detail=await page.evaluate(()=>({classes:longRun.classes,attackDistance:longRun.attackDistance,defended:longRun.defended,recovered:longRun.recovered,raidDamage:longRun.raidUnits.some(u=>u.hp<u.maxHp||u.state==='dead'),peakBuildings:longRun.peakBuildings,peakPopulation:longRun.peakPopulation,shamanAlive:state.units.some(u=>u.faction===1&&u.isShaman&&u.state!=='dead'),plan:enemyAIs[0].lastPlan}));
   const pass=detail.shamanAlive&&detail.peakBuildings>=5&&detail.attackDistance>20&&['warrior','firewarrior','spy'].every(t=>detail.classes[t])&&(!raid||(detail.defended&&detail.raidDamage&&detail.recovered));
   results.push({name:`${personality}: ${minutes} minutes${raid?' with raid and worker losses':''}`,pass,seed,detail});
   console.log((pass?'PASS ':'FAIL ')+JSON.stringify(results.at(-1)));
  }catch(e){results.push({name:personality,pass:false,error:String(e)});console.log('FAIL '+personality+' '+e);}finally{await page.close();}
 }
 results.push({name:'No runtime errors during long simulations',pass:errors.length===0,detail:errors});
}finally{
 await browser.close();await fs.mkdir(path.join(root,'test-results'),{recursive:true});
 await fs.writeFile(path.join(root,'test-results/strategy-long-report.json'),JSON.stringify({date:new Date().toISOString(),results,errors},null,2));
}
process.exitCode=results.some(r=>!r.pass)?1:0;
