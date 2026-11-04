import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{}),
    ...(process.argv.includes('--software-gl')?{args:['--use-gl=angle','--use-angle=swiftshader']}:{})});
try {
    for(const tier of ['low','high']){
        const page=await browser.newPage({viewport:{width:1000,height:650}});
        const errors=[];
        page.on('pageerror',error=>errors.push(String(error)));
        await page.addInitScript(value=>localStorage.setItem('graphics-quality',value),tier);
        await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
        await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
        const report=await page.evaluate(async()=>{
            state.isPaused=true;
            state.matchSettings.peaceTimeMinutes=0;
            // Keep incidental startup lights and model streaming out of the first-cast measurement.
            window.requestAnimationFrame=()=>0;
            await Promise.all(state.buildings.map(b=>Art.blender.ensure('building/'+b.type+'/root')));
            for(let i=state.particles.length-1;i>=0;i--){
                if(!state.particles[i].update(10))state.particles.splice(i,1);
            }
            const renderer=state.renderer,caster=state.shaman,{x,z}=caster.mesh.position;
            const render=()=>{
                const start=performance.now();
                renderer.render(state.scene,state.camera);
                renderer.getContext().finish();
                return performance.now()-start;
            };
            const results=[];
            for(const [spell,type] of [['swamp','Swamp'],['tornado','Tornado'],['swarm','Swarm'],['volcano','Volcano']]){
                const idleMs=render();
                const keys=new Set(renderer.info.programs.map(p=>p.cacheKey));
                const start=performance.now();
                gameTestAPI.executeSpell(spell,x+2,z,caster);
                const castMs=performance.now()-start;
                const effect=state.activeEffects.pop();
                if(effect?.constructor.name!==type)throw new Error(`Missing ${spell} visual effect`);
                const firstMs=render();
                const newPrograms=renderer.info.programs.filter(p=>!keys.has(p.cacheKey)).length;
                results.push({spell,idleMs,castMs,firstMs,repeatMs:render(),newPrograms});
                effect.dispose();
            }
            return results;
        });
        console.log(JSON.stringify({tier,report,errors}));
        if(errors.length||report.some(result=>result.newPrograms))
            throw new Error(`First cast compiled new spell shaders on ${tier}`);
        await page.close();
    }
}finally{await browser.close();}
