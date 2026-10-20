import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage();
    const errors=[];page.on('pageerror',error=>errors.push(String(error)));
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:60000});
    const report=await page.evaluate(()=>{
        state.isPaused=true;
        state.matchSettings.peaceTimeMinutes=0;
        const kinds=['hut','tower','warrior','fire','spy','shipyard'];
        const tested=[];
        for(const [index,kind] of kinds.entries()) {
            const x=state.shaman.mesh.position.x+25+index*12;
            const z=state.shaman.mesh.position.z+25;
            const building=gameTestAPI.createBuilding(kind,x,z,1,false,true);
            if(!building)throw new Error(`Could not create ${kind}`);
            for(let hit=1;hit<=7;hit++) {
                const target=building.mesh.position.clone();
                const start=target.clone().add(new THREE.Vector3(-5,2,0));
                const fireball=new gameTestAPI.Fireball(start,target,0);
                fireball.mesh.position.copy(target);
                fireball.explode();
                if(building.dead||building.hp<=0)
                    throw new Error(`${kind} fell after ${hit} fireball hits`);
            }
            tested.push({kind,maxHp:building.maxHp,remaining:building.hp});
        }
        const hut=tested[0];
        window.saveGame();
        const saved=JSON.parse(localStorage.getItem(CONFIG.SAVED_KEYS.SAVE_DATA));
        const oldHut=saved.buildings.find(b=>b.type==='hut'&&b.faction===1&&
            Math.abs(b.x-state.shaman.mesh.position.x-25)<.01&&
            Math.abs(b.z-state.shaman.mesh.position.z-25)<.01);
        if(!oldHut||oldHut.maxHp!==hut.maxHp)
            throw new Error('Building maximum health was not saved');
        oldHut.hp=50;
        delete oldHut.maxHp;
        localStorage.setItem(CONFIG.SAVED_KEYS.SAVE_DATA,JSON.stringify(saved));
        window.loadGame();
        const restored=state.buildings.find(b=>b.type==='hut'&&b.faction===1&&
            Math.abs(b.mesh.position.x-oldHut.x)<.01&&Math.abs(b.mesh.position.z-oldHut.z)<.01);
        if(!restored||Math.abs(restored.hp-restored.maxHp*.5)>.01)
            throw new Error('Old save did not preserve the hut health fraction');
        return {tested,restoredHutHp:restored.hp};
    });
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('PASS every building survives seven direct fireballs and legacy health loads',report);
} finally {
    await browser.close();
}
