import {createInstanceWriter} from './instance-writer.js';
import {CHARACTER_SHADOW_LAYER,createCharacterShadowProxy} from './character-shadow-proxy.js';
// Draw the original, fully animated meshes as instances. The rig, collision
// bodies, weapon pivots and raycast geometry remain authoritative and intact.
export function createCharacterBatches(T,state,heightAt,wildlife=()=>null){
    const hiddenLayer=31,buckets=new Map(),materials=new Map(),records=new WeakMap(),parts=new WeakMap(),masked=new Map();
    const writer=createInstanceWriter(T);
    const shadowProxy=createCharacterShadowProxy(T,writer);
    const inverse=new T.Matrix4(),matrix=new T.Matrix4(),color=new T.Color(),dummy=new T.Object3D();
    const identity=new T.Matrix4();
    const frustum=new T.Frustum(),projection=new T.Matrix4(),sphere=new T.Sphere();
    const shadowProfiles={low:[20,24],medium:[32,32],high:[45,40],ultra:[60,56]};
    const shadowDistances=[],simplifiedCasters=[],partialShadowBatches=[],empty=[];
    const smallDetails=new Set(['Eye','Iris','UpperEyelid','Brow','Earring','NoseBridge','NoseTip','Mouth','BraidBead','Thumb','RitualBeads','MaskEyeSlit']);
    let scene,blob,shadowMap,frame=0,lodPrepared=false;
    const stats={parts:0,instances:0,batches:0,farShadows:0,shadowProxyParts:0,visibleUnits:0,simplifiedUnits:0,lodChecksAvoided:0,ms:0,fallback:false};
    state.characterBatchStats=stats;
    const api={uploads:writer.stats,enabled:true,crowdDetail:true,firstPersonBudget:true,firstPersonShadowProxy:true,fullShadows:false,warming:false,stats,update,restore,dispose,matrixError,reducePose};
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
        shadowProxy.dispose();
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
        const viewportHeight=state.renderer?.domElement.height;
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
    function collect(node,shadow,healthBar=false,detail=0){
        if(!node.visible)return;
        if(detail&&(smallDetails.has(node.name)||detail===2&&node.isLOD&&node.name.startsWith('Blender detail LOD character/'))){
            node.traverse(maskPart);
            return;
        }
        if(node.isLOD){if(!lodPrepared||node.autoUpdate)node.update(state.camera);else stats.lodChecksAvoided++;}
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
        for(const child of node.children)collect(child,shadow,false,detail);
    }
    function suppressShadow(part){
        if(!part.castShadow)return;
        simplifiedCasters.push(part);
        part.castShadow=false;
    }
    function bindShadowPass(map){
        const render=map.render;
        map.render=function(lights,root,camera){
            if(root!==scene||shadowMap!==map||!partialShadowBatches.length&&!shadowProxy.active)return render.call(this,lights,root,camera);
            const layers=camera.layers.mask;
            if(shadowProxy.active)camera.layers.enable(CHARACTER_SHADOW_LAYER);
            // The detailed casters occupy the prefix of the same GPU batch.
            // Reuse the uploaded matrices for the shadow pass and restore the full draw count.
            for(const batch of partialShadowBatches)batch.mesh.count=batch.shadowCount;
            try{return render.call(this,lights,root,camera);}
            finally{
                camera.layers.mask=layers;
                for(const batch of partialShadowBatches)batch.mesh.count=batch.items.length;
            }
        };
        shadowMap=map;
    }
    function initBlob(){
        const geometry=new T.PlaneGeometry(1,1);geometry.rotateX(-Math.PI/2);
        const material=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{},
            vertexShader:'varying vec2 vUv;varying float fade;void main(){vUv=uv;fade=instanceColor.r;gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}',
            fragmentShader:'varying vec2 vUv;varying float fade;void main(){float a=(1.-smoothstep(.12,.5,length(vUv-.5)))*fade;gl_FragColor=vec4(.03,.035,.025,a);}'});
        blob=new T.InstancedMesh(geometry,material,2048);blob.frustumCulled=false;
        blob.name='Distant unit contact shadows';blob.instanceMatrix.setUsage(T.DynamicDrawUsage);
        blob.userData.landscapeKind='characters';
        // Three allocates the first instance color array from the current count.
        blob.setColorAt(0,color.setRGB(.2,.2,.2));blob.count=0;scene.add(blob);
    }
    function update(prepared=false){
        lodPrepared=prepared;
        const start=performance.now();restore();frame++;writer.reset();
        if(scene!==state.scene){dispose();scene=state.scene;}
        shadowProxy.begin();
        partialShadowBatches.length=0;
        for(const b of buckets.values()){b.items.length=0;b.shadowCount=0;if(b.mesh)b.mesh.visible=false;}
        if(blob){blob.count=0;blob.visible=false;}
        Object.assign(stats,{parts:0,instances:0,batches:0,farShadows:0,shadowProxyParts:0,visibleUnits:0,simplifiedUnits:0,lodChecksAvoided:0});
        const animals=wildlife(),bunnies=animals?.bunnies||empty,birds=animals?.birds||empty;
        const tier=state.graphicsQuality?.tier||'high';
        const firstPerson=api.firstPersonBudget&&state.isFPV&&state.camera?.isPerspectiveCamera&&tier!=='ultra'&&!api.warming;
        if(!api.enabled||!scene||!state.camera||state.units.length+bunnies.length+birds.length<12&&!api.warming&&!firstPerson){stats.ms=performance.now()-start;return;}
        if(state.renderer&&!state.renderer.capabilities.isWebGL2&&!state.renderer.extensions.get('ANGLE_instanced_arrays')){
            api.enabled=false;stats.fallback=true;stats.ms=performance.now()-start;return;
        }
        try{
            if(state.renderer?.shadowMap&&shadowMap!==state.renderer.shadowMap)bindShadowPass(state.renderer.shadowMap);
            const worldIsIdentity=scene.matrixWorld.equals(identity);
            inverse.copy(scene.matrixWorld).invert();
            projection.multiplyMatrices(state.camera.projectionMatrix,state.camera.matrixWorldInverse);frustum.setFromProjectionMatrix(projection);
            const focus=state.isFPV?state.camera.position:state.cameraLookAt;
            const detailLimit=(state.camera.isOrthographicCamera&&tier!=='ultra'||firstPerson)
                ?30*Math.max(1,state.renderer.getPixelRatio()):0;
            let [shadowRange,shadowBudget]=shadowProfiles[tier]||shadowProfiles.high;
            if(firstPerson){
                shadowRange=tier==='high'?23:16;
                shadowBudget=tier==='high'?12:8;
            }
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
            for(let populationIndex=0;populationIndex<3;populationIndex++){const population=populationIndex===0?state.units:populationIndex===1?bunnies:birds;
            for(const u of population){
                const animal=population!==state.units;
                if(!u.mesh?.parent||!u.mesh.visible||u.state==='transported')continue;
                let visible=true;for(let p=u.mesh.parent;p;p=p.parent)if(!p.visible)visible=false;
                if(!visible)continue;
                const p=u.mesh.position,dx=p.x-focus.x,dz=p.z-focus.z;
                sphere.center.copy(p);sphere.center.y+=u.isVehicle?4:2;sphere.radius=u.isVehicle?10:3;
                const inView=frustum.intersectsSphere(sphere);
                if(!animal&&inView&&u.state!=='dead')stats.visibleUnits++;
                const useProjected=api.crowdDetail&&!api.warming&&(!state.isFPV||firstPerson)&&!animal;
                const pixels=useProjected?projectedHeight(u):Infinity;
                const canSimplify=!u.isVehicle&&!u.isShaman&&!state.selectedUnits.includes(u);
                const detail=canSimplify?(pixels<23?2:pixels<=detailLimit?1:0):0;
                const distanceSq=dx*dx+dz*dz;
                const detailed=animal||api.fullShadows||state.renderer.shadowMap.enabled&&distanceSq<=shadowRangeSq&&
                    (firstPerson?(inView?pixels>=29:distanceSq<=100):pixels>=29);
                const proxy=detailed&&firstPerson&&api.firstPersonShadowProxy&&!api.fullShadows&&!animal&&
                    !u.isVehicle&&!u.invisible&&!u.isPhantom&&u.torso;
                if(proxy)shadowProxy.add(u,scene,inverse);
                if((!detailed||proxy)&&!inView){
                    // Outside both the view and detailed-shadow range: suppress only
                    // drawing, never the simulation or animation of the original rig.
                    for(const root of [u.torso,u.legL,u.legR,u.airshipVisual])root?.traverse(maskPart);
                    continue;
                }
                if(detail)stats.simplifiedUnits++;
                if(animal)collect(u.mesh,true);
                else for(const root of [u.torso,u.legL,u.legR,u.airshipVisual])if(root)collect(root,detailed&&!proxy,false,detail);
                // Preserve the original billboard transforms, fill scales and faction colors.
                // Warm both instance shaders even when the starting units are at full health.
                if(u.hpGroup&&(u.hpGroup.visible||api.warming)){
                    for(const part of u.hpGroup.children)collect(part,false,true);
                }
                if((!detailed||api.warming&&shadows===0)&&u.state!=='dead'&&!u.invisible&&!u.isPhantom&&shadows<2048){
                    if(!blob)initBlob();
                    const h=heightAt(p.x,p.z),altitude=Math.max(0,p.y-h),size=u.isVehicle?3.5:1.2;
                    dummy.position.set(p.x,h+.04,p.z);dummy.rotation.set(0,0,0);dummy.scale.set(size,1,size);
                    dummy.updateMatrix();matrix.multiplyMatrices(inverse,dummy.matrix);writer.matrix(blob,shadows,matrix);
                    const fade=.19/(1+altitude*.12);writer.color(blob,shadows++,color.setRGB(fade,fade,fade));
                }
            }}
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
                    b.mesh.userData.landscapeKind='characters';
                    b.mesh.receiveShadow=b.receive;b.mesh.renderOrder=b.order;
                    b.mesh.frustumCulled=false;b.mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);scene.add(b.mesh);
                    b.mesh.updateMatrixWorld(true);
                }
                for(let i=0;i<b.items.length;i++){
                    const part=b.items[i];
                    const instance=worldIsIdentity?part.matrixWorld:matrix.multiplyMatrices(inverse,part.matrixWorld);
                    writer.matrix(b.mesh,i,instance);
                    writer.color(b.mesh,i,part.material.color);masked.set(part,part.layers.mask);part.layers.set(hiddenLayer);
                }
                b.mesh.count=b.items.length;b.mesh.visible=true;b.mesh.castShadow=b.shadowCount>0;
                if(b.mesh.castShadow&&b.shadowCount<b.mesh.count)partialShadowBatches.push(b);
                writer.flush(b.mesh);
                stats.instances+=b.items.length;stats.batches++;
            }
            if(blob){
                blob.count=shadows;blob.visible=shadows>0;
                if(shadows){
                    writer.flush(blob);
                }
            }
            stats.shadowProxyParts=shadowProxy.finish();
            stats.farShadows=shadows;state.raycaster?.layers.enable(hiddenLayer);
        }catch(error){
            api.enabled=false;stats.fallback=true;partialShadowBatches.length=0;restore();
            shadowProxy.begin();
            for(const b of buckets.values())if(b.mesh)b.mesh.visible=false;if(blob)blob.visible=false;
            console.warn('Character batching unavailable; using original meshes',error);
        }
        stats.ms=performance.now()-start;
    }
    return api;
}
