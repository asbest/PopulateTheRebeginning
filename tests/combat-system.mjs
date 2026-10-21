import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const playwrightPath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=playwrightPath?await import(pathToFileURL(playwrightPath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const page=await browser.newPage();
const errors=[];
const results=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('dialog',dialog=>dialog.accept());
async function fresh(){
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman);
    await page.evaluate(()=>{
        state.isPaused=true;
        state.matchSettings.peaceTimeMinutes=0;
        state.campaignLevel=0;
        state.mana=1000;
        state.selectedUnits=[state.shaman];
        window.enemyAIs=[];
    });
}
async function check(name,run){
    try{const detail=await run();results.push({name,pass:true,detail});console.log('PASS '+name);}
    catch(error){results.push({name,pass:false,error:String(error)});console.log('FAIL '+name+' '+error);}
}
try{
    await check('Preachers permanently convert ordinary enemies and counter enemy preachers',async()=>{
        await fresh();
        return page.evaluate(()=>{
            const x=state.shaman.mesh.position.x+2,z=state.shaman.mesh.position.z;
            const preacher=new Humanoid(0,'preacher',x,z);
            const warrior=new Humanoid(1,'warrior',x+1,z);
            state.units.push(preacher,warrior);
            preacher.attackTarget=warrior;
            preacher.lastAttackTime=state.clock.getElapsedTime()-1.2;
            preacher.attack();
            if(warrior.faction!==0||warrior.conversionTimer!==0||warrior.originalFaction!==null||preacher.attackTarget)
                throw new Error('Conversion is temporary or failed');
            warrior.update(4);
            if(warrior.faction!==0)throw new Error('Converted warrior reverted');
            const shooter=new Humanoid(0,'firewarrior',x,z);
            state.units.push(shooter);
            shooter.attackTarget=warrior;
            const projectileCount=state.projectiles.length;
            shooter.attack();
            if(shooter.attackTarget||state.projectiles.length!==projectileCount)
                throw new Error('A soldier continued firing at a converted ally');
            const rival=new Humanoid(1,'preacher',x+1,z);
            state.units.push(rival);
            const before=rival.hp;
            preacher.attackTarget=rival;
            preacher.attackFired=false;
            preacher.lastAttackTime=state.clock.getElapsedTime()-1.2;
            preacher.attack();
            if(rival.hp>=before||rival.faction!==1)throw new Error('Enemy preacher was not countered');
            return {converted:warrior.faction,rivalDamage:before-rival.hp};
        });
    });
    await check('Occupied towers grant range and release guards after destruction',async()=>{
        await fresh();
        return page.evaluate(()=>{
            const x=state.shaman.mesh.position.x+12,z=state.shaman.mesh.position.z;
            const tower=gameTestAPI.createBuilding('tower',x,z,0,false,true);
            if(!tower)throw new Error('Tower could not be created');
            tower.underConstruction=false;
            const guard=new Humanoid(0,'firewarrior',x+2,z);
            const enemy=new Humanoid(1,'warrior',x+7,z);
            state.units.push(guard,enemy);
            const normalRange=gameTestAPI.combatRange(guard,enemy);
            if(!guard.enterTower(tower)||tower.garrison!==guard||guard.rigidBody.isEnabled())
                throw new Error('Tower guard did not enter');
            const towerRange=gameTestAPI.combatRange(guard,enemy);
            if(towerRange<=normalRange)throw new Error('Tower provides no range bonus');
            tower.destroy(false);
            if(guard.garrisonedIn||!guard.rigidBody.isEnabled())throw new Error('Guard remained trapped');
            return {normalRange,towerRange};
        });
    });
    await check('Buildings block shots and height changes ranged reach',async()=>{
        await fresh();
        return page.evaluate(()=>{
            const x=state.shaman.mesh.position.x+2,z=state.shaman.mesh.position.z;
            const shooter=new Humanoid(0,'firewarrior',x,z);
            const target=new Humanoid(1,'warrior',x+6,z);
            state.units.push(shooter,target);
            const flat=gameTestAPI.combatRange(shooter,target);
            shooter.mesh.position.y+=4;
            const high=gameTestAPI.combatRange(shooter,target);
            shooter.mesh.position.y-=8;
            const low=gameTestAPI.combatRange(shooter,target);
            if(!(high>flat&&flat>low))throw new Error('Height does not affect reach');
            shooter.mesh.position.y+=4;
            const blocker={dead:false,underConstruction:false,collisionRadius:2,type:'hut',
                mesh:{position:{x:x+3,y:Math.max(shooter.mesh.position.y,target.mesh.position.y),z}}};
            state.buildings.push(blocker);
            const clear=gameTestAPI.combatLineClear(shooter,target);
            state.buildings.pop();
            if(clear)throw new Error('Building does not block shot');
            return {low,flat,high};
        });
    });
    await check('Saving restores a tower and its occupant',async()=>{
        await fresh();
        return page.evaluate(()=>{
            const x=state.shaman.mesh.position.x+12,z=state.shaman.mesh.position.z;
            const tower=gameTestAPI.createBuilding('tower',x,z,0,false,true);
            tower.underConstruction=false;
            const guard=new Humanoid(0,'preacher',x+2,z);
            state.units.push(guard);
            if(!guard.enterTower(tower))throw new Error('Could not enter tower');
            const id=guard.id,towerId=tower.id;
            saveGame();loadGame();
            const restoredGuard=state.units.find(unit=>unit.id===id);
            const restoredTower=state.buildings.find(building=>building.id===towerId);
            if(!restoredTower||!restoredGuard||restoredGuard.garrisonedIn!==restoredTower||
               restoredTower.garrison!==restoredGuard||restoredGuard.rigidBody.isEnabled())
                throw new Error('Save lost tower occupant');
            return {guard:id,tower:towerId};
        });
    });
    await check('Offensive spells show a windup and damage interrupts it',async()=>{
        await fresh();
        return page.evaluate(()=>{
            const caster=state.shaman,x=caster.mesh.position.x+2,z=caster.mesh.position.z;
            const enemy=new Humanoid(1,'warrior',x,z);
            state.units.push(enemy);
            gameTestAPI.SpatialHash.update();
            const startMana=state.mana,startHp=enemy.hp;
            gameTestAPI.performAction(x,z,'lightning');
            const charged=startMana-state.mana;
            if(!gameTestAPI.SpellWindup.busy(caster)||enemy.hp!==startHp||charged<=0)
                throw new Error('Lightning had no preparation');
            caster.takeDamage(1,true);
            gameTestAPI.SpellWindup.update(.5);
            if(gameTestAPI.SpellWindup.busy(caster)||enemy.hp!==startHp||
               Math.abs(state.mana-(startMana-charged/2))>.01)
                throw new Error('Hit failed to interrupt and refund half the cost');
            gameTestAPI.performAction(x,z,'lightning');
            gameTestAPI.SpellWindup.update(1);
            if(enemy.hp>=startHp)throw new Error('Completed spell caused no damage');
            return {charged,remainingHp:enemy.hp};
        });
    });
    await check('Saving during a windup restores its mana on load',async()=>{
        await fresh();
        return page.evaluate(()=>{
            const x=state.shaman.mesh.position.x+2,z=state.shaman.mesh.position.z;
            const before=state.mana;
            gameTestAPI.performAction(x,z,'firestorm');
            if(!gameTestAPI.SpellWindup.busy(state.shaman)||state.mana>=before)
                throw new Error('Spell did not start');
            saveGame();loadGame();
            if(state.mana!==before||gameTestAPI.SpellWindup.pending.length)
                throw new Error('Unfinished spell spent mana after load');
            return {mana:state.mana};
        });
    });
    await check('No combat runtime errors',()=>{if(errors.length)throw new Error(errors.join('\n'));});
}finally{await browser.close();}
console.log(JSON.stringify({passed:results.filter(result=>result.pass).length,failed:results.filter(result=>!result.pass).length}));
process.exitCode=results.some(result=>!result.pass)?1:0;
