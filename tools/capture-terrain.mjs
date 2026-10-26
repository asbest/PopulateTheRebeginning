import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:60000});
    await page.waitForFunction(()=>['grass','sand','cliff'].every(kind=>Art.textures[kind].image?.width>=1000),null,{timeout:30000});
    const targets=[['shore',3.2],['grass-rock',22]];
    const directory=path.resolve('test-results');
    await fs.mkdir(directory,{recursive:true});
    for(const [name,height] of targets){
        const location=await page.evaluate(target=>{
            closeHelp();closeStoryOverlay();state.isPaused=true;
            let best={score:Infinity,x:0,z:0,h:0};
            for(let x=-160;x<=160;x+=4)for(let z=-160;z<=160;z+=4){
                const h=getHeight(x,z);
                const slope=Math.abs(getHeight(x+3,z)-getHeight(x-3,z))+Math.abs(getHeight(x,z+3)-getHeight(x,z-3));
                const score=Math.abs(h-target)+Math.max(0,1-slope)*.25;
                if(score<best.score)best={score,x,z,h};
            }
            state.cameraLookAt.set(best.x,0,best.z);
            state.viewScale=18;
            const aspect=innerWidth/innerHeight;
            Object.assign(state.orthoCamera,{left:-18*aspect,right:18*aspect,top:18,bottom:-18});
            state.orthoCamera.updateProjectionMatrix();state.camera=state.orthoCamera;
            updateCameraPosition();gameTestAPI.updateChunks(true);
            state.renderer.domElement.id='terrain-capture';
            return best;
        },height);
        await page.waitForTimeout(500);
        const destination=path.join(directory,`terrain-${name}.png`);
        await page.locator('#terrain-capture').screenshot({path:destination});
        console.log(name,location,destination);
    }
} finally {await browser.close();}
