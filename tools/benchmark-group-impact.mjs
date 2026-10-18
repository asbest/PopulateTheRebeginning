import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const playwrightPath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=playwrightPath
    ? await import(pathToFileURL(playwrightPath).href)
    : createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    await page.addInitScript(tier=>localStorage.setItem('graphics-quality',tier),
        process.env.GAME_GRAPHICS_QUALITY||'medium');
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman&&state.renderer,null,{timeout:90000});
    const report=await page.evaluate(()=>{
        closeHelp();closeStoryOverlay();state.isPaused=true;
        state.renderer.setPixelRatio(1);
        // All measurements run in this synchronous evaluation, so chunk
        // streaming cannot advance between the baseline and impact renders.
        const loadedChunks=Object.keys(state.chunks).length;
        const startupPulses=gameTestAPI.HitPulseManager.active.length;
        gameTestAPI.HitPulseManager.active.length=0;
        gameTestAPI.HitPulseManager.update(0);
        const center=state.shaman.mesh.position;
        const x=center.x+3,z=center.z+3;
        const units=[];
        for(let i=0;i<24;i++){
            const angle=i*Math.PI*2/24,radius=2+(i%3)*.65;
            const unit=new Humanoid(1,'warrior',x+Math.sin(angle)*radius,z+Math.cos(angle)*radius);
            unit.hp=unit.maxHp=1000;
            state.units.push(unit);units.push(unit);
        }
        gameTestAPI.SpatialHash.update();
        const sample=()=>{
            const times=[];
            for(let i=0;i<5;i++){
                const start=performance.now();
                state.renderer.render(state.scene,state.camera);
                state.renderer.getContext().finish();
                times.push(performance.now()-start);
            }
            times.sort((a,b)=>a-b);
            return {medianMs:times[2],calls:state.renderer.info.render.calls,
                triangles:state.renderer.info.render.triangles,particles:state.particles.length,
                programs:state.renderer.info.programs.length};
        };
        const before=sample();
        const y=getHeight(x,z)+.4;
        const target=new THREE.Vector3(x,y,z);
        const shot=new gameTestAPI.Fireball(target.clone().add(new THREE.Vector3(-8,3,0)),target,0);
        shot.mesh.position.copy(target);
        const start=performance.now();shot.explode();
        gameTestAPI.HitPulseManager.update(0);
        const impactMs=performance.now()-start;
        const after=sample();
        const hitPulses=gameTestAPI.HitPulseManager.active.length;
        gameTestAPI.HitPulseManager.update(.71);
        const expired=gameTestAPI.HitPulseManager.active.length===0&&
            gameTestAPI.HitPulseManager.meshes.every(mesh=>mesh.count===0&&!mesh.visible);
        return {loadedChunks,startupPulses,units:units.length,hits:units.filter(unit=>unit.hp<1000).length,
            impactMs,before,after,extraCalls:after.calls-before.calls,
            extraParticles:after.particles-before.particles,
            hitPulses,expired};
    });
    if(report.hits!==24 || report.hitPulses!==24 || !report.expired || report.extraCalls>30 ||
        report.extraParticles>24 || report.after.programs>report.before.programs+2) {
        console.error(`::error title=Group impact rendering budget::${JSON.stringify(report)}`);
        throw new Error(`Group impact regressed: ${JSON.stringify(report)}`);
    }
    console.log(JSON.stringify(report));
} finally {
    await browser.close();
}
