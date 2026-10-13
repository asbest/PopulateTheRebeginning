// Distance-driven gait and two-bone foot placement. The collision capsule stays
// upright during impacts; the character rig absorbs the motion visually.
export function createLocomotion(T) {
    const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
    const smooth=(a,b,rate,dt)=>a+(b-a)*(1-Math.exp(-rate*Math.min(dt,.1)));
    function turn(u,angle,dt=.016){
        u.turnTarget=angle;
        u.mesh.rotation.y+=wrap(angle-u.mesh.rotation.y)*(1-Math.exp(-10*Math.min(dt,.1)));
    }
    const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
    const ease=x=>{x=clamp(x,0,1);return x*x*(3-2*x);};
    function animateFall(u,dt,phase='airborne'){
        if(!u.legL)return;
        u.poseTick=u.updateTicker;
        const airborne=phase==='airborne',landing=phase==='landing';
        const rate=airborne?10:landing?14:9;
        const pose=(part,axis,target)=>{if(part)part[axis]=smooth(part[axis],target,rate,dt);};
        // Knees tuck in flight, then bend under the body to absorb the landing.
        // Arms guard the head instead of cycling through the walking animation.
        pose(u.torso.rotation,'x',airborne?.12+(u.impactLean||0):landing?.23:0);
        pose(u.torso.rotation,'z',airborne?.07:0);
        pose(u.torso.position,'y',airborne?.91:landing?.83:.9);
        pose(u.legL.rotation,'x',airborne?-.25:landing?.20:0);
        pose(u.legR.rotation,'x',airborne?-.14:landing?.12:0);
        pose(u.legL.userData.lower?.rotation,'x',airborne?.55:landing?.42:0);
        pose(u.legR.userData.lower?.rotation,'x',airborne?.48:landing?.38:0);
        pose(u.armL.rotation,'x',airborne?-.42:landing?-.32:0);
        pose(u.armR.rotation,'x',airborne?-.36:landing?-.28:0);
        pose(u.armL.rotation,'z',airborne?.22:landing?.13:0);
        pose(u.armR.rotation,'z',airborne?-.22:landing?-.13:0);
        pose(u.armL.userData.lower?.rotation,'x',airborne?-.55:landing?-.42:0);
        pose(u.armR.userData.lower?.rotation,'x',airborne?-.55:landing?-.42:0);
        pose(u.head.rotation,'x',airborne?-.08:landing?-.12:0);
    }
    function animateSwim(u,dt){
        if(!u.legL)return;
        u.poseTick=u.updateTicker;
        const t=u.animTime*5,rate=8;
        const pose=(part,axis,target)=>{if(part)part[axis]=smooth(part[axis],target,rate,dt);};
        pose(u.torso.rotation,'x',.18);
        pose(u.torso.position,'y',.9+Math.sin(t*2)*.015);
        pose(u.armL.rotation,'x',-.45+Math.sin(t)*.32);
        pose(u.armR.rotation,'x',-.45-Math.sin(t)*.32);
        pose(u.armL.userData.lower?.rotation,'x',-.35);
        pose(u.armR.userData.lower?.rotation,'x',-.35);
        pose(u.legL.rotation,'x',Math.sin(t)*.13);
        pose(u.legR.rotation,'x',-Math.sin(t)*.13);
        pose(u.legL.userData.lower?.rotation,'x',.22);
        pose(u.legR.userData.lower?.rotation,'x',.22);
    }
    const soleSamples=[];
    for(let row=0;row<=6;row++)for(let col=0;col<12;col++){
        const a=row*Math.PI/6,b=col*Math.PI/6;
        soleSamples.push({x:.055*Math.sin(a)*Math.cos(b),y:.01+.032*Math.cos(a),z:.034+.108*Math.sin(a)*Math.sin(b)});
    }
    function animate(u,dt,heightAt){
        if(!u.legL||['dead','stunned','getting_up','transported'].includes(u.state))return;
        if(u.isSwimming){animateSwim(u,dt);return;}
        if(!u.isGrounded){animateFall(u,dt);return;}
        u.poseTick=u.updateTicker;dt=clamp(dt,.001,.1);
        const p=u.mesh.position,scale=u.mesh.scale.y;
        const g=u.gait||(u.gait={last:p.clone(),phase:0,speed:0,vx:0,vz:0,feet:[{},{}],pelvis:.615});
        g.idleTime=(g.idleTime||0)+dt;
        const dx=p.x-g.last.x,dz=p.z-g.last.z,distance=Math.hypot(dx,dz);g.last.copy(p);
        const travel=distance<Math.max(2,u.moveSpeed*dt*3)?distance:0;
        if(travel!==distance){g.feet=[{},{}];g.vx=g.vz=0;}
        g.speed=smooth(g.speed,travel/dt,10,dt);g.vx=smooth(g.vx,travel?dx/dt:0,10,dt);g.vz=smooth(g.vz,travel?dz/dt:0,10,dt);
        const moving=g.speed>.06,run=ease((g.speed/scale-1.65)/2.35),weight=clamp(g.speed/(1.0*scale),0,1);
        // A full cycle is two steps. Walking retains double support; running has a flight interval.
        const stride=(1.02+.72*run)*scale,stanceTime=.62-.26*run,reach=stride/scale*stanceTime*.5;
        g.phase+=travel/stride;
        const yaw=u.mesh.rotation.y,c=Math.cos(yaw),s=Math.sin(yaw);
        const world=(x,z)=>({x:p.x+(c*x+s*z)*scale,z:p.z+(-s*x+c*z)*scale});
        const swingDuration=(1-stanceTime)*stride/Math.max(g.speed,.1);
        const sway=Math.sin(g.phase*Math.PI*2)*.012*weight;
        const desiredPelvis=.615-.018*weight+.014*weight*Math.cos(g.phase*Math.PI*4);
        let pelvis=desiredPelvis;
        // First plan both feet; one shared pelvis must support both legs.
        for(let i=0;i<2;i++){
            const f=g.feet[i],phase=(g.phase+i*.5)%1,hipX=(i===0?.1:-.1)+sway,neutral=world(hipX,0);
            const stance=!moving||phase<stanceTime;
            if(!f.plant){f.plant={...neutral};f.current={...neutral,y:heightAt(neutral.x,neutral.z)+.024*scale};f.wasStance=true;}
            if(moving&&!f.moving){f.plant=world(hipX,reach-Math.min(phase,stanceTime)*stride/scale);f.wasStance=true;}
            f.moving=moving;
            if(stance&&!f.wasStance)f.plant=f.landing?{...f.landing}:{...neutral};
            let target={...f.plant},lift=0,roll=0;
            if(moving&&stance){
                const t=phase/stanceTime;
                roll=-.20*(1-ease(t/.16))+.38*ease((t-.72)/.28);
            }
            if(!stance){
                const t=(phase-stanceTime)/(1-stanceTime);
                const ahead=world(hipX,reach);
                // Predict where the body will be at touchdown, not where it is at liftoff.
                const landing={x:ahead.x+g.vx*swingDuration*(1-t),z:ahead.z+g.vz*swingDuration*(1-t)};
                if(f.wasStance){f.takeoff={...f.plant};f.landing=landing;}
                else{f.landing.x=smooth(f.landing.x,landing.x,12,dt);f.landing.z=smooth(f.landing.z,landing.z,12,dt);}
                const tEase=ease(t);target={x:f.takeoff.x+(f.landing.x-f.takeoff.x)*tEase,z:f.takeoff.z+(f.landing.z-f.takeoff.z)*tEase};
                lift=Math.sin(Math.PI*t)**1.4*(.065+.09*run)*scale;
                roll=.38*(1-ease(t/.36))-.20*ease((t-.68)/.32);
            }
            if(!moving){
                target={x:smooth(f.current.x,neutral.x,10,dt),z:smooth(f.current.z,neutral.z,10,dt)};f.plant={...target};roll=0;
            }
            // Reset a foot only after a discontinuity or a very sharp pivot.
            if(Math.hypot(target.x-neutral.x,target.z-neutral.z)>.8*scale){target={...neutral};f.plant={...target};f.landing={...target};}
            // Keep each terrain contact within the leg's reach before solving the pelvis.
            // On steep slopes long planted steps used to drag the whole torso underground.
            const reachable=q=>{
                const wx=(q.x-p.x)/scale,wz=(q.z-p.z)/scale;
                const x=c*wx-s*wz-hipX,z=s*wx+c*wz;
                const h=(heightAt(q.x,q.z)-p.y)/scale;
                return h<.28 && (.52-h-.024)**2+x*x+z*z<.592**2;
            };
            if(!reachable(target)){
                const original={...target};let lo=0,hi=1;
                for(let j=0;j<10;j++){
                    const t=(lo+hi)*.5,q={x:p.x+(original.x-p.x)*t,z:p.z+(original.z-p.z)*t};
                    if(reachable(q))lo=t;else hi=t;
                }
                target={x:p.x+(original.x-p.x)*lo,z:p.z+(original.z-p.z)*lo};
                if(stance)f.plant={...target};
            }
            const front={x:target.x+s*.10*scale,z:target.z+c*.10*scale},back={x:target.x-s*.10*scale,z:target.z-c*.10*scale};
            const pitch=-Math.atan2(heightAt(front.x,front.z)-heightAt(back.x,back.z),.20*scale);
            const angle=pitch+roll,ca=Math.cos(angle),sa=Math.sin(angle);
            // Sample the actual sandal ellipsoid against the terrain, including its toe,
            // heel and side edges. A sole-center height is insufficient on steep/cross slopes.
            let y=-Infinity;
            for(const v of soleSamples){
                const x=v.x*scale,ly=(ca*v.y-sa*v.z)*scale,z=(sa*v.y+ca*v.z)*scale;
                y=Math.max(y,heightAt(target.x+c*x+s*z,target.z-s*x+c*z)-ly+.003*scale);
            }
            y+=lift;
            f.current={...target,y};f.target=f.current;f.wasStance=stance;f.roll=roll;f.pitch=pitch;f.hipX=hipX;
            const wx=(target.x-p.x)/scale,wz=(target.z-p.z)/scale;
            f.z=s*wx+c*wz;f.x=c*wx-s*wz;f.y=(y-p.y)/scale;
            pelvis=Math.min(pelvis,f.y+Math.sqrt(Math.max(.01,.597**2-f.z**2-(f.x-hipX)**2)));
        }
        pelvis=Math.max(.52,pelvis);
        // Keep the pelvis connected to both hips; the old independent hip drops looked like squatting.
        g.pelvis=smooth(g.pelvis,pelvis,24,dt);g.pelvis=Math.min(g.pelvis,pelvis+.006);
        for(let i=0;i<2;i++){
            const leg=i===0?u.legL:u.legR,f=g.feet[i];leg.position.set(f.hipX,g.pelvis,0);
            const down=g.pelvis-f.y,lateral=f.x-f.hipX,radialDown=Math.hypot(down,lateral),d=clamp(Math.hypot(radialDown,f.z),.04,.599),bend=Math.acos(clamp(d/.6,-1,1));
            leg.rotation.order="ZXY";
            leg.rotation.x=-Math.atan2(f.z,radialDown)-bend;
            leg.rotation.z=Math.atan2(lateral,down);
            leg.userData.lower.rotation.x=2*bend;
            const ankle=leg.userData.lower.getObjectByName('Sandal');
            if(ankle){
                const desired=new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),f.pitch+f.roll);
                ankle.quaternion.copy(leg.quaternion).multiply(leg.userData.lower.quaternion).invert().multiply(desired);
            }
        }
        const networkAttack=u.networkTarget&&u.state==='combat'&&g.speed<.2;
        const attacking=networkAttack||u.state==='combat'&&u.attackTarget&&Math.hypot(u.attackTarget.mesh.position.x-p.x,u.attackTarget.mesh.position.z-p.z)<=u.range;
        const strike=attacking?Math.sin((u.attackPhase||0)*Math.PI):0;
        if(!attacking){
            for(const [arm,foot,side] of [[u.armL,g.feet[1],1],[u.armR,g.feet[0],-1]]){
                // Opposite arm and leg move forward together. Do not invert the opposite leg a second time.
                const swing=-Math.atan2(foot.z,.55)*(.72+.28*run)*weight;
                arm.rotation.x=smooth(arm.rotation.x,(u.isShaman?swing*.25:swing)-.04,16,dt);
                arm.rotation.z=smooth(arm.rotation.z,side*.065,12,dt);
                arm.userData.lower.rotation.x=smooth(arm.userData.lower.rotation.x,-.16-.55*run,12,dt);
            }
        }else{
            if(networkAttack){u.armR.rotation.x=-Math.PI/2-strike*Math.PI/2;u.armL.rotation.x=-.4-strike*.4;}
            u.armR.userData.lower.rotation.x=-.16-strike*.4;u.armL.userData.lower.rotation.x=-.16-strike*.25;
        }
        const breath=Math.sin(g.idleTime*2.3)*.004*(1-weight);
        u.torso.position.set(sway,.9+g.pelvis-.615+breath,0);
        const handedness=u.type==='spy'?-1:1;
        u.torso.rotation.x=smooth(u.torso.rotation.x,.015*weight+.10*run-.065*strike,12,dt);
        u.torso.rotation.y=smooth(u.torso.rotation.y,-Math.sin(g.phase*Math.PI*2)*.035*weight+.11*strike*handedness,12,dt);
        u.torso.rotation.z=smooth(u.torso.rotation.z,-sway*.8,12,dt);
        u.head.rotation.y=smooth(u.head.rotation.y,clamp(wrap((u.turnTarget??yaw)-yaw),-.2,.2)*.35-u.torso.rotation.y*.5,10,dt);
        u.head.rotation.x=smooth(u.head.rotation.x,breath*.9-.02*run,8,dt);
        const cape=u.torso.getObjectByName(u.isShaman?'CeremonialCape':'SpyCloak');
        if(cape){
            cape.rotation.x=smooth(cape.rotation.x,-.14-.08*weight+Math.sin(g.phase*Math.PI*2)*.02*weight,8,dt);
            cape.rotation.z=smooth(cape.rotation.z,Math.sin(g.phase*Math.PI*2)*.035*weight,7,dt);
        }
        // Cloth stays anchored to the torso instead of kicking forward as a rigid board with the thigh.
        u.torso.updateMatrix();
        for(const leg of [u.legL,u.legR])for(const panel of leg.children.filter(n=>n.name==='SplitRobe')){
            const matrix=panel.userData.drapeMatrix||(panel.userData.drapeMatrix=new T.Matrix4());
            const cloth=panel.userData.clothMatrix||(panel.userData.clothMatrix=new T.Matrix4());
            leg.updateMatrix();cloth.makeRotationX(Math.min(0,leg.rotation.x*.4));cloth.setPosition(0,0,.135);
            matrix.copy(leg.matrix).invert().multiply(u.torso.matrix).multiply(cloth);matrix.decompose(panel.position,panel.quaternion,panel.scale);
        }
    }
    function ground(u,heightAt,dt){
        if(u.isVehicle||u.isSwimming||['dead','stunned','getting_up'].includes(u.state))return;
        const p=u.mesh.position;
        if(u.state!=='idle')u.idleAnchor=null;
        if(u.idleAnchor){p.x=u.idleAnchor.x;p.z=u.idleAnchor.z;}
        const h=heightAt(p.x,p.z),gap=p.y-h;
        if(gap<.35&&u.velocity.y<Math.max(2,u.moveSpeed)||u.isGrounded&&Math.abs(gap)<.45){
            u.isGrounded=true;p.y=h;
            if(u.rigidBody){
                const v=u.rigidBody.linvel();
                if(u.state==='idle'||u.state==='combat'&&u.attackTarget&&p.distanceTo(u.attackTarget.mesh.position)<=u.range){v.x*=Math.exp(-12*dt);v.z*=Math.exp(-12*dt);}
                if(u.state==='idle'&&(u.idleAnchor||Math.hypot(v.x,v.z)<.4)){u.idleAnchor={x:p.x,z:p.z};v.x=v.z=0;}
                const next=heightAt(p.x+v.x*dt,p.z+v.z*dt);
                // Follow the surface tangent, including downhill travel; gravity still handles genuine falls.
                const vy=Math.max(-u.moveSpeed,Math.min(u.moveSpeed,(next-h)/Math.max(dt,.001)));
                // Lift the collision capsule, not the visual feet, clear of the uphill surface.
                // At a slope the capsule radius extends below the center-point ground height.
                let clearance=.02;
                for(let i=0;i<8;i++){
                    const a=i*Math.PI/4,r=.3;
                    clearance=Math.max(clearance,heightAt(p.x+Math.cos(a)*r,p.z+Math.sin(a)*r)-h+.02);
                }
                u.groundBodyOffset=clearance;
                u.rigidBody.setTranslation({x:p.x,y:h+u.height/2+clearance,z:p.z},true);
                u.rigidBody.setLinvel({x:v.x,y:vy,z:v.z},true);u.velocity.y=vy;
            }
        }else u.isGrounded=false;
    }
    return {turn,animate,animateFall,ground};
}
