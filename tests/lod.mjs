import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
globalThis.window={addEventListener(){}};globalThis.location={protocol:'http:'};globalThis.localStorage={getItem:()=>null};
const {compactWaterIndices,terrainIndices,createTerrainLod}=await import('../art/terrain-lod.js');
const {createOverviewDetails,grassIndices}=await import('../art/overview-details.js');
const {chooseLod}=await import('../art/lod-policy.js');
const geo=new T.PlaneGeometry(40,40,80,80);geo.rotateX(-Math.PI/2);
const p=geo.attributes.position;for(let i=0;i<p.count;i++)p.setY(i,10);
const original=geo.index.array.slice();
for(const mixed of [false,true])for(const step of [2,4,8])for(const maxError of [Infinity,.015625]){
 for(let i=0;i<p.count;i++)p.setY(i,10);if(mixed)p.setY(42*81+42,12);
 const result=terrainIndices(T,geo,80,step,false,0,maxError);assert(result.attribute.count<geo.index.count);assert(result.error<=maxError);
 const edges=new Map(),index=result.attribute.array;
 for(let i=0;i<index.length;i+=3){
  const a=new T.Vector3().fromBufferAttribute(p,index[i]),b=new T.Vector3().fromBufferAttribute(p,index[i+1]),c=new T.Vector3().fromBufferAttribute(p,index[i+2]);
  assert(new T.Vector3().crossVectors(b.sub(a),c.sub(a)).y>0);
  for(let j=0;j<3;j++){const x=index[i+j],y=index[i+(j+1)%3],key=x<y?x+','+y:y+','+x;edges.set(key,(edges.get(key)||0)+1);}
 }
 let boundary=0;
 for(const [edge,count]of edges){assert(count===1||count===2);if(count===1){boundary++;const [a,b]=edge.split(',').map(Number);assert(a%81===0&&b%81===0||a%81===80&&b%81===80||a<81&&b<81||a>=80*81&&b>=80*81);}}
 assert.equal(boundary,320);assert.deepEqual(geo.index.array,original);
 console.log('PASS shared chunk/tile edges, winding, closed topology and triangle reduction '+JSON.stringify({mixed,step,maxError,original:geo.index.count/3,reduced:result.attribute.count/3}));
}
for(let i=0;i<p.count;i++)p.setY(i,10+Math.sin(p.getX(i)*.8)*Math.cos(p.getZ(i)*.6)*.2);
const relaxed=terrainIndices(T,geo,80,8,false,0),strict=terrainIndices(T,geo,80,8,false,0,.015625);
assert(relaxed.error>.015625);assert(strict.error<=.015625&&strict.attribute.count<geo.index.count);
assert(strict.errorTiles>0);assert(strict.attribute.count>=relaxed.attribute.count);
console.log('PASS strict error budgets keep difficult sections fine while simplifying their neighbours');
for(let i=0;i<p.count;i++)p.setY(i,10+Math.sin(p.getX(i)*.8)*Math.cos(p.getZ(i)*.6)*.8);
const capped=terrainIndices(T,geo,80,8,false,0,.5),screen=terrainIndices(T,geo,80,8,false,0,.5,true);
assert(screen.error<=.5);assert(screen.attribute.count<capped.attribute.count);
console.log('PASS overview uses the projected error budget instead of an unnecessary fixed world-space cap');
const water=geo.clone();water.setAttribute('depth',new T.Float32BufferAttribute(new Float32Array(p.count),1));water.setAttribute('foam',new T.Float32BufferAttribute(new Float32Array(p.count),1));
const dry=terrainIndices(T,water,80,1,true,0,Infinity,false,true);
assert.equal(dry.occludedTriangles,78*78*2);assert.equal(dry.attribute.count/3,12800-dry.occludedTriangles);
for(const index of dry.attribute.array){const x=index%81,z=Math.floor(index/81);assert(x<=1||z<=1||x>=79||z>=79);}
assert.deepEqual(geo.index.array,original);
console.log('PASS only dry water interiors are omitted; all perimeter wave-overlap cells and authoritative indices remain');
for(let i=0;i<p.count;i++)p.setY(i,0);
assert.equal(terrainIndices(T,geo,80,8,false,0).attribute.count,geo.index.count);
console.log('PASS shore terrain retains full geometry');
for(let i=0;i<p.count;i++)p.setY(i,p.getX(i)*.5);
const compact=compactWaterIndices(T,p,80,0),compactEdges=new Map();
assert(compact.simplified>0&&compact.shoreTiles>0&&compact.occludedTriangles>0);
assert(compact.attribute.count<original.length/2);
for(let i=0;i<compact.attribute.count;i+=3){
 const [a,b,c]=compact.attribute.array.subarray(i,i+3);
 assert((p.getZ(b)-p.getZ(a))*(p.getX(c)-p.getX(a))-(p.getX(b)-p.getX(a))*(p.getZ(c)-p.getZ(a))>0);
 for(const [u,v] of [[a,b],[b,c],[c,a]]){
  const key=Math.min(u,v)+','+Math.max(u,v);compactEdges.set(key,(compactEdges.get(key)||0)+1);
 }
}
// All exposed edges stay on the chunk perimeter or behind dry land.
for(const [key,count] of compactEdges){
 assert(count===1||count===2);
 if(count===2)continue;
 const [a,b]=key.split(',').map(Number),outside=[-20,20].some(edge=>
  p.getX(a)===edge&&p.getX(b)===edge||p.getZ(a)===edge&&p.getZ(b)===edge);
 assert(outside||Math.min(p.getY(a),p.getY(b))>1);
}
assert.deepEqual(geo.index.array,original);
console.log('PASS compact Low water retains watertight shore edges and omits covered tiles');
const nearWater=compactWaterIndices(T,p,80,0,'near'),farWater=compactWaterIndices(T,p,80,0,'far');
assert.equal(nearWater.simplified,0);
assert(nearWater.occludedTriangles>0&&nearWater.occludedTriangles<compact.occludedTriangles);
assert.equal(nearWater.attribute.count/3,12800-nearWater.occludedTriangles);
assert(farWater.simplified>0&&farWater.attribute.count<nearWater.attribute.count);
assert.equal(farWater.occludedTriangles,nearWater.occludedTriangles);
for(const row of [0,80]){
 const edge=new Set(nearWater.attribute.array);
 for(let col=0;col<=80;col++)assert(edge.has(row*81+col));
}
console.log('PASS Medium keeps dense nearby water and border overlap while simplifying open water at distance');
assert.equal(chooseLod(0,74,75,16),0);assert.equal(chooseLod(1,76,75,16),1);assert.equal(chooseLod(0,50,75,16),1);assert.equal(chooseLod(2,100,75,16),0);
console.log('PASS LOD hysteresis avoids toggling around thresholds');
const blades=new T.BufferGeometry(),positions=[];
for(let blade=0;blade<8;blade++)for(let ring=0;ring<=4;ring++)for(let side=0;side<4;side++){
 const t=ring/4;positions.push(blade*.1+.13*t*t+(side<2?-.01:.01),t*.6,side%2*.01);
}
blades.setAttribute('position',new T.Float32BufferAttribute(positions,3));
for(const step of [2,4]){const level=grassIndices(T,blades,step);assert.equal(level.index.count/3,256/step);assert(level.error<.07);
 for(let blade=0;blade<8;blade++)assert([...level.index.array].some(i=>i===blade*20+16));
}
console.log('PASS overview grass keeps every blade tip and bounds ring interpolation error');
blades.setIndex(grassIndices(T,blades,1).index);
function grassAt(z){
 const mesh=new T.InstancedMesh(blades.clone(),new T.MeshBasicMaterial(),11);
 mesh.position.z=z;mesh.coverBounds=new T.Box3(new T.Vector3(-1,0,-1),new T.Vector3(1,1,1));
 mesh.updateMatrixWorld(true);
 return {mesh,data:[{scale:1,height:1}]};
}
const nearbyGrass=grassAt(-8),distantGrass=grassAt(-64);
const grassState={graphicsQuality:{tier:'medium'},cameraLookAt:new T.Vector3(),isFPV:false,
 chunks:[nearbyGrass,distantGrass].map(grass=>({userData:{groundCover:{grass}}}))};
const grassDetails=createOverviewDetails(T,grassState,()=>blades);
const grassRenderer={domElement:{height:600}};
const grassCamera=new T.OrthographicCamera(-50,50,80,-80,.1,300);
grassCamera.position.set(0,100,0);grassCamera.lookAt(0,0,-.001);grassCamera.updateMatrixWorld(true);
grassDetails.update(grassCamera,grassRenderer);
assert.equal(nearbyGrass.mesh.count,11);assert.equal(distantGrass.mesh.count,6);
assert.equal(grassDetails.stats.visibleOmittedClumps,5);
grassState.cameraLookAt.z=-31;
grassDetails.update(grassCamera,grassRenderer);assert.equal(distantGrass.mesh.count,6,'Hysteresis keeps the same prefix');
grassState.cameraLookAt.z=-45;
grassDetails.update(grassCamera,grassRenderer);assert.equal(distantGrass.mesh.count,11,'Near camera focus restores density');
grassDetails.restore();assert.equal(nearbyGrass.mesh.count,11);assert.equal(distantGrass.mesh.count,11);
const eye=new T.PerspectiveCamera(60,1,.1,300);
eye.updateMatrixWorld(true);grassState.isFPV=true;
grassDetails.update(eye,grassRenderer);assert.equal(distantGrass.mesh.count,6);
grassState.cameraLookAt.z=0;
grassDetails.update(grassCamera,grassRenderer);
assert.equal(distantGrass.mesh.count,11,'A camera transition restores grass until perspective is ready');
assert.equal(grassDetails.stats.savedTriangles,0);
grassDetails.update(eye,grassRenderer);assert.equal(distantGrass.mesh.count,6);
grassState.graphicsQuality.tier='high';
grassDetails.update(eye,grassRenderer);assert.equal(distantGrass.mesh.count,11);
console.log('PASS Medium grass uses half of the distant clumps, restores them near the focus, and leaves High at full density');
const scene=new T.Scene(),chunk=new T.Group(),land=new T.PlaneGeometry(40,40,80,80),liquid=new T.PlaneGeometry(40,40,80,80);
land.rotateX(-Math.PI/2);liquid.rotateX(-Math.PI/2);for(let i=0;i<land.attributes.position.count;i++)land.attributes.position.setY(i,10);
liquid.setAttribute('depth',new T.Float32BufferAttribute(new Float32Array(6561),1));liquid.setAttribute('foam',new T.Float32BufferAttribute(new Float32Array(6561),1));
const waterMaterial=new T.MeshBasicMaterial();waterMaterial.uniforms={waveStrength:{value:1.55}};
chunk.add(new T.Mesh(land,new T.MeshBasicMaterial()),new T.Mesh(liquid,waterMaterial));scene.add(chunk);
const camera=new T.OrthographicCamera(-40,40,40,-40,.1,300);camera.position.set(30,40,30);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);
const state={isFPV:true,cameraLookAt:new T.Vector3(),viewScale:40},jobs=[],lod=createTerrainLod(T,state,{enqueue(key,fn){const job=Promise.resolve().then(fn);jobs.push(job);return job;}},0),renderer={domElement:{height:600}};
lod.register(chunk,80);const authoritative=liquid.index;
async function prepare(){for(let pass=0;pass<4;pass++){scene.updateMatrixWorld(true);lod.update(camera,renderer);await Promise.all(jobs.splice(0));}}
await prepare();assert.equal(lod.stats.occludedWaterTriangles,12168);assert.equal(liquid.index,authoritative);
waterMaterial.uniforms.waveStrength.value=2.1;lod.update(camera,renderer);assert.equal(chunk.children[3].geometry.index,authoritative);
waterMaterial.uniforms.waveStrength.value=1.55;await prepare();assert(lod.stats.occludedWaterTriangles>0);
for(let i=0;i<land.attributes.position.count;i++)land.attributes.position.setY(i,-2);land.attributes.position.needsUpdate=true;
lod.update(camera,renderer);assert.equal(chunk.children[3].geometry.index,authoritative);assert.equal(lod.stats.occludedWaterTriangles,0);
console.log('PASS dry-water culling falls back immediately after flooding or unsupported wave strength, without changing collision indices');
state.graphicsQuality={tier:'low'};
lod.update(camera,renderer);assert(chunk.children[3].visible);
for(let i=0;i<land.attributes.position.count;i++)land.attributes.position.setY(i,10);
land.attributes.position.needsUpdate=true;
lod.update(camera,renderer);assert(!chunk.children[3].visible);
for(let i=0;i<land.attributes.position.count;i++)land.attributes.position.setY(i,-10);
land.attributes.position.needsUpdate=true;
lod.update(camera,renderer);assert(chunk.children[3].visible);assert(chunk.children[3].geometry.index.count<authoritative.count);
state.graphicsQuality.tier='high';lod.update(camera,renderer);
assert.equal(chunk.children[3].geometry.index,authoritative);
console.log('PASS Low water redraws after flooding and restores the original detail on tier switch');
state.graphicsQuality.tier='medium';lod.update(camera,renderer);
assert.equal(chunk.children[3].geometry.index,authoritative);
state.cameraLookAt.x=100;lod.update(camera,renderer); // FPV uses the eye rather than strategy focus.
assert.equal(chunk.children[3].geometry.index,authoritative);
state.isFPV=false;lod.update(camera,renderer);
assert(chunk.children[3].geometry.index.count<authoritative.count);
waterMaterial.uniforms.waveStrength.value=2.1;lod.update(camera,renderer);
assert.equal(chunk.children[3].geometry.index,authoritative);
console.log('PASS Medium water retains full detail in First Person and falls back for unsupported waves');
state.isFPV=true;state.graphicsQuality.tier='high';waterMaterial.uniforms.waveStrength.value=1.55;
const waterView=new T.PerspectiveCamera(60,1,.1,300);
waterView.position.set(8,12,18);waterView.lookAt(0,0,0);waterView.updateMatrixWorld(true);
for(let i=0;i<land.attributes.position.count;i++)land.attributes.position.setY(i,land.attributes.position.getX(i)*.5);
land.attributes.position.needsUpdate=true;
lod.update(waterView,renderer);
assert.equal(chunk.children[2].geometry.index,land.index);
assert(lod.stats.visible.occludedWaterTriangles>0);
assert.equal(chunk.children[3].geometry.index.count/3,authoritative.count/3-lod.stats.visible.occludedWaterTriangles);
assert.equal(liquid.index,authoritative);
console.log('PASS High first-person culls only hidden water triangles and preserves the exact shore and land meshes');

const distantScene=new T.Scene(),movingCamera=new T.PerspectiveCamera(60,1,.1,450);
const queue=[];
const movingLod=createTerrainLod(T,{isFPV:true,viewScale:3},{enqueue(key,run){
    return new Promise((resolve,reject)=>queue.push(()=>Promise.resolve().then(run).then(resolve,reject)));
}},0);
for(let i=0;i<9;i++){
 const section=new T.Group();section.position.set((i%3-1)*40,0,-180-Math.floor(i/3)*40);
 section.add(new T.Mesh(land.clone(),new T.MeshBasicMaterial()),new T.Mesh(liquid.clone(),waterMaterial));
 distantScene.add(section);movingLod.register(section,80);
}
distantScene.updateMatrixWorld(true);movingCamera.updateMatrixWorld(true);movingLod.update(movingCamera,renderer);
assert.equal(queue.length,12);assert.equal(movingLod.stats.pendingFirstPerson,12);
movingCamera.rotation.y=Math.PI;movingCamera.updateMatrixWorld(true);movingLod.update(movingCamera,renderer);
await Promise.all(queue.splice(0).map(run=>run()));
assert.equal(movingLod.stats.prepared,0);assert.equal(movingLod.stats.pendingFirstPerson,0);
movingCamera.rotation.y=0;movingCamera.updateMatrixWorld(true);movingLod.update(movingCamera,renderer);
await Promise.all(queue.splice(0).map(run=>run()));
movingLod.update(movingCamera,renderer);
assert(queue.length>0&&queue.length<=12);
console.log('PASS first-person terrain queues are bounded, skip work left behind and resume preparation in view');
