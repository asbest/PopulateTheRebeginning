import {projectedCoverPixels} from './lod-policy.js';

// When individual petals no longer resolve, draw a single bloom for each head.
// Keep the original stems, palette, instance base positions and wind shader.
export function createFlowerOverview(T,state,palette,material,prepare){
    const records=new WeakMap(),matrix=new T.Matrix4(),offset=new T.Matrix4();
    const sphere=new T.Sphere(),clip=new T.Matrix4(),frustum=new T.Frustum(),box=new T.Box3();
    const stats={chunks:0,blooms:0,savedTriangles:0,pending:0};
    state.flowerOverviewStats=stats;
    const api={enabled:true,stats,update,release};
    const layer=29;

    function showOriginal(record){
        for(const [mesh,mask] of record.masked)if(mesh.layers.mask===(1<<layer))mesh.layers.mask=mask;
        record.masked.clear();
        if(record.mesh)record.mesh.visible=false;
    }
    function release(chunk){
        const record=records.get(chunk);
        if(!record)return;
        showOriginal(record);
        if(record.mesh){chunk.remove(record.mesh);record.mesh.geometry.dispose();record.mesh.dispose();}
        records.delete(chunk);
    }
    function update(camera,renderer){
        stats.chunks=stats.blooms=stats.savedTriangles=0;
        let builds=0;
        clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);
        frustum.setFromProjectionMatrix(clip);
        const limit=state.graphicsQuality?.vegetationPixelLimit??2;
        const ultra=state.graphicsQuality?.tier==='ultra',firstPerson=state.isFPV&&camera.isPerspectiveCamera&&!ultra;
        const bloomLimit=(camera.isOrthographicCamera&&!ultra||firstPerson)
            ?3.5*Math.max(1,renderer.getPixelRatio()):0;
        for(const chunk of Object.values(state.chunks)){
            const flowers=chunk.userData.flowers,stem=flowers?.stems,sourceBounds=stem?.geometry.boundingSphere;
            if(!sourceBounds)continue;
            let record=records.get(chunk);
            if(record&&record.stem!==stem){release(chunk);record=null;}
            if(!api.enabled||state.isFPV&&!firstPerson||!chunk.visible||!stem.visible){
                if(record)showOriginal(record);
                continue;
            }
            sphere.copy(sourceBounds).applyMatrix4(stem.matrixWorld);
            const pixels=projectedCoverPixels(camera,renderer.domElement.height,stem,sphere,box);
            const hysteresis=record?.mesh?.visible?1.12:1;
            if(!frustum.intersectsSphere(sphere)||pixels*.65>limit*hysteresis&&pixels*.32>bloomLimit*hysteresis){
                if(record)showOriginal(record);
                continue;
            }
            const bases=stem.geometry.attributes.aBasePos;
            if(!bases||!stem.count||!flowers.data.length)continue;
            if(!record){
                if(builds>=2)continue;
                builds++;
                const geometry=new T.OctahedronGeometry(.11);
                geometry.setAttribute('aBasePos',new T.InstancedBufferAttribute(new Float32Array(bases.array.length),3));
                const mesh=new T.InstancedMesh(geometry,material(),flowers.data.length);
                mesh.name='Overview flower blooms';
                mesh.userData.landscapeKind='flowers';
                mesh.visible=false;
                mesh.raycast=()=>{};
                record={stem,mesh,masked:new Map(),matrixVersion:-1,baseVersion:-1};
                records.set(chunk,record);
                chunk.add(mesh);mesh.updateMatrixWorld(true);
            }
            const mesh=record.mesh;
            if(record.matrixVersion!==stem.instanceMatrix.version||record.baseVersion!==bases.version){
                mesh.geometry.attributes.aBasePos.array.set(bases.array);
                mesh.geometry.attributes.aBasePos.needsUpdate=true;
                for(let i=0;i<flowers.data.length;i++){
                    const data=flowers.data[i];
                    stem.getMatrixAt(i,matrix);
                    offset.makeScale(data.scaleFactor*(data.isTulip?.72:1.1),data.isTulip?.28:.15,data.scaleFactor*(data.isTulip?.72:1.1));
                    offset.setPosition(0,data.isTulip?.11:.2,0);
                    mesh.setMatrixAt(i,matrix.multiply(offset));
                    mesh.setColorAt(i,palette()[data.cIndex]);
                }
                mesh.geometry.boundingSphere=sourceBounds.clone();
                mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;
                record.matrixVersion=stem.instanceMatrix.version;record.baseVersion=bases.version;
            }
            mesh.count=stem.count;
            if(!record.ready){
                if(!record.pending&&!record.failed){
                    const candidate=record;
                    candidate.pending=true;stats.pending++;
                    // Keep the original heads visible until the replacement's
                    // larger buffers have been uploaded through the GPU budget.
                    Promise.resolve().then(()=>records.get(chunk)===candidate?prepare(mesh):null)
                        .then(()=>{candidate.ready=true;}).catch(error=>{
                            candidate.failed=true;console.warn('Keeping full flower geometry after preparation failed',error);
                        }).finally(()=>{
                            candidate.pending=false;stats.pending--;
                        });
                }
                continue;
            }
            mesh.layers.mask=stem.layers.mask;
            mesh.visible=true;
            let originalTriangles=0;
            for(const source of [flowers.centers,flowers.petals,flowers.tulips]){
                if(!source?.visible||!source.count)continue;
                if(!record.masked.has(source))record.masked.set(source,source.layers.mask);
                source.layers.set(layer);
                originalTriangles+=source.count*(source.geometry.index?.count??source.geometry.attributes.position.count)/3;
            }
            stats.chunks++;stats.blooms+=mesh.count;
            stats.savedTriangles+=originalTriangles-mesh.count*8;
        }
    }
    return api;
}
