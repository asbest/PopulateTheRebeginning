import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{}),
    ...(process.argv.includes('--software-gl')?{args:['--use-gl=angle','--use-angle=swiftshader']}:{})});
try {
    const page=await browser.newPage({viewport:{width:1000,height:650}}),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.addInitScript(()=>localStorage.setItem('graphics-quality','high'));
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
    const result=await page.evaluate(async()=>{
        state.isPaused=true;
        state.matchSettings.peaceTimeMinutes=0;
        window.enemyAIs=[];
        // Hold the terrain and model set steady while the camera reveals the army.
        window.requestAnimationFrame=()=>0;
        await Promise.all(state.buildings.map(b=>Art.blender.ensure('building/'+b.type+'/root')));
        const {CharacterBatches:batch,BattleWork,SpatialHash}=gameTestAPI;
        const renderer=state.renderer,gl=renderer.getContext(),center=state.shaman.mesh.position.clone();
        renderer.setPixelRatio(1);
        const units=[],roles=['wild','warrior','firewarrior','preacher','spy','shaman'];
        for(let i=0;i<72;i++){
            const unit=new Humanoid(1,roles[i%roles.length],center.x+12+(i%12)*2.7,center.z+(Math.floor(i/12)-2.5)*2);
            unit.nextTargetCheck=0;
            state.units.push(unit);units.push(unit);
        }
        const focus=offset=>{
            state.cameraLookAt.copy(center);state.cameraLookAt.x+=offset;
            updateCameraPosition();state.camera.updateMatrixWorld(true);
        };
        let buffers=0,uploadBytes=0,shadowParts=0,visibleParts=0;
        const bufferData=gl.bufferData.bind(gl),bufferSubData=gl.bufferSubData.bind(gl),draw=renderer.renderBufferDirect;
        gl.bufferData=(...args)=>{buffers++;return bufferData(...args);};
        gl.bufferSubData=(...args)=>{
            uploadBytes+=args[4]===undefined?args[2].byteLength:args[4]*args[2].BYTES_PER_ELEMENT;
            return bufferSubData(...args);
        };
        renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
            if(object.name==='Animated character batch'){
                if(scene)visibleParts+=object.count;
                else shadowParts+=object.count;
            }
            return draw.call(this,camera,scene,geometry,material,object,group);
        };
        const render=()=>{
            buffers=uploadBytes=shadowParts=visibleParts=0;
            const keys=new Set(renderer.info.programs.map(p=>p.cacheKey)),start=performance.now();
            renderer.render(state.scene,state.camera);gl.finish();
            return {ms:performance.now()-start,buffers,uploadBytes,shadowParts,visibleParts,
                calls:renderer.info.render.calls,contactShadows:batch.stats.farShadows,
                newPrograms:renderer.info.programs.filter(p=>!keys.has(p.cacheKey)).length};
        };
        focus(-75);render();const away=render();
        focus(0);const first=render(),steady=render();
        focus(-75);render();
        focus(0);const repeat=render();
        batch.fullShadows=true;render();const full=render();
        batch.fullShadows=false;
        if(first.visibleParts<2500||!first.contactShadows||!first.shadowParts||first.shadowParts>full.shadowParts*.8||
            steady.calls>full.calls*1.04||batch.matrixError()>.0001||batch.stats.fallback)
            throw new Error('Crowd shadow savings or full-rate character batching regressed: '+JSON.stringify({first,steady,full}));
        // Force simultaneous target checks, then measure the existing combat budget.
        SpatialHash.update();state.clock.getElapsedTime=()=>60;state.clock.elapsedTime=60;
        let searchMs=0;
        for(const unit of units){
            const findTarget=unit.findTarget;
            unit.findTarget=function(){
                const start=performance.now();
                try{return findTarget.call(this);}
                finally{searchMs+=performance.now()-start;}
            };
        }
        const start=performance.now();
        BattleWork.begin();
        try{for(const unit of units)unit.update(1/60);}
        finally{BattleWork.end();}
        const targetSearch={updateMs:performance.now()-start,searchMs,...BattleWork.stats};
        if(targetSearch.searches!==8||targetSearch.deferredSearches<=0)
            throw new Error('Crowd target searches escaped their frame budget: '+JSON.stringify(targetSearch));
        return {away,first,steady,repeat,full,targetSearch};
    });
    if(errors.length)throw new Error(errors.join('\n'));
    console.log(JSON.stringify(result));
}finally{await browser.close();}
