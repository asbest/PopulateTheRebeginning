import assert from 'node:assert/strict';import * as T from '../vendor/three.module.js';
import {createSceneryBatches} from '../art/scenery-batches.js';import {createSceneIndex} from '../art/scene-index.js';
const scene=new T.Scene(),root=new T.Group(),geometry=new T.BoxGeometry(),material=new T.MeshStandardMaterial(),sources=[];
scene.add(root);for(let i=0;i<20;i++){const mesh=new T.Mesh(geometry,material);mesh.position.set(5+(i%5-2)*1.2,0,5+(Math.floor(i/5)-2)*1.2);root.add(mesh);sources.push(mesh);}
const camera=new T.OrthographicCamera(-20,20,20,-20,.1,100);camera.position.set(0,15,25);camera.lookAt(0,0,0);camera.updateMatrixWorld(true);scene.updateMatrixWorld(true);
const state={scene,camera,buildings:[{visualMesh:root}],chunks:{},renderer:{capabilities:{isWebGL2:true}},raycaster:new T.Raycaster()};
const batch=createSceneryBatches(T,state,createSceneIndex());batch.update();assert.equal(batch.stats.reason,'sparse');assert.equal(batch.stats.potentialSavings,19);
batch.update();assert.equal(batch.stats.reason,'sparse-cooldown');assert(batch.stats.cooldownFrames>0);
camera.position.x+=.1;camera.updateMatrixWorld(true);batch.update();assert.equal(batch.stats.reason,'sparse');
const offscreen=new T.Group(),looseGeometry=new T.SphereGeometry(.5,8,6),loose=new T.Mesh(looseGeometry,material);offscreen.position.x=1000;offscreen.add(loose);scene.add(offscreen);state.buildings.push({visualMesh:offscreen});scene.updateMatrixWorld(true);
batch.minSavings=16;batch.update();assert.equal(batch.stats.reason,'active');assert.equal(batch.stats.batches,1);assert.equal(batch.stats.instances,20);
batch.update();assert.equal(batch.stats.reason,'cached');assert(batch.stats.reused);
assert.equal(batch.stats.cacheSkippedRoots,1);offscreen.position.set(5,0,5);scene.updateMatrixWorld(true);batch.update();assert(batch.stats.reused);assert.equal(loose.layers.mask,1);
batch.enabled=false;batch.update();assert.equal(batch.stats.reason,'disabled');assert(sources.every(n=>n.layers.mask===1));
batch.enabled=true;state.renderer={capabilities:{isWebGL2:false},extensions:{get:()=>null}};batch.update();assert.equal(batch.stats.reason,'unsupported');assert(sources.every(n=>n.layers.mask===1));
batch.dispose();geometry.dispose();looseGeometry.dispose();material.dispose();
console.log('PASS scenery reports sparse/cooldown/active/cache/disabled/unsupported decisions and rechecks immediately after camera movement');
