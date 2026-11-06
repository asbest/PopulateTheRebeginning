import {seedWorld} from '../tests/fixtures/seed-world.mjs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const playwrightPath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=playwrightPath
    ? await import(pathToFileURL(playwrightPath).href)
    : createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    await seedWorld(page,98217);
    await page.addInitScript(tier=>localStorage.setItem('graphics-quality',tier),
        process.env.GAME_GRAPHICS_QUALITY||'medium');
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman&&state.renderer,null,{timeout:90000});
    const report=await page.evaluate(()=>{
        closeHelp();closeStoryOverlay();state.isPaused=true;
        state.matchSettings.peaceTimeMinutes=0;
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
        const crowdSize=72;
        for(let i=0;i<crowdSize;i++){
            const angle=i*2.399963,radius=Math.sqrt(i/crowdSize)*5.5;
            const unit=new Humanoid(1,'warrior',x+Math.sin(angle)*radius,z+Math.cos(angle)*radius);
            unit.hp=unit.maxHp=1000;
            unit.nextTargetCheck=Infinity;
            state.units.push(unit);units.push(unit);
        }
        gameTestAPI.SpatialHash.update();
        const healthBarGeometries=new Set(units[0].hpGroup.children.map(part=>part.geometry));
        const renderBufferDirect=state.renderer.renderBufferDirect;
        let healthBarCalls=0,healthBarParts=0;
        state.renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
            if(healthBarGeometries.has(geometry)){
                healthBarCalls++;
                healthBarParts+=object.isInstancedMesh?object.count:1;
            }
            return renderBufferDirect.call(this,camera,scene,geometry,material,object,group);
        };
        const sample=()=>{
            const times=[];
            let pointLights=0;
            state.scene.traverseVisible(node=>{if(node.isPointLight)pointLights++;});
            for(let i=0;i<5;i++){
                healthBarCalls=0;healthBarParts=0;
                const start=performance.now();
                state.renderer.render(state.scene,state.camera);
                state.renderer.getContext().finish();
                times.push(performance.now()-start);
            }
            const firstMs=times[0];
            times.sort((a,b)=>a-b);
            return {firstMs,medianMs:times[2],pointLights,calls:state.renderer.info.render.calls,
                triangles:state.renderer.info.render.triangles,particles:state.particles.length,
                programs:state.renderer.info.programs.length,healthBarCalls,healthBarParts};
        };
        const before=sample();
        const fx=gameTestAPI.FireballFxManager;
        gameTestAPI.executeSpell('blast',x,z,state.shaman);
        const shot=state.projectiles.at(-1);
        fx.update(0);
        const launch=sample();
        shot.update(shot.duration*.5);fx.update(1/60);
        const flight=sample();
        const start=performance.now();
        shot.update(shot.duration*.5);
        gameTestAPI.HitPulseManager.update(0);
        const impactMs=performance.now()-start;
        fx.update(0);
        const after=sample();
        const hits=units.filter(unit=>unit.hp<1000).length;
        const thrown=units.filter(unit=>unit.blastAirborne&&unit.state==='stunned').length;
        let peakBurnEmissions=0,burnEmissions=0;
        for(let frame=0;frame<9;frame++){
            state.physicsWorld.timestep=1/60;
            state.physicsWorld.step();
            const beforeBurn=fx.layers.glow.items.length;
            for(const unit of units)unit.update(1/60);
            const emitted=fx.layers.glow.items.length-beforeBurn;
            peakBurnEmissions=Math.max(peakBurnEmissions,emitted);
            burnEmissions+=emitted;
            gameTestAPI.updateTreeRegrowth(1/60);
            fx.update(1/60);
        }
        const aftermath=sample();
        // Measure the same pose with just these bars drawn individually.
        // A separate camera layer keeps them out of the character batch.
        gameTestAPI.CharacterBatches.restore();
        state.camera.layers.enable(1);
        for(const unit of units)for(const part of unit.hpGroup.children)part.layers.set(1);
        const unbatchedAftermath=sample();
        for(const unit of units)for(const part of unit.hpGroup.children)part.layers.set(0);
        state.camera.layers.disable(1);
        state.renderer.renderBufferDirect=renderBufferDirect;
        const hitPulses=gameTestAPI.HitPulseManager.active.length;
        gameTestAPI.HitPulseManager.update(.71);
        const expired=gameTestAPI.HitPulseManager.active.length===0&&
            gameTestAPI.HitPulseManager.meshes.every(mesh=>mesh.count===0&&!mesh.visible);
        // A group hit inside a settlement starts many passive healing effects
        // on the same simulation tick. Check the very first render of that burst.
        const hut=gameTestAPI.createBuilding('hut',x+4,z,1,false,true);
        hut.underConstruction=false;
        gameTestAPI.BuildingSpatialHash.markDirty();
        gameTestAPI.BuildingSpatialHash.update();
        const beforeHealing=sample();
        const healingFx=gameTestAPI.HealingFx;
        for(const unit of units){
            unit.updateTicker=19;
            unit.healTimer=.49;
            unit.update(1/60);
        }
        healingFx.update(1/60);
        fx.update(1/60);
        const healing=sample();
        const healingCount=healingFx.activeCount,healingMesh=healingFx.prepareRoot();
        const crosses=healingMesh.count/2;
        healingFx.update(1.5);
        const healingExpired=healingFx.activeCount===0&&!healingMesh.visible;
        return {loadedChunks,startupPulses,units:units.length,hits,thrown,peakBurnEmissions,burnEmissions,
            impactMs,before,launch,flight,after,aftermath,unbatchedAftermath,extraCalls:after.calls-before.calls,
            extraParticles:after.particles-before.particles,
            hitPulses,expired,beforeHealing,healing,healingCount,crosses,healingExpired};
    });
    if(report.hits!==report.units || report.thrown!==report.units || report.peakBurnEmissions>24 ||
        report.burnEmissions<report.units || report.hitPulses!==0 || !report.expired || report.extraCalls>30 ||
        report.extraParticles>24 || report.after.programs>report.before.programs+2 ||
        report.aftermath.healthBarParts<report.units*2 || report.aftermath.healthBarCalls>2 ||
        report.aftermath.healthBarParts!==report.unbatchedAftermath.healthBarParts ||
        report.aftermath.programs>report.after.programs+2 ||
        report.healingCount<12 || report.crosses!==report.healingCount || !report.healingExpired ||
        report.healing.pointLights!==report.beforeHealing.pointLights ||
        report.healing.programs>report.beforeHealing.programs || report.healing.calls>report.beforeHealing.calls+4) {
        console.error(`::error title=Group impact rendering budget::${JSON.stringify(report)}`);
        throw new Error(`Group impact regressed: ${JSON.stringify(report)}`);
    }
    console.log(JSON.stringify(report));
} finally {
    await browser.close();
}
