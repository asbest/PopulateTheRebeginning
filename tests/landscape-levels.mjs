import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {LANDSCAPES,CAMPAIGN_LANDSCAPES,LAVA_LEVELS} from '../art/landscape-profiles.js';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];
  const {CAMPAIGN_LANDSCAPES,LAVA_LEVELS}=await import('./art/landscape-profiles.js');
  const {getBaseHeight,restoreTerrainNoise}=gameTestAPI;
  const sample=()=>{const a=[];for(let x=-300;x<=300;x+=20)for(let z=-300;z<=300;z+=20)a.push(getBaseHeight(x,z));return a;};
  const original={...state.matchSettings},seed=original.terrainSeed;
  if(!Number.isInteger(seed)||original.terrainProfile!=='meadows'||original.liquid!=='water')throw Error('Fresh level configuration missing');
  const profiles=[];
  for(let i=0;i<12;i++) {
   Object.assign(state.matchSettings,{terrainProfile:CAMPAIGN_LANDSCAPES[i],terrainSeed:81495,biome:'normal',winter:false});restoreTerrainNoise();
   const a=sample(),wet=a.filter(h=>h<CONFIG.TERRAIN.WATER_LEVEL).length;
   if(wet<15||wet>a.length-15||a.some(h=>!Number.isFinite(h)))throw Error('Unusable profile '+CAMPAIGN_LANDSCAPES[i]+' wet='+wet);
   profiles.push({profile:CAMPAIGN_LANDSCAPES[i],wet,min:Math.min(...a),max:Math.max(...a),signature:a.map(h=>h.toFixed(2)).join(',')});
  }
  const signatures=new Set(profiles.map(p=>p.signature));if(signatures.size!==12)throw Error('Duplicate landscapes');
  state.matchSettings={...original,terrainProfile:'rift',terrainSeed:917211,liquid:'lava'};restoreTerrainNoise();
  const saved=sample();if(!saveGame(9))throw Error('Save failed');
  state.matchSettings.terrainSeed++;restoreTerrainNoise();if(sample().every((h,i)=>h===saved[i]))throw Error('Seed has no effect');
  if(!loadGame(9)||state.matchSettings.liquid!=='lava'||sample().some((h,i)=>h!==saved[i]))throw Error('Landscape changed on load');
  state.isPaused=true;
  await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
  if(state.chunkWaterMat.uniforms.lava.value!==1||state.waterState!=='lava')throw Error('Lava rendering not enabled');
  gameTestAPI.WaterSprayManager.update(.1);if(gameTestAPI.WaterSprayManager.points.visible)throw Error('Ocean spray over lava');
  const u=state.shaman,sea=CONFIG.TERRAIN.WATER_LEVEL,ground=sea-5;
  let molten=null;
  for(let x=-100;x<=100&&!molten;x+=5)for(let z=-100;z<=100;z+=5)if(getBaseHeight(x,z)<sea-1){molten=new THREE.Vector3(x,0,z);break;}
  if(!molten||Pathfinder.findPath(u.mesh.position,molten,false,1.5,false,false)!==null)throw Error('Player route enters lava');
  u.mesh.position.y=ground;u.isGrounded=true;u.manualSwimTimer=1;u.invulnerableTimer=0;u.godMode=false;
  const hp=u.hp;u.surviveWater(.2,ground);if(u.hp>=hp)throw Error('Lava did not damage victim');
  const after=u.hp,unitType=u.type;u.type='airship';u.surviveWater(.2,ground);u.type=unitType;
  if(u.hp!==after)throw Error('Lava damaged airship');
  u.mesh.position.y=sea+10;u.isGrounded=false;u.velocity.y=2;u.surviveWater(.2,ground);
  if(u.hp!==after)throw Error('Lava damaged airborne unit');
  state.matchSettings.liquid='water';u.mesh.position.y=ground;u.isGrounded=true;u.waterExposure=0;u.surviveWater(.2,ground);
  if(u.hp!==after)throw Error('Ordinary water inflicted heat damage');
  // A pre-profile save must still restore seed 12345 and the original maths.
  const key=CONFIG.SAVED_KEYS.SAVE_DATA+'.slot.9',data=JSON.parse(localStorage.getItem(key));
  delete data.matchSettings.terrainSeed;delete data.matchSettings.terrainProfile;delete data.matchSettings.liquid;
  localStorage.setItem(key,JSON.stringify(data));if(!loadGame(9))throw Error('Legacy load failed');state.isPaused=true;
  const legacy=sample();restoreTerrainNoise();if(sample().some((h,i)=>h!==legacy[i])||state.waterState==='lava')throw Error('Legacy world changed');
  const legacyNoise=new window.SimplexNoise((()=>{let a=12345;return()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};})());
  if(state.simplex.noise2D(.7,.9)!==legacyNoise.noise2D(.7,.9))throw Error('Legacy seed changed');
  return {seed,lavaLevels:LAVA_LEVELS,profiles:profiles.map(({signature,...p})=>p)};
 });
 assert.equal(Object.keys(LANDSCAPES).length,12);assert.equal(CAMPAIGN_LANDSCAPES.length,12);assert.equal(LAVA_LEVELS.length,3);
 await page.evaluate(()=>localStorage.setItem(CONFIG.SAVED_KEYS.START_CAMPAIGN,'1'));
 await page.reload();await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 assert.notEqual(await page.evaluate(()=>state.matchSettings.terrainSeed),result.seed,'Restart reused seed');
 assert.deepEqual(errors,[]);console.log('PASS distinct seeded landscapes, persistence, legacy worlds and lava hazards',result);
}finally{await browser.close();}
