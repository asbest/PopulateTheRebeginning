// Draw the original, fully animated meshes as instances. The rig, collision
// bodies, weapon pivots and raycast geometry remain authoritative and intact.
export function createCharacterBatches(T,state,heightAt,wildlife=()=>null){
    const hiddenLayer=31,buckets=new Map(),materials=new Map(),records=new WeakMap(),parts=new WeakMap(),masked=new Map();
    const inverse=new T.Matrix4(),matrix=new T.Matrix4(),color=new T.Color(),dummy=new T.Object3D();
    const frustum=new T.Frustum(),projection=new T.Matrix4(),sphere=new T.Sphere();
    let scene,blob,frame=0;
    const stats={parts:0,instances:0,batches:0,farShadows:0,ms:0,fallback:false};
    const api={enabled:true,fullShadows:false,warming:false,stats,update,restore,dispose,matrixError};
    const textureKeys=['map','normalMap','roughnessMap','metalnessMap','alphaMap','aoMap','bumpMap','emissiveMap'];
    function restore(){for(const [part,mask]of masked)part.layers.mask=mask;masked.clear();}
    function matrixError(){
        let error=0;const actual=new T.Matrix4(),expected=new T.Matrix4();
        for(const b of buckets.values())if(b.mesh?.visible)for(let i=0;i<b.items.length;i++){
            b.mesh.getMatrixAt(i,actual);expected.multiplyMatrices(inverse,b.items[i].matrixWorld);
            for(let k=0;k<16;k++)error=Math.max(error,Math.abs(actual.elements[k]-expected.elements[k]));
        }
        return error;
    }
    function dispose(){
        restore();for(const b of buckets.values())b.mesh?.parent?.remove(b.mesh);
        for(const b of buckets.values())b.mesh?.dispose();
        for(const m of materials.values())m.dispose();buckets.clear();materials.clear();
        if(blob){blob.parent?.remove(blob);blob.geometry.dispose();blob.material.dispose();blob=null;}
    }
    function materialKey(m){
        let r=records.get(m);
        if(r?.version===m.version&&materials.has(r.key))return r.key;
        const key=[m.type,...textureKeys.map(k=>m[k]?.uuid||''),m.roughness,m.metalness,m.side,m.vertexColors,
            m.flatShading,m.alphaTest,m.depthTest,m.depthWrite,m.polygonOffset,m.polygonOffsetFactor,m.polygonOffsetUnits,
            m.normalScale?.x,m.normalScale?.y,m.bumpScale,m.aoMapIntensity,m.emissive?.getHex(),m.emissiveIntensity,
            m.fog,m.toneMapped,m.wireframe].join('|');
        records.set(m,{version:m.version,key});
        if(!materials.has(key)){
            const copy=m.clone();copy.color.setRGB(1,1,1);
            // Joint rotations under nonuniform scales produce affine shear.
            // r128's stock instanced normals assume orthogonal columns; use the
            // exact inverse transpose so combat/fall poses can stay batched too.
            copy.onBeforeCompile=shader=>{
                const normal=T.ShaderChunk.defaultnormal_vertex.replace(/#ifdef USE_INSTANCING[\s\S]*?#endif/,`#ifdef USE_INSTANCING
                    mat3 affine=mat3(instanceMatrix);
                    vec3 a=cross(affine[1],affine[2]);
                    mat3 affineNormal=mat3(a,cross(affine[2],affine[0]),cross(affine[0],affine[1]));
                    transformedNormal=affineNormal*objectNormal/dot(affine[0],a);
                    #endif`);
                shader.vertexShader=shader.vertexShader.replace('#include <defaultnormal_vertex>',normal);
            };
            copy.customProgramCacheKey=()=> 'full-affine-instance-normals-v1';materials.set(key,copy);
        }
        return key;
    }
    function eligible(part){
        const m=part.material;
        return part.isMesh&&!part.isSkinnedMesh&&!part.isInstancedMesh&&m?.type==='MeshStandardMaterial'&&
            !m.transparent&&m.opacity===1&&!m.clippingPlanes?.length&&!part.geometry.morphAttributes.position&&!part.geometry.attributes.tangent&&
            m.onBeforeCompile===T.Material.prototype.onBeforeCompile&&part.name!=='StaffCrystal'&&
            (part.layers.mask&1)!==0&&part.matrixWorld.determinant()>0;
    }
    function collect(node,shadow){
        if(!node.visible)return;
        if(node.isLOD)node.update(state.camera);
        if(eligible(node)){
            const mk=materialKey(node.material),cast=shadow&&node.castShadow;
            let part=parts.get(node);
            if(!part||part.geometry!==node.geometry||part.mk!==mk||part.cast!==cast||part.receive!==node.receiveShadow||part.order!==node.renderOrder){
                part={geometry:node.geometry,mk,cast,receive:node.receiveShadow,order:node.renderOrder,
                    key:node.geometry.uuid+'|'+mk+'|'+cast+'|'+node.receiveShadow+'|'+node.renderOrder};parts.set(node,part);
            }
            const key=part.key;
            let b=buckets.get(key);
            if(!b){b={geometry:node.geometry,material:materials.get(mk),cast,receive:node.receiveShadow,order:node.renderOrder,items:[],mesh:null,capacity:0};buckets.set(key,b);}
            b.items.push(node);b.used=frame;stats.parts++;
        }
        for(const child of node.children)collect(child,shadow);
    }
    function initBlob(){
        const geometry=new T.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
        const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{},
            vertexShader:'varying vec2 vUv;varying float fade;void main(){vUv=uv;fade=instanceColor.r;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
            fragmentShader:'varying vec2 vUv;varying float fade;void main(){float a=(1.-smoothstep(.12,.5,length(vUv-.5)))*fade;gl_FragColor=vec4(.03,.035,.025,a);}'});
        blob=new T.InstancedMesh(geometry,material,2048);blob.frustumCulled=false;blob.count=0;
        blob.name='Distant unit contact shadows';blob.instanceMatrix.setUsage(T.DynamicDrawUsage);
        blob.setColorAt(0,color.setRGB(.2,.2,.2));scene.add(blob);
    }
    function update(){
        const start=performance.now();restore();frame++;
        if(scene!==state.scene){dispose();scene=state.scene;}
        for(const b of buckets.values()){b.items.length=0;if(b.mesh)b.mesh.visible=false;}
        if(blob){blob.count=0;blob.visible=false;}
        Object.assign(stats,{parts:0,instances:0,batches:0,farShadows:0});
        const animals=wildlife(),bunnies=animals?.bunnies||[],birds=animals?.birds||[];
        if(!api.enabled||!scene||!state.camera||state.units.length+bunnies.length+birds.length<12&&!api.warming){stats.ms=performance.now()-start;return;}
        if(state.renderer&&!state.renderer.capabilities.isWebGL2&&!state.renderer.extensions.get('ANGLE_instanced_arrays')){
            api.enabled=false;stats.fallback=true;stats.ms=performance.now()-start;return;
        }
        try{
            inverse.copy(scene.matrixWorld).invert();
            projection.multiplyMatrices(state.camera.projectionMatrix,state.camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
            const focus=state.isFPV?state.camera.position:state.cameraLookAt;
            const near={low:20,medium:32,high:45,ultra:60}[state.graphicsQuality?.tier]||45;
            let shadows=0;
            for(const population of [state.units,bunnies,birds])for(const u of population){
                const animal=population!==state.units;
                if(!u.mesh?.parent||!u.mesh.visible||u.state==='transported')continue;
                let visible=true;for(let p=u.mesh.parent;p;p=p.parent)if(!p.visible)visible=false;
                if(!visible)continue;
                const p=u.mesh.position,detailed=animal||api.fullShadows||Math.hypot(p.x-focus.x,p.z-focus.z)<=near;
                sphere.center.copy(p);sphere.center.y+=u.isVehicle?4:2;sphere.radius=u.isVehicle?10:8;
                if(!detailed&&!frustum.intersectsSphere(sphere)){
                    // Outside both the view and detailed-shadow range: suppress only
                    // drawing, never the simulation or animation of the original rig.
                    for(const root of [u.torso,u.legL,u.legR,u.airshipVisual])root?.traverse(part=>{
                        if(part.isMesh&&(part.layers.mask&1)!==0){masked.set(part,part.layers.mask);part.layers.set(hiddenLayer);}
                    });
                    continue;
                }
                if(animal)collect(u.mesh,true);
                else for(const root of [u.torso,u.legL,u.legR,u.airshipVisual])if(root)collect(root,detailed);
                if(!detailed&&u.state!=='dead'&&!u.invisible&&!u.isPhantom&&shadows<2048){
                    if(!blob)initBlob();
                    const h=heightAt(p.x,p.z),altitude=Math.max(0,p.y-h),size=u.isVehicle?3.5:1.2;
                    dummy.position.set(p.x,h+.04,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(size,1,size);
                    dummy.updateMatrix();matrix.multiplyMatrices(inverse,dummy.matrix);blob.setMatrixAt(shadows,matrix);
                    const fade=.19/(1+altitude*.12);blob.setColorAt(shadows++,color.setRGB(fade,fade,fade));
                }
            }
            for(const [key,b]of buckets){
                if(b.items.length<(api.warming?1:2)){if(frame-b.used>300&&b.mesh){scene.remove(b.mesh);b.mesh.dispose();buckets.delete(key);}continue;}
                if(b.capacity<b.items.length){
                    if(b.mesh){scene.remove(b.mesh);b.mesh.dispose();}
                    b.capacity=2**Math.ceil(Math.log2(Math.max(8,b.items.length)));
                    b.mesh=new T.InstancedMesh(b.geometry,b.material,b.capacity);b.mesh.name='Animated character batch';
                    b.mesh.castShadow=b.cast;b.mesh.receiveShadow=b.receive;b.mesh.renderOrder=b.order;
                    b.mesh.frustumCulled=false;b.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(b.mesh);
                    b.mesh.updateMatrixWorld(true);
                }
                for(let i=0;i<b.items.length;i++){
                    const part=b.items[i];matrix.multiplyMatrices(inverse,part.matrixWorld);b.mesh.setMatrixAt(i,matrix);
                    b.mesh.setColorAt(i,part.material.color);masked.set(part,part.layers.mask);part.layers.set(hiddenLayer);
                }
                b.mesh.count=b.items.length;b.mesh.visible=true;b.mesh.instanceMatrix.needsUpdate=true;b.mesh.instanceColor.needsUpdate=true;
                stats.instances+=b.items.length;stats.batches++;
            }
            if(blob){blob.count=shadows;blob.visible=shadows>0;if(shadows){blob.instanceMatrix.needsUpdate=true;blob.instanceColor.needsUpdate=true;}}
            stats.farShadows=shadows;state.raycaster?.layers.enable(hiddenLayer);
        }catch(error){
            api.enabled=false;stats.fallback=true;restore();
            for(const b of buckets.values())if(b.mesh)b.mesh.visible=false;if(blob)blob.visible=false;
            console.warn('Character batching unavailable; using original meshes',error);
        }
        stats.ms=performance.now()-start;
    }
    return api;
}
