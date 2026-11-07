import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const arg=process.argv.find(value=>value.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage();
    const shaderErrors=[];
    page.on('console',message=>{if(message.type()==='error'&&message.text().includes('WebGLProgram'))shaderErrors.push(message.text());});
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
    const result=await page.evaluate(()=>{
        state.isPaused=true;state.mana=0;
        const shaman=state.shaman,originalPosition=shaman.mesh.position.clone(),originalChunks=state.chunks;
        const x=10000,z=10000;
        shaman.mesh.position.set(x,0,z);
        shaman.state='idle';
        shaman.hp=shaman.maxHp-20;
        const ally={faction:0,state:'idle',hp:50,maxHp:100,mesh:{position:{x,z}},hpBar:{scale:{x:.5}}};
        const enemy={faction:1,state:'idle',hp:50,maxHp:100,mesh:{position:{x,z}},hpBar:{scale:{x:.5}}};
        state.units.push(ally,enemy);
        state.chunks={test:{userData:{ritualSite:{x,z}}}};
        const boostedRate=gameTestAPI.applyTotemAura(2,10);
        const marker=state.scene.getObjectByName('Totem buffs above units');
        const kinds=()=>marker.visible?Array.from(marker.geometry.getAttribute('kind').array.slice(0,marker.geometry.drawRange.count)):[];
        const nearMarkers=kinds();
        const scene=new THREE.Scene();
        scene.add(marker.clone());
        const camera=new THREE.OrthographicCamera(-4,4,4,-4,.1,100);
        camera.position.set(x,3,z+10);camera.lookAt(x,3,z);
        state.renderer.render(scene,camera);
        const renderedMarkers=state.renderer.info.render.points;
        const near={shamanHp:shaman.hp,allyHp:ally.hp,allyBar:ally.hpBar.scale.x,enemyHp:enemy.hp};
        shaman.mesh.position.x=x+CONFIG.TOTEM_AURA.RADIUS+.1;
        const normalRate=gameTestAPI.applyTotemAura(2,10);
        const farHp=shaman.hp,farMarkers=kinds();
        shaman.mesh.position.x=x;
        state.chunks.second={userData:{ritualSite:{x,z}}};
        const stackedRate=gameTestAPI.applyTotemAura(0,10);
        shaman.state='dead';
        const deadRate=gameTestAPI.applyTotemAura(2,10);
        const deadHp=shaman.hp;
        shaman.state='idle';
        shaman.hp=shaman.maxHp-1;
        gameTestAPI.applyTotemAura(2,10);
        const cappedHp=shaman.hp;
        state.chunks={};
        const noSiteRate=gameTestAPI.applyTotemAura(2,10);
        state.units.pop();state.units.pop();
        state.chunks=originalChunks;
        shaman.mesh.position.copy(originalPosition);
        return {boostedRate,near,normalRate,farHp,stackedRate,deadRate,deadHp,cappedHp,noSiteRate,
            maxHp:shaman.maxHp,nearMarkers,farMarkers,renderedMarkers,hiddenWithoutSite:!marker.visible};
    });
    if(shaderErrors.length)throw Error(shaderErrors.join("\n"));
    if(result.renderedMarkers!==3||result.boostedRate!==20||result.near.shamanHp!==result.maxHp-8||
        result.near.allyHp!==52||result.near.allyBar!==.52||result.near.enemyHp!==50||
        result.normalRate!==10||result.farHp!==result.near.shamanHp||
        result.stackedRate!==20||result.deadRate!==10||result.deadHp!==result.farHp||
        result.cappedHp!==result.maxHp||result.noSiteRate!==10||
        result.nearMarkers.join()!=='0,0,2'||result.farMarkers.join()!=='0'||!result.hiddenWithoutSite)
        throw new Error(JSON.stringify(result));
    console.log('PASS totem healing and doubled mana regeneration',result);
} finally {
    await browser.close();
}
