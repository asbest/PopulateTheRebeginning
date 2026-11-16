import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
globalThis.window={addEventListener(){}};globalThis.location={protocol:'http:'};globalThis.localStorage={getItem:()=>null};
const {terrainIndices}=await import('../art/terrain-lod.js');
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
for(let i=0;i<p.count;i++)p.setY(i,0);
assert.equal(terrainIndices(T,geo,80,8,false,0).attribute.count,geo.index.count);
console.log('PASS shore terrain retains full geometry');
assert.equal(chooseLod(0,74,75,16),0);assert.equal(chooseLod(1,76,75,16),1);assert.equal(chooseLod(0,50,75,16),1);assert.equal(chooseLod(2,100,75,16),0);
console.log('PASS LOD hysteresis avoids toggling around thresholds');
