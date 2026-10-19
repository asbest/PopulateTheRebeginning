import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const arg=process.argv.find(value=>value.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage();
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
    const result=await page.evaluate(()=>{
        state.isPaused=true;
        const api=gameTestAPI,shaman=state.shaman,p=shaman.mesh.position;
        shaman.state='idle';
        const follower=new Humanoid(0,'wild',p.x+3,p.z);
        follower.state='idle';follower.isGrounded=true;follower.velocity.set(0,0,0);
        const rival=new Humanoid(1,'shaman',p.x+3,p.z+1);
        state.units.push(follower,rival);
        api.updateWorship(follower,1/60);
        const ownShaman=follower.worshipTarget===shaman;
        for(let i=0;i<90;i++){
            follower.animTime+=1/60;
            api.updateWorship(follower,1/60);
            api.Locomotion.animate(follower,1/60,api.getSurfaceHeight);
        }
        const kneeling={blend:follower.worshipBlend,torsoY:follower.torso.position.y,
            knee:follower.legL.userData.lower.rotation.x,arm:follower.armL.rotation.x,
            facing:Math.atan2(Math.sin(follower.mesh.rotation.y-Math.atan2(p.x-follower.mesh.position.x,p.z-follower.mesh.position.z)),
                Math.cos(follower.mesh.rotation.y-Math.atan2(p.x-follower.mesh.position.x,p.z-follower.mesh.position.z)))};
        state.faith=50;
        api.updateFaith(10);
        const worshipFaith=state.faith;
        follower.state='move';api.updateWorship(follower,1/60);
        for(let i=0;i<90;i++)api.Locomotion.animate(follower,1/60,api.getSurfaceHeight);
        const moving={worship:follower.isWorshipping,blend:follower.worshipBlend};
        follower.state='idle';follower.mesh.position.x=p.x+CONFIG.FAITH.WORSHIP_RADIUS+2;
        api.updateWorship(follower,1/60);
        const farWorship=follower.isWorshipping;
        follower.die();
        const deathFaith=state.faith;
        api.changeFaith(1000);const cappedFaith=state.faith;
        api.changeFaith(-1000);const floorFaith=state.faith;
        state.faith=75;api.updateUI();window.saveGame();
        const saved=JSON.parse(localStorage.getItem(CONFIG.SAVED_KEYS.SAVE_DATA)).faith;
        return {ownShaman,kneeling,worshipFaith,moving,farWorship,deathFaith,cappedFaith,floorFaith,
            saved,ui:document.getElementById('faith-text').textContent,
            bonus:document.getElementById('faith-bonus').textContent,multiplier:api.faithManaMultiplier()};
    });
    if(!result.ownShaman||result.kneeling.blend<.95||result.kneeling.torsoY>.78||
        result.kneeling.knee<1||result.kneeling.arm>-.7||Math.abs(result.kneeling.facing)>.1||
        Math.abs(result.worshipFaith-50.35)>.001||result.moving.worship||result.moving.blend>.05||
        result.farWorship||Math.abs(result.deathFaith-46.35)>.001||
        result.cappedFaith!==100||result.floorFaith!==0||result.saved!==75||result.ui!=='75'||
        result.bonus!=='113%'||Math.abs(result.multiplier-1.125)>.0001)
        throw new Error(JSON.stringify(result));
    console.log('PASS faith, worship pose, facing, mana bonus and save',result);
} finally {
    await browser.close();
}
