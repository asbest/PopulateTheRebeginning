// Draw the original spinning, fading crosses without a light or draw call per unit.
export function createHealingFx(T,state,color){
    const duration=1.5,active=[],dummy=new T.Object3D();
    const box=new T.BoxGeometry(1,1,1);
    const material=new T.MeshBasicMaterial({color,transparent:true});
    let mesh,opacity,capacity=0,instanced;

    function prepareRoot(required=128){
        instanced??=state.renderer.capabilities.isWebGL2||!!state.renderer.extensions.get('ANGLE_instanced_arrays');
        if(!instanced)return null;
        if(capacity>=required)return mesh;
        if(mesh){
            state.scene.remove(mesh);mesh.dispose();mesh.geometry.dispose();
        }
        capacity=2**Math.ceil(Math.log2(Math.max(128,required)));
        const geometry=box.clone();
        opacity=new T.InstancedBufferAttribute(new Float32Array(capacity*2),1).setUsage(T.DynamicDrawUsage);
        geometry.setAttribute('crossOpacity',opacity);
        material.onBeforeCompile=shader=>{
            shader.vertexShader='attribute float crossOpacity; varying float vCrossOpacity;\n'+shader.vertexShader
                .replace('#include <color_vertex>','#include <color_vertex>\nvCrossOpacity = crossOpacity;');
            shader.fragmentShader='varying float vCrossOpacity;\n'+shader.fragmentShader
                .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.a *= vCrossOpacity;');
        };
        mesh=new T.InstancedMesh(geometry,material,capacity*2);
        mesh.name='Healing crosses';mesh.frustumCulled=false;mesh.count=0;mesh.visible=false;
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);state.scene.add(mesh);
        return mesh;
    }

    function add(x,y,z){
        const effect={x,y,z,age:0};
        if(!prepareRoot(active.length+1)){
            const group=new T.Group(),fade=new T.MeshBasicMaterial({color,transparent:true,opacity:.8});
            const vertical=new T.Mesh(box,fade),horizontal=new T.Mesh(box,fade);
            vertical.scale.set(.1,.6,.1);horizontal.scale.set(.6,.1,.1);
            group.add(vertical,horizontal);group.position.set(x,y,z);
            state.scene.add(group);effect.group=group;
        }
        active.push(effect);
    }

    function remove(effect){
        if(!effect.group)return;
        state.scene.remove(effect.group);effect.group.children[0].material.dispose();
    }

    function update(dt){
        let count=0;
        for(const effect of active){
            effect.age+=dt;
            if(effect.age>=duration){remove(effect);continue;}
            const {x,y,z,age}=effect,alpha=1-age/duration;
            if(effect.group){
                effect.group.position.y=y+2*age;effect.group.rotation.y=3*age;
                effect.group.children[0].material.opacity=alpha;
            }else{
                dummy.position.set(x,y+2*age,z);dummy.rotation.y=3*age;
                dummy.scale.set(.1,.6,.1);dummy.updateMatrix();mesh.setMatrixAt(count*2,dummy.matrix);
                dummy.scale.set(.6,.1,.1);dummy.updateMatrix();mesh.setMatrixAt(count*2+1,dummy.matrix);
                opacity.setX(count*2,alpha);opacity.setX(count*2+1,alpha);
            }
            active[count++]=effect;
        }
        active.length=count;
        if(!mesh)return;
        mesh.count=count*2;mesh.visible=count>0;
        if(count){
            mesh.instanceMatrix.updateRange.count=mesh.count*16;mesh.instanceMatrix.needsUpdate=true;
            opacity.updateRange.count=mesh.count;opacity.needsUpdate=true;
        }
    }

    function fillLights(lights,slot){
        // Reuse any spell lights left over after active combat effects.
        for(let i=active.length-1;i>=0&&slot<lights.length;i--){
            const {x,y,z,age}=active[i],light=lights[slot++];
            light.position.set(x,y+2*age,z);light.color.setHex(0x00ff00);
            light.distance=5;light.intensity=1-age/duration;
        }
        return slot;
    }

    function clear(){
        for(const effect of active)remove(effect);
        active.length=0;update(0);
    }
    return {add,update,clear,prepareRoot,fillLights,get activeCount(){return active.length;}};
}
