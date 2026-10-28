import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href)
    :createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
    const page=await browser.newPage();
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
    const result=await page.evaluate(()=>{
        state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;
        const origin=state.shaman.mesh.position;
        const warrior=new Humanoid(0,'warrior',origin.x,origin.z);
        const enemy=new Humanoid(1,'warrior',origin.x,origin.z+.9);
        state.units.push(warrior,enemy);
        const ground=getSurfaceHeight(origin.x,origin.z);
        warrior.mesh.position.set(origin.x,ground,origin.z);
        enemy.mesh.position.set(origin.x,ground+2.2,origin.z+.9);
        enemy.hp=enemy.maxHp=1000;
        warrior.lastAttackTime=-100;
        let now=10;state.clock.getElapsedTime=()=>now;
        if(!warrior.canMeleeHit(enemy)||!warrior.beginManualAttack(enemy.mesh.position.x,enemy.mesh.position.z))
            throw new Error('Adjacent enemy uphill is out of club range');
        warrior.manualAttack.elapsed=.51;now+=.51;warrior.attack(warrior.manualAttack);
        if(enemy.hp!==1000-warrior.damage)throw new Error('Uphill club swing did not deal damage');
        warrior.manualAttack=null;
        warrior.state='combat';warrior.attackTarget=enemy;
        warrior.lastAttackTime=now-.6;warrior.attackFired=false;
        warrior.rigidBody.setTranslation({x:origin.x,y:ground+warrior.height/2+(warrior.groundBodyOffset||0),z:origin.z},true);
        warrior.update(1/60);
        if(enemy.hp!==1000-warrior.damage*2)throw new Error('Automatic uphill attack did not use the club: '+JSON.stringify({hp:enemy.hp,warriorState:warrior.state,attackPhase:warrior.attackPhase,attackFired:warrior.attackFired,warriorY:warrior.mesh.position.y,enemyY:enemy.mesh.position.y}));
        enemy.mesh.position.y=warrior.mesh.position.y+5;
        if(warrior.canMeleeHit(enemy))throw new Error('Club reached an enemy far above the warrior');
        enemy.mesh.position.y=warrior.mesh.position.y;
        enemy.mesh.position.z=warrior.mesh.position.z+3;
        if(warrior.canMeleeHit(enemy))throw new Error('Club reached beyond horizontal range');
        return {rise:2.2,horizontalDistance:.9,damage:warrior.damage};
    });
    console.log('PASS warrior club reaches adjacent uphill enemy '+JSON.stringify(result));
}finally{await browser.close();}
