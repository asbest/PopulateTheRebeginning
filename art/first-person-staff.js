// Draw the held staff in camera space so turning, casting and narrow screens
// cannot swing it through the centre of the view.
export function createFirstPersonStaff(T){
    let holder,model,crystal,tip,originalVisibility;
    const anchor=new T.Group();
    anchor.name='First-person staff';

    function clear(){
        if(!holder)return;
        holder.staffGrip.visible=originalVisibility;
        model.traverse(node=>{if(node.isMesh)node.material.dispose();});
        anchor.remove(model);
        anchor.parent?.remove(anchor);
        holder=null;
    }

    function update(scene,camera,unit){
        if(unit!==holder)clear();
        if(!unit)return;
        if(!holder){
            holder=unit;
            originalVisibility=unit.staffGrip.visible;
            unit.staffGrip.visible=false;
            model=unit.staffGrip.clone();
            model.visible=true;
            crystal=model.getObjectByName('StaffCrystal');
            tip=model.getObjectByName('StaffTip');
            const palm=unit.armR.userData.lower.userData.palm.clone();
            palm.position.sub(unit.staffGrip.position);
            model.add(palm);
            model.traverse(node=>{
                if(!node.isMesh)return;
                node.castShadow=node.receiveShadow=false;
                node.material=node.material.clone();
                node.material.depthTest=node.material.depthWrite=false;
                node.material.transparent=true;
                node.renderOrder=1000;
                node.raycast=()=>{};
            });
            anchor.add(model);
        }
        if(anchor.parent!==scene)scene.add(anchor);
        anchor.position.copy(camera.position);
        anchor.quaternion.copy(camera.quaternion);
        const depth=1.15;
        const halfHeight=depth*Math.tan(T.MathUtils.degToRad(camera.fov/2))/camera.zoom;
        const halfWidth=halfHeight*camera.aspect;
        const casting=unit.staffWindup||unit.staffCastTimer>0;
        const bob=Math.sin(unit.animTime*6)*.014;
        model.position.set(halfWidth*.76,halfHeight*(-.92+bob+(casting ? .11 : 0)),-depth);
        model.rotation.set(casting?-.10:.04,0,-.065);
        model.scale.setScalar(Math.min(.8,halfHeight*1.23,halfWidth*1.08));
        crystal.material.emissiveIntensity=unit.staffCrystal.material.emissiveIntensity;
    }

    function tipPosition(unit){
        if(unit!==holder)return null;
        return tip.getWorldPosition(new T.Vector3());
    }

    return {update,tipPosition};
}
