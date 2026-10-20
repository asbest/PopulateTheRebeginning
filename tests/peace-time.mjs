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
    const result=await page.evaluate(()=>{
        state.isPaused=true;state.matchElapsed=0;gameTestAPI.updateUI();
        if(state.matchSettings.peaceTimeMinutes!==2.5||!gameTestAPI.isPeaceTime()||
            document.getElementById('peace-timer').textContent!=='Peace time: 02:30')
            throw new Error('Two-and-a-half-minute default or countdown missing');
        const input=document.getElementById('peace-time-minutes');
        input.value='3.5';input.dispatchEvent(new Event('change',{bubbles:true}));
        if(state.matchSettings.peaceTimeMinutes!==3.5||localStorage.getItem(CONFIG.SAVED_KEYS.PEACE_MINUTES)!=='3.5')
            throw new Error('Match setting was not saved');
        if(input.step!=='0.5'||document.getElementById('peace-timer').textContent!=='Peace time: 03:30')
            throw new Error('Half-minute setting did not update the countdown');
        state.matchElapsed=60;gameTestAPI.updateUI();
        if(document.getElementById('peace-timer').textContent!=='Peace time: 02:30')
            throw new Error('Countdown did not use elapsed game time');
        const ally=new Humanoid(0,'warrior',state.shaman.mesh.position.x+1,state.shaman.mesh.position.z);
        const enemy=new Humanoid(1,'warrior',ally.mesh.position.x+2,ally.mesh.position.z);
        state.units.push(ally,enemy);gameTestAPI.SpatialHash.update();
        if(ally.findTarget()!==null)throw new Error('Auto aggro started during peace');
        const hp=enemy.hp;
        ally.attackTarget=enemy;ally.state='combat';ally.attack();
        if(ally.state==='combat'||ally.attackTarget||enemy.hp!==hp)
            throw new Error('Direct attack was possible during peace');
        gameTestAPI.updateContextMenus();
        const blastButton=document.getElementById('btn-blast');
        if(!blastButton?.classList.contains('disabled')||blastButton.getAttribute('aria-disabled')!=='true')
            throw new Error('Offensive spell still appears available in the action menu');
        blastButton.click();
        window.selectAction('blast');
        if(state.currentAction==='blast')throw new Error('Offensive spell can still be selected during peace');
        const mana=state.mana,projectiles=state.projectiles.length;
        const snapshot=()=>({mana:state.mana,projectiles:state.projectiles.length,
            effects:state.activeEffects.length,terrain:state.terrainMods.size,enemyFaction:enemy.faction});
        const before=JSON.stringify(snapshot());
        for(const action of ['blast','lightning','hypnotise','swamp','swarm','tornado',
            'firestorm','volcano','raise','lower','flatten','landbridge','airship_rocket']) {
            gameTestAPI.performAction(enemy.mesh.position.x,enemy.mesh.position.z,action);
            if(JSON.stringify(snapshot())!==before)
                throw new Error(`${action} changed the match during peace`);
        }
        gameTestAPI.executeSpell('blast',enemy.mesh.position.x,enemy.mesh.position.z,state.shaman);
        if(JSON.stringify(snapshot())!==before)throw new Error('Direct spell execution bypassed peace');
        const target=enemy.mesh.position.clone();
        const fireball=new gameTestAPI.Fireball(target.clone().add(new THREE.Vector3(-5,2,0)),target,0);
        fireball.mesh.position.copy(target);
        fireball.explode();
        if(enemy.hp!==hp)throw new Error('A fireball impact caused damage during peace');
        if(window.enemyAIs[0]?.cast('lightning',enemy.mesh.position)!==false)
            throw new Error('Enemy AI cast an offensive spell during peace');
        state.matchElapsed=3.5*60;
        gameTestAPI.updateUI();
        if(gameTestAPI.isPeaceTime()||!document.getElementById('peace-timer').hidden||ally.findTarget()!==enemy)
            throw new Error('Combat did not become available when peace ended');
        gameTestAPI.updateContextMenus();
        if(document.getElementById('btn-blast')?.classList.contains('disabled'))
            throw new Error('Offensive spell button stayed disabled after peace');
        gameTestAPI.performAction(enemy.mesh.position.x,enemy.mesh.position.z,'blast');
        if(state.mana>=mana||state.projectiles.length!==projectiles+1)
            throw new Error('Offensive spell remained blocked after peace');
        window.selectAction('blast');
        window.setPeaceTimeMinutes(4.5);
        if(!gameTestAPI.isPeaceTime()||state.currentAction!=='move'||state.projectiles.length)
            throw new Error('Starting peace again did not cancel an armed or flying fireball');
        input.value='0';input.dispatchEvent(new Event('change',{bubbles:true}));
        if(state.matchSettings.peaceTimeMinutes!==0||gameTestAPI.isPeaceTime())
            throw new Error('Zero-minute setting did not disable peace');
        window.saveGame();
        const saved=JSON.parse(localStorage.getItem(CONFIG.SAVED_KEYS.SAVE_DATA));
        if(saved.matchElapsed!==210||saved.matchSettings.peaceTimeMinutes!==0)
            throw new Error('Peace progress was not saved');
        return {defaultMinutes:2.5,configuredMinutes:3.5,remainingAfterOneMinute:150,attackUnlocked:true,saveElapsed:saved.matchElapsed};
    });
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('PASS peace time, settings, combat lock and save progress',result);
    await page.evaluate(()=>{
        window.setPeaceTimeMinutes(3.5);
        localStorage.setItem(CONFIG.SAVED_KEYS.START_CAMPAIGN,'2');
    });
    await page.reload();
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:60000});
    const restored=await page.evaluate(()=>{
        window.toggleMatchSettings();
        return {minutes:state.matchSettings.peaceTimeMinutes,
            input:document.getElementById('peace-time-minutes').value};
    });
    if(restored.minutes!==3.5||restored.input!=='3.5')
        throw new Error('Peace setting was not restored for the next level: '+JSON.stringify(restored));
    console.log('PASS peace-time Match Setting persists across level reload');
} finally {
    await browser.close();
}
