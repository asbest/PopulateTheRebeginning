import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {createTerrainStream} from '../art/terrain-stream.js';
// Worker failure, stale results and timeout must always restore synchronous use.
let revision=0,time=0;const fake={postMessage(job){this.job=job;},terminate(){this.terminated=true;}};
const manager=createTerrainStream({version:()=>revision,snapshot:()=>({}),makeWorker:()=>fake,now:()=>time});
assert.equal(manager.prepare(1,1),true);const old=fake.job;
revision++;manager.take(1,1);fake.onmessage({data:{id:old.id,arrays:{bad:true}}});assert.equal(manager.take(1,1),undefined);
manager.prepare(2,2);time=3001;assert.equal(manager.prepare(3,3),false);assert.equal(fake.terminated,true);
assert.equal(manager.stats.pending,0);assert.equal(manager.stats.ready,0);
const blocked=createTerrainStream({version:()=>0,snapshot:()=>({}),makeWorker:()=>{throw Error('blocked');}});
assert.equal(blocked.prepare(0,0),false);
const broken={postMessage(job){this.job=job;},terminate(){}};
const failed=createTerrainStream({version:()=>0,snapshot:()=>({}),makeWorker:()=>broken});
failed.prepare(0,0);broken.onmessage({data:{id:broken.job.id,error:'worker failure'}});assert.equal(failed.enabled,false);
console.log('PASS bounded terrain Worker fallback, timeout and stale-result rejection');
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{}),
 ...(process.argv.includes('--software-gl')?{args:['--use-gl=angle','--use-angle=swiftshader']}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 let noiseFetches=0;
 await page.context().route('**/vendor/simplex-noise.min.js*',async route=>{
  // The first job must survive a delayed worker dependency, not just a warm
  // cache whose import happens to finish before the first message is delivered.
  if(++noiseFetches>1)await new Promise(r=>setTimeout(r,250));
  await route.continue();
 });
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];
  // This checks CPU arrays and real Worker transport, not pixels. Avoid
  // unrelated software-GPU stalls while awaiting numerical results on CI.
  state.renderer.render=()=>{};
  const {updateChunkGeometry,updateChunkWater,terrainWorkerSnapshot}=gameTestAPI;
  // A fresh real manager keeps this protocol test independent of a startup
  // fallback caused by intentionally slow software rendering before the fixture.
  const {createTerrainStream}=await import('./art/terrain-stream.js');
  const stream=createTerrainStream({snapshot:terrainWorkerSnapshot,
   version:()=>`${state.navigationVersion}|${state.matchSettings.biome}|${!!state.matchSettings.winter}`,
   makeWorker:()=>new Worker(new URL('./art/terrain-worker.js',location.href),{type:'module'})});
  const [key,chunk]=Object.entries(state.chunks)[0],[cx,cz]=key.split(',').map(Number),cases=[];
  delete state.matchSettings.terrainProfile;delete state.matchSettings.terrainSeed;delete state.matchSettings.liquid;gameTestAPI.restoreTerrainNoise();
  for(const [biome,winter]of [['normal',false],['normal',true],['winter',true],['jungle',false],['night',false],['mountain',false],['storm',false],['void',false],['celestial',false],['cosmic',false]]){
   state.matchSettings.biome=biome;state.matchSettings.winter=winter;state.heightCache.clear();
   state.terrainMods.set(`${cx*40},${cz*40}`,1.25);state.navigationVersion++;
   stream.clear();stream.prepare(cx,cz);
   const geo=chunk.children[0].geometry.clone(),water=chunk.children[1].geometry.clone();
   updateChunkGeometry({geometry:geo},cx,cz);updateChunkWater({geometry:water},cx,cz);
   let arrays;const start=performance.now();
   while(!(arrays=stream.take(cx,cz))){
    if(!stream.enabled||performance.now()-start>10000)throw new Error('Terrain Worker did not finish: '+JSON.stringify({biome,cases,stats:stream.stats}));
    await new Promise(r=>setTimeout(r,10));stream.prepare(cx,cz);
   }
   const expected={position:geo.attributes.position.array,normal:geo.attributes.normal.array,
    color:geo.attributes.color.array,pattern:geo.attributes.artTerrainPattern.array,
    foam:water.attributes.foam.array,depth:water.attributes.depth.array};
   for(const name of Object.keys(expected)){
    const a=expected[name],b=arrays[name];if(a.length!==b.length)throw new Error(name+' length');
    for(let i=0;i<a.length;i++)if(a[i]!==b[i])throw new Error(`${biome} ${name}[${i}]: ${a[i]} != ${b[i]}`);
   }
   cases.push({biome,winter,equal:true});geo.dispose();water.dispose();
  }
  const {CAMPAIGN_LANDSCAPES}=await import('./art/landscape-profiles.js');
  for(const profile of CAMPAIGN_LANDSCAPES){
   state.matchSettings.terrainProfile=profile;state.matchSettings.terrainSeed=137914;state.matchSettings.liquid='lava';gameTestAPI.restoreTerrainNoise();state.navigationVersion++;
   stream.clear();stream.prepare(cx,cz);
   const geo=chunk.children[0].geometry.clone(),water=chunk.children[1].geometry.clone();
   updateChunkGeometry({geometry:geo},cx,cz);updateChunkWater({geometry:water},cx,cz);
   let arrays;const start=performance.now();
   while(!(arrays=stream.take(cx,cz))){if(!stream.enabled||performance.now()-start>10000)throw Error('Profile Worker timeout '+profile);await new Promise(r=>setTimeout(r,10));stream.prepare(cx,cz);}
   for(const [name,a] of Object.entries({position:geo.attributes.position.array,normal:geo.attributes.normal.array,color:geo.attributes.color.array,pattern:geo.attributes.artTerrainPattern.array,foam:water.attributes.foam.array,depth:water.attributes.depth.array})){
    const b=arrays[name];if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('Profile Worker differs '+profile+' '+name);
   }
   cases.push({profile,equal:true});geo.dispose();water.dispose();
  }
  stream.disable();if(stream.prepare(cx,cz)!==false)throw new Error('Disabled Worker did not fall back');
  const fallback=gameTestAPI.createChunk(cx,cz);if(!fallback.children[0].geometry.attributes.position.count)throw new Error('Synchronous terrain missing');
  return {cases,stats:{...stream.stats},fallback:true};
 });
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS Worker terrain positions, normals, colours, foam and depth match synchronously '+JSON.stringify(result));
}finally{await browser.close();}
