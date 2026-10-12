// Browser bridge for the editable Blender source in ./blender/Overhaul.blend.
// Static meshes share BufferGeometry and PBR textures across every instance.
let sharedPack;

export function createBlenderPack(T) {
    if (sharedPack) return sharedPack;
    const geometries=new Map(), materials=new Map();
    let models=null;
    const textureLoader=new T.TextureLoader();
    const surfaces=new Map();
    const definitions={
        stone:{color:0xe7d6b5,map:'stone',metalness:0,normalScale:.48},
        wood:{color:0xe8d7b9,map:'wood',metalness:0,normalScale:.45},
        thatch:{color:0xf4dfaf,map:'thatch',metalness:0,normalScale:.42},
        rope:{color:0xcab391,map:'thatch',metalness:0,normalScale:.28},
        leather:{color:0x8c6446,map:'wood',metalness:0,normalScale:.24},
        bronze:{color:0xc6a46a,map:'wood',metalness:.68,normalScale:.18},
        ivory:{color:0xf0e1bc,map:'stone',metalness:0,normalScale:.12},
        dark:{color:0x53626b,map:'wood',metalness:.08,normalScale:.26},
        faction:{color:0xffffff,map:'cloth',metalness:0,normalScale:.22},
        ember:{color:0xffa653,map:'stone',metalness:.15,normalScale:.12},
        leaf0:{color:0x80b262,map:'grass',metalness:0,normalScale:.28},
        leaf1:{color:0x609349,map:'grass',metalness:0,normalScale:.28},
        leaf2:{color:0xacc46b,map:'grass',metalness:0,normalScale:.28},
        fur:{color:0xb8a58b,map:'cloth',metalness:0,normalScale:.18},
        feather:{color:0x9e967d,map:'cloth',metalness:0,normalScale:.16}
    };
    function texture(kind,type) {
        const key=kind+'/'+type;
        if(!surfaces.has(key)) {
            const url=type==='map'
                ? kind==='cloth' ? './character-cloth.png' : `./materials/${kind}.png`
                : `./blender/${kind}-${type}.png`;
            const t=textureLoader.load(new URL(url,import.meta.url).href);
            t.wrapS=t.wrapT=T.RepeatWrapping;
            t.anisotropy=8;
            t.minFilter=T.LinearMipmapLinearFilter;
            if(type==='map')t.encoding=T.sRGBEncoding;
            surfaces.set(key,t);
        }
        return surfaces.get(key);
    }
    function material(kind,factionColor) {
        const key=kind==='faction'?kind+'/'+factionColor:kind;
        if(!materials.has(key)) {
            const info=definitions[kind];
            if(!info)throw new Error('Unknown Blender material '+kind);
            const m=new T.MeshStandardMaterial({
                color:kind==='faction'?factionColor:info.color,
                map:texture(info.map,'map'),
                normalMap:texture(info.map,'normal'),
                roughnessMap:texture(info.map,'roughness'),
                normalScale:new T.Vector2(info.normalScale,info.normalScale),
                roughness:kind==='bronze'?.56:1,
                metalness:info.metalness,
                side:kind.startsWith('leaf')||kind==='fur'||kind==='feather'?T.DoubleSide:T.FrontSide
            });
            if(kind==='ember'){m.emissive=new T.Color(0xff4d13);m.emissiveIntensity=.5;}
            m.name='Blender/'+key;
            materials.set(key,m);
        }
        return materials.get(key);
    }
    function geometry(key,kind,data) {
        const cacheKey=key+'/'+kind;
        if(!geometries.has(cacheKey)) {
            const g=new T.BufferGeometry();
            g.setAttribute('position',new T.Float32BufferAttribute(data.position,3));
            g.setAttribute('normal',new T.Float32BufferAttribute(data.normal,3));
            g.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));
            g.computeBoundingSphere();
            geometries.set(cacheKey,g);
        }
        return geometries.get(cacheKey);
    }
    function attach(parent,key,factionColor=0x387bb7) {
        const model=models?.[key];
        if(!model)return false;
        for(const [kind,data] of Object.entries(model)) {
            const part=new T.Mesh(geometry(key,kind,data),material(kind,factionColor));
            part.name='Blender '+key+' '+kind;
            part.castShadow=true;
            part.receiveShadow=true;
            part.userData.blenderAsset=true;
            if(kind==='faction')part.userData.characterFaction=true;
            parent.add(part);
        }
        return true;
    }
    function getGeometry(key,kind) {
        const data=models?.[key]?.[kind];
        return data?geometry(key,kind,data):null;
    }
    const ready=fetch(new URL('./blender/mesh-pack.json',import.meta.url))
        .then(response=>{if(!response.ok)throw new Error(`HTTP ${response.status}`);return response.json();})
        .then(data=>{if(data.version!==1)throw new Error('Unsupported Blender asset version');models=data.models;})
        .catch(error=>{console.warn('Blender detail pack unavailable; using base meshes',error);});
    sharedPack={ready,attach,getGeometry,texture,get models(){return models;},geometries,materials};
    return sharedPack;
}
