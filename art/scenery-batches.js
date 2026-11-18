import {createBoxInstances} from './box-instances.js';
// Original meshes, materials, shadows and raycast geometry remain authoritative.
// Spatially bounded instances share vertex buffers; no mesh simplification/LOD.
export function createSceneryBatches(T,state,index=null){
 const buckets=new Map(),roots=new WeakMap(),masked=new Map(),hiddenLayer=30;
 const boxes=createBoxInstances(T);
 const matrix=new T.Matrix4(),sphere=new T.Sphere(),point=new T.Vector3();
 const projection=new T.Matrix4(),frustum=new T.Frustum();
 let scene,frame=0,cooldown=0,lastBuildings=-1,lastTerrainBuild,lastMinSavings=-1,lodPrepared=false;
 const stats={parts:0,instances:0,batches:0,uploads:0,skippedRoots:0,ms:0,fallback:false,cacheHits:0,sourceChecks:0,cacheSkippedRoots:0,reused:false,buildingInstances:0,buildingBatches:0,reason:'startup',cooldownFrames:0,potentialSavings:0,visitedRoots:0,unsupportedParts:0};
 const api={enabled:true,warming:false,cacheEnabled:true,minSavings:64,stats,update,restore,dispose,matrixError,eligible,
  sourceLayers:part=>masked.get(part)??part.layers.mask,releaseParts};
 state.sceneryBatchStats=stats;
 const cachedCamera=new T.Matrix4(),cachedProjection=new T.Matrix4(),cachedScene=new T.Matrix4();
 const lastView=new T.Matrix4(),lastProjection=new T.Matrix4();
 let cached=false,cachedWarming=false,cachedMinSavings,cacheCooldown=0;const observedRoots=[],visitedRoots=[];
 function restore(){cached=false;for(const [part,mask]of masked)if(part.layers.mask===(1<<hiddenLayer))part.layers.mask=mask;masked.clear();}
 function releaseParts(parts){for(const part of parts)if(masked.has(part)){
  if(part.layers.mask===(1<<hiddenLayer))part.layers.mask=masked.get(part);masked.delete(part);cached=false;
 }}
 function releaseGeometry(b){if(b.geometry){
  // The wrapper owns its bounds/VAOs, not the source vertex/index buffers.
  b.geometry.attributes={};b.geometry.index=null;b.geometry.dispose();
 }}
 function dispose(){restore();observedRoots.length=visitedRoots.length=0;for(const b of buckets.values()){b.mesh?.parent?.remove(b.mesh);b.mesh?.dispose();releaseGeometry(b);}buckets.clear();}
 function eligible(p){const m=p.material;return p.isMesh&&!p.isInstancedMesh&&!p.isSkinnedMesh&&
  !p.customDepthMaterial&&!p.customDistanceMaterial&&
  m?.type==='MeshStandardMaterial'&&!m.transparent&&m.opacity===1&&!m.clippingPlanes?.length&&
  !p.geometry.morphAttributes.position&&m.onBeforeCompile===T.Material.prototype.onBeforeCompile&&
  p.onBeforeRender===T.Object3D.prototype.onBeforeRender;}
 function visitRoots(visit){
  for(const b of state.buildings)if(!b.dead){
   if(b.visualMesh?.parent&&!b.visualMesh.userData.buildingBatchOwned)visit(b.visualMesh);
   if(b.constructionRig?.visible&&b.constructionRig.parent)visit(b.constructionRig);
   if(b.damageVisual?.visible&&b.damageVisual.parent)visit(b.damageVisual);
  }
  for(const key in state.chunks){const chunk=state.chunks[key];
   for(const t of chunk.userData?.trees||[])if(t.mesh?.parent)visit(t.mesh);
   if(chunk.userData?.ritualSite?.mesh?.parent)visit(chunk.userData.ritualSite.mesh);
  }
 }
 function ancestorsVisible(root){for(let p=root.parent;p;p=p.parent)if(!p.visible)return false;return true;}
 function unchanged(){
  if(!cached||!api.cacheEnabled||!api.enabled||scene!==state.scene||cachedWarming!==api.warming||cachedMinSavings!==api.minSavings||
   !cachedCamera.equals(state.camera.matrixWorld)||!cachedProjection.equals(state.camera.projectionMatrix)||!cachedScene.equals(scene.matrixWorld))return false;
  let i=0,same=true;
  visitRoots(root=>{if(observedRoots[i++]?.root!==root)same=false;});
  if(!same||i!==observedRoots.length)return false;
  for(const entry of observedRoots){
   // Unbatched originals remain fully live in the scene. Their edits cannot
   // invalidate an instance buffer they never contributed to; if they enter
   // view they simply render on their original path until the next rebuild.
   if(!entry.batched){stats.cacheSkippedRoots++;continue;}
   if(entry.revision!==(index?index.list(entry.root).revision:entry.root.userData.detailRevision||0)||entry.ancestors!==ancestorsVisible(entry.root))return false;
   for(const r of entry.nodes){
    const n=r.node;stats.sourceChecks++;
    if(n.visible!==r.visible)return false;
    if(!n.isMesh)continue;
    if(n.geometry!==r.geometry||n.material!==r.material||eligible(n)!==r.eligible)return false;
    if(!r.eligible)continue;
    const g=n.geometry;
    if(!r.matrix.equals(n.matrixWorld)||n.layers.mask!==r.layers||n.castShadow!==r.cast||n.receiveShadow!==r.receive||
     n.renderOrder!==r.order||n.frustumCulled!==r.culled||g.index!==r.index||g.index?.version!==r.indexVersion||
     g.attributes.position.version!==r.positionVersion||g.drawRange.start!==r.start||g.drawRange.count!==r.count)return false;
   }
  }
  return true;
 }
 function remember(){
  observedRoots.length=0;
  for(const root of visitedRoots){
   const list=roots.get(root),entry=list.observation||(list.observation={root,nodes:list.nodes.map(node=>({node}))});
   entry.revision=list.revision;entry.ancestors=ancestorsVisible(root);entry.batched=false;
   for(const r of entry.nodes){
    const node=r.node;r.visible=node.visible;
    if(masked.has(node))entry.batched=true;
    if(node.isMesh){
     r.geometry=node.geometry;r.material=node.material;r.eligible=eligible(node);
     if(r.eligible){const g=node.geometry;if(!r.matrix)r.matrix=new T.Matrix4();r.matrix.copy(node.matrixWorld);r.layers=node.layers.mask;
      r.cast=node.castShadow;r.receive=node.receiveShadow;r.order=node.renderOrder;r.culled=node.frustumCulled;
      r.index=g.index;r.indexVersion=g.index?.version;r.positionVersion=g.attributes.position.version;r.start=g.drawRange.start;r.count=g.drawRange.count;}
    }
   }
   observedRoots.push(entry);
  }
  cachedCamera.copy(state.camera.matrixWorld);cachedProjection.copy(state.camera.projectionMatrix);cachedScene.copy(scene.matrixWorld);
  cachedWarming=api.warming;cachedMinSavings=api.minSavings;cached=true;
 }
 function orthogonal(m){const a=m.elements,x=a[0]*a[0]+a[1]*a[1]+a[2]*a[2],y=a[4]*a[4]+a[5]*a[5]+a[6]*a[6],z=a[8]*a[8]+a[9]*a[9]+a[10]*a[10];
  return m.determinant()>0&&Math.abs(a[0]*a[4]+a[1]*a[5]+a[2]*a[6])<1e-6*Math.sqrt(x*y)&&
   Math.abs(a[0]*a[8]+a[1]*a[9]+a[2]*a[10])<1e-6*Math.sqrt(x*z)&&Math.abs(a[4]*a[8]+a[5]*a[9]+a[6]*a[10])<1e-6*Math.sqrt(y*z);}
 function collect(root){
  if(!root?.parent)return;
  let list=roots.get(root);
  const topology=index?.list(root);
  const revision=topology?topology.revision:root.userData.detailRevision||0;
  if(!list||list.revision!==revision){
   list=[];list.lods=topology?topology.lods:[];list.revision=revision;
   list.nodes=topology?topology.nodes:[];
   list.bounds=new T.Sphere();list.box=new T.Box3();list.rootMatrix=new T.Matrix4();list.bounded=false;
   if(topology)for(const node of topology.meshes)list.push({node,matrix:new T.Matrix4(),seen:false});
   else root.traverse(node=>{
    list.nodes.push(node);
    if(node.isLOD)list.lods.push(node);
    if(node.isMesh)list.push({node,matrix:new T.Matrix4(),seen:false});
   });roots.set(root,list);
  }
  // This only skips the batching optimization. Original off-screen sources
  // remain available to rendering/shadows, even if a child later expands.
  if(!list.bounded||!list.rootMatrix.equals(root.matrixWorld)){
   list.box.makeEmpty();
   for(const r of list){const p=r.node;if(!p.geometry)continue;
    if(!p.geometry.boundingSphere)p.geometry.computeBoundingSphere();
    sphere.copy(p.geometry.boundingSphere).applyMatrix4(p.matrixWorld);
    list.box.expandByPoint(point.copy(sphere.center).addScalar(sphere.radius));
    list.box.expandByPoint(point.copy(sphere.center).addScalar(-sphere.radius));
   }
   list.box.getBoundingSphere(list.bounds);list.rootMatrix.copy(root.matrixWorld);list.bounded=true;
  }
  if(!api.warming&&!frustum.intersectsSphere(list.bounds)){stats.skippedRoots++;return;}
  for(const lod of list.lods)if(!lodPrepared||lod.autoUpdate)lod.update(state.camera);
  for(const r of list){
   const p=r.node;let visible=true;
   for(let n=p;n;n=n.parent){if(!n.visible){visible=false;break;}if(n===scene)break;}
   if(!visible||(p.layers.mask&1)===0)continue;
   if(!eligible(p)){stats.unsupportedParts++;continue;}
   const changed=!r.seen||!r.matrix.equals(p.matrixWorld);
   if(changed){r.matrix.copy(p.matrixWorld);r.valid=orthogonal(r.matrix);r.seen=true;}
   if(!r.valid)continue;
   // Batch only parts the original camera pass would draw. Off-screen sources
   // remain untouched and continue casting their original visible shadows.
   if(!api.warming&&p.frustumCulled&&!frustum.intersectsObject(p))continue;
   const box=boxes.get(p.geometry),geometry=box?.geometry||p.geometry;
   const e=p.matrixWorld.elements,cx=Math.floor(e[12]/40),cz=Math.floor(e[14]/40);
   if(!r.key||r.cx!==cx||r.cz!==cz||r.geometry!==geometry||r.material!==p.material||r.cast!==p.castShadow||
    r.receive!==p.receiveShadow||r.order!==p.renderOrder||r.layers!==p.layers.mask){
    r.cx=cx;r.cz=cz;r.geometry=geometry;r.box=box;r.material=p.material;r.cast=p.castShadow;
    r.receive=p.receiveShadow;r.order=p.renderOrder;r.layers=p.layers.mask;
    r.key=[cx,cz,geometry.uuid,p.material.uuid,p.castShadow,p.receiveShadow,p.renderOrder,p.layers.mask].join('|');
   }
   const key=r.key;
   let b=buckets.get(key);
   if(!b){b={source:geometry,material:p.material,cx,cz,cast:p.castShadow,receive:p.receiveShadow,
    order:p.renderOrder,layers:p.layers.mask,items:[],previous:[],capacity:0,mesh:null};buckets.set(key,b);}
   b.items.push(r);b.dirty ||= changed;b.used=frame;stats.parts++;
  }
 }
 function update(prepared=false){
  lodPrepared=prepared;stats.enabled=api.enabled;stats.minSavings=api.minSavings;
  const start=performance.now();stats.sourceChecks=stats.cacheSkippedRoots=0;stats.reused=false;
  const viewSteady=state.camera&&lastView.equals(state.camera.matrixWorld)&&lastProjection.equals(state.camera.projectionMatrix),wasCached=cached;
  if(state.camera){lastView.copy(state.camera.matrixWorld);lastProjection.copy(state.camera.projectionMatrix);}
  if(unchanged()){stats.reason='cached';stats.cacheHits++;stats.reused=true;stats.uploads=0;stats.ms=performance.now()-start;return;}
  if(wasCached&&viewSteady)cacheCooldown=8;
  restore();frame++;
  if(scene!==state.scene){dispose();scene=state.scene;}
  Object.assign(stats,{parts:0,instances:0,batches:0,uploads:0,skippedRoots:0,buildingInstances:0,buildingBatches:0});
  for(const [key,b]of buckets){
   b.items.length=0;b.dirty=false;if(b.mesh)b.mesh.visible=false;
   if(frame-b.used>180){b.mesh?.parent?.remove(b.mesh);b.mesh?.dispose();releaseGeometry(b);buckets.delete(key);}
  }
  if(!api.enabled||!scene){stats.reason='disabled';stats.ms=performance.now()-start;return;}
  // Sparse views use originals. Reconsider periodically or as buildings/chunks
  // arrive; skipping this optimization never suppresses a mesh or animation.
  if(!api.warming&&viewSteady&&cooldown>0&&lastMinSavings===api.minSavings&&lastBuildings===state.buildings.length&&lastTerrainBuild===state.lastTerrainBuildAt){cooldown--;stats.reason='sparse-cooldown';stats.cooldownFrames=cooldown;stats.ms=performance.now()-start;return;}
  cooldown=0;stats.cooldownFrames=0;lastBuildings=state.buildings.length;lastTerrainBuild=state.lastTerrainBuildAt;lastMinSavings=api.minSavings;
  if(!state.renderer?.capabilities.isWebGL2&&!state.renderer?.extensions.get('ANGLE_instanced_arrays')){api.enabled=false;stats.fallback=true;stats.reason='unsupported';stats.ms=performance.now()-start;return;}
  try{
   projection.multiplyMatrices(state.camera.projectionMatrix,state.camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
   stats.unsupportedParts=0;visitedRoots.length=0;visitRoots(root=>{visitedRoots.push(root);collect(root);});stats.visitedRoots=visitedRoots.length;
   let savings=0,buildingSavings=0;for(const b of buckets.values())if(b.items.length>=2){
    savings+=b.items.length-1;if(b.items[0].node.userData.mergedBuildingStatic)buildingSavings+=b.items.length-1;
   }
   stats.potentialSavings=savings;
   if(!api.warming&&savings<api.minSavings&&buildingSavings<8){cooldown=15;stats.reason='sparse';stats.cooldownFrames=cooldown;stats.ms=performance.now()-start;return;}
   stats.reason='active';
   for(const [key,b]of buckets){
    if(b.items.length<2){if(b.mesh)b.previous.length=0;if(frame-b.used>180){b.mesh?.parent?.remove(b.mesh);b.mesh?.dispose();releaseGeometry(b);buckets.delete(key);}continue;}
    if(b.items.length>b.capacity){
     b.mesh?.parent?.remove(b.mesh);b.mesh?.dispose();releaseGeometry(b);
     const geometry=b.geometry=new T.BufferGeometry();geometry.setIndex(b.source.index);
     for(const [name,attribute]of Object.entries(b.source.attributes))geometry.setAttribute(name,attribute);
     geometry.groups=b.source.groups.map(g=>({...g}));geometry.setDrawRange(b.source.drawRange.start,b.source.drawRange.count);
     b.capacity=2**Math.ceil(Math.log2(b.items.length));b.mesh=new T.InstancedMesh(geometry,b.material,b.capacity);
     b.mesh.name='Spatial scenery batch';b.mesh.position.set(b.cx*40,0,b.cz*40);b.mesh.layers.mask=b.layers;
     b.mesh.raycast=()=>{}; // Selection uses the original building/tree hierarchy.
     b.mesh.castShadow=b.cast;b.mesh.receiveShadow=b.receive;b.mesh.renderOrder=b.order;
     b.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(b.mesh);b.mesh.updateMatrixWorld(true);
     b.inverse=new T.Matrix4().copy(b.mesh.matrixWorld).invert();b.bounds=new T.Box3();b.dirty=true;
     b.parentMatrix=scene.matrixWorld.clone();
    }
    if(!b.parentMatrix.equals(scene.matrixWorld)){b.inverse.copy(b.mesh.matrixWorld).invert();b.parentMatrix.copy(scene.matrixWorld);b.dirty=true;}
    let same=b.previous.length===b.items.length;
    if(same)for(let i=0;i<b.items.length;i++)if(b.previous[i]!==b.items[i]){same=false;break;}
    if(b.dirty||!same){
     b.bounds.makeEmpty();if(!b.source.boundingSphere)b.source.computeBoundingSphere();
     for(let i=0;i<b.items.length;i++){
      const r=b.items[i];matrix.multiplyMatrices(b.inverse,r.node.matrixWorld);if(r.box)matrix.scale(r.box.scale);b.mesh.setMatrixAt(i,matrix);
      sphere.copy(b.source.boundingSphere).applyMatrix4(matrix);
      b.bounds.expandByPoint(point.copy(sphere.center).addScalar(sphere.radius));
      b.bounds.expandByPoint(point.copy(sphere.center).addScalar(-sphere.radius));
     }
     if(!b.geometry.boundingBox)b.geometry.boundingBox=new T.Box3();
     b.geometry.boundingBox.copy(b.bounds);
     if(!b.geometry.boundingSphere)b.geometry.boundingSphere=new T.Sphere();
     b.bounds.getBoundingSphere(b.geometry.boundingSphere);
     b.mesh.instanceMatrix.updateRange.offset=0;b.mesh.instanceMatrix.updateRange.count=b.items.length*16;
     b.mesh.instanceMatrix.needsUpdate=true;b.previous.length=b.items.length;
     for(let i=0;i<b.items.length;i++)b.previous[i]=b.items[i];stats.uploads++;
    }
    b.mesh.count=b.items.length;b.mesh.visible=true;
    for(const r of b.items){masked.set(r.node,r.node.layers.mask);r.node.layers.set(hiddenLayer);}
    stats.instances+=b.items.length;stats.batches++;
    if(b.items[0].node.userData.mergedBuildingStatic){stats.buildingInstances+=b.items.length;stats.buildingBatches++;}
   }
   state.raycaster?.layers.enable(hiddenLayer);
   if(api.cacheEnabled&&viewSteady&&cacheCooldown--<=0)remember();
  }catch(error){api.enabled=false;stats.fallback=true;stats.reason='error';restore();for(const b of buckets.values())if(b.mesh)b.mesh.visible=false;console.warn('Scenery batching unavailable; using originals',error);}
  stats.ms=performance.now()-start;
 }
 function matrixError(){let error=0;const expected=new T.Matrix4(),actual=new T.Matrix4();for(const b of buckets.values())if(b.mesh?.visible)for(let i=0;i<b.items.length;i++){
  expected.multiplyMatrices(b.inverse,b.items[i].node.matrixWorld);if(b.items[i].box)expected.scale(b.items[i].box.scale);b.mesh.getMatrixAt(i,actual);
  for(let k=0;k<16;k++)error=Math.max(error,Math.abs(expected.elements[k]-actual.elements[k]));}return error;}
 return api;
}
