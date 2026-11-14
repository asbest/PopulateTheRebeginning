import {assetURL} from './asset-urls.js';
import {ASSET_REVISION} from './asset-revisions.js';
// Optional acceleration: storage restrictions must never prevent a game start.
let registration;
export function installAssetCache(){
    if(location.protocol==='file:')return;
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
        const shell=['index.html','PopulateTheRebeginning.html','art/presentation.css','vendor/peerjs.min.js','vendor/simplex-noise.min.js'];
        const resources=performance.getEntriesByType('resource').map(entry=>entry.name);
        const revisions=new URL('./asset-revisions.js',import.meta.url);
        revisions.searchParams.set('v',ASSET_REVISION);
        const urls=[...new Set([revisions.href,...[...shell,...resources].map(url=>assetURL(url))])]
            .filter(url=>new URL(url).searchParams.has('v')).slice(0,200);
        await new Promise(resolve=>{
            const channel=new MessageChannel();
            const timer=setTimeout(()=>{channel.port1.close();resolve();},30000);
            channel.port1.onmessage=()=>{clearTimeout(timer);channel.port1.close();resolve();};
            worker.postMessage({type:'CACHE_USED_ASSETS',urls},[channel.port2]);
        });
    }catch(error){console.warn('Asset cache skipped',error);}
}
