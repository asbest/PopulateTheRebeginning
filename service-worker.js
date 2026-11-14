/* Versioned, on-demand asset cache. No bulk downloads or saved-game storage. */
importScripts('./asset-cache-manifest.js');
const PREFIX='populate-assets-',NAME=PREFIX+self.GAME_ASSETS.revision;
const ROOT=new URL('./',self.location.href);
function managed(input){
    const url=new URL(input);
    if(url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname))return false;
    const path=decodeURIComponent(url.pathname.slice(ROOT.pathname.length));
    const version=path==='art/asset-revisions.js'?self.GAME_ASSETS.revision:self.GAME_ASSETS.files[path];
    return !!version&&url.searchParams.get('v')===version;
}
self.addEventListener('install',event=>event.waitUntil(self.skipWaiting()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
    try{
        const names=(await caches.keys()).filter(name=>name.startsWith(PREFIX)&&name!==NAME);
        // Retain one previous release for open tabs and reuse of unchanged assets.
        await Promise.all(names.slice(0,-1).map(name=>caches.delete(name)));
    }catch{} 
    await self.clients.claim();
})()));
async function stored(request){
    try{
        const current=await caches.open(NAME),hit=await current.match(request);
        if(hit)return hit;
        for(const name of await caches.keys())if(name.startsWith(PREFIX)&&name!==NAME){
            const previous=await (await caches.open(name)).match(request);
            if(previous){await current.put(request,previous.clone()).catch(()=>{});return previous;}
        }
    }catch{}
    return null;
}
async function offlineResponse(response,navigation){
    if(!navigation)return response;
    const html=(await response.text()).replace('<head>','<head><script>window.POPULATE_OFFLINE=true;</script>');
    const headers=new Headers(response.headers);headers.delete('content-length');headers.delete('content-encoding');
    return new Response(html,{status:200,headers});
}
async function remember(request,response){
    if(response.ok&&response.status===200)try{const copy=response.clone();await (await caches.open(NAME)).put(request,copy);}catch{}
}
self.addEventListener('fetch',event=>{
    const original=event.request;
    if(original.method!=='GET'||original.headers.has('range'))return;
    const url=new URL(original.url);
    if(url.origin!==ROOT.origin||!url.pathname.startsWith(ROOT.pathname))return;
    let path=decodeURIComponent(url.pathname.slice(ROOT.pathname.length));
    if(!path)path='index.html';
    const version=path==='art/asset-revisions.js'?self.GAME_ASSETS.revision:self.GAME_ASSETS.files[path];
    if(!version)return;
    // Explicit versions must stay isolated. Bare module/navigation requests
    // use this service worker release's content version.
    if(url.searchParams.has('v')&&url.searchParams.get('v')!==version)return;
    if(path.endsWith('.html'))url.search='';
    url.pathname=ROOT.pathname+path;url.searchParams.set('v',version);
    const request=new Request(url.href);
    event.respondWith((async()=>{
        const hit=await stored(request);
        if(hit&&original.mode!=='navigate')return hit;
        let response;
        try{response=await fetch(request);}
        catch(error){if(hit)return offlineResponse(hit,original.mode==='navigate');throw error;}
        if(!response.ok&&hit)return offlineResponse(hit,original.mode==='navigate');
        // Cache writes do not delay delivery to the renderer or audio decoder.
        event.waitUntil(remember(request,response));
        return response;
    })());
});
self.addEventListener('message',event=>{
    if(event.data?.type!=='CACHE_USED_ASSETS'||!Array.isArray(event.data.urls))return;
    event.waitUntil((async()=>{
        const urls=[...new Set(event.data.urls)].filter(url=>{try{return managed(url);}catch{return false;}}).slice(0,200);
        async function fill(){
            while(urls.length){
                const url=urls.shift();
                if(await stored(url))continue;
                try{await remember(url,await fetch(url,{cache:'force-cache'}));}catch{}
            }
        }
        await Promise.all([fill(),fill()]);
        event.ports[0]?.postMessage({cached:true});
    })());
});
