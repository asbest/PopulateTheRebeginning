// Original procedural fire: one bounded draw call for all burning vegetation.
export function createTreeFire(T,state) {
    let mesh;
    const dummy=new T.Object3D(),color=new T.Color(),capacity=384;
    function init(){
        const material=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.DoubleSide,
            uniforms:{time:{value:0}},
            vertexShader:`varying vec2 uvFire;varying vec3 dataFire;
                void main(){uvFire=uv;dataFire=instanceColor;
                gl_Position=projectionMatrix*modelViewMatrix*instanceMatrix*vec4(position,1.);}`,
            fragmentShader:`uniform float time;varying vec2 uvFire;varying vec3 dataFire;
                void main(){vec2 p=uvFire;float seed=dataFire.b*31.;
                float sway=sin(p.y*9.-time*6.+seed)*.08+sin(p.y*17.+time*4.+seed)*.035;
                float width=(1.-p.y)*.43+.015;
                float edge=1.-smoothstep(width*.45,width,abs(p.x-.5+sway*p.y));
                float alpha=edge*smoothstep(0.,.13,p.y)*(1.-smoothstep(.65,1.,p.y))*dataFire.r;
                vec3 flame=mix(vec3(1.,.82,.2),vec3(1.,.14,.015),p.y);
                if(dataFire.g>.5){float cloud=1.-smoothstep(.1,.5,length((p-.5)*vec2(1.,.8)));
                    alpha=cloud*dataFire.r*.32;flame=vec3(.19,.17,.15);}
                gl_FragColor=vec4(flame,alpha);}`});
        mesh=new T.InstancedMesh(new T.PlaneGeometry(1,1),material,capacity);
        mesh.setMatrixAt(0,new T.Matrix4());mesh.setColorAt(0,color.setRGB(1,0,0));mesh.count=0;mesh.frustumCulled=false;
        mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);mesh.instanceColor.setUsage(T.DynamicDrawUsage);
        mesh.name='Vegetation fire and smoke';state.scene.add(mesh);
    }
    return {prepareRoot(){if(!mesh)init();return mesh;},update(sites){
        if(!mesh&&!sites.length)return;
        if(!mesh)init();
        let count=0;
        const put=(x,y,z,w,h,fade,smoke,seed)=>{
            if(count>=capacity)return;
            dummy.position.set(x,y,z);dummy.quaternion.copy(state.camera.quaternion);
            dummy.scale.set(w,h,1);dummy.updateMatrix();mesh.setMatrixAt(count,dummy.matrix);
            mesh.setColorAt(count++,color.setRGB(fade,smoke,seed));
        };
        for(const s of sites){
            const fade=Math.min(1,s.age*4)*Math.min(1,(8-s.age)/2);
            for(let i=0;i<3;i++){
                const pulse=1+.16*Math.sin(state.treeTime*8+i*2+s.x);
                put(s.x+Math.sin(i*3+s.z)*s.scale*.4,s.y+(1+i*1.05)*s.scale,s.z,
                    (1.2+i*.25)*s.scale*pulse,(2.9-i*.25)*s.scale*pulse,fade,0,(i+1)/4);
            }
            const rise=(state.treeTime*.7+s.x%2)%2;
            put(s.x+.3*Math.sin(state.treeTime+s.z),s.y+(4+rise)*s.scale,s.z,
                (1.7+rise)*s.scale,(2+rise)*s.scale,fade,1,.5);
        }
        mesh.count=count;mesh.visible=count>0;mesh.material.uniforms.time.value=state.treeTime;
        if(count){mesh.instanceMatrix.updateRange.count=count*16;mesh.instanceColor.updateRange.count=count*3;
            mesh.instanceMatrix.needsUpdate=true;mesh.instanceColor.needsUpdate=true;}
    }};
}
