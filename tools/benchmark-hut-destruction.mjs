import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const playwrightPath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=playwrightPath
    ? await import(pathToFileURL(playwrightPath).href)
    : createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    for(const profile of [
        {name:'desktop',options:{viewport:{width:1280,height:800}}},
        {name:'Android',options:{viewport:{width:412,height:915},deviceScaleFactor:2,
            isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/124.0 Mobile Safari/537.36'}}
    ]) {
    const page=await browser.newPage(profile.options);
    if(profile.name==='Android')await page.addInitScript(()=>localStorage.setItem('graphics-quality','low'));
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman&&state.renderer,null,{timeout:90000});
    const report=await page.evaluate(()=>{
        closeHelp();closeStoryOverlay();state.isPaused=true;
        state.renderer.setPixelRatio(1);
        const building=state.buildings.filter(b=>b.type==='hut'&&!b.dead)
            .sort((a,b)=>a.mesh.position.distanceToSquared(state.camera.position)-
                b.mesh.position.distanceToSquared(state.camera.position))[0];
        if(!building)throw new Error('No hut to destroy');
        const p=building.mesh.position;
        state.camera.position.set(p.x+11,p.y+13,p.z+16);
        state.camera.lookAt(p.x,p.y+1.5,p.z);
        state.selectedBuilding=building;
        building.setRallyPoint(p.x+6,p.z+6);
        const rallyLine=building.rallyLine;
        let rallyLineDisposed=false;
        rallyLine.geometry.addEventListener('dispose',()=>{rallyLineDisposed=true;});
        const render=()=>{
            const t=performance.now();
            state.renderer.render(state.scene,state.camera);
            state.renderer.getContext().finish();
            return {ms:performance.now()-t,calls:state.renderer.info.render.calls,
                programs:state.renderer.info.programs.length,particles:state.particles.length};
        };
        for(let i=0;i<3;i++)render();
        const before=render();
        const previousParticles=new Set(state.particles);
        const t=performance.now();building.takeDamage(building.maxHp+1);
        const damageMs=performance.now()-t;
        gameTestAPI.HitPulseManager.update(0);
        const first=render();
        const second=render();
        const afterRepeat=state.particles.length;
        const pulseCount=gameTestAPI.HitPulseManager.active.length;
        building.takeDamage(5);
        building.destroy();
        building.update(1/60);
        const repeatParticles=state.particles.length;
        const repeatPulses=gameTestAPI.HitPulseManager.active.length;
        const collapseLights=state.particles.filter(effect=>!previousParticles.has(effect)&&
            effect.mesh?.children?.some(c=>c.isPointLight)).length;
        state.particles=state.particles.filter(p=>p.update(2)===true);
        const settled=render();
        const peer=gameTestAPI.createBuilding('hut',p.x+12,p.z+12,building.faction,false,true);
        const detailsShared=!!peer&&
            peer.constructionRig.children[0].geometry===building.constructionRig.children[0].geometry&&
            peer.constructionRig.children[0].material===building.constructionRig.children[0].material&&
            peer.damageVisual.children[0].geometry===building.damageVisual.children[0].geometry;
        peer.hp=1;
        const playSound=gameTestAPI.SoundManager.playSound;
        let explosionSounds=0;
        gameTestAPI.SoundManager.playSound=name=>{
            if(name==='explosion')explosionSounds++;
            return Promise.resolve(true);
        };
        const fireballStart=peer.mesh.position.clone().add(new THREE.Vector3(-5,2,0));
        const fireballTarget=peer.mesh.position.clone();
        const fireball=new gameTestAPI.Fireball(fireballStart,fireballTarget,1-peer.faction);
        fireball.mesh.position.copy(fireballTarget);
        const beforeFireball=new Set(state.particles);
        fireball.explode();
        gameTestAPI.SoundManager.playSound=playSound;
        const fireballLights=state.particles.filter(effect=>!beforeFireball.has(effect)&&
            effect.mesh?.children?.some(c=>c.isPointLight)).length;
        return {before,damageMs,first,second,afterRepeat,repeatParticles,pulseCount,
            repeatPulses,collapseLights,settled,dead:building.dead,
            rallyLineAttached:!!rallyLine.parent,rallyLineDisposed,
            selectedBuildingCleared:state.selectedBuilding===null,detailsShared,
            fireballHutDestroyed:peer.dead,explosionSounds,fireballLights};
    });
    if(!report.dead||report.repeatParticles!==report.afterRepeat||
        report.repeatPulses!==report.pulseCount||report.collapseLights!==0||
        report.rallyLineAttached||!report.rallyLineDisposed||!report.selectedBuildingCleared||
        !report.detailsShared||!report.fireballHutDestroyed||
        report.explosionSounds!==1||report.fireballLights>1||
        report.first.calls>report.before.calls+30||report.first.programs>report.before.programs+1)
        throw new Error(`${profile.name} hut destruction regressed: ${JSON.stringify(report)}`);
    console.log(JSON.stringify({profile:profile.name,...report}));
    await page.close();
    }
} finally {await browser.close();}
