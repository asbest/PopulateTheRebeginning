export const CHARACTER_SHADOW_LAYER=27;

// A single batch of low-poly shapes follows the rendered rig's joint matrices.
export function createCharacterShadowProxy(T,writer){
    const poses=new WeakMap(),world=new T.Matrix4(),matrix=new T.Matrix4();
    let mesh,count=0;

    function poseFor(unit){
        if(poses.has(unit))return poses.get(unit);
        const shapes=[];
        function add(joint,y,sx,sy,sz,z=0){
            if(joint)shapes.push({joint,local:new T.Matrix4().makeScale(sx,sy,sz).setPosition(0,y,z)});
        }
        add(unit.torso,-.014,unit.type==='warrior'?.23:.19,.29,.14);
        add(unit.head,.06,.13,.155,.125);
        for(const arm of [unit.armL,unit.armR]){
            add(arm,-.12,.065,.17,.075);
            add(arm.userData.lower,-.14,.058,.18,.064);
        }
        for(const leg of [unit.legL,unit.legR]){
            add(leg,-.125,.082,.18,.092);
            add(leg.userData.lower,-.16,.07,.18,.088);
        }
        add(unit.staffGrip,.48,.033,.65,.033);
        add(unit.weaponGrip,-.23,.065,.34,.064);
        add(unit.shieldGrip,0,.19,.22,.045);
        add(unit.preacherGrip,.24,.034,.36,.034);
        poses.set(unit,shapes);
        return shapes;
    }

    function add(unit,scene,inverse){
        if(!mesh){
            mesh=new T.InstancedMesh(new T.IcosahedronGeometry(1,0),new T.MeshBasicMaterial(),2048);
            mesh.name='Animated character shadow silhouettes';
            mesh.userData.landscapeKind='characters';
            mesh.userData.shadowOnly=true;
            mesh.layers.set(CHARACTER_SHADOW_LAYER);
            mesh.castShadow=true;mesh.frustumCulled=false;mesh.raycast=()=>{};
            mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
            scene.add(mesh);mesh.updateMatrixWorld(true);
        }
        for(const {joint,local} of poseFor(unit)){
            if(count>=mesh.instanceMatrix.count)break;
            if(!joint.visible)continue;
            world.multiplyMatrices(joint.matrixWorld,local);
            writer.matrix(mesh,count++,matrix.multiplyMatrices(inverse,world));
        }
    }

    return {add,begin(){count=0;if(mesh)mesh.visible=false;},
        finish(){if(mesh){mesh.count=count;mesh.visible=count>0;if(count)writer.flush(mesh);}return count;},
        get active(){return count>0;},
        dispose(){if(!mesh)return;mesh.parent?.remove(mesh);mesh.geometry.dispose();mesh.material.dispose();mesh.dispose();mesh=null;count=0;}};
}
