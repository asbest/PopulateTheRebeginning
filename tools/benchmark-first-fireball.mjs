import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const playwrightPath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=playwrightPath
    ? await import(pathToFileURL(playwrightPath).href)
    : createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const tier=process.argv.find(arg=>arg.startsWith('--tier='))?.slice(7)||'high';
    await page.addInitScript(tier=>localStorage.setItem('graphics-quality',tier),tier);
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman&&state.renderer,null,{timeout:90000});
    const result=await page.evaluate(async ({tier,live,switchHigh})=>{
        closeHelp();closeStoryOverlay();
        if(live){if(state.isPaused)togglePause();}
        else {state.isPaused=true;setGraphicsQuality(tier);state.renderer.setPixelRatio(1);}
        await new Promise(resolve=>setTimeout(resolve,live?1200:1000));
        if(switchHigh)cycleGraphicsQuality();
        const render=()=>{
            const start=performance.now();
            state.renderer.render(state.scene,state.camera);
            state.renderer.getContext().finish();
            return {ms:performance.now()-start,programs:state.renderer.info.programs.length};
        };
        const before=render();
        const beforeKeys=state.renderer.info.programs.map(program=>program.cacheKey);
        const start=state.shaman.mesh.position.clone().add(new THREE.Vector3(0,3,0));
        const end=start.clone().add(new THREE.Vector3(8,0,0));
        const first=new gameTestAPI.Fireball(start,end,0);
        const firstFrame=render();
        const added=state.renderer.info.programs.map(program=>program.cacheKey).filter(key=>!beforeKeys.includes(key));
        state.scene.remove(first.mesh);
        const afterRemoval=render();
        const second=new gameTestAPI.Fireball(start,end,0);
        const secondFrame=render();
        state.scene.remove(second.mesh);
        return {tier:state.graphicsQuality.tier,before,firstFrame,afterRemoval,secondFrame,added};
    },{tier,live:process.argv.includes('--live'),switchHigh:process.argv.includes('--switch-high')});
    if(result.firstFrame.programs-result.before.programs>2)
        throw new Error('First fireball bulk-compiled shaders during gameplay: '+JSON.stringify(result));
    console.log(JSON.stringify(result));
} finally {await browser.close();}
