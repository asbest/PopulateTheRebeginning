// Reuse the original ten bolt segments; only their transforms change.
// Damage, spell timing and the shared light budget remain with the game.
export function createLightningFx(T,state){
 const free=[],active=new Set(),axis=new T.Vector3(0,1,0),diff=new T.Vector3(),dummy=new T.Object3D();
 let geometry;
 const stats={created:0,reused:0,active:0};
 function create(){
  geometry ||= new T.CylinderGeometry(.2,.2,1,8);
  const material=new T.MeshBasicMaterial({color:0xffffff,transparent:true,opacity:1});
  const mesh=new T.Group();mesh.name='Lightning bolt';mesh.visible=false;
  const instanced=state.renderer.capabilities.isWebGL2||!!state.renderer.extensions.get('ANGLE_instanced_arrays');
  if(instanced){
   const segments=new T.InstancedMesh(geometry,material,10);
   segments.instanceMatrix.setUsage(T.DynamicDrawUsage);segments.frustumCulled=false;
   for(let i=0;i<10;i++)segments.setMatrixAt(i,new T.Matrix4());mesh.add(segments);
  }else for(let i=0;i<10;i++)mesh.add(new T.Mesh(geometry,material));
  stats.created++;return {mesh,material,instanced,generation:0};
 }
 function release(entry){
  if(!active.delete(entry))return;
  entry.mesh.parent?.remove(entry.mesh);entry.mesh.visible=false;stats.active=active.size;
  if(free.length<16)free.push(entry);
  else{if(entry.instanced)entry.mesh.children[0].dispose();entry.material.dispose();}
 }
 return {stats,
  prepareRoots(){while(free.length+active.size<8)free.push(create());return free.map(entry=>entry.mesh);},
  strike(x,h,z,duration){
   let entry=free.pop();if(entry)stats.reused++;else entry=create();
   const {mesh,material,instanced}=entry,generation=++entry.generation;
   let cx=x,cy=h+30,cz=z;
   for(let i=0;i<10;i++){
    const ny=cy-3,nx=i===9?x:x+(Math.random()-.5)*4,nz=i===9?z:z+(Math.random()-.5)*4;
    diff.set(nx-cx,ny-cy,nz-cz);const length=diff.length();
    dummy.position.set(cx+diff.x/2,cy+diff.y/2,cz+diff.z/2);
    dummy.quaternion.setFromUnitVectors(axis,diff.normalize());dummy.scale.set(1,length,1);dummy.updateMatrix();
    if(instanced)mesh.children[0].setMatrixAt(i,dummy.matrix);
    else{const part=mesh.children[i];part.position.copy(dummy.position);part.quaternion.copy(dummy.quaternion);part.scale.copy(dummy.scale);}
    cx=nx;cy=ny;cz=nz;
   }
   if(instanced)mesh.children[0].instanceMatrix.needsUpdate=true;
   const glow=mesh.userData.lightning={x,y:h+2,z,intensity:3};
   material.opacity=1;mesh.visible=true;state.scene.add(mesh);active.add(entry);stats.active=active.size;
   return {mesh,life:duration,maxLife:duration,update(dt){
    if(entry.generation!==generation||!active.has(entry))return false;
    this.life-=dt;
    const pulse=Math.max(0,Math.min(1,this.life/.3))*(.78+.22*Math.cos((duration-this.life)*Math.PI*6));
    material.opacity=pulse;glow.intensity=3*pulse;
    if(this.life<=0){release(entry);return false;}return true;
   }};
  },
  clear(){for(const entry of [...active])release(entry);}
 };
}
