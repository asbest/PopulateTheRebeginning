import {projectedCoverPixels} from './lod-policy.js';
// Keep all eight volumetric grass blades. Only intermediate rings disappear
// when their maximum displacement is below half a drawing-buffer pixel.
export function grassIndices(T,geometry,step){
 const p=geometry.attributes.position,indices=[];let error=0;
 for(let blade=0;blade<8;blade++)for(let ring=0;ring<4;ring+=step){
  const start=blade*20+ring*4,end=start+step*4;
  for(let side=0;side<4;side++){
   const next=(side+1)%4;indices.push(start+side,start+next,end+side,start+next,end+next,end+side);
   for(let j=1;j<step;j++){
    const t=j/step,k=start+j*4+side,a=start+side,b=end+side;
    error=Math.max(error,Math.hypot(p.getX(k)-(p.getX(a)*(1-t)+p.getX(b)*t),
     p.getY(k)-(p.getY(a)*(1-t)+p.getY(b)*t),p.getZ(k)-(p.getZ(a)*(1-t)+p.getZ(b)*t)));
   }
  }
 }
 return {index:new T.Uint16BufferAttribute(indices,1),error:error*2};
}
// The narrow sides of a blade can cover less than a pixel.
// Keep both broad faces, with the original positions, normals and wind.
function thinGrassIndices(T,geometry){
 const p=geometry.attributes.position,indices=[];let thickness=0;
 for(let ring=0;ring<p.count;ring+=4){
  thickness=Math.max(thickness,Math.hypot(p.getX(ring)-p.getX(ring+3),p.getZ(ring)-p.getZ(ring+3)),
   Math.hypot(p.getX(ring+1)-p.getX(ring+2),p.getZ(ring+1)-p.getZ(ring+2)));
  if(ring%20===16)continue;
  for(const side of [0,2]){
   const a=ring+side,b=a+1;indices.push(a,b,a+4,b,b+4,a+4);
  }
 }
 return {index:new T.Uint16BufferAttribute(indices,1),error:thickness};
}

function lowGrassIndices(T){
 const indices=[];
 // The wider face of each original blade, with its middle bend and tip.
 // The shared grass material already draws both sides.
 for(let blade=0;blade<8;blade++)for(let ring=0;ring<4;ring+=2){
  const a=blade*20+ring*4,b=a+1,c=a+8,d=b+8;
  indices.push(a,b,c,b,d,c);
 }
 return new T.Uint16BufferAttribute(indices,1);
}
export function createOverviewDetails(T,state,source=()=>null){
 const records=new WeakMap(),variants=new WeakMap(),sphere=new T.Sphere();
 const thinned=new Map();
 const lowGrass=lowGrassIndices(T);
 const stats={full:0,medium:0,far:0,savedTriangles:0,visibleSavedTriangles:0,visibleOmittedClumps:0};state.overviewDetailStats=stats;
 const api={enabled:true,stats,update,restore,release};const clip=new T.Matrix4(),frustum=new T.Frustum(),box=new T.Box3();
 function restore(){
  for(const [mesh,count] of thinned)mesh.count=count;
  thinned.clear();
 }
 function release(mesh){const r=records.get(mesh);if(!r)return;
  if(thinned.has(mesh)){mesh.count=thinned.get(mesh);thinned.delete(mesh);}
  if(mesh.geometry===r.geometry&&(mesh.geometry.index===lowGrass||r.levels.some(level=>mesh.geometry.index===level.index)))
   mesh.geometry.setIndex(r.original);
  records.delete(mesh);
 }
 function update(camera,renderer){
  restore();
  stats.full=stats.medium=stats.far=stats.savedTriangles=stats.visibleSavedTriangles=stats.visibleOmittedClumps=0;
  clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(clip);
  const tier=state.graphicsQuality?.tier,low=tier==='low',medium=tier==='medium';
  const ultra=tier==='ultra',firstPerson=state.isFPV&&camera.isPerspectiveCamera&&!ultra;
  const densityLod=api.enabled&&medium&&(!state.isFPV||firstPerson);
  const focus=firstPerson?camera.position:state.cameraLookAt;
  for(const key in state.chunks){const layer=state.chunks[key].userData?.groundCover?.grass,mesh=layer?.mesh;if(!mesh)continue;
   const g=mesh.geometry,p=g.attributes.position;
   // Custom/replaced ground-cover geometry retains its original path.
   if(p?.count!==160||!g.index)continue;
   const visible=mesh.visible&&mesh.layers.test(camera.layers)&&frustum.intersectsObject(mesh);
   if(firstPerson&&api.enabled&&!visible)continue;
   let r=records.get(mesh);
   if(!r||r.geometry!==g||r.positionVersion!==p.version){
    const template=p.version===0?(source()||g):g,base=template.attributes.position;
    let levels=variants.get(base.array);
    if(!levels||template===g&&p.version!==r?.positionVersion){
     levels=[grassIndices(T,template,2),grassIndices(T,template,4),thinGrassIndices(T,template)];variants.set(base.array,levels);
    }
    let scale=1;for(const d of layer.data)scale=Math.max(scale,d.scale*Math.max(1.8,d.height||1));
    r={geometry:g,original:r?.geometry===g?r.original:g.index,levels,scale,level:0,positionVersion:p.version};records.set(mesh,r);
   }
   const fullCount=mesh.count;
   if(densityLod&&visible&&mesh.coverBounds&&focus){
    box.copy(mesh.coverBounds).applyMatrix4(mesh.matrixWorld);
    const dx=Math.max(box.min.x-focus.x,focus.x-box.max.x,0);
    const dz=Math.max(box.min.z-focus.z,focus.z-box.max.z,0);
    // Leave near clumps at full density. The same seeded prefix is always
    // drawn at distance, with a buffer to avoid flicker around the boundary.
    const limit=r.sparse?28:36;
    r.sparse=dx*dx+dz*dz>limit*limit;
    if(r.sparse&&fullCount>1){
     thinned.set(mesh,fullCount);
     mesh.count=Math.ceil(fullCount/2);
     stats.visibleOmittedClumps+=fullCount-mesh.count;
    }
   }else if(!densityLod)r.sparse=false;
   let level=0;
   if(api.enabled&&low&&p.version===0)level=4;
   else if(api.enabled&&(!state.isFPV||firstPerson)&&g.boundingSphere){
    sphere.copy(g.boundingSphere).applyMatrix4(mesh.matrixWorld);
    const pixels=projectedCoverPixels(camera,renderer.domElement.height,mesh,sphere,box),scale=r.scale*mesh.matrixWorld.getMaxScaleOnAxis();
    const bladePixels=pixels*scale*.62,near=firstPerson&&bladePixels>24;
    const thinLimit=medium&&!near?(r.level===3?2.1:1.8):(r.level===3?.95:.8);
    if((camera.isOrthographicCamera&&!ultra||firstPerson)&&p.version===0&&
       r.levels[2].error*scale*pixels*1.1<=thinLimit)level=3;
    if(bladePixels<(medium?24:8))for(let i=0;i<2;i++){
     // Wind is an affine height-dependent shear of magnitude < .08.
     const limit=medium?(r.level===i+1?1.3:1):(r.level===i+1?.5:.35);
     if(r.levels[i].error*scale*pixels*1.1<=limit&&(!medium||!level||r.levels[i].index.count<r.levels[level-1].index.count))level=i+1;
    }
   }
   r.level=level;const index=level===4?lowGrass:level?r.levels[level-1].index:r.original;if(g.index!==index)g.setIndex(index);
   stats[['full','medium','far','medium','far'][level]]++;
   const saved=(r.original.count*fullCount-index.count*mesh.count)/3;stats.savedTriangles+=saved;
   if(visible)stats.visibleSavedTriangles+=saved;
  }
 }
 return api;
}
