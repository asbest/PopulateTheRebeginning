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
const tier=process.argv.find(arg=>arg.startsWith('--tier='))?.slice(7)||'low';
const sceneFilter=process.argv.find(arg=>arg.startsWith('--scene='))?.slice(8);
const scenes=['overview','first-person','battle'];
if(!['low','medium','high'].includes(tier))throw Error('Use --tier=low, --tier=medium or --tier=high');
if(sceneFilter&&!scenes.includes(sceneFilter))throw Error('Unknown scene: '+sceneFilter);
const browser=await chromium.launch({
    headless:true,...(process.platform==='win32'?{channel:'chrome'}:{}),
    args:software?['--use-angle=swiftshader','--enable-unsafe-swiftshader']:[]
});
try{
    const viewport=tier==='high'?{width:410,height:843}:{width:480,height:852};
    const page=await browser.newPage({viewport,deviceScaleFactor:2});
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('console',message=>{
        if(message.type()==='error'&&/THREE\.WebGLProgram|INVALID_OPERATION/.test(message.text()))errors.push(message.text());
    });
    await seedWorld(page,98217);
    await page.addInitScript(tier=>localStorage.setItem('graphics-quality',tier),tier);
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady&&state.shaman,null,{timeout:90000});
    if(!live)await page.evaluate(()=>{
        const schedule=requestAnimationFrame;
        window.stopTestPresentation=()=>{
            window.requestAnimationFrame=callback=>callback.name==='animate'?0:schedule(callback);
        };
    });
    if(!live)await startManualSimulation(page,98217);
    const result=await page.evaluate(async ({live,capture,scenes})=>{
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
        const target=new THREE.Vector3(origin.x,getHeight(origin.x,origin.z-15)+1.5,origin.z-15);
        let walkingStart=null,walkingScore=-Infinity;
        for(const radius of [23,29,35])for(let angle=0;angle<2*Math.PI;angle+=Math.PI/8){
            const x=target.x+Math.sin(angle)*radius,z=target.z+Math.cos(angle)*radius;
            const sideX=Math.cos(angle),sideZ=-Math.sin(angle);
            let clearance=Infinity;
            for(const side of [-5,0,5]){
                const px=x+sideX*side,pz=z+sideZ*side,ground=getHeight(px,pz);
                if(ground<water+.4){clearance=-Infinity;break;}
                const eye=ground+2.1;
                for(const t of [.06,.12,.2,.3,.45,.6,.8]){
                    const height=getHeight(px+(target.x-px)*t,pz+(target.z-pz)*t);
                    clearance=Math.min(clearance,eye+(target.y-eye)*t-height);
                }
            }
            const score=clearance-radius*.015;
            if(score>walkingScore){walkingStart={x,z,sideX,sideZ};walkingScore=score;}
        }
        if(!walkingStart)throw Error('No dry first-person route facing the settlement');
        state.matchSettings.peaceTimeMinutes=0;
        const quantile=(values,p)=>values.slice().sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
        const results=[],samplePixel=new Uint8Array(4);
        for(const scene of scenes){
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
                if(state.isFPV){
                    const lateral=Math.sin(step*.055)*5;
                    const x=walkingStart.x+lateral*walkingStart.sideX,z=walkingStart.z+lateral*walkingStart.sideZ;
                    shaman.placeOnGround(x,z);
                    state.fpvYaw=Math.atan2(x-target.x,z-target.z);
                    state.fpvPitch=Math.atan2(target.y-shaman.mesh.position.y-2.1,Math.hypot(x-target.x,z-target.z));
                }else state.cameraLookAt.set(origin.x+Math.sin(step*.055)*6,origin.y,origin.z-17);
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
        return {tier:state.graphicsQuality.tier,gpu:gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL||gl.RENDERER),width:gl.drawingBufferWidth,
            height:gl.drawingBufferHeight,units:state.units.length,buildings:state.buildings.length,results};
    },{live,capture:!!images,scenes:sceneFilter?[sceneFilter]:scenes});
    if(errors.length)throw Error(errors.join('\n'));
    for(const scene of result.results){
        if(scene.image)await writeFile(images+'-'+scene.scene+'.png',Buffer.from(scene.image.split(',')[1],'base64'));
        delete scene.image;
    }
    console.log(JSON.stringify(result));
}finally{await browser.close();}
