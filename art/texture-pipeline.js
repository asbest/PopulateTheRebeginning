import {createProceduralSurfaces} from './procedural-surfaces.js';
import {graphicsSettings,useProceduralSurfaces,onGraphicsChange,enableProceduralFallback} from './graphics-settings.js';
import {KTX2Loader} from '../vendor/KTX2Loader.js';
import {TEXTURE_PREVIEWS} from './startup-manifest.js';
import {assetPath,assetURL} from './asset-urls.js';

// Keep the original images as a per-texture fallback. KTX2 is only selected
// after WebGL reports an actual GPU block-compression format.
export function createTexturePipeline(T,resources){
    const plain=new T.TextureLoader();
    const procedural=createProceduralSurfaces(T),surfaces=new Map(),remoteFor=new WeakMap(),forward=new WeakMap();
    const status={enabled:false,loaded:0,fallbacks:0,pending:0,previewLoaded:0,previewPending:0,promoted:0,upgrading:0};
    const readyByTexture=new WeakMap(),pending=new Set();
    const texturesByURL=new Map();
    const previews=new Map(),entryByTexture=new WeakMap(),queue=[];
    const query=new URLSearchParams(location.search);
    const fullMode=query.get('assets')==='full'||query.get('textures')==='png';
    let compressed=null;
    let configured=false,gpuRenderer=null;
    let gpuVersions=new WeakMap();
    function configure(renderer){
        if(configured)return;
        configured=true;gpuRenderer=renderer;
        renderer.domElement?.addEventListener('webglcontextrestored',()=>{gpuVersions=new WeakMap();});
        const formats=['WEBGL_compressed_texture_astc','WEBGL_compressed_texture_etc',
            'WEBGL_compressed_texture_etc1','WEBGL_compressed_texture_s3tc',
            'EXT_texture_compression_bptc','WEBGL_compressed_texture_pvrtc'];
        const forcedPlain=new URLSearchParams(location.search).get('textures')==='png';
        status.enabled=!forcedPlain&&formats.some(format=>renderer.extensions.has(format));
        if(status.enabled){
            compressed=new KTX2Loader().setTranscoderPath(new URL('../vendor/basis/',import.meta.url).href)
                .setWorkerLimit(Math.min(2,navigator.hardwareConcurrency||2)).detectSupport(renderer);
        }
    }
    function loadFull(url,settings={}){
        if(texturesByURL.has(url))return texturesByURL.get(url);
        const apply=(texture,ready=false)=>{
            texture.wrapS=texture.wrapT=settings.wrap??T.RepeatWrapping;
            texture.anisotropy=Math.min(settings.anisotropy??4,graphicsSettings.profile.anisotropy);
            texture.minFilter=T.LinearMipmapLinearFilter;
            texture.magFilter=T.LinearFilter;
            texture.encoding=settings.srgb?T.sRGBEncoding:T.LinearEncoding;
            if(ready)texture.needsUpdate=true;
            return texture;
        };
        let resolveReady;
        const ready=new Promise(resolve=>{resolveReady=resolve;});
        pending.add(ready);
        ready.finally(()=>pending.delete(ready));
        let texture;
        if(!status.enabled){
            const timer=setTimeout(()=>{enableProceduralFallback();resolveReady(false);},5000);
            texture=plain.load(assetURL(url),()=>{clearTimeout(timer);resolveReady(true);},undefined,error=>{
                clearTimeout(timer);enableProceduralFallback();resolveReady(false);
            });
            readyByTexture.set(texture,ready);
            texturesByURL.set(url,texture);
            return apply(texture);
        }
        const ktxURL=assetURL(url.replace(/\.(png|webp)(?=\?|$)/i,'.ktx2'));
        status.pending++;
        let completed=false,fallbackStarted=false,fallbackImage=null,fallbackUserData=null,timeout;
        const finish=()=>{
            if(completed)return false;
            completed=true;
            clearTimeout(timeout);
            status.pending--;
            resolveReady(true);
            return true;
        };
        const restoreFallback=()=>{
            if(!fallbackImage)return;
            fallbackUserData??=texture.userData;
            texture.copy(fallbackImage);
            texture.isCompressedTexture=false;
            texture.userData=fallbackUserData;
            apply(texture,true);
        };
        const fallback=error=>{
            if(completed||fallbackStarted)return;
            fallbackStarted=true;
            clearTimeout(timeout);
            console.warn('KTX2 texture unavailable; loading original image',ktxURL,error);
            status.fallbacks++;
            const fallbackTimer=setTimeout(()=>{if(!completed){completed=true;status.pending--;resolveReady(false);}},15000);
            plain.load(assetURL(url),image=>{
                clearTimeout(fallbackTimer);
                fallbackImage=image;
                restoreFallback();
                finish();
            },undefined,fallbackError=>{
                clearTimeout(fallbackTimer);
                enableProceduralFallback();
                if(!completed){
                    completed=true;
                    status.pending--;
                    resolveReady(false);
                }
            });
        };
        texture=compressed.load(ktxURL,()=>{
            if(fallbackStarted){restoreFallback();return;}
            if(!finish())return;
            status.loaded++;
            apply(texture,true);
        },undefined,fallback);
        timeout=setTimeout(()=>fallback(new Error('KTX2 decoding timed out')),12000);
        readyByTexture.set(texture,ready);
        texturesByURL.set(url,texture);
        return apply(texture);
    }
    function adopt(target,source,settings){
        const userData=target.userData||{},repeat=target.repeat.clone(),offset=target.offset.clone(),center=target.center.clone(),rotation=target.rotation;
        target.dispose();target.copy(source);target.userData=userData;
        target.isCompressedTexture=!!source.isCompressedTexture;target.isDataTexture=!!source.isDataTexture;
        target.repeat.copy(repeat);target.offset.copy(offset);target.center.copy(center);target.rotation=rotation;
        target.wrapS=target.wrapT=settings.wrap??T.RepeatWrapping;
        target.anisotropy=Math.min(settings.anisotropy??4,graphicsSettings.profile.anisotropy);target.encoding=settings.srgb?T.sRGBEncoding:T.LinearEncoding;
        target.minFilter=T.LinearMipmapLinearFilter;target.magFilter=T.LinearFilter;target.needsUpdate=true;
    }
    function loadRemote(url,settings={}){
        const preview=TEXTURE_PREVIEWS[assetPath(url)];
        if(fullMode||!preview)return loadFull(url,settings);
        if(previews.has(url))return previews.get(url).texture;
        const pixel=/-normal\./i.test(url)?[128,128,255,255]:[255,255,255,255];
        const texture=new T.DataTexture(new Uint8Array(pixel),1,1,T.RGBAFormat);
        texture.wrapS=texture.wrapT=settings.wrap??T.RepeatWrapping;
        texture.encoding=settings.srgb?T.sRGBEncoding:T.LinearEncoding;texture.needsUpdate=true;
        let resolveReady,finished=false;
        const ready=new Promise(resolve=>{resolveReady=resolve;});
        const entry={url,settings,texture,ready,queued:false,high:false,failed:false};
        previews.set(url,entry);entryByTexture.set(texture,entry);readyByTexture.set(texture,ready);pending.add(ready);status.previewPending++;
        const finish=success=>{if(finished)return;finished=true;clearTimeout(timer);status.previewPending--;pending.delete(ready);resolveReady(success);};
        const fallback=()=>{
            if(finished)return;
            entry.fallbackStarted=true;
            enableProceduralFallback();
            adopt(texture,procedural(url),settings);
            finish(true);
        };
        const timer=setTimeout(fallback,5000);
        plain.load(assetURL(preview),image=>{
            if(finished||entry.fallbackStarted)return;
            adopt(texture,image,settings);status.previewLoaded++;finish(true);
        },undefined,fallback);
        return texture;
    }
    function load(url,settings={}){
        if(surfaces.has(url))return surfaces.get(url).texture;
        const texture=new T.Texture();
        const entry={texture,settings,url,remote:null};
        surfaces.set(url,entry);
        adopt(texture,procedural(url),settings);texture.userData.procedural=true;
        refresh(entry);
        return texture;
    }
    function refresh(entry){
        const {texture,settings,url}=entry;
        if(useProceduralSurfaces()){
            adopt(texture,procedural(url),settings);texture.userData.procedural=true;
            readyByTexture.set(texture,Promise.resolve(true));
            return;
        }
        const remote=entry.remote||(entry.remote=loadRemote(url,settings));
        remoteFor.set(texture,remote);forward.set(remote,entry);
        const ready=(readyByTexture.get(remote)||Promise.resolve(true)).then(success=>{
            if(!success){enableProceduralFallback();return true;}
            if(!useProceduralSurfaces()){
                adopt(texture,remote,settings);texture.userData.procedural=false;
            }
            return true;
        });
        readyByTexture.set(texture,ready);
    }
    onGraphicsChange(()=>{for(const entry of surfaces.values())refresh(entry);});
    function warmTexture(texture){
        const stable=forward.get(texture);
        if(stable&&!useProceduralSurfaces()){
            adopt(stable.texture,texture,stable.settings);texture=stable.texture;
        }
        if(!texture||!gpuRenderer?.initTexture||gpuVersions.get(texture)===texture.version)return;
        gpuRenderer.initTexture(texture);gpuVersions.set(texture,texture.version);
    }
    async function promote(texture){
        if(useProceduralSurfaces())return;
        const entry=entryByTexture.get(texture);
        if(!entry||entry.high||entry.failed)return;
        if(entry.upgrade)return entry.upgrade;
        entry.upgrade=(async()=>{
            await entry.ready;
            const source=loadFull(entry.url,entry.settings);
            if(await readyByTexture.get(source)){
                const commit=()=>{
                    if(useProceduralSurfaces())return;
                    adopt(entry.texture,source,entry.settings);
                    // Initialize the actual stable texture object, not a disposable
                    // copy that would force another upload at the first close view.
                    warmTexture(entry.texture);entry.high=true;status.promoted++;
                };
                if(resources)await resources.enqueue('texture/'+entry.texture.uuid,commit,-2);
                else commit();
            }
            else entry.failed=true;
        })();
        return entry.upgrade;
    }
    function drain(){
        if(useProceduralSurfaces()||!graphicsSettings.profile.hd){
            for(const entry of queue)entry.queued=false;
            queue.length=0;
            return;
        }
        while(status.upgrading<2&&queue.length){
            const entry=queue.shift();status.upgrading++;
            promote(entry.texture).catch(error=>{entry.failed=true;console.warn('Keeping startup texture',error);})
                .finally(()=>{status.upgrading--;drain();});
        }
    }
    function request(texture){
        if(useProceduralSurfaces()||!graphicsSettings.profile.hd)return;
        const entry=entryByTexture.get(texture);
        if(!entry||entry.high||entry.queued||entry.failed)return;
        entry.queued=true;queue.push(entry);drain();
    }
    const point=new T.Vector3();
    function streamVisible(scene,focus,radius,extra=[]){
        if(useProceduralSurfaces()||!previews.size)return;
        const requestSurface=texture=>request(remoteFor.get(texture)||texture);
        for(const texture of extra)requestSurface(texture);
        const radiusSq=radius*radius;
        scene.traverseVisible(node=>{
            if(!node.isMesh||!node.material)return;
            if(point.setFromMatrixPosition(node.matrixWorld).distanceToSquared(focus)>radiusSq)return;
            for(const material of [node.material].flat())for(const key of ['map','normalMap','roughnessMap','metalnessMap','emissiveMap'])requestSurface(material[key]);
        });
    }
    return {configure,load,status,streamVisible,
        promote:texture=>promote(remoteFor.get(texture)||texture),
        request:texture=>request(remoteFor.get(texture)||texture),warmTexture,
        promoteAll:()=>Promise.all([...previews.values()].map(entry=>promote(entry.texture))),
        whenReady:texture=>readyByTexture.get(texture)||Promise.resolve(true),waitForPending:()=>Promise.all([...pending])};
}
