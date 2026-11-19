// Shared rendering budgets. Gameplay, navigation and physics use their own clocks.
export const GRAPHICS_PROFILES=Object.freeze({
    low:{pixel:.85,cover:.2,shadow:512,shadows:false,detail:.14,normal:false,surface:false,hd:false,anisotropy:1,minScale:.55},
    medium:{pixel:1,cover:.45,shadow:1024,shadows:true,detail:.4,normal:false,surface:true,hd:false,anisotropy:2,minScale:.6},
    high:{pixel:1.35,cover:.85,shadow:2048,shadows:true,detail:1,normal:true,surface:true,hd:true,anisotropy:4,minScale:.67},
    ultra:{pixel:1.8,cover:1,shadow:3072,shadows:true,detail:1.4,normal:true,surface:true,hd:true,anisotropy:8,minScale:.67}
});
const listeners=new Set();
const smallDevice=(navigator.deviceMemory||8)<=2||(navigator.hardwareConcurrency||8)<=2;
let initialTier=smallDevice?'low':'high';
try{initialTier=localStorage.getItem('graphics-quality')||initialTier;}catch{}
if(!GRAPHICS_PROFILES[initialTier])initialTier='high';
export const graphicsSettings={tier:initialTier,profile:GRAPHICS_PROFILES[initialTier],detailScale:1,
    offline:location.protocol==='file:'||globalThis.POPULATE_OFFLINE===true||navigator.onLine===false};
export const useProceduralSurfaces=()=>graphicsSettings.tier==='low'||graphicsSettings.offline;
export function onGraphicsChange(listener){listeners.add(listener);}
export function enableProceduralFallback(){
    if(graphicsSettings.offline)return;
    graphicsSettings.offline=true;
    for(const listener of listeners)listener();
}
window.addEventListener('offline',enableProceduralFallback);
const originals=new Map();
export function qualityMaterial(material){
    if(!material?.isMeshStandardMaterial)return material;
    let saved=originals.get(material);
    if(!saved){
        saved={normalMap:material.normalMap,bumpMap:material.bumpMap,
            roughnessMap:material.roughnessMap,metalnessMap:material.metalnessMap,aoMap:material.aoMap};
        originals.set(material,saved);
        material.addEventListener('dispose',()=>originals.delete(material));
    }
    const profile=graphicsSettings.profile;
    let changed=false;
    for(const [key,value] of Object.entries(saved)){
        const enabled=key==='normalMap'||key==='bumpMap'?profile.normal:profile.surface;
        const next=enabled?value:null;
        if(material[key]!==next){material[key]=next;changed=true;}
    }
    if(changed)material.needsUpdate=true;
    return material;
}
export function adaptGraphicsBudget(fps,scale,workload=null){
    const profile=graphicsSettings.profile;
    if(workload){
        const {quality,calls,triangles,overview}=workload;
        const geometryHeavy=calls>=500||triangles>=1000000;
        const limit=graphicsSettings.tier==='ultra'?1.5:2;
        if(quality.resolutionProbe){
            const probe=quality.resolutionProbe;
            quality.resolutionProbe=null;
            const comparable=Math.abs(calls-probe.calls)<=Math.max(25,probe.calls*.15)&&
                Math.abs(triangles-probe.triangles)<=Math.max(12000,probe.triangles*.15);
            if(!comparable||fps<probe.fps*1.07){
                quality.resolutionCooldown=4;
                quality.adaptationReason=comparable?'resolution-probe-no-gain':'resolution-probe-scene-changed';
                return probe.scale;
            }
            quality.adaptationReason='resolution-probe-improved';
            return scale;
        }
        quality.resolutionCooldown=Math.max(0,(quality.resolutionCooldown||0)-1);
        quality.vegetationPixelLimit=quality.vegetationPixelLimit??limit;
        if(fps<32&&geometryHeavy&&overview&&quality.vegetationPixelLimit<limit+.8){
            quality.vegetationPixelLimit=Math.min(limit+.8,quality.vegetationPixelLimit+.4);
            quality.adaptationReason='overview-geometry';
            return scale;
        }
        if(fps<32){
            const trial=Math.max(profile.minScale,scale-.1);
            if(trial<scale&&!quality.resolutionCooldown){
                quality.resolutionProbe={fps,calls,triangles,scale};
                quality.adaptationReason='testing-resolution';
                return trial;
            }
            quality.adaptationReason='keeping-resolution';
            return scale;
        }
        if(fps>45)quality.vegetationPixelLimit=Math.max(limit,quality.vegetationPixelLimit-.2);
        quality.adaptationReason=fps>45?'restoring-detail':'stable';
        return fps>45?Math.min(1,scale+.025):scale;
    }
    if(fps<32){
        scale=Math.max(profile.minScale,scale-.1);
        graphicsSettings.detailScale=Math.max(.3,graphicsSettings.detailScale-.15);
    }else if(fps>45){
        scale=Math.min(1,scale+.025);
        graphicsSettings.detailScale=Math.min(1,graphicsSettings.detailScale+.05);
    }
    return scale;
}
export function setGraphicsTier(tier){
    graphicsSettings.tier=Object.hasOwn(GRAPHICS_PROFILES,tier)?tier:'high';
    graphicsSettings.profile=GRAPHICS_PROFILES[graphicsSettings.tier];
    graphicsSettings.detailScale=1;
    for(const material of originals.keys())qualityMaterial(material);
    for(const listener of listeners)listener();
    return graphicsSettings.profile;
}
