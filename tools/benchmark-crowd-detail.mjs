import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {seedWorld,startManualSimulation} from '../tests/fixtures/seed-world.mjs';

const path=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=path?await import(pathToFileURL(path).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
    const page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await seedWorld(page,98217);
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
    await startManualSimulation(page,98217);
    const report=await page.evaluate(()=>{
        const {CharacterBatches:batch,Locomotion}=gameTestAPI;
        const center=state.shaman.mesh.position.clone(),renderer=state.renderer,gl=renderer.getContext();
        const roles=['warrior','firewarrior','preacher','wild'];
        for(const unit of state.units)unit.mesh.visible=false;
        state.selectedUnits=[];state.viewScale=45;
        state.cameraLookAt.copy(center);gameTestAPI.updateCameraZoom();updateCameraPosition();
        renderer.setPixelRatio(1);
        const units=Array.from({length:60},(_,i)=>new Humanoid(i%2,roles[i%roles.length],
            center.x+(i%10-4.5)*1.8,center.z+(Math.floor(i/10)-2.5)*1.8));
        const p95=times=>times.sort((a,b)=>a-b)[Math.ceil(times.length*.95)-1];
        function measure(count,combat,optimized){
            batch.crowdDetail=optimized;
            state.units=units.slice(0,count);
            units.forEach((unit,i)=>{
                unit.mesh.visible=i<count;
                unit.state=combat&&i%2===0?'combat':'idle';
                unit.isGrounded=true;unit.gait=null;unit.updateTicker+=2;
            });
            renderer.render(state.scene,state.camera);gl.finish();
            const pose=[],render=[],frame=[];
            let samples=0,combatSamples=0;
            const dt=1/60;
            for(let i=0;i<30;i++){
                const start=performance.now();
                for(const unit of state.units){
                    unit.updateTicker++;unit.animTime+=dt;
                    const before=unit.gait?.idleTime;
                    if(unit.state==='combat')Locomotion.animateCombat(unit,(i%20)/20);
                    unit.animateCrowdPose(dt);
                    if(unit.gait?.idleTime!==before){samples++;if(unit.state==='combat')combatSamples++;}
                }
                const draw=performance.now();
                renderer.render(state.scene,state.camera);gl.finish();
                const end=performance.now();
                if(i>=6){pose.push(draw-start);render.push(end-draw);frame.push(end-start);}
            }
            return {poseP95:p95(pose),renderP95:p95(render),frameP95:p95(frame),samples,combatSamples,
                calls:renderer.info.render.calls,triangles:renderer.info.render.triangles,
                visible:batch.stats.visibleUnits,simplified:batch.stats.simplifiedUnits,contactShadows:batch.stats.farShadows};
        }
        const result=[];
        for(const count of [15,30,60])for(const combat of [false,true]){
            const baseline=measure(count,combat,false),optimized=measure(count,combat,true);
            if(batch.stats.fallback||optimized.visible!==count||!optimized.simplified||
               optimized.samples>=baseline.samples||optimized.combatSamples!==baseline.combatSamples||
               optimized.triangles>=baseline.triangles)
                throw Error('Crowd detail did not reduce work '+JSON.stringify({count,combat,baseline,optimized}));
            result.push({count,combat,baseline,optimized});
        }
        const probe=state.units[0];state.isFPV=true;
        renderer.render(state.scene,state.camera);
        if(batch.stats.simplifiedUnits||batch.reducePose(probe))throw Error('First-person detail was reduced');
        return result;
    });
    if(errors.length)throw Error(errors.join('\n'));
    console.log(JSON.stringify(report));
}finally{await browser.close();}
