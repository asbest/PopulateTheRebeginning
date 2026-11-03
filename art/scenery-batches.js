// Original meshes, materials, shadows and raycast geometry remain authoritative.
// Spatially bounded instances share vertex buffers; no mesh simplification/LOD.
export function createSceneryBatches(T,state){
 const buckets=new Map(),roots=new WeakMap(),masked=new Map(),hiddenLayer=30;
 const matrix=new T.Matrix4(),sphere=new T.Sphere(),point=new T.Vector3();
 const projection=new T.Matrix4(),frustum=new T.Frustum();
 let scene,frame=0,cooldown=0,lastBuildings=-1,lastTerrainBuild;
 const stats={parts:0,instances:0,batches:0,uploads:0,ms:0,fallback:false};
 const api={enabled:true,warming:false,stats,update,restore,dispose,matrixError};
 function restore(){for(const [part,mask]of masked)part.layers.mask=mask;masked.clear();}
 function releaseGeometry(b){if(b.geometry){
  // The wrapper owns its bounds/VAOs, not the source vertex/index buffers.
  b.geometry.attributes={};b.geometry.index=null;b.geometry.dispose();
 }}
 function dispose(){restore();for(const b of buckets.values()){b.mesh?.parent?.remove(b.mesh);b.mesh?.dispose();releaseGeometry(b);}buckets.clear();}
 function eligible(p){const m=p.material;return p.isMesh&&!p.isInstancedMesh&&!p.isSkinnedMesh&&
  !p.customDepthMaterial&&!p.customDistanceMaterial&&
  m?.type==='MeshStandardMaterial'&&!m.transparent&&m.opacity===1&&!m.clippingPlanes?.length&&
  !p.geometry.morphAttributes.position&&m.onBeforeCompile===T.Material.prototype.onBeforeCompile&&
  p.onBeforeRender===T.Object3D.prototype.onBeforeRender;}
 function orthogonal(m){const a=m.elements,x=a[0]*a[0]+a[1]*a[1]+a[2]*a[2],y=a[4]*a[4]+a[5]*a[5]+a[6]*a[6],z=a[8]*a[8]+a[9]*a[9]+a[10]*a[10];
  return m.determinant()>0&&Math.abs(a[0]*a[4]+a[1]*a[5]+a[2]*a[6])<1e-6*Math.sqrt(x*y)&&
   Math.abs(a[0]*a[8]+a[1]*a[9]+a[2]*a[10])<1e-6*Math.sqrt(x*z)&&Math.abs(a[4]*a[8]+a[5]*a[9]+a[6]*a[10])<1e-6*Math.sqrt(y*z);}
 function collect(root){
  if(!root?.parent)return;
  let list=roots.get(root);
  if(!list){list=[];root.traverse(node=>{if(node.isMesh)list.push({node,matrix:new T.Matrix4(),seen:false});});roots.set(root,list);}
  for(const r of list){
   const p=r.node;let visible=true;
   for(let n=p;n;n=n.parent){if(!n.visible||n.isLOD){visible=false;break;}if(n===scene)break;}
   if(!visible||(p.layers.mask&1)===0||!eligible(p))continue;
   const changed=!r.seen||!r.matrix.equals(p.matrixWorld);
   if(changed){r.matrix.copy(p.matrixWorld);r.valid=orthogonal(r.matrix);r.seen=true;}
   if(!r.valid)continue;
   // Batch only parts the original camera pass would draw. Off-screen sources
   // remain untouched and continue casting their original visible shadows.
   if(!api.warming&&p.frustumCulled&&!frustum.intersectsObject(p))continue;
   const e=p.matrixWorld.elements,cx=Math.floor(e[12]/40),cz=Math.floor(e[14]/40);
   if(!r.key||r.cx!==cx||r.cz!==cz||r.geometry!==p.geometry||r.material!==p.material||r.cast!==p.castShadow||
    r.receive!==p.receiveShadow||r.order!==p.renderOrder||r.layers!==p.layers.mask){
    r.cx=cx;r.cz=cz;r.geometry=p.geometry;r.material=p.material;r.cast=p.castShadow;
    r.receive=p.receiveShadow;r.order=p.renderOrder;r.layers=p.layers.mask;
    r.key=[cx,cz,p.geometry.uuid,p.material.uuid,p.castShadow,p.receiveShadow,p.renderOrder,p.layers.mask].join('|');
   }
   const key=r.key;
   let b=buckets.get(key);
   if(!b){b={source:p.geometry,material:p.material,cx,cz,cast:p.castShadow,receive:p.receiveShadow,
    order:p.renderOrder,layers:p.layers.mask,items:[],previous:[],capacity:0,mesh:null};buckets.set(key,b);}
   b.items.push(r);b.dirty ||= changed;b.used=frame;stats.parts++;
  }
 }
 function update(){
  const start=performance.now();restore();frame++;
  if(scene!==state.scene){dispose();scene=state.scene;}
  Object.assign(stats,{parts:0,instances:0,batches:0,uploads:0});
  for(const [key,b]of buckets){
   b.items.length=0;b.dirty=false;if(b.mesh)b.mesh.visible=false;
   if(frame-b.used>180){b.mesh?.parent?.remove(b.mesh);b.mesh?.dispose();releaseGeometry(b);buckets.delete(key);}
  }
  if(!api.enabled||!scene){stats.ms=performance.now()-start;return;}
  // Sparse views use originals. Reconsider periodically or as buildings/chunks
  // arrive; skipping this optimization never suppresses a mesh or animation.
  if(!api.warming&&cooldown>0&&lastBuildings===state.buildings.length&&lastTerrainBuild===state.lastTerrainBuildAt){cooldown--;stats.ms=performance.now()-start;return;}
  cooldown=0;lastBuildings=state.buildings.length;lastTerrainBuild=state.lastTerrainBuildAt;
  if(!state.renderer?.capabilities.isWebGL2&&!state.renderer?.extensions.get('ANGLE_instanced_arrays')){api.enabled=false;stats.fallback=true;return;}
  try{
   projection.multiplyMatrices(state.camera.projectionMatrix,state.camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
   for(const b of state.buildings)if(!b.dead)collect(b.visualMesh);
   for(const key in state.chunks){const chunk=state.chunks[key];
    for(const t of chunk.userData?.trees||[])collect(t.mesh);
    if(chunk.userData?.ritualSite)collect(chunk.userData.ritualSite.mesh);
   }
   let savings=0;for(const b of buckets.values())if(b.items.length>=2)savings+=b.items.length-1;
   if(!api.warming&&savings<64){cooldown=15;stats.ms=performance.now()-start;return;}
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
      const r=b.items[i];matrix.multiplyMatrices(b.inverse,r.node.matrixWorld);b.mesh.setMatrixAt(i,matrix);
      sphere.copy(b.source.boundingSphere).applyMatrix4(matrix);
      b.bounds.expandByPoint(point.copy(sphere.center).addScalar(sphere.radius));
      b.bounds.expandByPoint(point.copy(sphere.center).addScalar(-sphere.radius));
     }
     b.geometry.boundingBox=b.bounds.clone();b.geometry.boundingSphere=b.bounds.getBoundingSphere(new T.Sphere());
     b.mesh.instanceMatrix.needsUpdate=true;b.previous.length=b.items.length;
     for(let i=0;i<b.items.length;i++)b.previous[i]=b.items[i];stats.uploads++;
    }
    b.mesh.count=b.items.length;b.mesh.visible=true;
    for(const r of b.items){masked.set(r.node,r.node.layers.mask);r.node.layers.set(hiddenLayer);}
    stats.instances+=b.items.length;stats.batches++;
   }
   state.raycaster?.layers.enable(hiddenLayer);
  }catch(error){api.enabled=false;stats.fallback=true;restore();for(const b of buckets.values())if(b.mesh)b.mesh.visible=false;console.warn('Scenery batching unavailable; using originals',error);}
  stats.ms=performance.now()-start;
 }
 function matrixError(){let error=0;const expected=new T.Matrix4(),actual=new T.Matrix4();for(const b of buckets.values())if(b.mesh?.visible)for(let i=0;i<b.items.length;i++){
  expected.multiplyMatrices(b.inverse,b.items[i].node.matrixWorld);b.mesh.getMatrixAt(i,actual);
  for(let k=0;k<16;k++)error=Math.max(error,Math.abs(expected.elements[k]-actual.elements[k]));}return error;}
 return api;
}
