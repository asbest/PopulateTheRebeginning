// Experimental two-by-two chunk batches. Copy only the instances that the
// original frustum test would submit. The grass shader uses world-space bases.
export function createGrassBatches(T,state,template){
    const batches=new Map(),hidden=[],clip=new T.Matrix4(),frustum=new T.Frustum(),identity=new T.Matrix4();
    let scene;
    const stats={batches:0,savedCalls:0,uploads:0};
    const api={enabled:false,stats,update,restore};
    function restore(){
        for(const source of hidden)source.visible=true;
        hidden.length=0;
    }
    function release(batch){
        batch.mesh.parent?.remove(batch.mesh);
        batch.mesh.geometry.dispose();
        batch.mesh.dispose();
    }
    function update(camera){
        restore();
        stats.batches=stats.savedCalls=stats.uploads=0;
        if(!api.enabled||scene!==state.scene){
            for(const batch of batches.values())release(batch);
            batches.clear();scene=state.scene;
        }
        if(!api.enabled||!camera.isOrthographicCamera||!scene.matrixWorld.equals(identity)){
            for(const batch of batches.values())batch.mesh.visible=false;
            return;
        }
        const sourceGeometry=template(),groups=new Map();
        if(!sourceGeometry)return;
        clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(clip);
        for(const key in state.chunks){
            const chunk=state.chunks[key],source=chunk.userData.groundCover?.grass?.mesh;
            if(!chunk.parent||!chunk.visible||!source?.visible||!source.count||!source.layers.test(camera.layers)||
               source.castShadow||source.receiveShadow||!source.frustumCulled||!source.matrixWorld.equals(identity)||
               !frustum.intersectsObject(source))continue;
            const g=source.geometry;
            if(!g.index||!source.instanceColor||!g.attributes.aBasePos||
               ['position','normal','uv','color'].some(name=>g.attributes[name]?.count!==sourceGeometry.attributes[name]?.count||g.attributes[name]?.version!==0))continue;
            const [x,z]=key.split(',').map(Number);
            const id=[Math.floor(x/2),Math.floor(z/2),source.material.id,source.layers.mask,source.renderOrder,g.index.count].join('/');
            if(!groups.has(id))groups.set(id,[]);
            groups.get(id).push(source);
        }
        for(const [id,batch] of batches)if((groups.get(id)?.length||0)<2){release(batch);batches.delete(id);}
        for(const [id,sources] of groups){
            if(sources.length<2)continue;
            const stamp=sources.map(s=>[s.id,s.count,s.instanceMatrix.version,s.instanceColor.version,s.geometry.attributes.aBasePos.version,s.geometry.index.version].join('/')).join(':');
            let batch=batches.get(id);
            if(batch?.stamp!==stamp){
                if(batch)release(batch);
                const first=sources[0],geometry=sourceGeometry.clone(),index=first.geometry.index;
                geometry.setIndex(index.clone());
                const count=sources.reduce((sum,s)=>sum+s.count,0),bases=new Float32Array(count*3),colors=new Float32Array(count*3);
                const mesh=new T.InstancedMesh(geometry,first.material,count);
                mesh.name='Grass overview batch';mesh.userData.landscapeKind='grass';
                mesh.layers.mask=first.layers.mask;mesh.renderOrder=first.renderOrder;
                mesh.frustumCulled=false;mesh.raycast=()=>{};
                let offset=0;
                for(const source of sources){
                    mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(0,source.count*16),offset*16);
                    colors.set(source.instanceColor.array.subarray(0,source.count*3),offset*3);
                    bases.set(source.geometry.attributes.aBasePos.array.subarray(0,source.count*3),offset*3);
                    offset+=source.count;
                }
                mesh.instanceColor=new T.InstancedBufferAttribute(colors,3);
                geometry.setAttribute('aBasePos',new T.InstancedBufferAttribute(bases,3));
                scene.add(mesh);mesh.updateMatrixWorld(true);
                batch={mesh,stamp};batches.set(id,batch);stats.uploads++;
            }
            batch.mesh.visible=true;
            for(const source of sources){source.visible=false;hidden.push(source);}
            stats.batches++;stats.savedCalls+=sources.length-1;
        }
    }
    return api;
}
