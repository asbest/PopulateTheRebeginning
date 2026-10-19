import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const arg=process.argv.find(value=>value.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
    const result=await page.evaluate(async()=>{
        state.isPaused=true;
        const worker=gameTestAPI.PathWorker;
        const routes=[];
        const check=async(start,end,avoidWater=false)=>{
            const expected=Pathfinder.findPath(start,end,false,1.5,avoidWater,false);
            const actual=await new Promise((resolve,reject)=>{
                const timeout=setTimeout(()=>reject(new Error('Worker path timed out')),12000);
                const tick=setInterval(()=>worker.update(),20);
                const accepted=worker.request(start,end,false,avoidWater,false,(path,fallback)=>{
                    clearTimeout(timeout);clearInterval(tick);resolve({path,fallback});
                });
                if(!accepted){clearTimeout(timeout);clearInterval(tick);reject(new Error('Worker unavailable'));}
            });
            const reference=expected?.map(p=>[p.x,p.z])??null;
            routes.push({equal:JSON.stringify(reference)===JSON.stringify(actual.path),
                fallback:actual.fallback,length:actual.path?.length??null});
        };
        const player=state.shaman.mesh.position;
        await check(player,gameTestAPI.findNearestLand(player.x+12,player.z+5));
        await check(player,gameTestAPI.findNearestLand(player.x-25,player.z+14));
        const enemy=window.enemyAIs[0].myShaman.mesh.position;
        await check(enemy,gameTestAPI.findNearestLand(enemy.x+10,enemy.z+4),true);
        await check(enemy,gameTestAPI.findNearestLand(enemy.x-18,enemy.z-12),true);
        state.waterState='frozen';
        await check(enemy,gameTestAPI.findNearestLand(enemy.x+15,enemy.z+9),true);
        state.waterState='liquid';
        gameTestAPI.modifyTerrain(player.x+5,player.z+2,2,.8);
        await check(player,gameTestAPI.findNearestLand(player.x+12,player.z+5));
        const ai=window.enemyAIs[0],originalLength=state.units.length;
        const probe={id:'worker-ai-probe',faction:ai.faction,type:'airship',state:'idle',aiRole:null,
            mesh:{position:enemy.clone()},calls:[],
            goto(x,z,path){this.calls.push({x,z,path});this.finalDest={x,z};this.state='move';}};
        state.units.push(probe);
        while(state.units.length<32)state.units.push({state:'dead'});
        const first={x:enemy.x+7,z:enemy.z+3},latest={x:enemy.x+11,z:enemy.z+5};
        ai.moveUnit(probe,first,'guard');ai.flushPathQueue();
        ai.moveUnit(probe,latest,'guard');ai.flushPathQueue();
        const applied=await new Promise((resolve,reject)=>{
            const started=performance.now();
            const timer=setInterval(()=>{
                worker.update();
                if(probe.calls.length){clearInterval(timer);resolve(probe.calls.slice());}
                else if(performance.now()-started>12000){clearInterval(timer);reject(new Error('AI worker order timed out'));}
            },20);
        });
        const staleIgnored=applied.length===1&&applied[0].x===latest.x&&applied[0].z===latest.z&&
            Array.isArray(applied[0].path);
        const realStart=gameTestAPI.findNearestLand(enemy.x+2,enemy.z+2);
        const real=new Humanoid(ai.faction,'wild',realStart.x,realStart.z);
        state.units.push(real);
        const realGoal=gameTestAPI.findNearestLand(realStart.x+12,realStart.z+6);
        ai.moveUnit(real,realGoal,'builder');ai.flushPathQueue();
        const realMoved=await new Promise((resolve,reject)=>{
            const started=performance.now();
            const timer=setInterval(()=>{
                worker.update();
                if(real.state==='move'){clearInterval(timer);resolve(real.path.length>0&&real.target!==null);}
                else if(performance.now()-started>12000){clearInterval(timer);reject(new Error('Real AI worker path timed out'));}
            },20);
        });
        probe.state='idle';probe.finalDest=null;
        const fallbackGoal={x:enemy.x+14,z:enemy.z+6};
        ai.moveUnit(probe,fallbackGoal,'guard');ai.flushPathQueue();
        worker.disable();
        worker.update();
        const fallbackApplied=probe.calls.length===2&&probe.calls[1].x===fallbackGoal.x&&
            probe.calls[1].path===undefined;
        state.units.length=originalLength;ai.pathQueue.clear();
        return {routes,disabled:worker.disabled,staleIgnored,realMoved,fallbackApplied};
    });
    if(errors.length||result.routes.some(route=>!route.equal||route.fallback)||!result.disabled||
        !result.staleIgnored||!result.realMoved||!result.fallbackApplied)
        throw new Error(JSON.stringify({result,errors}));
    console.log('PASS worker matches synchronous terrain paths and updates after terrain edits',result);
} finally {
    await browser.close();
}
