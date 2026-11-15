import assert from 'node:assert/strict';
import * as T from '../vendor/three.module.js';
import {createInstanceWriter} from '../art/instance-writer.js';
import {createBoxInstances} from '../art/box-instances.js';
import {createShadowCache} from '../art/shadow-cache.js';

const writer=createInstanceWriter(T),mesh=new T.InstancedMesh(new T.BoxGeometry(),new T.MeshStandardMaterial(),8);
const matrix=new T.Matrix4().makeTranslation(.123456789,2,3),color=new T.Color(.1,.2,.3);
writer.matrix(mesh,2,matrix);writer.color(mesh,2,color);writer.flush(mesh);
assert.equal(writer.stats.colorUploads,1);writer.reset();
writer.matrix(mesh,2,matrix);writer.color(mesh,2,color);writer.flush(mesh);
assert.deepEqual(writer.stats,{matrixUploads:0,colorUploads:0,values:0});
matrix.elements[12]=4;writer.matrix(mesh,2,matrix);writer.flush(mesh);
assert.equal(mesh.instanceMatrix.updateRange.offset,44);assert.equal(mesh.instanceMatrix.updateRange.count,1);
color.setRGB(1,0,0);writer.color(mesh,2,color);writer.flush(mesh);assert.equal(writer.stats.colorUploads,1);
console.log('PASS unchanged poses/tribe colours do not upload; changed data uploads its exact range');

const boxes=createBoxInstances(T),a=new T.BoxGeometry(2,3,4),b=new T.BoxGeometry(5,6,7);
assert.equal(boxes.get(a).geometry,boxes.get(b).geometry);
assert.deepEqual(boxes.get(a).scale.toArray(),[2,3,4]);
a.translate(1,0,0);assert.equal(boxes.get(a),null);
assert.equal(boxes.get(new T.BoxGeometry(1,1,1,2)),null);
console.log('PASS boxes share geometry without changing dimensions; edited/subdivided meshes retain originals');

const scene=new T.Scene(),camera=new T.PerspectiveCamera(),sun=new T.DirectionalLight();
sun.castShadow=true;sun.shadow.map={};scene.add(sun);
const caster=new T.Mesh(new T.BoxGeometry(),new T.MeshStandardMaterial());caster.castShadow=true;scene.add(caster);
const cache=createShadowCache(T),renderer={shadowMap:{enabled:true,type:T.PCFSoftShadowMap},getRenderTarget:()=>null};
const update=()=>{scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);cache.update(scene,camera,renderer);};
update();assert(sun.shadow.autoUpdate);update();assert(!sun.shadow.autoUpdate);
caster.position.x=1;update();assert(sun.shadow.autoUpdate);update();assert(!sun.shadow.autoUpdate);
caster.material.opacity=.5;update();assert(sun.shadow.autoUpdate);
caster.visible=false;update();assert(sun.shadow.autoUpdate);update();assert(!sun.shadow.autoUpdate);
caster.visible=true;update();assert(sun.shadow.autoUpdate);
sun.position.z=8;update();assert(sun.shadow.autoUpdate);
sun.shadow.needsUpdate=true;update();assert(sun.shadow.autoUpdate);sun.shadow.needsUpdate=false;
scene.remove(caster);update();assert(sun.shadow.autoUpdate);
cache.enabled=false;update();assert(sun.shadow.autoUpdate);
console.log('PASS unchanged shadows cache; movement, material, visibility, removal, lights and explicit invalidation refresh immediately');
const movingCache=createShadowCache(T);scene.add(caster);
for(let i=0;i<10;i++){
    caster.position.x++;scene.updateMatrixWorld(true);movingCache.update(scene,camera,renderer);
    assert(sun.shadow.autoUpdate);
}
assert(movingCache.stats.bypassed>0);
for(let i=0;i<65;i++)movingCache.update(scene,camera,renderer);
assert(!sun.shadow.autoUpdate);
console.log('PASS moving scenes bypass cache inspection, keep full-rate shadows and resume caching after settling');
