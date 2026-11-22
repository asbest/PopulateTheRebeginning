// Only skip static chunk LOD work when its complete bounds miss both the main
// camera and every shadow camera. Sources, rendering and animations stay live.
export function createLodVisibility(T,state,index,transforms){
 const owners=new WeakMap(),chunks=new WeakMap(),cameraFrustum=new T.Frustum(),clip=new T.Matrix4(),sphere=new T.Sphere(),point=new T.Vector3();
 const shadows=[],shadowPool=[],stats={enabled:true,visibleChunks:0,skippedChunks:0,rebuiltBounds:0,unsafeChunks:0,shadowFallback:false};let frame=0,unknownShadow=false;
 state.lodVisibilityStats=stats;
 function begin(camera,renderer){
  frame++;stats.visibleChunks=stats.skippedChunks=stats.rebuiltBounds=stats.unsafeChunks=0;
  stats.enabled=this.enabled;if(!this.enabled)return;
  clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);cameraFrustum.setFromProjectionMatrix(clip);
  shadows.length=0;unknownShadow=false;
  if(renderer.shadowMap.enabled)for(const light of index.list(state.scene).lights){
   if(!light.castShadow||!index.visible(light,state.scene))continue;
   if(!light.isDirectionalLight||!light.shadow?.updateMatrices){unknownShadow=true;continue;}
   light.shadow.updateMatrices(light);const c=light.shadow.camera,f=shadowPool[shadows.length]||(shadowPool[shadows.length]=new T.Frustum());
   clip.multiplyMatrices(c.projectionMatrix,c.matrixWorldInverse);f.setFromProjectionMatrix(clip);shadows.push(f);
  }
  stats.shadowFallback=unknownShadow;
  for(const key in state.chunks){const chunk=state.chunks[key],list=index.list(chunk),version=transforms.version(chunk),land=chunk.children[0]?.geometry.attributes.position;
   let e=chunks.get(chunk);
   if(!e){e={chunk,members:[],sphere:new T.Sphere(),box:new T.Box3(),matrix:new T.Matrix4(),needed:true};chunks.set(chunk,e);}
   const topology=e.revision!==list.revision,pose=e.version!==version,terrain=e.land!==land||e.landVersion!==land?.version;
   if(topology){for(const node of e.members)if(owners.get(node)===e)owners.delete(node);e.members.length=0;
    for(const node of list.lods){owners.set(node,e);e.members.push(node);}for(const node of list.visualLods){owners.set(node,e);e.members.push(node);}
    e.stable=e.members.every(node=>{
     for(let p=node;p&&p!==chunk;p=p.parent)if(!transforms.has(p))return false;
     return true;
    });
   }
   const dirty=topology||pose||terrain||!e.matrix.equals(chunk.matrixWorld)||e.pending;
   // Repeated transform changes (burning/growing props) use the original LOD
   // path until they settle instead of rebuilding bounds during every frame.
   const moving=pose&&e.lastPoseFrame===frame-1;
   if(pose)e.lastPoseFrame=frame;
   if(dirty&&!moving){
    e.box.makeEmpty();e.unsafe=false;
    const include=node=>{for(const mesh of index.list(node).meshes){const g=mesh.geometry;if(!g?.attributes.position)continue;
     const m=mesh.material;
     if(mesh.isSkinnedMesh||mesh.morphTargetInfluences||mesh.customDepthMaterial||mesh.customDistanceMaterial||Array.isArray(m)||m?.isShaderMaterial||m?.displacementMap)e.unsafe=true;
     if(m?.onBeforeCompile!==T.Material.prototype.onBeforeCompile&&m?.customProgramCacheKey?.()!=='island-tree-wind-v1')e.unsafe=true;
     if(!g.boundingSphere)g.computeBoundingSphere();sphere.copy(g.boundingSphere).applyMatrix4(mesh.matrixWorld);
     e.box.expandByPoint(point.copy(sphere.center).addScalar(sphere.radius));e.box.expandByPoint(point.copy(sphere.center).addScalar(-sphere.radius));
    }};
    for(const node of list.lods)include(node);for(const node of list.visualLods)include(node);
    if(e.box.isEmpty())e.unsafe=true;else e.box.expandByScalar(2).getBoundingSphere(e.sphere);
    e.matrix.copy(chunk.matrixWorld);e.pending=false;stats.rebuiltBounds++;
   }else if(moving)e.pending=true;
   if(dirty)e.demand=undefined;
   e.revision=list.revision;e.version=version;e.land=land;e.landVersion=land?.version;
   e.needed=moving||e.unsafe||unknownShadow||cameraFrustum.intersectsSphere(e.sphere);
   for(let i=0;!e.needed&&i<shadows.length;i++)e.needed=shadows[i].intersectsSphere(e.sphere);
   if(e.unsafe||moving)stats.unsafeChunks++;
   if(e.needed)stats.visibleChunks++;else stats.skippedChunks++;
  }
 }
 return {enabled:true,stats,begin,
  allow(node){const e=owners.get(node);return !this.enabled||!e||!e.chunk.parent||e.needed;},
  reuse(node,demand){
   const e=owners.get(node);
   if(!this.enabled||demand===undefined||!e?.stable||!e.chunk.parent||e.pending)return false;
   // All members of a visible chunk share the same orthographic screen scale.
   if(e.decisionFrame!==frame){e.decisionFrame=frame;e.reuse=e.demand===demand;e.demand=demand;}
   return e.reuse;
  }
 };
}
