// Keep the original instance batch when the whole chunk is on screen. Along a
// frustum edge, draw only the visible quadrants using the same blade geometry.
export function createFirstPersonGrass(T,state){
    const records=new WeakMap(),hidden=[],drawn=[],clip=new T.Matrix4(),frustum=new T.Frustum();
    const projected=new T.Box3(),point=new T.Vector3();
    const stats={chunks:0,cells:0,culledInstances:0,uploads:0};
    state.firstPersonGrassStats=stats;

    function restore(){
        for(const mesh of hidden)mesh.visible=true;
        for(const mesh of drawn)mesh.visible=false;
        hidden.length=drawn.length=0;
    }

    function release(source){
        const record=records.get(source);
        if(!record)return;
        for(const {mesh} of record.cells)if(mesh){
            mesh.parent?.remove(mesh);
            // These vertex/index attributes belong to the original mesh.
            const base=mesh.geometry.attributes.aBasePos;
            mesh.geometry.attributes={aBasePos:base};mesh.geometry.index=null;
            mesh.geometry.dispose();mesh.dispose();
        }
        records.delete(source);
    }

    function prepare(chunk,layer){
        const source=layer.mesh,g=source.geometry,base=g.attributes.aBasePos;
        let r=records.get(source);
        if(r&&r.geometry===g&&r.base===base)return r;
        release(source);
        const center=chunk.children[0].position;
        const cells=Array.from({length:4},()=>({indices:[],box:new T.Box3(),count:0}));
        for(let i=0;i<layer.data.length;i++){
            const {x,z}=layer.data[i];
            cells[Number(x>=center.x)+2*Number(z>=center.z)].indices.push(i);
        }
        r={cells,geometry:g,base,matrixVersion:-1,baseVersion:-1,colorVersion:-1,count:-1};
        records.set(source,r);
        return r;
    }

    function sync(source,r){
        const matrixVersion=source.instanceMatrix.version,baseVersion=r.base.version,colorVersion=source.instanceColor.version;
        const changed=r.matrixVersion!==matrixVersion||r.baseVersion!==baseVersion||r.colorVersion!==colorVersion;
        if(!changed&&r.count===source.count)return;
        r.matrixVersion=matrixVersion;r.baseVersion=baseVersion;r.colorVersion=colorVersion;r.count=source.count;
        for(const cell of r.cells){
            cell.count=0;cell.box.makeEmpty();
            for(const i of cell.indices){
                if(i>=source.count)break;
                cell.count++;
                point.fromArray(source.instanceMatrix.array,i*16+12);cell.box.expandByPoint(point);
            }
            // Bounds include the original blade height, lean and wind displacement.
            if(cell.count){cell.box.min.addScalar(-2);cell.box.max.x+=2;cell.box.max.y+=4;cell.box.max.z+=2;}
            if(changed)cell.dirty=true;
        }
    }

    function drawCell(source,r,cell){
        let mesh=cell.mesh;
        if(!mesh){
            const geometry=new T.BufferGeometry(),capacity=cell.indices.length;
            for(const name in r.geometry.attributes)geometry.setAttribute(name,r.geometry.attributes[name]);
            geometry.setAttribute('aBasePos',new T.InstancedBufferAttribute(new Float32Array(capacity*3),3));
            mesh=cell.mesh=new T.InstancedMesh(geometry,source.material,capacity);
            mesh.instanceColor=new T.InstancedBufferAttribute(new Float32Array(capacity*3),3);
            mesh.name='First-person grass quadrant';mesh.userData.landscapeKind='grass';
            mesh.frustumCulled=false;mesh.raycast=()=>{};mesh.matrixAutoUpdate=false;
            source.parent.add(mesh);cell.dirty=true;
        }
        if(cell.dirty){
            const bases=mesh.geometry.attributes.aBasePos;
            for(const [j,i] of cell.indices.entries()){
                mesh.instanceMatrix.array.set(source.instanceMatrix.array.subarray(i*16,i*16+16),j*16);
                mesh.instanceColor.array.set(source.instanceColor.array.subarray(i*3,i*3+3),j*3);
                bases.array.set(r.base.array.subarray(i*3,i*3+3),j*3);
            }
            mesh.instanceMatrix.needsUpdate=mesh.instanceColor.needsUpdate=bases.needsUpdate=true;
            cell.dirty=false;stats.uploads++;
        }
        mesh.geometry.setIndex(r.geometry.index);
        mesh.material=source.material;mesh.layers.mask=source.layers.mask;mesh.renderOrder=source.renderOrder;
        mesh.matrix.copy(source.matrix);mesh.updateMatrixWorld(true);
        mesh.count=cell.count;mesh.visible=true;drawn.push(mesh);stats.cells++;
    }

    function update(camera){
        restore();stats.chunks=stats.cells=stats.culledInstances=stats.uploads=0;
        if(!api.enabled||!state.isFPV||!camera.isPerspectiveCamera||state.graphicsQuality?.tier==='ultra')return;
        clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(clip);
        for(const chunk of Object.values(state.chunks)){
            const layer=chunk.userData.groundCover?.grass,source=layer?.mesh;
            if(!chunk.parent||!chunk.visible||!source?.visible||!source.count||!source.geometry.attributes.aBasePos||
               source.castShadow||source.receiveShadow||!source.instanceColor||!source.layers.test(camera.layers)||!frustum.intersectsObject(source))continue;
            const r=prepare(chunk,layer);
            sync(source,r);
            let visible=0,uploads=0;
            for(const cell of r.cells){
                cell.visible=cell.count>0&&frustum.intersectsBox(projected.copy(cell.box).applyMatrix4(source.matrixWorld));
                if(cell.visible){visible+=cell.count;if(!cell.mesh||cell.dirty)uploads++;}
            }
            const avoided=source.count-visible;
            if(avoided<Math.max(16,source.count*.25)||stats.uploads+uploads>6)continue;
            for(const cell of r.cells)if(cell.visible)drawCell(source,r,cell);
            source.visible=false;hidden.push(source);stats.chunks++;stats.culledInstances+=avoided;
        }
    }
    const api={enabled:true,stats,update,restore,release};
    return api;
}
