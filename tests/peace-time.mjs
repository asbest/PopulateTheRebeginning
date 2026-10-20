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
        const mana=state.mana,projectiles=state.projectiles.length;
        gameTestAPI.performAction(enemy.mesh.position.x,enemy.mesh.position.z,'blast');
        if(state.mana!==mana||state.projectiles.length!==projectiles)
            throw new Error('Offensive spell consumed mana during peace');
        state.matchElapsed=3.5*60;
        gameTestAPI.updateUI();
        if(gameTestAPI.isPeaceTime()||!document.getElementById('peace-timer').hidden||ally.findTarget()!==enemy)
            throw new Error('Combat did not become available when peace ended');
        gameTestAPI.performAction(enemy.mesh.position.x,enemy.mesh.position.z,'blast');
        if(state.mana>=mana||state.projectiles.length!==projectiles+1)
            throw new Error('Offensive spell remained blocked after peace');
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
