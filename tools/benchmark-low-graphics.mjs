import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {seedWorld,startManualSimulation} from '../tests/fixtures/seed-world.mjs';

const customPlaywright=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=customPlaywright
    ? await import(pathToFileURL(customPlaywright).href)
    : createRequire(import.meta.url)('playwright');
const software=process.argv.includes('--software');
const live=process.argv.includes('--live');
const images=process.argv.find(arg=>arg.startsWith('--images='))?.slice(9);
const browser=await chromium.launch({
    headless:true,...(process.platform==='win32'?{channel:'chrome'}:{}),
    args:software?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]
});
try{
    const page=await browser.newPage({viewport:{width:480,height:852},deviceScaleFactor:2});
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{
        if(message.type()==='error'&&/THREE\.WebGLProgram|INVALID_OPERATION/.test(message.text()))errors.push(message.text());
    });
    await seedWorld(page,98217);
    await page.addInitScript(()=>localStorage.setItem('graphics-quality','low'));
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady&&state.shaman,null,{timeout:90000});
    if(!live)await page.evaluate(()=>{
        const schedule=requestAnimationFrame;
        window.stopTestPresentation=()=>{
            window.requestAnimationFrame=callback=>callback.name==='animate'?0:schedule(callback);
        };
    });
    if(!live)await startManualSimulation(page,98217);
    const result=await page.evaluate(async ({live,capture})=>{
        closeHelp();closeStoryOverlay();
        state.isPaused=true;
        window.enemyAIs=[];
        const {renderer,shaman}=state,gl=renderer.getContext();
        // Use the preset's initial resolution for every sample. The live
        // loop still runs normally, including its simulation and streaming.
        renderer.setPixelRatio=()=>{};
        const {BattleWork,SpatialHash,BuildingSpatialHash,FireballFxManager}=gameTestAPI;
        const {measureLandscapeDraws}=await import('./art/landscape-draws.js');
        const startPosition=shaman.mesh.position.clone(),origin=shaman.mesh.position.clone();
        const lots=Array.from({length:12},(_,i)=>[(i%6-2.5)*6,-20-Math.floor(i/6)*8]);
        const checks=[...lots,[-6,0],[6,0],[-6,-10],[6,-10],[-6,-18],[6,-18],[0,0],[0,-8],[0,-18]];
        const water=CONFIG.TERRAIN.VISUAL_WATER_LEVEL;
        let bestScore=Infinity;
        for(let dx=-80;dx<=80;dx+=4)for(let dz=-80;dz<=80;dz+=4){
            const x=startPosition.x+dx,z=startPosition.z+dz;
            const heights=checks.map(([px,pz])=>getHeight(x+px,z+pz));
            const minimum=Math.min(...heights),maximum=Math.max(...heights);
            if(minimum<water+.8)continue;
            const score=Math.hypot(dx,dz)*.05+(maximum-minimum)*.9+(minimum-water)*.35;
            if(score<bestScore){bestScore=score;origin.set(x,getHeight(x,z),z);}
        }
        if(!Number.isFinite(bestScore))throw Error('No dry site for the settlement fixture');
        state.cameraLookAt.copy(origin);updateCameraPosition();
        const passes=(CONFIG.TERRAIN.RENDER_DISTANCE*2+1)**2+1;
        for(let i=0;i<passes;i++)gameTestAPI.updateChunks();
        const units=[];
        for(let i=0;i<36;i++){
            const type=i%5===0?'firewarrior':i%5===1?'preacher':'warrior';
            const unit=new Humanoid(i%2,type,origin.x+(i%6-2.5)*1.5,origin.z-9-Math.floor(i/6)*1.3);
            unit.hp=unit.maxHp=100000;unit.nextTargetCheck=Infinity;
            units.push(unit);state.units.push(unit);
        }
        for(const [i,[x,z]] of lots.entries()){
            const building=gameTestAPI.createBuilding(['tower','fire','warrior','temple'][i%4],
                origin.x+x,origin.z+z,i%2,false,true);
            building.underConstruction=false;building.visualMesh.scale.y=1;
        }
        await Art.blender.loadAll();
        state.matchSettings.peaceTimeMinutes=0;
        const quantile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
        const results=[],samplePixel=new Uint8Array(4);
        for(const scene of ['overview','first-person','battle']){
            state.selectedUnits=scene==='first-person'?[shaman]:[];
            state.isFPV=scene==='first-person';
            state.camera=state.isFPV?state.perspectiveCamera:state.orthoCamera;
            state.viewScale=scene==='overview'?70:35;
            gameTestAPI.updateCameraZoom();
            state.fpvYaw=0;state.fpvPitch=-.10;
            shaman.placeOnGround(origin.x,origin.z);
            for(let i=0;i<units.length;i++){
                units[i].state=scene==='battle'?'combat':'idle';
                units[i].attackTarget=scene==='battle'?units[i^1]:null;
            }
            const frames=[],cpu=[],triangles=[],calls=[];
            const updateView=step=>{
                const x=Math.sin(step*.055)*6,z=scene==='first-person'?-step*.09:-17;
                state.cameraLookAt.set(origin.x+x,origin.y,origin.z+z);
                if(state.isFPV){shaman.placeOnGround(origin.x+x,origin.z+z);state.fpvYaw=Math.sin(step*.045)*.62;}
                updateCameraPosition();
            };
            if(live){
                updateView(0);
                const nextFrame=()=>new Promise(resolve=>requestAnimationFrame(()=>resolve(performance.now())));
                for(let i=0;i<18;i++)await nextFrame();
                state.isPaused=false;
                const start=await nextFrame();
                let previous=start;
                while(previous-start<7000){
                    updateView((previous-start)*.006);
                    const now=await nextFrame();
                    frames.push(now-previous);previous=now;
                    triangles.push(renderer.info.render.triangles);calls.push(renderer.info.render.calls);
                }
                state.isPaused=true;
            }else for(let frame=-12;frame<36;frame++){
                const time=performance.now(),step=Math.max(0,frame);
                updateView(step);
                if(scene==='battle'){
                    const dt=1/60;
                    BattleWork.begin();SpatialHash.update();BuildingSpatialHash.update();
                    state.physicsWorld.timestep=dt;state.physicsWorld.step();
                    for(const unit of units)unit.update(dt);
                    for(let i=state.projectiles.length-1;i>=0;i--)if(!state.projectiles[i].update(dt))state.projectiles.splice(i,1);
                    for(let i=state.particles.length-1;i>=0;i--)if(!state.particles[i].update(dt))state.particles.splice(i,1);
                    FireballFxManager.update(dt);BattleWork.end();
                }
                renderer.render(state.scene,state.camera);
                const submitted=performance.now();
                gl.readPixels(gl.drawingBufferWidth>>1,gl.drawingBufferHeight>>1,1,1,gl.RGBA,gl.UNSIGNED_BYTE,samplePixel);
                if(frame>=0){
                    cpu.push(submitted-time);frames.push(performance.now()-time);
                    triangles.push(renderer.info.render.triangles);calls.push(renderer.info.render.calls);
                }
                if(frame%6===0)await new Promise(resolve=>setTimeout(resolve,0));
            }
            const landscape=measureLandscapeDraws(renderer,state.scene,state.camera).main;
            const total=frames.reduce((sum,value)=>sum+value,0);
            results.push({scene,fps:+(1000*frames.length/total).toFixed(2),medianMs:quantile(frames,.5),p95Ms:quantile(frames,.95),
                cpuMedianMs:cpu.length?quantile(cpu,.5):null,triangles:quantile(triangles,.5),calls:quantile(calls,.5),
                width:gl.drawingBufferWidth,height:gl.drawingBufferHeight,landscape,
                image:capture?renderer.domElement.toDataURL():null});
        }
        const debug=gl.getExtension('WEBGL_debug_renderer_info');
        return {gpu:gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL||gl.RENDERER),width:gl.drawingBufferWidth,
            height:gl.drawingBufferHeight,units:state.units.length,buildings:state.buildings.length,results};
    },{live,capture:!!images});
    if(errors.length)throw Error(errors.join('\n'));
    for(const scene of result.results){
        if(scene.image)await writeFile(images+'-'+scene.scene+'.png',Buffer.from(scene.image.split(',')[1],'base64'));
        delete scene.image;
    }
    console.log(JSON.stringify(result));
}finally{await browser.close();}
