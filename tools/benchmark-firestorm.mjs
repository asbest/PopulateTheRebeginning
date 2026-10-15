import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath
    ? await import(pathToFileURL(modulePath).href)
    : createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1440,height:900}});
    const tier=process.argv.find(arg=>arg.startsWith('--tier='))?.slice(7)||'high';
    await page.addInitScript(value=>localStorage.setItem('graphics-quality',value),tier);
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman&&state.renderer,null,{timeout:90000});
    if(process.argv.includes('--live')){
        const live=await page.evaluate(async ({noCast,settle})=>{
            closeHelp();closeStoryOverlay();state.isPaused=false;
            if(settle)await new Promise(resolve=>setTimeout(resolve,1000));
            const p=state.shaman.mesh.position;state.mana=1000;
            if(!noCast)gameTestAPI.performAction(p.x+3,p.z,'firestorm');
            const frames=[],events=[],end=performance.now()+12000;
            let last=performance.now(),peakParticles=0,peakLights=0,peakCalls=0,
                previousPrograms=state.renderer.info.programs.length;
            while(performance.now()<end){
                await new Promise(resolve=>requestAnimationFrame(resolve));
                const now=performance.now(),frame=now-last;frames.push(frame);last=now;
                peakParticles=Math.max(peakParticles,state.particles.length);
                peakCalls=Math.max(peakCalls,state.renderer.info.render.calls);
                let lights=0;state.scene.traverse(object=>{if(object.isPointLight)lights++;});
                peakLights=Math.max(peakLights,lights);
                const programs=state.renderer.info.programs.length;
                if(frame>80||programs!==previousPrograms)events.push({at:Math.round(now-(end-12000)),
                    frame,programs,lights,projectiles:state.projectiles.length,particles:state.particles.length});
                previousPrograms=programs;
            }
            frames.sort((a,b)=>a-b);
            return {frames:frames.length,median:frames[Math.floor(frames.length*.5)],p95:frames[Math.floor(frames.length*.95)],
                max:frames.at(-1),over100ms:frames.filter(frame=>frame>100).length,programs:state.renderer.info.programs.length,
                peakParticles,peakLights,peakCalls,events};
        },{noCast:process.argv.includes('--no-cast'),settle:process.argv.includes('--settle')});
        console.log(JSON.stringify(live));
    } else {
    const result=await page.evaluate(()=>{
        closeHelp();closeStoryOverlay();state.isPaused=true;window.enemyAIs=[];
        for(const particle of state.particles)state.scene.remove(particle.mesh);
        state.particles.length=0;
        const renderer=state.renderer;
        const render=label=>{
            const before=performance.now();renderer.render(state.scene,state.camera);renderer.getContext().finish();
            let lights=0;state.scene.traverse(object=>{if(object.isPointLight)lights++;});
            return {label,ms:performance.now()-before,programs:renderer.info.programs.length,lights,
                projectiles:state.projectiles.length,particles:state.particles.length};
        };
        const report=[render('before')];
        const p=state.shaman.mesh.position;
        state.mana=1000;
        gameTestAPI.performAction(p.x+3,p.z,'firestorm');
        report.push(render('cast'));
        const storm=state.activeEffects.at(-1);
        for(let i=0;i<4;i++){
            storm.update(1.01);
            report.push(render(`fall-${i+1}`));
            const projectile=state.projectiles.shift();
            projectile.update(projectile.duration);
            report.push(render(`impact-${i+1}`));
            for(let j=state.particles.length-1;j>=0;j--){
                if(!state.particles[j].update(.6))state.particles.splice(j,1);
            }
            report.push(render(`fade-${i+1}`));
        }
        return report;
    });
    const firstPrograms=result[0].programs;
    if(result.some(frame=>frame.programs!==firstPrograms))
        throw new Error('Firestorm compiled shaders during gameplay: '+JSON.stringify(result));
    console.log(JSON.stringify(result));
    }
} finally {await browser.close();}
