import {KTX2Loader} from '../vendor/KTX2Loader.js';

// Keep the original images as a per-texture fallback. KTX2 is only selected
// after WebGL reports an actual GPU block-compression format.
export function createTexturePipeline(T){
    const plain=new T.TextureLoader();
    const status={enabled:false,loaded:0,fallbacks:0,pending:0};
    const readyByTexture=new WeakMap(),pending=new Set();
    const texturesByURL=new Map();
    let compressed=null;
    let configured=false;
    function configure(renderer){
        if(configured)return;
        configured=true;
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
    function load(url,settings={}){
        if(texturesByURL.has(url))return texturesByURL.get(url);
        const apply=(texture,ready=false)=>{
            texture.wrapS=texture.wrapT=settings.wrap??T.RepeatWrapping;
            texture.anisotropy=settings.anisotropy??4;
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
            texture=plain.load(url,()=>resolveReady(true),undefined,error=>{
                console.error('Texture load failed',url,error);resolveReady(false);
            });
            readyByTexture.set(texture,ready);
            texturesByURL.set(url,texture);
            return apply(texture);
        }
        const ktxURL=url.replace(/\.(png|webp)(?=\?|$)/i,'.ktx2');
        status.pending++;
        const fallback=error=>{
            console.warn('KTX2 texture unavailable; loading original image',ktxURL,error);
            status.fallbacks++;
            plain.load(url,image=>{
                const userData=texture.userData;
                texture.copy(image);
                texture.isCompressedTexture=false;
                texture.userData=userData;
                apply(texture,true);
                image.dispose();
                status.pending--;resolveReady(true);
            },undefined,fallbackError=>{
                console.error('Texture fallback failed',url,fallbackError);
                status.pending--;resolveReady(false);
            });
        };
        texture=compressed.load(ktxURL,()=>{
            status.pending--;
            status.loaded++;
            apply(texture,true);
            resolveReady(true);
        },undefined,fallback);
        readyByTexture.set(texture,ready);
        texturesByURL.set(url,texture);
        return apply(texture);
    }
    return {configure,load,status,whenReady:texture=>readyByTexture.get(texture)||Promise.resolve(true),
        waitForPending:()=>Promise.all([...pending])};
}
