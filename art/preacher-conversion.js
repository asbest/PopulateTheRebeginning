export function createPreacherConversion(T,state,{getFactionColor,combatRange,lineClear,isPeaceTime}){
    const channels=new Map(),materials=new Map();
    let beamGeometry,barGeometry,labelMaterial,background;
    function resources(faction){
        if(!beamGeometry){
            beamGeometry=new T.CylinderGeometry(.025,.045,1,6);barGeometry=new T.PlaneGeometry(1.6,.13);
            background=new T.MeshBasicMaterial({color:0x17212a,depthTest:false,toneMapped:false});
            const canvas=document.createElement('canvas');canvas.width=256;canvas.height=48;
            const ctx=canvas.getContext('2d');ctx.font='bold 26px sans-serif';ctx.textAlign='center';ctx.fillStyle='#ffffff';ctx.fillText('CONVERSION',128,32);
            labelMaterial=new T.SpriteMaterial({map:new T.CanvasTexture(canvas),depthTest:false,toneMapped:false});
        }
        if(!materials.has(faction))materials.set(faction,new T.MeshBasicMaterial({
            color:new T.Color(getFactionColor(faction)).convertSRGBToLinear(),toneMapped:false,transparent:true,opacity:.9,depthWrite:false}));
        return materials.get(faction);
    }
    function cancel(priest){priest.preachingSync=null;const channel=channels.get(priest);if(channel){state.scene.remove(channel.visual);channels.delete(priest);}}
    function eligible(priest,target){return priest.type==='preacher'&&target?.mesh&&typeof target.setFaction==='function'&&
        !target.isShaman&&!target.isVehicle&&!target.isPhantom&&target.type!=='preacher'&&!target.dead&&
        !['dead','transported'].includes(target.state)&&!target.invisible&&!window.isAllied(priest.faction,target.faction);}
    function update(dt){
        if(!state.units.some(unit=>unit.type==='preacher'&&unit.state!=='dead')){if(channels.size)clear();return;}
        const client=state.network.role==='client';
        const present=new Set(state.units);
        for(const priest of channels.keys())if(!present.has(priest))cancel(priest);
        for(const priest of state.units){
            if(priest.type!=='preacher')continue;
            const target=client?state.units.find(u=>u.id===priest.networkPreaching?.targetId):priest.attackTarget;
            if(isPeaceTime()||!['combat','garrison'].includes(priest.state)||!present.has(target)||!eligible(priest,target)||
                (!client&&(priest.mesh.position.distanceTo(target.mesh.position)>combatRange(priest,target)||!lineClear(priest,target)))){
                cancel(priest);continue;
            }
            let channel=channels.get(priest);
            if(channel?.target!==target){cancel(priest);channel=null;}
            if(!channel){
                const material=resources(priest.faction),visual=new T.Group();visual.name='PreacherConversion';
                const beam=new T.Mesh(beamGeometry,material);visual.add(beam);
                const progress=new T.Group();visual.add(progress);
                const back=new T.Mesh(barGeometry,background);back.renderOrder=10;progress.add(back);
                const fill=new T.Mesh(barGeometry,material);fill.renderOrder=11;fill.material=material;progress.add(fill);
                const label=new T.Sprite(labelMaterial);label.position.y=.3;label.scale.set(1.8,.34,1);label.renderOrder=12;progress.add(label);
                state.scene.add(visual);channel={target,elapsed:0,visual,beam,progress,fill};channels.set(priest,channel);
            }
            channel.elapsed=client?Math.min(5,(priest.networkPreaching?.elapsed||0)+dt):channel.elapsed+dt;
            if(!client)priest.preachingSync={targetId:target.id,elapsed:channel.elapsed};
            const progress=Math.min(1,channel.elapsed/5);
            const start=priest.mesh.position.clone().add(new T.Vector3(0,1.3,0));
            const end=target.mesh.position.clone().add(new T.Vector3(0,(target.height||1.5)+.3,0));
            const direction=end.clone().sub(start),length=direction.length();
            channel.beam.position.copy(start).addScaledVector(direction,.5);
            channel.beam.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize());
            channel.beam.scale.set(1+.25*Math.sin(channel.elapsed*10),length,1);
            channel.progress.position.copy(end).add(new T.Vector3(0,.55,0));channel.progress.quaternion.copy(state.camera.quaternion);
            channel.fill.scale.x=Math.max(.001,progress);channel.fill.position.x=-.8*(1-progress);
            channel.visual.userData.progress=progress;
            if(!client&&channel.elapsed+1e-8>=5){
                target.setFaction(priest.faction);target.hypnosisActive=false;target.originalFaction=null;target.conversionTimer=0;
                target.attackTarget=null;target.state='idle';priest.attackTarget=null;priest.state=priest.garrisonedIn?'garrison':'idle';cancel(priest);
            }
        }
    }
    function clear(){for(const priest of channels.keys())cancel(priest);}
    return {update,cancel,clear,eligible};
}
