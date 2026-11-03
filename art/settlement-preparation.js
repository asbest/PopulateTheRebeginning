// Shared GPU resources are warmed off-screen, in the real renderer's context.
// No world objects, collision bodies, animations or authored LODs are modified.
export function createSettlementPreparation(T,state,art,getLights){
 const budget=art.resources,types=new Map(),warmed=new Set(),programs=new Set(),geometryKeys=new WeakMap(),disposed=new WeakSet();
 let roots=new WeakMap(),boundRenderer,lights=[],lightTime=-Infinity;
 const point=new T.Vector3(),lastCamera=new T.Vector3(),predicted=new T.Vector3();
 let warmScene,signature='',target,previousTime=0,lastTick=-Infinity,backgroundPending=false;
 const stats={types:0,meshes:0,errors:0,initialMs:0,scans:0,chunks:0};
 function environment(){
  const r=state.renderer,time=performance.now();
  if(time-lightTime>=500){lights=getLights().filter(l=>l?.visible);lightTime=time;}
  if(boundRenderer!==r){boundRenderer=r;r.domElement.addEventListener('webglcontextrestored',()=>{
   warmed.clear();programs.clear();roots=new WeakMap();warmScene=null;signature='';
  });}
  const next=[r.outputEncoding,r.toneMapping,r.physicallyCorrectLights,r.shadowMap.enabled,r.shadowMap.type,state.graphicsQuality?.tier,
   state.scene.fog?.type,...lights.map(l=>l.type+'/'+l.castShadow)].join('|');
  if(!warmScene||signature!==next){
   signature=next;warmScene=new T.Scene();warmScene.fog=state.scene.fog?.clone()||null;
   warmScene.environment=state.scene.environment;
   for(const light of lights){const copy=light.clone();warmScene.add(copy);if(copy.target){warmScene.add(copy.target);copy.target.updateMatrixWorld();}}
  }
  return signature;
 }
 function draw(source,instanced,program){
  if(disposed.has(source.geometry))return;
  const r=state.renderer;if(r.getContext().isContextLost())throw Error('Context lost during preparation');
  environment();
  if(!target)target=new T.WebGLRenderTarget(1,1,{depthBuffer:true,stencilBuffer:false});
  target.texture.encoding=r.outputEncoding;
  const mesh=instanced?new T.InstancedMesh(source.geometry,source.material,1):new T.Mesh(source.geometry,source.material);
  const ownMatrix=instanced?mesh.instanceMatrix:null;
  if(source.isInstancedMesh){mesh.instanceMatrix=source.instanceMatrix;mesh.instanceColor=source.instanceColor;mesh.count=1;}
  else if(instanced)mesh.setMatrixAt(0,new T.Matrix4());
  mesh.receiveShadow=source.receiveShadow;mesh.frustumCulled=false;warmScene.add(mesh);
  if(!source.geometry.boundingSphere)source.geometry.computeBoundingSphere();
  const sphere=source.geometry.boundingSphere,camera=new T.PerspectiveCamera(60,1,.001,10000);
  camera.position.copy(sphere.center).add(new T.Vector3(0,0,Math.max(.1,sphere.radius*2.5)));
  camera.lookAt(sphere.center);
  const oldTarget=r.getRenderTarget(),face=r.getActiveCubeFace(),level=r.getActiveMipmapLevel();
  const viewport=r.getViewport(new T.Vector4()),scissor=r.getScissor(new T.Vector4()),scissorTest=r.getScissorTest();
  const auto=r.autoClear,shadowAuto=r.shadowMap.autoUpdate,shadowNeed=r.shadowMap.needsUpdate;
  try{
   r.shadowMap.autoUpdate=false;r.shadowMap.needsUpdate=false;r.autoClear=true;
   r.setRenderTarget(target);r.setViewport(0,0,1,1);r.setScissorTest(false);
   r.render(warmScene,camera);stats.meshes++;programs.add(program);
  }finally{
   r.setRenderTarget(oldTarget,face,level);r.setViewport(viewport);r.setScissor(scissor);r.setScissorTest(scissorTest);
   r.autoClear=auto;r.shadowMap.autoUpdate=shadowAuto;r.shadowMap.needsUpdate=shadowNeed;
   warmScene.remove(mesh);
   if(instanced){mesh.instanceMatrix=ownMatrix;mesh.instanceColor=null;mesh.dispose();}
  }
 }
 function collect(root,promote=false,largeOnly=false){
  const env=environment(),jobs=[];
  root.traverse(source=>{
   if(!source.isMesh||!source.geometry?.attributes.position?.count||disposed.has(source.geometry)||Array.isArray(source.material)||source.isInstancedMesh&&source.count===0)return;
   if(largeOnly){
    let bytes=source.geometry.index?.array.byteLength||0;
    for(const attr of Object.values(source.geometry.attributes))bytes+=attr.array.byteLength;
    if(source.isInstancedMesh)bytes+=source.instanceMatrix.array.byteLength+(source.instanceColor?.array.byteLength||0);
    if(bytes<8192)return;
   }
   if(promote)for(const name of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap','aoMap','bumpMap','alphaMap'])art.requestTexture(source.material[name]);
   const variants=source.isInstancedMesh?[true]:source.material.type==='MeshStandardMaterial'&&source.material.onBeforeCompile===T.Material.prototype.onBeforeCompile?[false,true]:[false];
   for(const instanced of variants){
    const key=[env,source.geometry.uuid,source.material.uuid,source.material.version,instanced,!!source.instanceColor,source.receiveShadow].join('|');
    if(warmed.has(key))continue;warmed.add(key);
    let keys=geometryKeys.get(source.geometry);
    if(!keys){
     const geometry=source.geometry;keys=new Set();geometryKeys.set(geometry,keys);
     geometry.addEventListener('dispose',()=>{disposed.add(geometry);for(const k of keys){warmed.delete(k);budget.cancel('settlement/'+k);}keys.clear();});
    }
    keys.add(key);
    const program=[env,source.material.uuid,source.material.version,instanced,!!source.instanceColor,
     source.geometry.attributes.color?.itemSize||0,!!source.geometry.attributes.uv2].join('|');
    const job=budget.enqueue('settlement/'+key,()=>{if(environment()!==env){warmed.delete(key);return;}draw(source,instanced,program);},()=>programs.has(program)?0:1).catch(error=>{
     warmed.delete(key);stats.errors++;console.warn('Settlement preparation deferred; keeping original rendering',error);
    });jobs.push(job);
   }
  });
  return Promise.all(jobs);
 }
 function prepareType(kind){
  if(types.has(kind))return types.get(kind);
  // Network/model loading is independent of the GPU preparation budget.
  const data=art.blender.ensure('building/'+kind+'/root');
  const work=(async()=>{
   const root=await budget.enqueue('settlement-prototype/'+kind,()=>art.building(kind),1);
   await data;await collect(root);stats.types++;return true;
  })().catch(error=>{stats.errors++;console.warn('Building base mesh remains available',kind,error);return false;});
  types.set(kind,work);return work;
 }
 async function initial(){
  const start=performance.now(),kinds=new Set(state.buildings.filter(b=>!b.dead).map(b=>b.type));
  let timer;
  await Promise.race([Promise.all([...kinds].map(prepareType)),new Promise(resolve=>{timer=setTimeout(resolve,1200);})]);
  clearTimeout(timer);stats.initialMs=performance.now()-start;
 }
 function tick(time){
  if(!state.assetsReady||time-lastTick<500)return;lastTick=time;
  const camera=state.camera.position,dt=Math.max(.1,(time-previousTime)/1000);
  predicted.copy(camera);
  if(previousTime){point.copy(camera).sub(lastCamera).multiplyScalar(2/dt).clampLength(0,40);predicted.add(point);}
  lastCamera.copy(camera);previousTime=time;
  // Start with the currently needed types. Optional future types load only
  // after entering play, one group at a time; the welcome screen stays small.
  if(!state.isPaused&&!backgroundPending){
   const kind=['hut','warrior','fire','preacher','spy','tower','shipyard'].find(k=>!types.has(k)&&!(k==='shipyard'&&state.matchSettings.noFlyers));
   if(kind){backgroundPending=true;prepareType(kind).finally(()=>{backgroundPending=false;});}
  }
  const env=environment(),candidates=[];
  for(const b of state.buildings){
   if(b.dead||!b.visualMesh)continue;
   const distance=Math.min(b.mesh.position.distanceToSquared(camera),b.mesh.position.distanceToSquared(predicted));
   if(distance>130*130)continue;
   const promote=state.isFPV||state.viewScale<=28;
   const stamp=env+'/'+b.visualMesh.children.length+'/'+promote;
   if(roots.get(b.visualMesh)===stamp)continue;
   candidates.push({root:b.visualMesh,stamp,distance,promote});
  }
  candidates.sort((a,b)=>a.distance-b.distance);
  for(const {root,stamp,promote}of candidates.slice(0,4)){
   roots.set(root,stamp);
   budget.enqueue('settlement-scan/'+root.uuid,()=>{stats.scans++;collect(root,promote);},-1)
    .catch(()=>{roots.delete(root);stats.errors++;});
  }
  // Distant loaded chunks can already cast shadows into the view. Prepare
  // them too, after the nearest chunks, without increasing the frame budget.
  const chunks=[];
  for(const chunk of Object.values(state.chunks)){
   const mesh=chunk.children[0];if(!mesh)continue;
   const distance=Math.min(mesh.position.distanceToSquared(camera),mesh.position.distanceToSquared(predicted));
   const stamp=env+'/'+chunk.children.length;
   if(roots.get(chunk)!==stamp)chunks.push({root:chunk,stamp,distance});
  }
  chunks.sort((a,b)=>a.distance-b.distance);
  for(const {root,stamp}of chunks.slice(0,2)){
   roots.set(root,stamp);
   budget.enqueue('terrain-gpu-scan/'+root.uuid,()=>{stats.chunks++;collect(root,false,true);},-1)
    .catch(()=>{roots.delete(root);stats.errors++;});
  }
 }
 return {stats,initial,tick,prepareType,prepareRoot:collect};
}
