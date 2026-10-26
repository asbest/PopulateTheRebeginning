import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const arg=process.argv.find(value=>value.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage();
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.gameTestAPI&&window.enemyAIs?.length,null,{timeout:90000});
    const result=await page.evaluate(()=>{
        state.isPaused=true;
        // Exercise the synchronous fallback when a browser cannot run workers.
        gameTestAPI.PathWorker.disable();
        const ai=window.enemyAIs[0],originalLength=state.units.length;
        const p=ai.myShaman.mesh.position;
        const probes=Array.from({length:10},(_,i)=>({
            id:`path-probe-${i}`,faction:ai.faction,type:'airship',state:'idle',aiRole:null,
            mesh:{position:new THREE.Vector3(p.x+i*.01,p.y,p.z)},calls:0,
            goto(x,z){this.calls++;this.finalDest={x,z};this.state='move';}
        }));
        state.units.push(...probes);
        while(state.units.length<32) state.units.push({state:'dead'});
        try {
            probes.forEach((u,i)=>ai.moveUnit(u,{x:p.x+10+i,z:p.z},'guard'));
            const queued=ai.pathQueue.size,initialCalls=probes.reduce((sum,u)=>sum+u.calls,0);
            ai.flushPathQueue();const firstFrameCalls=probes.reduce((sum,u)=>sum+u.calls,0);
            ai.flushPathQueue();const secondFrameCalls=probes.reduce((sum,u)=>sum+u.calls,0);
            while(ai.pathQueue.size) ai.flushPathQueue();
            const allCalls=probes.reduce((sum,u)=>sum+u.calls,0);

            const failed=probes[0];failed.state='idle';failed.finalDest=null;
            failed.goto=function(){this.calls++;this.state='idle';};
            const goal={x:p.x+30,z:p.z};
            ai.moveUnit(failed,goal,'guard');ai.flushPathQueue();
            const firstFailureCalls=failed.calls;
            for(let i=0;i<4;i++){ai.moveUnit(failed,goal,'guard');ai.flushPathQueue();}
            const repeatedFailureCalls=failed.calls;
            gameTestAPI.BuildingSpatialHash.markDirty();
            ai.moveUnit(failed,goal,'guard');ai.flushPathQueue();
            return {queued,initialCalls,firstFrameCalls,secondFrameCalls,allCalls,
                firstFailureCalls,repeatedFailureCalls,retriedAfterChange:failed.calls};
        } finally {
            state.units.length=originalLength;
            ai.pathQueue.clear();
        }
    });
    if(result.queued!==10||result.initialCalls!==0||result.firstFrameCalls!==3||
        result.secondFrameCalls!==6||result.allCalls!==10||result.firstFailureCalls!==2||
        result.repeatedFailureCalls!==2||result.retriedAfterChange!==3)
        throw new Error(JSON.stringify(result));
    console.log('PASS large-army path queue and failed-route cache',result);
} finally {
    await browser.close();
}
