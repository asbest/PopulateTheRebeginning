// A palm, four curled fingers and an opposing thumb in one shared draw call.
export function createGripGeometry(T,side,axis='y'){
    const pieces=[];
    function add(geometry,position,scale=[1,1,1],rotation=[0,0,0]){
        const g=geometry.index?geometry.toNonIndexed():geometry.clone();geometry.dispose();
        g.applyMatrix4(new T.Matrix4().compose(new T.Vector3(...position),
            new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale)));pieces.push(g);
    }
    add(new T.SphereGeometry(1,8,6),[0,0,-.014],[.034,.047,.026]);
    for(let i=0;i<4;i++){
        const offset=(i-1.5)*.019;
        add(new T.TorusGeometry(.032,.009,5,8,Math.PI*1.7),
            axis==='x'?[offset,0,.012]:[0,offset,.012],[1,1,1],axis==='x'?[0,Math.PI/2,0]:[Math.PI/2,0,0]);
    }
    add(new T.SphereGeometry(1,8,6),[side*.026,.026,.036],[.014,.027,.014],[0,0,-side*.55]);
    const merged=new T.BufferGeometry();
    for(const attribute of ['position','normal','uv']){
        const array=new Float32Array(pieces.reduce((n,p)=>n+p.attributes[attribute].array.length,0));
        let offset=0;for(const p of pieces){array.set(p.attributes[attribute].array,offset);offset+=p.attributes[attribute].array.length;}
        merged.setAttribute(attribute,new T.BufferAttribute(array,attribute==='uv'?2:3));
    }
    merged.computeBoundingSphere();pieces.forEach(p=>p.dispose());return merged;
}
