import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const playwrightPath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=playwrightPath
    ? await import(pathToFileURL(playwrightPath).href)
    : createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.fireballShadersReady,null,{timeout:90000});
    const result=await page.evaluate(()=>{
        state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;
        closeHelp();closeStoryOverlay();setGraphicsQuality('high');
        state.renderer.setPixelRatio(1);
        const start=state.shaman.mesh.position.clone().add(new THREE.Vector3(0,2,0));
        const gl=state.renderer.getContext();
        const render=()=>{const t=performance.now();state.renderer.render(state.scene,state.camera);gl.finish();
            return {ms:performance.now()-t,calls:state.renderer.info.render.calls};};
        render();
        const empty=render();
        const shots=[];const t0=performance.now();
        for(let i=0;i<8;i++)shots.push(new gameTestAPI.Fireball(
            start.clone().add(new THREE.Vector3(i*.2,0,0)),start.clone().add(new THREE.Vector3(9,0,i*.2)),0,5.4,15,false,true));
        const constructMs=performance.now()-t0;
        const salvoFrame=render();
        const steadyFrame=render();
        const t1=performance.now();for(const shot of shots)shot.explode();
        const impactMs=performance.now()-t1;
        gameTestAPI.FireballFxManager.update(0);
        const afterImpact=render();
        for(let i=0;i<32;i++)gameTestAPI.SurfaceMarks.add(start.x,start.z,{kind:'ember',radius:1.6,life:18});
        const effects=Object.fromEntries(Object.entries(gameTestAPI.FireballFxManager.layers)
            .map(([name,layer])=>[name,layer.items.length]));
        return {empty,constructMs,salvoFrame,steadyFrame,impactMs,afterImpact,effects,
            impactParticles:state.particles.length,lights:gameTestAPI.FireballFxManager.lights.filter(light=>light.visible).length,
            emberMarks:gameTestAPI.SurfaceMarks.marks.filter(mark=>mark.kind==='ember').length};
    });
    if(result.lights>2||result.impactParticles>80||result.afterImpact.calls-result.empty.calls>20||
        result.effects.glow<8||result.effects.smoke!==8||'ring' in result.effects||'flash' in result.effects||result.emberMarks>24)
        throw new Error('Firewarrior volley exceeded the light or effect budget: '+JSON.stringify(result));
    console.log(JSON.stringify(result));
}finally{await browser.close();}
