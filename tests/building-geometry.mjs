import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {createBuildingGeometry} from '../art/building-geometry.js';
const optimizer=createBuildingGeometry(T),geometry=new T.BoxGeometry(1,1,1),material=new T.MeshStandardMaterial();
const positions=geometry.attributes.position.array.slice(),normals=geometry.attributes.normal.array.slice(),uvs=geometry.attributes.uv.array.slice(),indices=geometry.index.array.slice();
let disposed=0;geometry.addEventListener('dispose',()=>disposed++);
function fixture(){
 const root=new T.Group(),parts=[];
 for(let i=0;i<2;i++){
  const part=new T.Mesh(geometry,material);part.position.set(i*2,.3,i);part.rotation.set(.2,i*.7,.1);part.scale.set(.8,1+i*.2,1.4);
  part.castShadow=part.receiveShadow=true;part.updateMatrix();root.add(part);parts.push(part);
 }
 const landmark=new T.Mesh(geometry,material);landmark.name='Roof landmark';root.add(landmark);
 const mirrored=new T.Mesh(geometry,material);mirrored.scale.x=-1;root.add(mirrored);
 const flame=new T.Mesh(geometry,new T.MeshStandardMaterial({emissive:0xff4400}));root.add(flame);
 return {root,parts,landmark,mirrored,flame};
}
const sample=fixture(),expected={position:[],normal:[],uv:[]};
for(const part of sample.parts)for(let i=0;i<geometry.index.count;i++){
 const index=geometry.index.getX(i),point=new T.Vector3().fromBufferAttribute(geometry.attributes.position,index).applyMatrix4(part.matrix);
 const normal=new T.Vector3().fromBufferAttribute(geometry.attributes.normal,index).applyMatrix3(new T.Matrix3().getNormalMatrix(part.matrix)).normalize();
 expected.position.push(...point.toArray());expected.normal.push(...normal.toArray());
 expected.uv.push(geometry.attributes.uv.getX(index),geometry.attributes.uv.getY(index));
}
optimizer.merge(sample.root,'hut');
const merged=sample.root.children.find(n=>n.userData.mergedBuildingStatic);
assert(merged&&merged.material===material&&merged.castShadow&&merged.receiveShadow&&merged.userData.sharedGeometry);
for(const key of ['position','normal','uv']){
 const attribute=merged.geometry.attributes[key],actual=[];
 for(let i=0;i<merged.geometry.index.count;i++){const index=merged.geometry.index.getX(i);for(let j=0;j<attribute.itemSize;j++)actual.push(attribute.array[index*attribute.itemSize+j]);}
 assert.equal(actual.length,expected[key].length);
 for(let i=0;i<actual.length;i++)assert(Math.abs(actual[i]-expected[key][i])<2e-6,key+' changed at '+i);
}
assert(sample.root.children.includes(sample.landmark)&&sample.root.children.includes(sample.mirrored)&&sample.root.children.includes(sample.flame));
const second=fixture();optimizer.merge(second.root,'temple');
assert.equal(second.root.children.find(n=>n.userData.mergedBuildingStatic).geometry,merged.geometry);
assert(optimizer.stats.hits>0);
optimizer.enabled=false;const fallback=fixture();optimizer.merge(fallback.root,'hut');assert(fallback.parts.every(n=>n.parent===fallback.root));
assert.deepEqual(geometry.attributes.position.array,positions);assert.deepEqual(geometry.attributes.normal.array,normals);
assert.deepEqual(geometry.attributes.uv.array,uvs);assert.deepEqual(geometry.index.array,indices);assert.equal(disposed,0);
console.log('PASS shared merged buffers preserve triangles, transformed normals, UVs, landmarks, mirrored/effect fallback and original ownership');
