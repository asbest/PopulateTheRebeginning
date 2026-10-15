import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const arg=process.argv.find(item=>item.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const root=path.resolve(import.meta.dirname,'..');
const results=[];

async function check(name,run){
    try{
        const detail=await run();
        results.push({name,pass:true,detail});
        console.log(`PASS ${name}`);
    }catch(error){
        results.push({name,pass:false,error:String(error)});
        console.error(`FAIL ${name}: ${error}`);
    }
}

function assert(condition,message){if(!condition)throw new Error(message);}

await check('Every source texture has a valid, smaller KTX2 counterpart',async()=>{
    const folders=['art/blender','art/materials'];
    const sources=[];
    for(const folder of folders){
        for(const name of await fs.readdir(path.join(root,folder))){
            if(/\.(png|webp)$/i.test(name))sources.push(path.join(folder,name));
        }
    }
    sources.push('art/character-cloth.png','art/character-skin-v2.png');
    let sourceBytes=0,ktxBytes=0;
    const magic=Buffer.from('ab4b5458203230bb0d0a1a0a','hex');
    for(const source of sources){
        const destination=source.replace(/\.(png|webp)$/i,'.ktx2');
        const [input,output]=await Promise.all([fs.stat(path.join(root,source)),fs.readFile(path.join(root,destination))]);
        assert(output.subarray(0,12).equals(magic),`Invalid KTX2 header: ${destination}`);
        assert(output.readUInt32LE(20)%4===0&&output.readUInt32LE(24)%4===0,`Unaligned texture: ${destination}`);
        sourceBytes+=input.size;ktxBytes+=output.byteLength;
    }
    assert(ktxBytes<sourceBytes,`KTX2 assets (${ktxBytes}) are not smaller than sources (${sourceBytes})`);
    return {count:sources.length,sourceBytes,ktxBytes};
});

const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
    async function openGame(query='',missingGrass=false){
        const page=await browser.newPage();
        const errors=[],ktxRequests=[],failedRequests=[],badResponses=[];
        page.on('pageerror',error=>errors.push(String(error)));
        page.on('requestfailed',request=>failedRequests.push(`${request.url()}: ${request.failure()?.errorText}`));
        page.on('response',response=>{if(response.status()>=400)badResponses.push(`${response.status()} ${response.url()}`);});
        page.on('console',message=>{
            if(message.type()==='error'&&/shader|webgl|texture/i.test(message.text()))errors.push(message.text());
        });
        page.on('request',request=>{
            if(request.url().endsWith('.ktx2'))ktxRequests.push(request.url());
        });
        if(missingGrass)await page.route('**/art/materials/grass.ktx2',route=>route.fulfill({status:404,body:''}));
        await page.goto(`http://127.0.0.1:8765/PopulateTheRebeginning.html?test=1${query}`,{timeout:90000});
        try{
            await page.waitForFunction(()=>window.gameTestAPI&&Art.textureStatus.pending===0,null,{timeout:30000});
        }catch(error){
            const progress=await page.evaluate(()=>({api:!!window.gameTestAPI,loading:document.querySelector('#loading')?.textContent,
                textureStatus:window.Art?.textureStatus,readyState:document.readyState})).catch(()=>null);
            await page.close();
            throw new Error(`${error}; browser errors: ${errors.join('; ')}; failed requests: ${failedRequests.join('; ')}; bad responses: ${badResponses.join('; ')}; progress: ${JSON.stringify(progress)}`);
        }
        return {page,errors,ktxRequests};
    }

    await check('KTX2 materials render in the live game',async()=>{
        const {page,errors,ktxRequests}=await openGame();
        try{
            const state=await page.evaluate(()=>({
                status:Art.textureStatus,
                grass:Art.textures.grass?.isCompressedTexture,
                stone:Art.textures.stone?.isCompressedTexture,
                skin:Characters.tiles.skin?.isCompressedTexture,
                skinMapped:(()=>{let found=false;state.shaman?.mesh?.traverse(node=>{
                    if(node.material?.userData?.characterKind==='skin'&&node.material.map===Characters.tiles.skin)found=true;
                });return found;})(),
                terrainWidth:Art.textures.grass?.image?.width
            }));
            assert(state.status.enabled,'Compressed texture support did not initialize');
            assert(state.status.loaded>=20,`Only ${state.status.loaded} compressed textures loaded`);
            assert(state.status.fallbacks===0,`${state.status.fallbacks} textures fell back unexpectedly`);
            assert(state.grass&&state.stone&&state.skin,'Representative materials are not compressed');
            assert(state.skinMapped,'The character skin material does not use its texture');
            assert(ktxRequests.length>=20,'KTX2 assets were not fetched');
            assert(errors.length===0,`Browser errors: ${errors.join('; ')}`);
            return {...state,ktxRequests:ktxRequests.length};
        }finally{await page.close();}
    });

    await check('PNG switch keeps the game playable without KTX2 requests',async()=>{
        const {page,errors,ktxRequests}=await openGame('&textures=png');
        try{
            const state=await page.evaluate(()=>({
                status:Art.textureStatus,
                grass:Art.textures.grass?.isCompressedTexture,
                skin:Characters.tiles.skin?.isCompressedTexture,
                terrainWidth:Art.textures.grass?.image?.width
            }));
            assert(!state.status.enabled,'PNG override did not disable KTX2');
            assert(!state.grass&&!state.skin,'A compressed texture remained active');
            assert(state.terrainWidth>=1000,'PNG terrain texture failed to load');
            assert(ktxRequests.length===0,'PNG override still fetched KTX2');
            assert(errors.length===0,`Browser errors: ${errors.join('; ')}`);
            return state;
        }finally{await page.close();}
    });

    await check('Missing KTX2 asset falls back to its source image',async()=>{
        const {page,errors}=await openGame('',true);
        try{
            const state=await page.evaluate(()=>({
                status:Art.textureStatus,
                grass:Art.textures.grass?.isCompressedTexture,
                terrainWidth:Art.textures.grass?.image?.width
            }));
            assert(state.status.fallbacks>=1,'Missing KTX2 was not recorded as a fallback');
            assert(!state.grass,'Fallback is still marked as a compressed texture');
            assert(state.terrainWidth>=1000,'Fallback terrain texture failed to load');
            assert(errors.length===0,`Browser errors: ${errors.join('; ')}`);
            return state;
        }finally{await page.close();}
    });

    await check('A stalled KTX2 request cannot trap the welcome screen',async()=>{
        const page=await browser.newPage();
        const errors=[];
        let releaseRequest;
        const blocked=new Promise(resolve=>{releaseRequest=resolve;});
        let requestBlocked=false;
        page.on('pageerror',error=>errors.push(String(error)));
        await page.route('**/art/materials/grass.ktx2',async route=>{
            requestBlocked=true;
            await blocked;
            await route.continue().catch(()=>{});
        });
        try{
            await page.goto('http://127.0.0.1:8765/PopulateTheRebeginning.html?test=1',
                {waitUntil:'domcontentloaded',timeout:90000});
            await page.waitForFunction(()=>window.gameTestAPI&&
                document.querySelector('#loading')?.style.display==='none'&&
                Art.textureStatus.pending===0,null,{timeout:60000});
            const state=await page.evaluate(()=>({status:Art.textureStatus,
                grassCompressed:Art.textures.grass?.isCompressedTexture}));
            assert(requestBlocked,'The KTX2 request was not intercepted');
            assert(state.status.fallbacks>=1&&!state.grassCompressed,'Stalled texture did not switch to PNG');
            assert(errors.length===0,`Browser errors: ${errors.join('; ')}`);
            const lateResponse=page.waitForResponse(response=>
                response.url().endsWith('/art/materials/grass.ktx2'),{timeout:30000});
            releaseRequest();
            await lateResponse;
            assert(!await page.evaluate(()=>Art.textures.grass?.isCompressedTexture),
                'Late KTX2 response replaced the PNG fallback');
            return state;
        }finally{releaseRequest();await page.close();}
    });

}finally{await browser.close();}

await fs.mkdir(path.join(root,'test-results'),{recursive:true});
await fs.writeFile(path.join(root,'test-results/ktx2-report.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({passed:results.filter(result=>result.pass).length,failed:results.filter(result=>!result.pass).length}));
if(results.some(result=>!result.pass))process.exitCode=1;
