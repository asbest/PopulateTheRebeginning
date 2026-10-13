import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const playwrightPath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=playwrightPath
    ? await import(pathToFileURL(playwrightPath).href)
    : createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.state?.shaman&&
        Object.keys(state.chunks).length>=(2*CONFIG.TERRAIN.RENDER_DISTANCE+1)**2,null,{timeout:90000});
    await page.evaluate(()=>{closeHelp();closeStoryOverlay();setGraphicsQuality('high');
        state.graphicsQuality.dynamicScale=1;state.renderer.setPixelRatio(1);if(!state.isPaused)togglePause();});
    await page.waitForTimeout(1000);
    const result=await page.evaluate(async()=>{
        const cover=Object.values(state.chunks).flatMap(chunk=>Object.values(chunk.userData?.groundCover||{}))
            .map(layer=>layer?.mesh).filter(Boolean);
        const flowers=Object.values(state.chunks).flatMap(chunk=>
            ['stems','centers','petals','tulips'].map(key=>chunk.userData?.flowers?.[key])).filter(Boolean);
        const culledObjects=[...cover,...flowers];
        const canvas=document.createElement('canvas');canvas.width=state.renderer.domElement.width;canvas.height=state.renderer.domElement.height;
        const context=canvas.getContext('2d',{willReadFrequently:true});
        state.renderer.render(state.scene,state.camera);
        context.drawImage(state.renderer.domElement,0,0);
        const culledImage=context.getImageData(0,0,canvas.width,canvas.height).data.slice();
        const culledCalls=state.renderer.info.render.calls;
        culledObjects.forEach(mesh=>mesh.frustumCulled=false);
        state.renderer.render(state.scene,state.camera);
        context.drawImage(state.renderer.domElement,0,0);
        const unculledImage=context.getImageData(0,0,canvas.width,canvas.height).data;
        const unculledCalls=state.renderer.info.render.calls;
        culledObjects.forEach(mesh=>mesh.frustumCulled=true);
        let changedPixels=0,maxChannelDelta=0;
        for(let i=0;i<culledImage.length;i+=4){let delta=0;
            for(let k=0;k<3;k++)delta=Math.max(delta,Math.abs(culledImage[i+k]-unculledImage[i+k]));
            if(delta>2)changedPixels++;maxChannelDelta=Math.max(maxChannelDelta,delta);
        }
        const samples=[];
        for(let turn=0;turn<4;turn++){
            state.camera.rotation.y+=Math.PI/2;
            const deltas=[];let before=performance.now();
            for(let i=0;i<90;i++)await new Promise(resolve=>requestAnimationFrame(()=>{
                const now=performance.now();if(i>15)deltas.push(now-before);before=now;resolve();
            }));
            samples.push({calls:state.renderer.info.render.calls,triangles:state.renderer.info.render.triangles,
                medianFrameMs:deltas.sort((a,b)=>a-b)[Math.floor(deltas.length/2)]});
        }
        const chunkCount=Object.keys(state.chunks).length;
        const chunkSize=CONFIG.TERRAIN.CHUNK_SIZE;
        const cx=Math.round(state.cameraLookAt.x/chunkSize),cz=Math.round(state.cameraLookAt.z/chunkSize);
        const departingKey=`${cx-CONFIG.TERRAIN.RENDER_DISTANCE},${cz}`;
        const departing=state.chunks[departingKey];
        let releasedGeometries=0;
        const departingMeshes=[departing.children[0],departing.children[1],
            ...Object.values(departing.userData.groundCover).map(layer=>layer?.mesh),
            ...['stems','centers','petals','tulips'].map(key=>departing.userData.flowers?.[key])];
        departingMeshes.filter(Boolean).forEach(mesh=>mesh.geometry.addEventListener('dispose',()=>releasedGeometries++));
        const existingKeys=new Set(Object.keys(state.chunks));
        state.cameraLookAt.x+=chunkSize;
        gameTestAPI.updateChunks();
        const createdOnPan=Object.keys(state.chunks).filter(key=>!existingKeys.has(key)).length;
        return {chunks:chunkCount,units:state.units.length,flowerMeshes:flowers.length,
            visualParity:changedPixels===0,changedPixels,maxChannelDelta,releasedGeometries,
            createdOnPan,culledCalls,unculledCalls,samples};
    });
    if(!result.visualParity||result.unculledCalls<=result.culledCalls||result.releasedGeometries<5||result.createdOnPan>2)
        throw new Error('Culling benchmark failed: '+JSON.stringify(result));
    console.log(JSON.stringify(result));
} finally {await browser.close();}
