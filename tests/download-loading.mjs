import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {TEXTURE_PREVIEWS,MODEL_FILES,MODEL_GROUPS} from '../art/startup-manifest.js';
import {ASSET_HASHES} from '../art/asset-revisions.js';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const base=process.env.GAME_URL||'http://127.0.0.1:8765';
const results=[];
function assert(condition,message){if(!condition)throw new Error(message);}
async function check(name,run){
    try{const detail=await run();results.push({name,pass:true,detail});console.log('PASS',name,detail||'');}
    catch(error){results.push({name,pass:false,error:String(error)});console.error('FAIL',name,error);}
}
const local=file=>new URL('../'+file,import.meta.url);
await check('Generated chunks preserve every authored model and use matching content hashes',async()=>{
    const original=await fs.readFile(local('art/blender/mesh-pack.json'));
    const models=JSON.parse(original).models,combined={};let startupBytes=0;
    for(const [group,file] of Object.entries(MODEL_FILES)){
        const bytes=await fs.readFile(local(file)),chunk=JSON.parse(bytes);
        assert(file.includes(createHash('sha256').update(bytes).digest('hex').slice(0,16)),'Stale model filename: '+file);
        for(const [key,data] of Object.entries(chunk.models)){
            assert(MODEL_GROUPS[key]===group&&!combined[key],'Duplicate or misplaced model: '+key);
            combined[key]=data;
        }
        if(group==='startup')startupBytes=gzipSync(bytes).length;
    }
    assert(Object.keys(combined).length===Object.keys(models).length,'Incomplete model partition');
    for(const key of Object.keys(models))assert(JSON.stringify(combined[key])===JSON.stringify(models[key]),'Changed geometry: '+key);
    assert(startupBytes<gzipSync(original).length,'Initial model download did not shrink');
    assert((await fs.stat(local('art/key-art-startup.webp'))).size<(await fs.stat(local('art/key-art.png'))).size*.2,'Welcome illustration did not shrink');
    for(const [file,hash] of Object.entries(ASSET_HASHES)){
        const bytes=await fs.readFile(local(file));
        const canonical=/\.(js|json|html|css)$/i.test(file)?bytes.toString('utf8').replaceAll('\r\n','\n'):bytes;
        assert(createHash('sha256').update(canonical).digest('hex').slice(0,16)===hash,'Stale revision: '+file);
    }
    return {models:Object.keys(combined).length,startupGzipBytes:startupBytes,fullGzipBytes:gzipSync(original).length};
});
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
async function game(options={}){
    const context=await browser.newContext({viewport:{width:800,height:600},...options.context}),page=await context.newPage();
    const errors=[],requests=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('request',request=>requests.push(request.url()));
    page.on('dialog',dialog=>dialog.accept());
    if(options.setup)await options.setup(page);
    try{
        await page.goto(`${base}/PopulateTheRebeginning.html?test=1${options.query||''}`,{waitUntil:'domcontentloaded',timeout:90000});
        await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:120000});
        return {page,context,errors,requests};
    }catch(error){await context.close();throw error;}
}
try{
    for(const mobile of [false,true])await check(`Fast ${mobile?'mobile':'desktop'} startup fetches small textures and core models without audio or HD downloads`,async()=>{
        const {page,context,errors,requests}=await game({context:mobile?{viewport:{width:390,height:844},isMobile:true,hasTouch:true,
            userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'}:{}});
        try{
            const data=await page.evaluate(()=>({status:Art.textureStatus,width:Characters.tiles.skin.image.width,
                models:Object.keys(Art.blender.models),audio:gameTestAPI.SoundManager.ctx}));
            assert(!requests.some(url=>/\.(wav|mp3|ktx2)(\?|$)|\/mesh-pack\.json/.test(url)),'Startup downloaded deferred assets');
            assert(!requests.some(url=>new URL(url).pathname.endsWith('/key-art.png')),'Startup fetched the original illustration');
            assert(!requests.some(url=>Object.entries(MODEL_FILES).some(([group,file])=>group!=='startup'&&url.includes(file))),'Unused role models downloaded');
            assert(data.width<=256&&data.width>1&&data.status.previewLoaded>=20,'Preview textures are not usable');
            assert(data.audio===null,'Startup opened AudioContext');
            let previewBytes=0,fullKtxBytes=0;
            for(const [source,preview] of Object.entries(TEXTURE_PREVIEWS))if(requests.some(url=>url.includes(preview))){
                previewBytes+=(await fs.stat(local(preview))).size;
                fullKtxBytes+=(await fs.stat(local(source.replace(/\.(png|webp)$/i,'.ktx2')))).size;
            }
            assert(previewBytes<fullKtxBytes*.1,'Startup texture budget is not substantially lower');
            assert(errors.length===0,errors.join('; '));
            return {previewBytes,equivalentFullKtxBytes:fullKtxBytes,textureCount:data.status.previewLoaded,initialModels:data.models.length};
        }finally{await context.close();}
    });
    await check('Deferred spy details attach once and retain a faction change while loading',async()=>{
        let release;
        const blocked=new Promise(resolve=>{release=resolve;});
        const {page,context,errors}=await game({setup:page=>page.route('**/art/startup/models/spy.*',async route=>{await blocked;await route.continue().catch(()=>{});})});
        try{
            await page.evaluate(()=>{
                window.lazyWarrior=new Humanoid(0,'spy',state.shaman.mesh.position.x+2,state.shaman.mesh.position.z);
                Characters.setFaction(lazyWarrior,0xf03070);
                if(!lazyWarrior.armR||!lazyWarrior.mesh.children.length)throw new Error('No base warrior while loading');
            });
            release();
            const data=await page.evaluate(async()=>{
                await Art.blender.ensure('character/spy/torso');
                await new Promise(resolve=>setTimeout(resolve,0));
                const details=[];lazyWarrior.mesh.traverse(node=>{if(node.userData.blenderAsset)details.push(node);});
                const faction=details.filter(node=>node.userData.characterFaction);
                if(!details.length||!faction.length||faction.some(node=>node.material.color.getHex()!==0xf03070))throw new Error('Late detail lost faction: '+JSON.stringify({details:details.length,colors:faction.map(node=>node.material.color.getHex())}));
                const parent=new THREE.Group();Art.blender.attach(parent,'character/spy/torso');Art.blender.attach(parent,'character/spy/torso');
                if(parent.children.length!==1)throw new Error('Duplicate LOD attached');
                return {details:details.length,factionParts:faction.length};
            });
            assert(errors.length===0,errors.join('; '));return data;
        }finally{release();await context.close();}
    });
    await check('Close zoom streams HD into existing texture objects with transforms and metadata intact',async()=>{
        const {page,context,errors}=await game();
        try{
            await page.evaluate(()=>{
                window.beforeTexture=Art.textures.grass;window.beforeSkin=Characters.tiles.skin;
                beforeTexture.repeat.set(3,5);beforeTexture.userData={testMarker:17};
                state.viewScale=8;state.cameraLookAt.copy(state.shaman.mesh.position);
            });
            await page.waitForFunction(()=>Art.textures.grass.image.width>=1000&&Characters.tiles.skin.image.width>=1000,
                null,{timeout:60000});
            const data=await page.evaluate(()=>{
                if(Art.textures.grass!==beforeTexture||Characters.tiles.skin!==beforeSkin)throw new Error('Texture identity changed');
                if(beforeTexture.repeat.x!==3||beforeTexture.repeat.y!==5||beforeTexture.userData.testMarker!==17)throw new Error('Texture state lost');
                if(Art.textureStatus.upgrading>2)throw new Error('Unbounded upgrade concurrency');
                state.renderer.render(state.scene,state.camera);
                return {width:beforeTexture.image.width,status:Art.textureStatus};
            });
            assert(errors.length===0,errors.join('; '));return data;
        }finally{await context.close();}
    });
    await check('Missing previews and model packs retain a playable base game',async()=>{
        const {page,context,errors}=await game({setup:async page=>{
            await page.route('**/art/startup/textures/materials-grass.*',route=>route.fulfill({status:404,body:''}));
            await page.route('**/art/startup/models/*',route=>route.fulfill({status:404,body:''}));
            await page.route('**/art/blender/mesh-pack.json*',route=>route.fulfill({status:404,body:''}));
        }});
        try{
            const data=await page.evaluate(()=>{
                closeHelp();closeStoryOverlay();state.isPaused=true;
                const warrior=new Humanoid(0,'warrior',state.shaman.mesh.position.x+2,state.shaman.mesh.position.z);
                if(!warrior.armR||!warrior.legL||warrior.hp<=0||!state.renderer)throw new Error('Missing base rig');
                return {width:Art.textures.grass.image.width,models:Object.keys(Art.blender.models).length};
            });
            assert(data.width>=1000,'Missing preview did not use full texture fallback');
            assert(data.models===0&&errors.length===0,'Base mesh fallback failed: '+errors.join('; '));return data;
        }finally{await context.close();}
    });
    await check('A failed HD upgrade keeps the working preview',async()=>{
        const {page,context,errors}=await game({setup:async page=>{
            for(const extension of ['ktx2','png'])await page.route(`**/art/materials/grass.${extension}*`,route=>route.fulfill({status:404,body:''}));
        }});
        try{
            await page.evaluate(()=>{window.previewImage=Art.textures.grass.image;Art.streamTextures(state.scene,state.cameraLookAt,0);});
            await page.waitForFunction(()=>Art.textureStatus.upgrading===0&&Art.textureStatus.pending===0,null,{timeout:60000});
            assert(await page.evaluate(()=>Art.textures.grass.image===previewImage&&previewImage.width===256),'Upgrade destroyed preview');
            assert(errors.length===0,errors.join('; '));
        }finally{await context.close();}
    });
    await check('A stalled preview uses its original fallback and ignores a late preview response',async()=>{
        let release;const blocked=new Promise(resolve=>{release=resolve;});
        const {page,context,errors}=await game({setup:page=>page.route('**/art/startup/textures/materials-grass.*',async route=>{
            await blocked;await route.continue().catch(()=>{});
        })});
        try{
            assert(await page.evaluate(()=>Art.textures.grass.image.width>=1000),'Stalled preview blocked fallback');
            const response=page.waitForResponse(response=>new URL(response.url()).pathname.includes('/textures/materials-grass.'));
            release();await response;
            assert(await page.evaluate(()=>Art.textures.grass.image.width>=1000),'Late preview replaced full fallback');
            assert(!errors.length,errors.join('; '));
        }finally{release();await context.close();}
    });
    await check('Versioned assets are reusable offline and an old content version cannot satisfy a new URL',async()=>{
        const {page,context,errors}=await game({query:'&cache=1'});
        try{
            await page.waitForFunction(()=>navigator.serviceWorker.controller,null,{timeout:30000});
            const result=await page.evaluate(async()=>{
                const {assetURL}=await import('./art/asset-urls.js');
                const url=assetURL('art/materials/grass.ktx2');
                const names=await caches.keys(),name=names.find(name=>name.startsWith('populate-assets-'));
                const cache=await caches.open(name),old=new URL(url);old.searchParams.set('v','old-version');
                await cache.put(old.href,new Response('old-content'));
                const bytes=await (await fetch(url)).arrayBuffer();
                if(bytes.byteLength<1000)throw new Error('Old content returned for new hash');
                window.cachedAssetURL=url;
                return {bytes:bytes.byteLength,url};
            });
            await page.waitForFunction(async()=>!!await caches.match(cachedAssetURL),null,{timeout:30000});
            await context.setOffline(true);
            const bytes=await page.evaluate(async()=>(await (await fetch(cachedAssetURL)).arrayBuffer()).byteLength);
            assert(bytes===result.bytes,'Cached download was not reusable offline');
            assert(errors.length===0,errors.join('; '));return {bytes,offlineHit:true};
        }finally{await context.setOffline(false);await context.close();}
    });
    await check('A browser rejecting service-worker registration still starts',async()=>{
        const {page,context,errors}=await game({query:'&cache=1',setup:page=>page.addInitScript(()=>{
            navigator.serviceWorker.register=()=>Promise.reject(new DOMException('Storage blocked','SecurityError'));
        })});
        try{assert(await page.evaluate(()=>!!state.shaman&&state.assetsReady),'Startup depended on cache');assert(!errors.length,errors.join('; '));}
        finally{await context.close();}
    });
}finally{await browser.close();}
await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../test-results/download-loading-report.json',import.meta.url),JSON.stringify(results,null,2));
console.log(JSON.stringify({passed:results.filter(result=>result.pass).length,failed:results.filter(result=>!result.pass).length}));
if(results.some(result=>!result.pass))process.exitCode=1;
