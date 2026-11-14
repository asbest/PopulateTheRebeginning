// Draw the original, fully animated meshes as instances. The rig, collision
// bodies, weapon pivots and raycast geometry remain authoritative and intact.
export function createCharacterBatches(T,state,heightAt,wildlife=()=>null){
    const hiddenLayer=31,buckets=new Map(),materials=new Map(),records=new WeakMap(),parts=new WeakMap(),masked=new Map();
    const inverse=new T.Matrix4(),matrix=new T.Matrix4(),color=new T.Color(),dummy=new T.Object3D();
    const frustum=new T.Frustum(),projection=new T.Matrix4(),sphere=new T.Sphere();
    const shadowProfiles={low:[20,24],medium:[32,32],high:[45,40],ultra:[60,56]};
    const shadowDistances=[],simplifiedCasters=[],partialShadowBatches=[];
    const smallDetails=new Set(['Eye','Iris','UpperEyelid','Brow','Earring','NoseBridge','NoseTip','Mouth','BraidBead','Thumb','RitualBeads','MaskEyeSlit']);
    let scene,blob,shadowMap,frame=0;
    const stats={parts:0,instances:0,batches:0,farShadows:0,visibleUnits:0,simplifiedUnits:0,ms:0,fallback:false};
    const api={enabled:true,crowdDetail:true,fullShadows:false,warming:false,stats,update,restore,dispose,matrixError,reducePose};
    const textureKeys=['map','normalMap','roughnessMap','metalnessMap','alphaMap','aoMap','bumpMap','emissiveMap'];
    function restore(){
        for(const [part,mask]of masked)part.layers.mask=mask;
        masked.clear();
        for(const part of simplifiedCasters)part.castShadow=true;
        simplifiedCasters.length=0;
    }
    function matrixError(){
        let error=0;const actual=new T.Matrix4(),expected=new T.Matrix4();
        for(const b of buckets.values())if(b.mesh?.visible)for(let i=0;i<b.items.length;i++){
            b.mesh.getMatrixAt(i,actual);expected.multiplyMatrices(inverse,b.items[i].matrixWorld);
            for(let k=0;k<16;k++)error=Math.max(error,Math.abs(actual.elements[k]-expected.elements[k]));
        }
        return error;
    }
    function dispose(){
        restore();partialShadowBatches.length=0;for(const b of buckets.values())b.mesh?.parent?.remove(b.mesh);
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
    function eligible(part,healthBar){
        const m=part.material;
        return part.isMesh&&!part.isSkinnedMesh&&!part.isInstancedMesh&&m?.type===(healthBar?'MeshBasicMaterial':'MeshStandardMaterial')&&
            !m.transparent&&m.opacity===1&&!m.clippingPlanes?.length&&!part.geometry.morphAttributes.position&&!part.geometry.attributes.tangent&&
            m.onBeforeCompile===T.Material.prototype.onBeforeCompile&&part.name!=='StaffCrystal'&&
            (part.layers.mask&1)!==0&&part.matrixWorld.determinant()>0;
    }
    function maskPart(part){
        if(part.isMesh&&(part.layers.mask&1)!==0){masked.set(part,part.layers.mask);part.layers.set(hiddenLayer);}
    }
    function projectedHeight(unit){
        const camera=state.camera,p=unit.mesh.position;
        const height=(unit.height||1.5)*unit.mesh.scale.y;
        const viewportHeight=state.renderer?.domElement.clientHeight;
        if(!viewportHeight)return Infinity;
        const pixels=height*viewportHeight*Math.abs(camera.projectionMatrix.elements[5])*.5;
        if(!camera.isPerspectiveCamera)return pixels;
        const m=camera.matrixWorldInverse.elements;
        const depth=-(m[2]*p.x+m[6]*p.y+m[10]*p.z+m[14]);
        return pixels/Math.max(depth,camera.near);
    }
    function reducePose(unit){
        return api.enabled&&api.crowdDetail&&!state.isFPV&&stats.visibleUnits>=15&&
            !state.selectedUnits.includes(unit)&&!unit.isShaman&&!unit.isVehicle&&projectedHeight(unit)<22;
    }
    function collect(node,shadow,healthBar=false,simple=false){
        if(!node.visible)return;
        if(simple&&(smallDetails.has(node.name)||node.isLOD&&node.name.startsWith('Blender detail LOD character/'))){
            node.traverse(maskPart);
            return;
        }
        if(node.isLOD)node.update(state.camera);
        if(eligible(node,healthBar)){
            const mk=materialKey(node.material),cast=node.castShadow;
            let part=parts.get(node);
            if(!part||part.geometry!==node.geometry||part.mk!==mk||part.cast!==cast||part.receive!==node.receiveShadow||part.order!==node.renderOrder){
                part={geometry:node.geometry,mk,cast,receive:node.receiveShadow,order:node.renderOrder,
                    key:node.geometry.uuid+'|'+mk+'|'+cast+'|'+node.receiveShadow+'|'+node.renderOrder};parts.set(node,part);
            }
            const key=part.key;
            let b=buckets.get(key);
            if(!b){b={geometry:node.geometry,material:materials.get(mk),cast,receive:node.receiveShadow,order:node.renderOrder,healthBar,items:[],shadowCount:0,mesh:null,capacity:0};buckets.set(key,b);}
            const end=b.items.length;
            if(cast&&shadow){
                const slot=b.shadowCount++;
                if(slot<end)b.items[end]=b.items[slot];
                b.items[slot]=node;
            }else b.items.push(node);
            b.used=frame;stats.parts++;
        }else if(!shadow&&node.isMesh)suppressShadow(node);
        for(const child of node.children)collect(child,shadow,false,simple);
    }
    function suppressShadow(part){
        if(!part.castShadow)return;
        simplifiedCasters.push(part);
        part.castShadow=false;
    }
    function bindShadowPass(map){
        const render=map.render;
        map.render=function(lights,root,camera){
            if(root!==scene||shadowMap!==map||!partialShadowBatches.length)return render.call(this,lights,root,camera);
            // The detailed casters occupy the prefix of the same GPU batch.
            // Reuse the uploaded matrices for the shadow pass and restore the full draw count.
            for(const batch of partialShadowBatches)batch.mesh.count=batch.shadowCount;
            try{return render.call(this,lights,root,camera);}
            finally{for(const batch of partialShadowBatches)batch.mesh.count=batch.items.length;}
        };
        shadowMap=map;
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
        partialShadowBatches.length=0;
        for(const b of buckets.values()){b.items.length=0;b.shadowCount=0;if(b.mesh)b.mesh.visible=false;}
        if(blob){blob.count=0;blob.visible=false;}
        Object.assign(stats,{parts:0,instances:0,batches:0,farShadows:0,visibleUnits:0,simplifiedUnits:0});
        const animals=wildlife(),bunnies=animals?.bunnies||[],birds=animals?.birds||[];
        if(!api.enabled||!scene||!state.camera||state.units.length+bunnies.length+birds.length<12&&!api.warming){stats.ms=performance.now()-start;return;}
        if(state.renderer&&!state.renderer.capabilities.isWebGL2&&!state.renderer.extensions.get('ANGLE_instanced_arrays')){
            api.enabled=false;stats.fallback=true;stats.ms=performance.now()-start;return;
        }
        try{
            if(state.renderer?.shadowMap&&shadowMap!==state.renderer.shadowMap)bindShadowPass(state.renderer.shadowMap);
            inverse.copy(scene.matrixWorld).invert();
            projection.multiplyMatrices(state.camera.projectionMatrix,state.camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
            const focus=state.isFPV?state.camera.position:state.cameraLookAt;
            const [shadowRange,shadowBudget]=shadowProfiles[state.graphicsQuality?.tier]||shadowProfiles.high;
            let shadowRangeSq=shadowRange*shadowRange;
            if(!api.fullShadows&&state.units.length>shadowBudget){
                shadowDistances.length=0;
                for(const unit of state.units){
                    if(!unit.mesh?.parent||!unit.mesh.visible||unit.state==='transported')continue;
                    const p=unit.mesh.position,dx=p.x-focus.x,dz=p.z-focus.z;
                    const distanceSq=dx*dx+dz*dz;
                    if(distanceSq<=shadowRangeSq)shadowDistances.push(distanceSq);
                }
                if(shadowDistances.length>shadowBudget){
                    shadowDistances.sort((a,b)=>a-b);
                    // Crowds outside the close-up area use the existing contact shadow.
                    shadowRangeSq=Math.max(12*12,shadowDistances[shadowBudget-1]);
                }
            }
            let shadows=0;
            for(const population of [state.units,bunnies,birds])for(const u of population){
                const animal=population!==state.units;
                if(!u.mesh?.parent||!u.mesh.visible||u.state==='transported')continue;
                let visible=true;for(let p=u.mesh.parent;p;p=p.parent)if(!p.visible)visible=false;
                if(!visible)continue;
                const p=u.mesh.position,dx=p.x-focus.x,dz=p.z-focus.z;
                sphere.center.copy(p);sphere.center.y+=u.isVehicle?4:2;sphere.radius=u.isVehicle?10:3;
                const inView=frustum.intersectsSphere(sphere);
                if(!animal&&inView&&u.state!=='dead')stats.visibleUnits++;
                const useProjected=api.crowdDetail&&!api.warming&&!state.isFPV&&!animal;
                const pixels=useProjected?projectedHeight(u):Infinity;
                const simple=pixels<23&&!u.isVehicle;
                const detailed=animal||api.fullShadows||state.renderer.shadowMap.enabled&&dx*dx+dz*dz<=shadowRangeSq&&pixels>=29;
                if(!detailed&&!inView){
                    // Outside both the view and detailed-shadow range: suppress only
                    // drawing, never the simulation or animation of the original rig.
                    for(const root of [u.torso,u.legL,u.legR,u.airshipVisual])root?.traverse(maskPart);
                    continue;
                }
                if(simple)stats.simplifiedUnits++;
                if(animal)collect(u.mesh,true);
                else for(const root of [u.torso,u.legL,u.legR,u.airshipVisual])if(root)collect(root,detailed,false,simple);
                // Preserve the original billboard transforms, fill scales and faction colors.
                // Warm both instance shaders even when the starting units are at full health.
                if(u.hpGroup&&(u.hpGroup.visible||api.warming)){
                    for(const part of u.hpGroup.children)collect(part,false,true);
                }
                if((!detailed||api.warming&&shadows===0)&&u.state!=='dead'&&!u.invisible&&!u.isPhantom&&shadows<2048){
                    if(!blob)initBlob();
                    const h=heightAt(p.x,p.z),altitude=Math.max(0,p.y-h),size=u.isVehicle?3.5:1.2;
                    dummy.position.set(p.x,h+.04,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(size,1,size);
                    dummy.updateMatrix();matrix.multiplyMatrices(inverse,dummy.matrix);blob.setMatrixAt(shadows,matrix);
                    const fade=.19/(1+altitude*.12);blob.setColorAt(shadows++,color.setRGB(fade,fade,fade));
                }
            }
            for(const [key,b]of buckets){
                if(b.items.length<(api.warming||b.healthBar?1:2)){
                    if(b.items.length&&b.cast&&!b.shadowCount)suppressShadow(b.items[0]);
                    if(!b.healthBar&&frame-b.used>300&&b.mesh){scene.remove(b.mesh);b.mesh.dispose();buckets.delete(key);}
                    continue;
                }
                if(b.capacity<b.items.length){
                    if(b.mesh){scene.remove(b.mesh);b.mesh.dispose();}
                    // Reserve room for a full group hit during shader warmup.
                    const minCapacity=b.healthBar?128:api.warming?32:8;
                    b.capacity=2**Math.ceil(Math.log2(Math.max(minCapacity,b.items.length)));
                    b.mesh=new T.InstancedMesh(b.geometry,b.material,b.capacity);b.mesh.name='Animated character batch';
                    b.mesh.receiveShadow=b.receive;b.mesh.renderOrder=b.order;
                    b.mesh.frustumCulled=false;b.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(b.mesh);
                    b.mesh.updateMatrixWorld(true);
                }
                for(let i=0;i<b.items.length;i++){
                    const part=b.items[i];matrix.multiplyMatrices(inverse,part.matrixWorld);b.mesh.setMatrixAt(i,matrix);
                    b.mesh.setColorAt(i,part.material.color);masked.set(part,part.layers.mask);part.layers.set(hiddenLayer);
                }
                b.mesh.count=b.items.length;b.mesh.visible=true;b.mesh.castShadow=b.shadowCount>0;
                if(b.mesh.castShadow&&b.shadowCount<b.mesh.count)partialShadowBatches.push(b);
                b.mesh.instanceMatrix.updateRange.count=b.mesh.count*16;
                b.mesh.instanceColor.updateRange.count=b.mesh.count*3;
                b.mesh.instanceMatrix.needsUpdate=true;b.mesh.instanceColor.needsUpdate=true;
                stats.instances+=b.items.length;stats.batches++;
            }
            if(blob){
                blob.count=shadows;blob.visible=shadows>0;
                if(shadows){
                    blob.instanceMatrix.updateRange.count=shadows*16;
                    blob.instanceColor.updateRange.count=shadows*3;
                    blob.instanceMatrix.needsUpdate=true;blob.instanceColor.needsUpdate=true;
                }
            }
            stats.farShadows=shadows;state.raycaster?.layers.enable(hiddenLayer);
        }catch(error){
            api.enabled=false;stats.fallback=true;partialShadowBatches.length=0;restore();
            for(const b of buckets.values())if(b.mesh)b.mesh.visible=false;if(blob)blob.visible=false;
            console.warn('Character batching unavailable; using original meshes',error);
        }
        stats.ms=performance.now()-start;
    }
    return api;
}
