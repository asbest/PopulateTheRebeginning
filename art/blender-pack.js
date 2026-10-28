// Browser bridge for the editable Blender source in ./blender/Overhaul.blend.
// Static meshes share BufferGeometry and PBR textures across every instance.
import {MODEL_GROUPS,MODEL_FILES} from './startup-manifest.js';
import {assetURL} from './asset-urls.js';
import {fitBarracksTiles} from './roof-profile.js';
let sharedPack;

export function createBlenderPack(T,loadTexture) {
    if (sharedPack) return sharedPack;
    const geometries=new Map(), materials=new Map();
    const models=Object.create(null),loads=new Map(),pendingParents=new WeakMap(),attached=new WeakMap();
    const surfaces=new Map();
    const definitions={
        stone:{color:0xe7d6b5,map:'stone',metalness:0,normalScale:.48},
        wood:{color:0xe8d7b9,map:'wood',metalness:0,normalScale:.45},
        thatch:{color:0xf4dfaf,map:'thatch',metalness:0,normalScale:.42},
        rope:{color:0xcab391,map:'rope',metalness:0,normalScale:.36},
        leather:{color:0x8c6446,map:'leather',metalness:0,normalScale:.30},
        bronze:{color:0xc6a46a,map:'bronze',metalness:.68,normalScale:.23},
        ivory:{color:0xf0e1bc,map:'ivory',metalness:0,normalScale:.18},
        dark:{color:0x53626b,map:'dark',metalness:.08,normalScale:.31},
        faction:{color:0xffffff,map:'cloth',metalness:0,normalScale:.22},
        ember:{color:0xffa653,map:'ember',metalness:.15,normalScale:.26},
        leaf0:{color:0x80b262,map:'foliage',metalness:0,normalScale:.31},
        leaf1:{color:0x609349,map:'foliage',metalness:0,normalScale:.31},
        leaf2:{color:0xacc46b,map:'foliage',metalness:0,normalScale:.31},
        fur:{color:0xb8a58b,map:'fur',metalness:0,normalScale:.24},
        feather:{color:0x9e967d,map:'feather',metalness:0,normalScale:.21}
    };
    const crafted=new Set(['rope','leather','bronze','ivory','dark','ember','foliage','fur','feather','sand','cliff',
        'dirt','mud','gravel','moss']);
    function texture(kind,type) {
        const key=kind+'/'+type;
        if(!surfaces.has(key)) {
            const url=type==='map'
                ? kind==='fur' ? './blender/fur-albedo-v2.png'
                    : kind==='feather' ? './blender/feather-plumage-albedo.png'
                    : crafted.has(kind) ? `./blender/${kind}-albedo.png`
                    : kind==='cloth' ? './character-cloth.png'
                    : kind==='skin' ? './character-skin-v2.png' : `./materials/${kind}.png`
                : `./blender/${kind}-${type}.png`;
            const t=loadTexture(new URL(url,import.meta.url).href,{srgb:type==='map',anisotropy:8});
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
            if(key==='building/warrior/root'&&kind==='thatch')data=fitBarracksTiles(data);
            const g=new T.BufferGeometry();
            g.setAttribute('position',new T.Float32BufferAttribute(data.position,3));
            g.setAttribute('normal',new T.Float32BufferAttribute(data.normal,3));
            g.setAttribute('uv',new T.Float32BufferAttribute(data.uv,2));
            if(data.index)g.setIndex(data.index);
            g.computeBoundingSphere();
            geometries.set(cacheKey,g);
        }
        return geometries.get(cacheKey);
    }
    function attach(parent,key,factionColor=0x387bb7) {
        const model=models?.[key];
        if(!model){
            if(!MODEL_GROUPS[key])return false;
            let requests=pendingParents.get(parent);
            if(!requests){requests=new Map();pendingParents.set(parent,requests);}
            if(!requests.has(key)){
                const request={color:factionColor};requests.set(key,request);
                ensure(key).then(loaded=>{requests.delete(key);if(loaded)attach(parent,key,request.color);});
            }
            return false;
        }
        if(attached.get(parent)?.has(key))return true;
        if(!attached.has(parent))attached.set(parent,new Set());
        attached.get(parent).add(key);
        const near=new T.Group();
        for(const [kind,data] of Object.entries(model)) {
            const part=new T.Mesh(geometry(key,kind,data),material(kind,factionColor));
            part.name='Blender '+key+' '+kind;
            part.castShadow=true;
            part.receiveShadow=true;
            part.userData.blenderAsset=true;
            if(kind==='faction')part.userData.characterFaction=true;
            near.add(part);
        }
        // At normal strategy zoom the silhouette remains, while tiny surface parts
        // stop issuing draw calls. The authored geometry stays available close up.
        const lod=new T.LOD();
        lod.name='Blender detail LOD '+key;
        lod.addLevel(near,0);
        const distance=key.startsWith('critter/bird/')||key.startsWith('critter/bunny/')
            ? 100000 : key.startsWith('building/')?85:55;
        lod.addLevel(new T.Group(),distance);
        parent.add(lod);
        return true;
    }
    function getGeometry(key,kind) {
        const data=models?.[key]?.[kind];
        return data?geometry(key,kind,data):null;
    }
    async function readPack(file){
        const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
        try{
            const response=await fetch(assetURL(file),{signal:controller.signal});
            if(!response.ok)throw new Error(`HTTP ${response.status}`);
            const data=await response.json();
            if(![1,2].includes(data.version)||!data.models)throw new Error('Unsupported Blender asset version');
            Object.assign(models,data.models);
        }finally{clearTimeout(timer);}
    }
    function loadGroup(group){
        if(!loads.has(group))loads.set(group,readPack(MODEL_FILES[group]).catch(error=>{loads.delete(group);throw error;}));
        return loads.get(group);
    }
    function loadAll(){
        if(!loads.has('full'))loads.set('full',readPack('art/blender/mesh-pack.json').catch(error=>{loads.delete('full');throw error;}));
        return loads.get('full');
    }
    async function ensure(key){
        if(models[key])return true;
        if(!MODEL_GROUPS[key])return false;
        try{await loadGroup(MODEL_GROUPS[key]);return !!models[key];}
        catch(error){console.warn('Model detail unavailable; using base mesh',key,error);return false;}
    }
    function updatePendingFaction(root,color){
        root.traverse(node=>{for(const request of pendingParents.get(node)?.values()||[])request.color=color;});
    }
    const full=new URLSearchParams(location.search).get('assets')==='full';
    const ready=(full?loadAll():loadGroup('startup').catch(()=>loadAll()))
        .catch(error=>{console.warn('Blender detail pack unavailable; using base meshes',error);});
    sharedPack={ready,attach,getGeometry,texture,ensure,loadAll,updatePendingFaction,get models(){return models;},geometries,materials};
    return sharedPack;
}
