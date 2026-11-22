import {projectedPixels} from './lod-policy.js';
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
// The narrow sides of a blade cover less than a pixel in the strategy view.
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
export function createOverviewDetails(T,state,source=()=>null){
 const records=new WeakMap(),variants=new WeakMap(),sphere=new T.Sphere();
 const stats={full:0,medium:0,far:0,savedTriangles:0,visibleSavedTriangles:0};state.overviewDetailStats=stats;
 const api={enabled:true,stats,update,release};const clip=new T.Matrix4(),frustum=new T.Frustum();
 function release(mesh){const r=records.get(mesh);if(!r)return;
  if(mesh.geometry===r.geometry&&r.levels.some(level=>mesh.geometry.index===level.index))mesh.geometry.setIndex(r.original);
  records.delete(mesh);
 }
 function update(camera,renderer){
  stats.full=stats.medium=stats.far=stats.savedTriangles=stats.visibleSavedTriangles=0;
  clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(clip);
  for(const key in state.chunks){const layer=state.chunks[key].userData?.groundCover?.grass,mesh=layer?.mesh;if(!mesh)continue;
   const g=mesh.geometry,p=g.attributes.position;
   // Custom/replaced ground-cover geometry retains its original path.
   if(p?.count!==160||!g.index)continue;
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
   let level=0;
   if(api.enabled&&!state.isFPV&&g.boundingSphere){
    sphere.copy(g.boundingSphere).applyMatrix4(mesh.matrixWorld);
    const pixels=projectedPixels(camera,renderer.domElement.height,sphere.center,sphere.radius),scale=r.scale*mesh.matrixWorld.getMaxScaleOnAxis();
    if(camera.isOrthographicCamera&&state.graphicsQuality?.tier!=='ultra'&&p.version===0&&
       r.levels[2].error*scale*pixels*1.1<=(r.level===3?.95:.8))level=3;
    if(pixels*scale*.62<8)for(let i=0;i<2;i++){
     // Wind is an affine height-dependent shear of magnitude < .08.
     if(r.levels[i].error*scale*pixels*1.1<=(r.level===i+1?.5:.35))level=i+1;
    }
   }
   r.level=level;const index=level?r.levels[level-1].index:r.original;if(g.index!==index)g.setIndex(index);
   stats[['full','medium','far','medium'][level]]++;
   const saved=(r.original.count-index.count)/3*mesh.count;stats.savedTriangles+=saved;
   if(mesh.visible&&mesh.layers.test(camera.layers)&&frustum.intersectsObject(mesh))stats.visibleSavedTriangles+=saved;
  }
 }
 return api;
}
