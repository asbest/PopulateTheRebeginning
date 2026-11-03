import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {createLightningFx} from '../art/lightning-fx.js';

for(const instancing of [true,false]){
 const state={scene:new T.Scene(),renderer:{capabilities:{isWebGL2:instancing},extensions:{get:()=>null}}};
 const fx=createLightningFx(T,state),roots=fx.prepareRoots();
 assert.equal(roots.length,8);
 const geometry=roots[0].children[0].geometry;
 assert(roots.every(root=>root.children.every(part=>part.geometry===geometry)));
 const bolt=fx.strike(15,8,7,3),parts=bolt.mesh.children;
 assert.equal(parts.length,instancing?1:10);
 let end=new T.Vector3(15,38,7);
 for(let i=0;i<10;i++){
  const matrix=new T.Matrix4();
  if(instancing)parts[0].getMatrixAt(i,matrix);else{parts[i].updateMatrix();matrix.copy(parts[i].matrix);}
  const start=new T.Vector3(0,-.5,0).applyMatrix4(matrix),next=new T.Vector3(0,.5,0).applyMatrix4(matrix);
  assert(start.distanceTo(end)<1e-4,'Disconnected lightning segments');
  assert(Math.abs(start.y-next.y-3)<1e-4);
  // Scaling a reusable unit cylinder preserves the original segment vertices.
  const position=new T.Vector3(),rotation=new T.Quaternion(),scale=new T.Vector3();matrix.decompose(position,rotation,scale);
  const original=new T.CylinderGeometry(.2,.2,scale.y,8),reference=original.attributes.position;
  for(let j=0;j<reference.count;j++){
   const a=new T.Vector3().fromBufferAttribute(reference,j).applyQuaternion(rotation).add(position);
   const b=new T.Vector3().fromBufferAttribute(geometry.attributes.position,j).applyMatrix4(matrix);
   assert(a.distanceTo(b)<1e-4,'Bolt geometry changed');
  }
  original.dispose();end=next;
 }
 assert(end.distanceTo(new T.Vector3(15,8,7))<1e-4);
 bolt.update(2.8);assert(bolt.life>0&&bolt.mesh.parent===state.scene);
 assert.equal(bolt.update(.21),false);assert.equal(bolt.mesh.parent,null);
 const active=Array.from({length:17},()=>fx.strike(0,0,0,3));
 assert.equal(fx.stats.active,17,'Overflow must retain every bolt');
 for(const effect of active)effect.update(3.1);
 const before=fx.stats.created;
 const reused=Array.from({length:16},()=>fx.strike(0,0,0,3));assert.equal(fx.stats.created,before);
 const stale=reused.at(-1);fx.clear();const current=fx.strike(0,0,0,3);
 assert.equal(stale.mesh,current.mesh);
 assert.equal(stale.update(1),false);assert.equal(current.mesh.parent,state.scene);
 fx.clear();assert.equal(fx.stats.active,0);
}
console.log('PASS reusable lightning preserves connected cylinder geometry, duration, overlap, overflow, stale-effect safety and non-instanced fallback');
