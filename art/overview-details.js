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
   if(!r||r.geometry!==g){
    const template=p.version===0?(source()||g):g,base=template.attributes.position;
    let levels=variants.get(base.array);
    if(!levels){levels=[grassIndices(T,template,2),grassIndices(T,template,4)];variants.set(base.array,levels);}
    let scale=1;for(const d of layer.data)scale=Math.max(scale,d.scale*Math.max(1.8,d.height||1));
    r={geometry:g,original:g.index,levels,scale,level:0};records.set(mesh,r);
   }
   let level=0;
   if(api.enabled&&!state.isFPV&&g.boundingSphere){
    sphere.copy(g.boundingSphere).applyMatrix4(mesh.matrixWorld);
    const pixels=projectedPixels(camera,renderer.domElement.height,sphere.center,sphere.radius),scale=r.scale*mesh.matrixWorld.getMaxScaleOnAxis();
    if(pixels*scale*.62<8)for(let i=0;i<r.levels.length;i++){
     // Wind is an affine height-dependent shear of magnitude < .08.
     if(r.levels[i].error*scale*pixels*1.1<=(r.level===i+1?.5:.35))level=i+1;
    }
   }
   r.level=level;const index=level?r.levels[level-1].index:r.original;if(g.index!==index)g.setIndex(index);
   stats[['full','medium','far'][level]]++;
   const saved=(r.original.count-index.count)/3*mesh.count;stats.savedTriangles+=saved;
   if(mesh.visible&&mesh.layers.test(camera.layers)&&frustum.intersectsObject(mesh))stats.visibleSavedTriangles+=saved;
  }
 }
 return api;
}
