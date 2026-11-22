// Spatial batches for heterogeneous static building meshes. Original objects
// remain authoritative for selection/LOD; only their rendering layer is masked.
// Buffer copying and GPU preparation yield through the existing frame budget.
import {createBuildingObserver,nextBuildingObservationFrame} from './building-observer.js';
export function createBuildingBatches(T,state,budget,index,legacy,warm=()=>Promise.resolve(),transforms=null){
 const hidden=29,groups=new Map(),records=new WeakMap(),owners=new Map(),previousRoots=[];
 const inverseScene=new T.Matrix4(),sceneMatrix=new T.Matrix4(),point=new T.Vector3(),visibility=new WeakMap();
 const currentRoots=[],currentEntries=[],observedRoots=new Map();
 let scene,sequence=0,ready=false,tick=0,observationFrame=0,instanceStrategy=false;
 const stats={sourceParts:0,batches:0,passthroughParts:0,pending:0,rebuilt:0,reusedFrames:0,sourceChecks:0,observationChecks:0,observationHits:0,instancedBatches:0,savedVertexBytes:0,errors:0,ms:0};
 const api={enabled:true,instancingEnabled:false,observationEnabled:true,stats,update:safeUpdate,dispose};state.buildingBatchStats=stats;
 function safeUpdate(){const start=performance.now();try{update();}catch(error){
  stats.errors++;api.enabled=false;dispose();stats.ms=performance.now()-start;
  console.warn('Static building batching unavailable; keeping originals',error);
 }}
 function geometrySupported(g){
  if(!g?.isBufferGeometry||g.isInstancedBufferGeometry||g.drawRange.start!==0||g.drawRange.count!==Infinity)return false;
  for(const key in g.morphAttributes)if(g.morphAttributes[key].length)return false;
  let count=0;for(const key in g.attributes){if(key!=='position'&&key!=='normal'&&key!=='uv')return false;count++;}
  if(count!==3)return false;
  const p=g.attributes.position,n=g.attributes.normal,u=g.attributes.uv;
  return p.itemSize===3&&n.itemSize===3&&u.itemSize===2&&n.count===p.count&&u.count===p.count&&
   !p.isInterleavedBufferAttribute&&!n.isInterleavedBufferAttribute&&!u.isInterleavedBufferAttribute&&
   !p.normalized&&!n.normalized&&!u.normalized&&p.array instanceof Float32Array&&n.array instanceof Float32Array&&u.array instanceof Float32Array;
 }
 function layer(n){const own=owners.get(n);return own&&n.layers.mask===(1<<hidden)?own.mask:legacy.sourceLayers(n);}
 function eligible(n){
  const m=n.material,g=n.geometry;
  return n.isMesh&&!n.isInstancedMesh&&!n.isSkinnedMesh&&!n.customDepthMaterial&&!n.customDistanceMaterial&&
   n.onBeforeRender===T.Object3D.prototype.onBeforeRender&&m?.type==='MeshStandardMaterial'&&!m.transparent&&m.opacity===1&&
   !m.clippingPlanes?.length&&!m.displacementMap&&!m.vertexColors&&!m.stencilWrite&&m.blending===T.NormalBlending&&
   (!m.normalMap||m.normalMapType===T.TangentSpaceNormalMap)&&
   m.onBeforeCompile===T.Material.prototype.onBeforeCompile&&geometrySupported(g);
 }
 function ancestorVisible(root){for(let n=root.parent;n;n=n.parent)if(!n.visible)return false;return true;}
 function inspect(root){
  const list=index.list(root),shown=ancestorVisible(root);let record=records.get(root);
  const observer=observedRoots.get(root),transformVersion=transforms?.version(root);
  if(api.observationEnabled&&observer?.safe){observer.poll(observationFrame);stats.observationChecks+=observer.checks;}
  if(api.observationEnabled&&record&&observer?.safe&&record.observedVersion===observer.version&&record.transformVersion===transformVersion&&
   record.revision===list.revision&&record.shown===shown&&record.rootMatrix.equals(root.matrixWorld)){
   stats.observationHits++;record.changed=false;return record;
  }
  let changed=!record||record.revision!==list.revision||record.shown!==shown,moving=false;
  if(!changed)for(const r of record.nodes){
   const n=r.node;stats.sourceChecks++;
   if(n.visible!==r.visible){changed=true;break;}
   if(!n.isMesh)continue;
   const g=n.geometry,valid=eligible(n);
   if(valid!==r.eligible||g!==r.geometry||n.material!==r.material||layer(n)!==r.layers||n.castShadow!==r.cast||
    n.receiveShadow!==r.receive||n.renderOrder!==r.order||n.frustumCulled!==r.culled){changed=true;break;}
   if(!valid)continue;
   if(!r.matrix.equals(n.matrixWorld)){moving=true;changed=true;break;}
   if(g.index!==r.index||g.index?.version!==r.indexVersion||
    g.attributes.position!==r.position||g.attributes.position.version!==r.positionVersion||
    g.attributes.normal!==r.normal||g.attributes.normal.version!==r.normalVersion||
    g.attributes.uv!==r.uv||g.attributes.uv.version!==r.uvVersion){changed=true;break;}
  }
  if(changed){
   const old=record;record={root,revision:list.revision,shown,nodes:[],parts:[],complete:true,
    changedAt:moving?tick:old?.changedAt,cooldownUntil:moving&&old?.changedAt===tick-1?performance.now()+250:old?.cooldownUntil||0};
   for(const n of list.nodes){
    const visible=n.visible&&(n===root?shown:visibility.get(n.parent));visibility.set(n,visible);
    const r={node:n,visible:n.visible};
    if(n.isMesh){
     const g=n.geometry;r.eligible=eligible(n);r.geometry=g;r.material=n.material;r.layers=layer(n);r.cast=n.castShadow;
     r.receive=n.receiveShadow;r.order=n.renderOrder;r.culled=n.frustumCulled;
     if(r.eligible){
      r.matrix=n.matrixWorld.clone();r.index=g.index;r.indexVersion=g.index?.version;
      r.position=g.attributes.position;r.positionVersion=r.position.version;r.normal=g.attributes.normal;r.normalVersion=r.normal.version;
      r.uv=g.attributes.uv;r.uvVersion=r.uv.version;
      if(visible&&(r.layers&1)!==0){
       if(r.matrix.determinant()>0)record.parts.push(r);else record.complete=false;
      }
     }else if(visible&&(r.layers&1)!==0&&legacy.eligible(n))record.complete=false;
    }
    record.nodes.push(r);
   }
   // Reuse unchanged source records so unrelated cells/materials stay prepared.
   if(old)for(let i=0;i<record.parts.length;i++){
    const r=record.parts[i],prior=old.parts.find(p=>p.node===r.node);
    if(prior&&r.geometry===prior.geometry&&r.material===prior.material&&r.layers===prior.layers&&r.cast===prior.cast&&
     r.receive===prior.receive&&r.order===prior.order&&r.culled===prior.culled&&r.matrix.equals(prior.matrix)&&
     r.position===prior.position&&r.positionVersion===prior.positionVersion&&r.normal===prior.normal&&r.normalVersion===prior.normalVersion&&
     r.uv===prior.uv&&r.uvVersion===prior.uvVersion&&r.index===prior.index&&r.indexVersion===prior.indexVersion)record.parts[i]=prior;
   }
   records.set(root,record);
  }
  if(api.observationEnabled&&transforms&&list.nodes.every(n=>transforms.has(n))){
   let watch=observedRoots.get(root);if(!watch){watch=createBuildingObserver();observedRoots.set(root,watch);}
   if(changed||!watch.safe||record.observedVersion!==watch.version)watch.bind(list.nodes);
   record.observedVersion=watch.version;record.transformVersion=transformVersion;
   if(!record.rootMatrix)record.rootMatrix=new T.Matrix4();record.rootMatrix.copy(root.matrixWorld);
  }else if(observer){observer.dispose();observedRoots.delete(root);}
  record.changed=changed;return record;
 }
 function discard(g){
  g.valid=false;for(const key of g.jobs)budget.cancel(key);g.jobs.clear();
  for(const r of g.parts){const own=owners.get(r.node);if(own?.group!==g)continue;
   if(r.node.layers.mask===(1<<hidden))r.node.layers.mask=own.mask;owners.delete(r.node);
  }
  if(g.mesh)g.mesh.parent?.remove(g.mesh);
  releaseGeometry(g);g.geometry=null;
  (g.mesh||g.candidateMesh)?.dispose?.();
 }
 function releaseGeometry(g){if(!g.geometry)return;
  if(g.instanced){g.geometry.attributes={};g.geometry.index=null;}
  g.geometry.dispose();
 }
 function orthogonal(matrix){const a=matrix.elements,x=a[0]*a[0]+a[1]*a[1]+a[2]*a[2],y=a[4]*a[4]+a[5]*a[5]+a[6]*a[6],z=a[8]*a[8]+a[9]*a[9]+a[10]*a[10];
  return matrix.determinant()>0&&Math.abs(a[0]*a[4]+a[1]*a[5]+a[2]*a[6])<1e-6*Math.sqrt(x*y)&&
   Math.abs(a[0]*a[8]+a[1]*a[9]+a[2]*a[10])<1e-6*Math.sqrt(x*z)&&Math.abs(a[4]*a[8]+a[5]*a[9]+a[6]*a[10])<1e-6*Math.sqrt(y*z);
 }
 function dispose(){
  for(const g of groups.values())discard(g);groups.clear();
  for(const root of previousRoots)root.userData.buildingBatchOwned=false;previousRoots.length=0;ready=false;
  for(const watch of observedRoots.values())watch.dispose();observedRoots.clear();
  stats.sourceParts=stats.batches=stats.passthroughParts=stats.instancedBatches=stats.savedVertexBytes=0;
 }
 async function prepare(g){
  stats.pending++;
  const step=async(fn)=>{
   if(!g.valid)return false;const key='building-buffer/'+g.id+'/'+(++g.sequence);g.jobs.add(key);
   const done=await budget.enqueue(key,()=>{g.jobs.delete(key);if(!g.valid)return false;fn();return true;},g.sequence===1?0:-.5,true);
   return done===true&&g.valid;
  };
  let geometry;
  try{
   if(g.instanced){
    if(!await step(()=>{
     const source=g.parts[0].geometry;geometry=g.geometry=new T.BufferGeometry();
     for(const name in source.attributes)geometry.setAttribute(name,source.attributes[name]);geometry.setIndex(source.index);
     const mesh=g.candidateMesh=new T.InstancedMesh(geometry,g.material,g.parts.length),box=new T.Box3(),sphere=new T.Sphere(),point=new T.Vector3();
     if(!source.boundingSphere)source.computeBoundingSphere();
     for(let i=0;i<g.parts.length;i++){
      const matrix=new T.Matrix4().multiplyMatrices(g.inverse,g.parts[i].matrix);mesh.setMatrixAt(i,matrix);
      sphere.copy(source.boundingSphere).applyMatrix4(matrix);box.expandByPoint(point.copy(sphere.center).addScalar(sphere.radius));
      box.expandByPoint(point.copy(sphere.center).addScalar(-sphere.radius));
     }
     mesh.instanceMatrix.setUsage(T.StaticDrawUsage);mesh.instanceMatrix.needsUpdate=true;mesh.receiveShadow=g.receive;
     geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new T.Sphere());
    }))return;
    await warm(g.candidateMesh);
    if(g.valid&&g.scene===state.scene){g.prepared=true;ready=true;}else releaseGeometry(g);
    return;
   }
   let positions,normals,uvs,indices;
   if(!await step(()=>{positions=new Float32Array(g.vertices*3);normals=new Float32Array(g.vertices*3);uvs=new Float32Array(g.vertices*2);indices=new Uint16Array(g.indices);}))return;
   const box=new T.Box3(),v=new T.Vector3(),normal=new T.Vector3();let vertexOffset=0,indexOffset=0;
   for(const r of g.parts){
    const matrix=new T.Matrix4().multiplyMatrices(g.inverse,r.matrix),normalMatrix=new T.Matrix3().getNormalMatrix(matrix);
    for(let start=0;start<r.position.count;start+=4096){const end=Math.min(r.position.count,start+4096);
     if(!await step(()=>{for(let i=start;i<end;i++){
      v.fromBufferAttribute(r.position,i).applyMatrix4(matrix);box.expandByPoint(v);
      normal.fromBufferAttribute(r.normal,i).applyMatrix3(normalMatrix).normalize();
      const at=(vertexOffset+i)*3;positions[at]=v.x;positions[at+1]=v.y;positions[at+2]=v.z;
      normals[at]=normal.x;normals[at+1]=normal.y;normals[at+2]=normal.z;
      const uv=(vertexOffset+i)*2;uvs[uv]=r.uv.getX(i);uvs[uv+1]=r.uv.getY(i);
     }}))return;
    }
    const count=r.index?.count||r.position.count;
    for(let start=0;start<count;start+=8192){const end=Math.min(count,start+8192);
     if(!await step(()=>{for(let i=start;i<end;i++)indices[indexOffset+i]=vertexOffset+(r.index?r.index.getX(i):i);}))return;
    }
    vertexOffset+=r.position.count;indexOffset+=count;
   }
   if(!await step(()=>{
    geometry=g.geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(positions,3));
    geometry.setAttribute('normal',new T.BufferAttribute(normals,3));geometry.setAttribute('uv',new T.BufferAttribute(uvs,2));
    geometry.setIndex(new T.BufferAttribute(indices,1));geometry.boundingBox=box;geometry.boundingSphere=box.getBoundingSphere(new T.Sphere());
   }))return;
   const probe=new T.Mesh(geometry,g.material);probe.receiveShadow=g.receive;
   await warm(probe);
   if(g.valid&&g.scene===state.scene){g.prepared=true;ready=true;}else geometry.dispose();
  }catch(error){if(g.valid){g.failed=true;stats.errors++;console.warn('Static building batch kept its original rendering',error);}releaseGeometry(g);g.candidateMesh?.dispose();g.geometry=null;}
  finally{stats.pending--;}
 }
 function publish(){
  for(const g of groups.values())if(g.prepared&&!g.mesh&&g.valid){
   // Relinquish legacy instance ownership before masking the original sources.
   legacy.releaseParts(g.parts.map(r=>r.node));
   const mesh=g.mesh=g.candidateMesh||new T.Mesh(g.geometry,g.material);mesh.name='Static building material batch';
   mesh.userData.landscapeKind='buildings';
   mesh.position.copy(g.origin);mesh.castShadow=g.cast;mesh.receiveShadow=g.receive;mesh.renderOrder=g.order;
   mesh.frustumCulled=g.culled;mesh.layers.mask=g.layers;mesh.raycast=()=>{};g.scene.add(mesh);
   for(const r of g.parts){owners.set(r.node,{group:g,mask:r.layers});r.node.layers.set(hidden);}
   stats.rebuilt++;
  }
  for(const g of groups.values())if(g.parts.length===1){
   g.parts[0].passthrough=true;legacy.releaseParts([g.parts[0].node]);
  }
  for(const root of previousRoots){const r=records.get(root);
   root.userData.buildingBatchOwned=r.complete&&r.parts.length>0&&r.parts.every(p=>owners.has(p.node)||p.passthrough);
  }
  stats.sourceParts=owners.size;stats.batches=0;stats.passthroughParts=0;stats.instancedBatches=stats.savedVertexBytes=0;
  for(const g of groups.values()){if(g.mesh){stats.batches++;if(g.instanced){stats.instancedBatches++;stats.savedVertexBytes+=g.vertices*32+g.indices*2-g.parts.length*64;}}else if(g.parts.length===1)stats.passthroughParts++;}
  state.raycaster?.layers.enable(hidden);ready=false;
 }
 function update(){
  const start=performance.now();stats.sourceChecks=stats.observationChecks=0;tick++;observationFrame=nextBuildingObservationFrame();
  if(scene!==state.scene){dispose();scene=state.scene;sceneMatrix.identity();}
  if(instanceStrategy!==api.instancingEnabled){dispose();instanceStrategy=api.instancingEnabled;}
  if(!api.enabled){dispose();stats.sourceParts=stats.batches=stats.passthroughParts=0;stats.ms=performance.now()-start;return;}
  const roots=currentRoots,entries=currentEntries;roots.length=entries.length=0;
  let changed=!sceneMatrix.equals(scene.matrixWorld);
  sceneMatrix.copy(scene.matrixWorld);inverseScene.copy(sceneMatrix).invert();
  for(const b of state.buildings)if(!b.dead&&!b.underConstruction&&b.visualMesh?.parent){
   const record=inspect(b.visualMesh);if(record.cooldownUntil>start)continue;
   roots.push(b.visualMesh);entries.push(record);changed ||= record.changed;
  }
  for(const [root,watch]of observedRoots)if(!roots.includes(root)){watch.dispose();observedRoots.delete(root);}
  if(roots.length!==previousRoots.length||roots.some((r,i)=>r!==previousRoots[i]))changed=true;
  if(!changed){if(ready)publish();else stats.reusedFrames++;stats.ms=performance.now()-start;return;}
  for(const root of previousRoots)root.userData.buildingBatchOwned=false;
  previousRoots.length=0;previousRoots.push(...roots);
  const candidates=new Map();
  for(const record of entries){
   point.setFromMatrixPosition(record.root.matrixWorld).applyMatrix4(inverseScene);
   const cx=Math.floor(point.x/40),cz=Math.floor(point.z/40);
   for(const r of record.parts){
    r.passthrough=false;
    const base=[cx,cz,r.material.uuid,r.cast,r.receive,r.order,r.culled,r.layers].join('|');
    let split=0,key=base+'|0',group=candidates.get(key);
    while(group&&group.vertices+r.position.count>32768){key=base+'|'+(++split);group=candidates.get(key);}
    if(r.position.count>32768){record.complete=false;continue;}
    if(!group){group={parts:[],vertices:0,indices:0,cx,cz};candidates.set(key,group);}
    group.parts.push(r);group.vertices+=r.position.count;group.indices+=r.index?.count||r.position.count;
   }
  }
  for(const [key,g]of groups){const next=candidates.get(key);
   if(!next||next.parts.length!==g.parts.length||next.parts.some((r,i)=>r!==g.parts[i])){discard(g);groups.delete(key);}
  }
  for(const [key,next]of candidates){
   if(groups.has(key))continue;
   const source=next.parts[0],origin=new T.Vector3(next.cx*40,0,next.cz*40);
   const inverse=new T.Matrix4().makeTranslation(-origin.x,0,-origin.z).multiply(inverseScene);
   const g={...next,id:++sequence,sequence:0,jobs:new Set(),valid:true,scene,origin,inverse,material:source.material,
    cast:source.cast,receive:source.receive,order:source.order,culled:source.culled,layers:source.layers};groups.set(key,g);
   if(g.parts.length===1){source.passthrough=true;continue;}
   // Baked large surfaces avoid an extra instance/normal matrix per vertex.
   // Keep instancing for small repeated pieces; broad instancing was slower
   // than baking in the settlement comparison despite saving buffer memory.
   g.instanced=api.instancingEnabled&&source.position.count<=64&&!!(state.renderer?.capabilities.isWebGL2||state.renderer?.extensions.get('ANGLE_instanced_arrays'))&&
    g.parts.every(r=>r.geometry===source.geometry&&orthogonal(new T.Matrix4().multiplyMatrices(inverse,r.matrix)));
   prepare(g);
  }
  publish();stats.ms=performance.now()-start;
 }
 return api;
}
