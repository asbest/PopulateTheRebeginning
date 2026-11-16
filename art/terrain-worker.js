// Uses the existing MIT-licensed Three.js and SimplexNoise vendor modules.
import * as T from '../vendor/three.module.js';
import {createTerrainKernel} from './terrain-kernel.js';
globalThis.window=globalThis;
// Install the receiver synchronously. With a top-level await here, a slow
// module load can deliver the first job before onmessage exists and lose it.
const noiseReady=import('../vendor/simplex-noise.min.js').then(()=>null,error=>error);
let workspace,configuration;
onmessage=async({data:job})=>{
 try{
  const failure=await noiseReady;if(failure)throw failure;
  const env=job.env,seed=env.noise;
  const {mods,heightKeys,heightValues,...settings}=env;
  const signature=JSON.stringify(settings);
  if(!workspace||signature!==configuration){
  const fallbackPhase=Number.isInteger(env.settings.terrainSeed)?env.settings.terrainSeed>>>0:0;
  const simplex=seed?new window.SimplexNoise(()=>.5):{noise2D:(x,y)=>Math.sin(x+fallbackPhase)*Math.cos(y)};
  if(seed){simplex.perm=new Uint8Array(seed.perm);simplex.permMod12=new Uint8Array(seed.permMod12);}
  const heightCache=new Map();
  env.state={simplex,terrainMods:new Map(),heightCache,matchSettings:env.settings};
  const kernel=createTerrainKernel(T,env),geo=new T.PlaneGeometry(env.CHUNK_SIZE,env.CHUNK_SIZE,env.CHUNK_RES,env.CHUNK_RES);
  geo.rotateX(-Math.PI/2);const count=geo.attributes.position.count;
  geo.setAttribute('color',new T.BufferAttribute(new Float32Array(count*3),3));
  geo.setAttribute('artTerrainPattern',new T.Uint8BufferAttribute(new Uint8Array(count*4),4,true));
  const water=new T.PlaneGeometry(env.CHUNK_SIZE,env.CHUNK_SIZE,env.CHUNK_RES,env.CHUNK_RES);water.rotateX(-Math.PI/2);
  water.setAttribute('foam',new T.BufferAttribute(new Float32Array(count),1));
  water.setAttribute('depth',new T.BufferAttribute(new Float32Array(count),1));
  workspace={kernel,geo,water,state:env.state,edits:null};configuration=signature;
  }
  const {kernel,geo,water,state}=workspace,edits=JSON.stringify(mods);
  if(edits!==workspace.edits){state.terrainMods.clear();for(const [key,value]of mods)state.terrainMods.set(key,value);state.heightCache.clear();workspace.edits=edits;}
  kernel.updateChunkGeometry({geometry:geo},job.cx,job.cz);
  kernel.updateChunkWater({geometry:water},job.cx,job.cz);
  // Transfer owned output copies; keep reusable geometry buffers in the Worker.
  const arrays={position:geo.attributes.position.array.slice(),normal:geo.attributes.normal.array.slice(),
   color:geo.attributes.color.array.slice(),pattern:geo.attributes.artTerrainPattern.array.slice(),
   foam:water.attributes.foam.array.slice(),depth:water.attributes.depth.array.slice()};
  postMessage({id:job.id,arrays},Object.values(arrays).map(a=>a.buffer));
 }catch(error){postMessage({id:job.id,error:String(error)});}
};
