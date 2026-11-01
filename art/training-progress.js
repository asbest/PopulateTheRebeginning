export function createTrainingProgress(T){
    const barGeometry=new T.PlaneGeometry(2.2,.18),backGeometry=new T.PlaneGeometry(2.34,.30);
    const fillMaterial=new T.MeshBasicMaterial({color:0xffcf69,toneMapped:false,depthTest:false,depthWrite:false});
    const backMaterial=new T.MeshBasicMaterial({color:0x14242b,toneMapped:false,depthTest:false,depthWrite:false});
    const labels=new Map(),worldPosition=new T.Vector3();
    function labelMaterial(type){
        if(!labels.has(type)){
            const canvas=document.createElement('canvas');canvas.width=384;canvas.height=64;
            const ctx=canvas.getContext('2d');ctx.font='bold 28px sans-serif';ctx.textAlign='center';
            ctx.lineWidth=5;ctx.strokeStyle='#14242b';ctx.fillStyle='#fff4d2';
            const text='TRAINING: '+({warrior:'Warrior',firewarrior:'Fire warrior',preacher:'Priest',spy:'Spy'}[type]||type);
            ctx.strokeText(text,192,42);ctx.fillText(text,192,42);
            labels.set(type,new T.SpriteMaterial({map:new T.CanvasTexture(canvas),toneMapped:false,depthTest:false,depthWrite:false}));
        }
        return labels.get(type);
    }
    return {
        attach(parent,height){
            const group=new T.Group();group.name='Training progress';group.position.y=height;group.visible=false;
            const back=new T.Mesh(backGeometry,backMaterial),fill=new T.Mesh(barGeometry,fillMaterial);
            back.renderOrder=20;fill.renderOrder=21;group.add(back,fill);
            const label=new T.Sprite(labelMaterial('warrior'));label.position.y=.40;label.scale.set(3.2,.53,1);label.renderOrder=22;group.add(label);
            parent.add(group);return {group,fill,label};
        },
        update(building,camera,duration){
            const visual=building.trainingProgress;if(!visual)return;
            const task=building.trainingQueue?.[0];visual.group.visible=!!task&&!building.underConstruction&&!building.dead;
            if(!visual.group.visible)return;
            const progress=Math.max(0,Math.min(1,1-task.timer/(task.duration||duration)));
            visual.group.userData.progress=progress;visual.group.quaternion.copy(camera.quaternion);
            worldPosition.copy(building.mesh.position);worldPosition.y+=visual.group.position.y;
            const scale=camera.isOrthographicCamera?(camera.top-camera.bottom)/20:camera.position.distanceTo(worldPosition)/24;
            visual.group.scale.setScalar(Math.max(1.25,Math.min(4,scale)));
            visual.fill.scale.x=Math.max(.001,progress);visual.fill.position.x=-1.1*(1-progress);
            visual.label.material=labelMaterial(task.type);
        }
    };
}
