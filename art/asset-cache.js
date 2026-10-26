// Optional acceleration: storage restrictions must never prevent a game start.
let registration;
export function installAssetCache(){
    if(registration)return registration;
    const query=new URLSearchParams(location.search);
    if(!('serviceWorker' in navigator)||!isSecureContext||(query.has('test')&&query.get('cache')!=='1'))return;
    registration=navigator.serviceWorker.register(new URL('../service-worker.js',import.meta.url),{updateViaCache:'none'})
        .catch(error=>{console.warn('Asset cache unavailable; using network',error);return null;});
    return registration;
}
export async function cacheCurrentAssets(){
    try{
        const registered=await installAssetCache();
        if(!registered)return;
        const ready=await Promise.race([navigator.serviceWorker.ready,new Promise(resolve=>setTimeout(()=>resolve(null),10000))]);
        const worker=ready?.active;
        if(!worker)return;
        const urls=[...new Set(performance.getEntriesByType('resource').map(entry=>entry.name))]
            .filter(url=>new URL(url).searchParams.has('v')).slice(0,200);
        worker.postMessage({type:'CACHE_USED_ASSETS',urls});
    }catch(error){console.warn('Asset cache skipped',error);}
}
