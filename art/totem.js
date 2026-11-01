// Original procedural tribal monument; meshes and materials are shared by all sites.
export function createTotemFactory(T,stoneTexture){
    const parts={stone:[],dark:[],gold:[],turquoise:[]};
    function add(kind,geometry,position,scale=[1,1,1],rotation=[0,0,0]){
        const matrix=new T.Matrix4().compose(new T.Vector3(...position),
            new T.Quaternion().setFromEuler(new T.Euler(...rotation)),new T.Vector3(...scale));
        const transformed=geometry.index?geometry.toNonIndexed():geometry.clone();geometry.dispose();
        transformed.applyMatrix4(matrix);parts[kind].push(transformed);
    }
    const box=(kind,p,s,r)=>add(kind,new T.BoxGeometry(1,1,1),p,s,r);
    const drum=(kind,y,top,bottom,height)=>add(kind,new T.CylinderGeometry(top,bottom,height,8),[0,y,0]);
    drum('stone',.18,1.12,1.3,.42);drum('stone',.48,.85,1.02,.30);
    drum('gold',.67,.8,.86,.10);
    drum('stone',3.3,.58,.73,5.25);
    for(const y of [1.05,2.65,4.35,5.35]){
        drum('gold',y,.69,.69,.13);drum('dark',y-.11,.67,.67,.065);
    }
    // Faces grow toward the great horned mask at the summit.
    for(const [y,size] of [[1.85,.65],[3.55,.82],[5.95,1.18]]){
        const offset=Math.max(0,.76-size*.56);
        const face=(kind,p,s,r)=>box(kind,[p[0],p[1],p[2]+offset],s,r);
        add('stone',new T.CylinderGeometry(.83,.69,1.40,4).rotateY(Math.PI/4),[0,y,offset],[size,size,size]);
        const front=.59*size;
        for(const side of [-1,1]){
            face('dark',[side*.26*size,y+.15*size,front],[.39*size,.26*size,.08*size]);
            face('turquoise',[side*.26*size,y+.16*size,front+.047*size],[.19*size,.095*size,.035*size]);
            face('stone',[side*.27*size,y+.34*size,front+.01*size],[.53*size,.17*size,.19*size],[0,0,side*.16]);
            face('gold',[side*.62*size,y+.05*size,0],[.19*size,.65*size,.28*size]);
            face('turquoise',[side*.71*size,y+.05*size,.04],[.035*size,.35*size,.13*size]);
        }
        face('stone',[0,y-.04*size,front+.06*size],[.19*size,.45*size,.28*size]);
        face('dark',[0,y-.38*size,front-.035*size],[.58*size,.11*size,.09*size]);
        face('stone',[0,y-.52*size,front-.03*size],[.64*size,.17*size,.14*size]);
        for(const side of [-1,1])face('turquoise',[side*.40*size,y-.14*size,.54*size],[.065*size,.26*size,.035*size],[0,0,-side*.23]);
    }
    drum('gold',6.85,.84,.81,.22);
    // Broad, stepped crest and outward horns stay connected to the head.
    for(let i=-2;i<=2;i++){
        const y=7.15+(2-Math.abs(i))*.18;
        box('stone',[i*.34,y,0],[.24,.75,.34],[0,0,-i*.12]);
        box('turquoise',[i*.34,y+.25,.18],[.13,.17,.035],[0,0,-i*.12]);
    }
    for(const side of [-1,1]){
        box('gold',[side*.94,6.55,0],[.78,.23,.33],[0,0,side*.48]);
        add('stone',new T.ConeGeometry(.24,.95,4),[side*1.32,6.99,0],[1,1,1],[0,0,-side*.22]);
    }
    const crystal=new T.OctahedronGeometry(.30,0);add('turquoise',crystal,[0,7.9,0],[.8,1.35,.8]);
    const materials={
        stone:new T.MeshStandardMaterial({color:0xb5a888,map:stoneTexture,roughness:.94}),
        dark:new T.MeshStandardMaterial({color:0x263634,roughness:1}),
        gold:new T.MeshStandardMaterial({color:0xa88746,roughness:.66,metalness:.35}),
        turquoise:new T.MeshStandardMaterial({color:0x65d8d1,roughness:.4,metalness:.12,emissive:0x187e83,emissiveIntensity:.5})
    };
    const geometries={};
    for(const [kind,pieces] of Object.entries(parts)){
        const geometry=new T.BufferGeometry();
        for(const attribute of ['position','normal','uv']){
            const length=pieces.reduce((n,g)=>n+g.attributes[attribute].array.length,0),array=new Float32Array(length);
            let offset=0;for(const piece of pieces){array.set(piece.attributes[attribute].array,offset);offset+=piece.attributes[attribute].array.length;}
            geometry.setAttribute(attribute,new T.BufferAttribute(array,attribute==='uv'?2:3));
        }
        geometry.computeBoundingBox();geometry.computeBoundingSphere();geometries[kind]=geometry;
        pieces.forEach(piece=>piece.dispose());
    }
    return ()=>{
        const monument=new T.Group();monument.name='Ancient carved totem';
        for(const kind of Object.keys(geometries)){
            const mesh=new T.Mesh(geometries[kind],materials[kind]);mesh.name='Totem '+kind;
            mesh.castShadow=true;mesh.receiveShadow=true;mesh.userData.sharedGeometry=true;monument.add(mesh);
        }
        return monument;
    };
}
