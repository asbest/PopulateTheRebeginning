import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
import {seedWorld,startManualSimulation} from './fixtures/seed-world.mjs';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage();await seedWorld(page,98217);
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 await startManualSimulation(page,98217);
 const result=await page.evaluate(async()=>{
  const api=gameTestAPI,key=Object.keys(state.chunks)[0],[cx,cz]=key.split(',').map(Number),chunk=state.chunks[key];
  const ground=chunk.children[0],water=chunk.children[1],size=api.CONFIG.TERRAIN.CHUNK_SIZE;
  const refresh=()=>{api.updateChunkGeometry(ground,cx,cz);api.updateChunkWater(water,cx,cz);api.updateChunkPhysics(cx,cz);};
  refresh();const version=ground.geometry.attributes.position.version,collider=state.terrainColliders.get(key);
  refresh();if(ground.geometry.attributes.position.version!==version||state.terrainColliders.get(key)!==collider)throw Error('Unchanged mesh/collider rebuilt');
  state.terrainMods.set(`${cx*size+size*3},${cz*size}`,100);state.heightCache.clear();refresh();
  if(ground.geometry.attributes.position.version!==version||state.terrainColliders.get(key)!==collider)throw Error('Distant edit rebuilt this chunk');
  const edit=`${cx*size+size/2},${cz*size}`;
  state.terrainMods.set(edit,(state.terrainMods.get(edit)||0)+2);state.heightCache.clear();refresh();
  if(ground.geometry.attributes.position.version===version||state.terrainColliders.get(key)===collider)throw Error('Local edit did not refresh terrain/collider');
  const reference={geometry:ground.geometry.clone()},referenceWater={geometry:water.geometry.clone()};
  api.TerrainKernel.updateChunkGeometry(reference,cx,cz);api.TerrainKernel.updateChunkWater(referenceWater,cx,cz);
  for(const [actual,expected,names]of [[ground,reference,['position','normal','color','artTerrainPattern']],[water,referenceWater,['foam','depth']]])
   for(const name of names){const a=actual.geometry.attributes[name].array,b=expected.geometry.attributes[name].array;
    if(a.length!==b.length||a.some((v,i)=>v!==b[i]))throw Error('Terrain cache changed '+name);}
  reference.geometry.dispose();referenceWater.geometry.dispose();
  api.updateUI();let writes=0;const observer=new MutationObserver(records=>{writes+=records.length;});
  for(const id of ['faith-text','faith-bonus'])observer.observe(document.getElementById(id),{childList:true,subtree:true,characterData:true});
  api.updateUI();api.updateUI();await Promise.resolve();observer.disconnect();
  if(writes)throw Error('Unchanged HUD text was rewritten');
  return {cache:{...api.TerrainRefresh.stats},preserved:['position','normal','color','artTerrainPattern','foam','depth'],colliderReusedAndRefreshed:true,unchangedHudWrites:writes};
 });
 console.log('PASS cached terrain and collider reuse preserve raw-kernel output after border/distant edits '+JSON.stringify(result));
}finally{await browser.close();}
