export function createRoofLandmarks(T,time){
    const cache=new Map(),shieldMaterials=new Map();
    function merge(pieces){
        const output=new T.BufferGeometry();
        for(const attribute of ['position','normal','uv']){
            const array=new Float32Array(pieces.reduce((n,g)=>n+g.attributes[attribute].array.length,0));
            let offset=0;for(const g of pieces){array.set(g.attributes[attribute].array,offset);offset+=g.attributes[attribute].array.length;}
            output.setAttribute(attribute,new T.BufferAttribute(array,attribute==='uv'?2:3));
        }
        output.computeBoundingSphere();pieces.forEach(g=>g.dispose());return output;
    }
    function part(g,p=[0,0,0],scale=[1,1,1],rotation=[0,0,0]){
        const geometry=g.index?g.toNonIndexed():g.clone();g.dispose();
        geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...p),new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale)));
        return geometry;
    }
    function rod(a,b,r){
        const start=new T.Vector3(...a),end=new T.Vector3(...b),direction=end.clone().sub(start);
        const geometry=part(new T.CylinderGeometry(r,r,direction.length(),10));
        geometry.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction.normalize())));
        geometry.translate(...start.add(end).multiplyScalar(.5).toArray());return geometry;
    }
    function geometry(key,create){if(!cache.has(key))cache.set(key,create());return cache.get(key);}
    function mesh(root,key,create,material){
        const item=new T.Mesh(geometry(key,create),material);item.name=key;item.castShadow=item.receiveShadow=true;item.userData.sharedGeometry=true;root.add(item);return item;
    }
    const flameMaterial=new T.ShaderMaterial({uniforms:{time},side:T.DoubleSide,transparent:true,depthWrite:false,toneMapped:false,
        vertexShader:`uniform float time;varying vec2 vUv;
            void main(){vUv=uv;vec3 p=position;float h=uv.y;
              p.xz*=pow(max(.015,1.-h),.58);
              p.x+=h*h*(sin(time*3.1+h*7.)*.17+sin(time*5.7+h*12.)*.065);
              p.z+=sin(time*2.8+h*9.)*.12*h*h;
              p.y+=sin(time*5.+h*8.)*.11*h;
              gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
        fragmentShader:`uniform float time;varying vec2 vUv;
            void main(){float h=vUv.y,x=abs(vUv.x-.5)*2.;
              float flow=sin(h*17.-time*6.+sin(vUv.x*12.+time*2.))*sin(h*9.-time*3.);
              float edge=1.-smoothstep(.38+flow*.12,1.,x);
              float alpha=edge*(1.-smoothstep(.68,1.,h))*(.76+flow*.14);
              vec3 color=mix(vec3(1.,.17,.015),vec3(1.,.68,.07),1.-h);
              color=mix(color,vec3(1.,.97,.65),pow(max(0.,1.-x),3.)*(1.-h)*.85);
              gl_FragColor=vec4(color,alpha);}`
    });
    return {
        fire(root,bronze){
            const group=new T.Group();group.name='Roof fire beacon';root.add(group);
            mesh(group,'Roof brazier',()=>merge([
                part(new T.CylinderGeometry(.14,.19,.28,10),[0,3.94,0]),
                part(new T.CylinderGeometry(.46,.18,.24,14,1,true),[0,4.10,0]),
                part(new T.TorusGeometry(.44,.045,6,14),[0,4.22,0],[1,1,1],[Math.PI/2,0,0])
            ]),bronze);
            const flame=mesh(group,'RoofFlame',()=>merge([0,Math.PI/3,Math.PI*2/3].map(angle=>
                part(new T.PlaneGeometry(1.5,2.8,6,14),[0,1.4,0],[1,1,1],[0,angle,0]))),flameMaterial);
            flame.position.y=4.12;flame.castShadow=flame.receiveShadow=false;
            // Vertex animation is contained inside this conservative bound.
            flame.geometry.boundingSphere=new T.Sphere(new T.Vector3(0,1.4,0),1.9);
        },
        warrior(root,wood,bronze,factionColor){
            if(!shieldMaterials.has(factionColor))shieldMaterials.set(factionColor,new T.MeshStandardMaterial({
                color:new T.Color(factionColor).convertSRGBToLinear(),roughness:.78,metalness:.08}));
            const group=new T.Group();group.name='Roof club and shield';group.position.y=2.83;root.add(group);
            mesh(group,'Roof weapon supports',()=>merge([
                part(new T.CylinderGeometry(.32,.40,.2,10),[0,.1,0]),rod([0,.15,0],[0,1.35,0],.085),
                rod([-.85,.26,-.18],[.85,2.35,-.18],.105)
            ]),wood);
            mesh(group,'Roof bronze weapon details',()=>{
                const pieces=[part(new T.TorusGeometry(.77,.06,6,20),[0,1.08,.17]),
                    part(new T.SphereGeometry(1,10,8),[0,1.08,.23],[.19,.19,.12]),
                    part(new T.SphereGeometry(1,10,8),[.85,2.35,-.18],[.31,.42,.31])];
                for(let i=0;i<6;i++){
                    const a=i*Math.PI/3;
                    const spike=part(new T.ConeGeometry(.07,.28,5));
                    spike.applyMatrix4(new T.Matrix4().makeRotationFromQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(Math.cos(a),0,Math.sin(a)))));
                    spike.translate(.85+Math.cos(a)*.32,2.35,-.18+Math.sin(a)*.32);pieces.push(spike);
                }
                return merge(pieces);
            },bronze);
            mesh(group,'Roof tribe shield',()=>part(new T.CylinderGeometry(.74,.74,.13,20),[0,1.08,.08],[1,1,1],[Math.PI/2,0,0]),shieldMaterials.get(factionColor));
        }
    };
}
