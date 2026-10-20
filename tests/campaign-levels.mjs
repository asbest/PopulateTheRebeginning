import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {CAMPAIGN_STORIES} from '../art/campaign-story.js';
import {CAMPAIGN_MISSIONS} from '../art/campaign-missions.js';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const page=await browser.newPage({viewport:{width:1280,height:800}});
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
const url=(process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1';
const expected={
    1:{ai:1,biome:'normal'},2:{ai:2,biome:'normal'},
    3:{ai:1,biome:'normal',winter:true,noFlyers:true},
    4:{ai:1,biome:'normal',suddenDeath:true},
    5:{ai:3,biome:'normal',infiniteMana:true,doubleSpeed:true},
    6:{ai:1,biome:'night'},7:{ai:1,biome:'mountain'},
    8:{ai:3,biome:'jungle'},9:{ai:1,biome:'storm'},
    10:{ai:1,biome:'void'},11:{ai:5,biome:'celestial'},
    12:{ai:1,biome:'cosmic'}
};
try {
    await page.goto(url,{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:60000});
    for(let level=1;level<=12;level++) {
        await page.evaluate(level=>{
            localStorage.setItem(CONFIG.SAVED_KEYS.START_CAMPAIGN,String(level));
            localStorage.setItem(CONFIG.SAVED_KEYS.MAX_CAMPAIGN_LEVEL,String(level));
            localStorage.removeItem(CONFIG.SAVED_KEYS.SAVE_DATA);
        },level);
        await page.goto(url,{waitUntil:'load',timeout:60000});
        await page.waitForFunction(()=>window.gameTestAPI&&state.shaman&&state.renderer,null,{timeout:60000});
        const setup=await page.evaluate(()=>{
            const settings=state.matchSettings;
            const factions=[...new Set(state.units.filter(u=>u.state!=='dead'&&u.faction!==0).map(u=>u.faction))];
            const data={level:state.campaignLevel,ai:window.enemyAIs.length,biome:settings.biome||'normal',
                winter:settings.winter,noFlyers:settings.noFlyers,suddenDeath:settings.suddenDeath,
                infiniteMana:settings.infiniteMana,doubleSpeed:settings.doubleSpeed,peaceMinutes:settings.peaceTimeMinutes,
                factions:factions.length,story:document.getElementById('story-title').innerText,
                objective:document.getElementById('story-objective').textContent,
                overlay:document.getElementById('story-overlay').style.display,
                shaman:state.shaman.state,physics:!!state.physicsWorld};
            window.closeHelp();window.closeStoryOverlay();
            state.matchSettings.peaceTimeMinutes=0;
            if(state.isPaused)window.togglePause();
            window.campaignProbe={updates:0};
            for(const ai of window.enemyAIs){const original=ai.update;ai.update=function(dt){campaignProbe.updates++;return original.call(this,dt);};}
            return data;
        });
        const want=expected[level];
        for(const [key,value] of Object.entries({level,ai:want.ai,biome:want.biome,
            winter:!!want.winter,noFlyers:!!want.noFlyers,suddenDeath:!!want.suddenDeath,
            infiniteMana:!!want.infiniteMana,doubleSpeed:!!want.doubleSpeed})) {
            if(setup[key]!==value)throw new Error(`Level ${level}: ${key}=${setup[key]}, expected ${value}`);
        }
        if(setup.factions!==want.ai||setup.story!==CAMPAIGN_STORIES[level].title||
            setup.peaceMinutes!==5||
            !setup.objective.includes(CAMPAIGN_STORIES[level].objective)||setup.overlay!=='flex'||
            setup.shaman==='dead'||!setup.physics)
            throw new Error(`Level ${level}: incomplete start ${JSON.stringify(setup)}`);
        const missionStart=await page.evaluate(()=>{
            const sites=state.campaignMission?.sites||[];
            let spacing=Infinity;
            for(let i=0;i<sites.length;i++)for(let j=i+1;j<sites.length;j++)
                spacing=Math.min(spacing,Math.hypot(sites[i].x-sites[j].x,sites[i].z-sites[j].z));
            const destination=state.campaignMission?.destination;
            return {kind:state.campaignMission?.level,ready:gameTestAPI.campaignMissionComplete(),
                status:document.getElementById('campaign-objective').textContent,sites:sites.length,spacing,
                targetDistance:destination?Math.hypot(destination.x-state.shaman.mesh.position.x,
                    destination.z-state.shaman.mesh.position.z):0,escorts:state.campaignMission?.escortIds?.length||0};
        });
        if(missionStart.kind!==level||missionStart.ready||!missionStart.status.includes(`Level ${level}:`))
            throw new Error(`Level ${level}: mission did not start ${JSON.stringify(missionStart)}`);
        const rule=CAMPAIGN_MISSIONS[level];
        if((rule.kind==='capture'||rule.kind==='stronghold')&&
            (missionStart.sites<rule.required||missionStart.spacing<12))
            throw new Error(`Level ${level}: mission sites overlap ${JSON.stringify(missionStart)}`);
        if((rule.kind==='breach'||rule.kind==='escort')&&missionStart.targetDistance<30)
            throw new Error(`Level ${level}: destination is too close to spawn ${JSON.stringify(missionStart)}`);
        if(rule.kind==='escort'&&missionStart.escorts!==rule.followers)
            throw new Error(`Level ${level}: missing escort followers ${JSON.stringify(missionStart)}`);
        await page.waitForTimeout(1400);
        const played=await page.evaluate(()=>({updates:campaignProbe.updates,alive:state.units.filter(u=>u.state!=='dead').length,
            mana:state.mana,renderer:!!state.renderer.getContext(),paused:state.isPaused}));
        if(played.updates<1||played.alive<2||!played.renderer||played.paused||!Number.isFinite(played.mana))
            throw new Error(`Level ${level}: simulation failed ${JSON.stringify(played)}`);
        await page.evaluate(({level,rule})=>{
            for(const ai of window.enemyAIs)ai.update=()=>{};
            const mission=state.campaignMission;
            const defeatEnemy=()=>{
                for(const unit of state.units)if(!window.isAllied(unit.faction,0))unit.state='dead';
            };
            const defeatShamans=()=>{
                for(const unit of state.units)if(unit.type==='shaman'&&!window.isAllied(unit.faction,0))unit.state='dead';
            };
            const finishBuildings=count=>{
                while(state.buildings.filter(b=>b.faction===0&&!b.dead&&!b.underConstruction).length<count){
                    const index=state.buildings.filter(b=>b.faction===0&&!b.dead).length;
                    const point=gameTestAPI.findNearestLand(state.shaman.mesh.position.x+8+index*8,
                        state.shaman.mesh.position.z+8,30);
                    const hut=gameTestAPI.createBuilding('hut',point.x,point.z,0,false,true);
                    if(!hut)throw new Error('Could not create shelter fixture');
                    hut.underConstruction=false;hut.constructionTimer=0;
                }
            };
            if(rule.kind==='settlement'){
                finishBuildings(rule.huts);
                defeatEnemy();
            }else if(rule.kind==='defense'){
                finishBuildings(rule.buildings);
                gameTestAPI.updateCampaignMission(rule.seconds);
            }else if(rule.kind==='breach'){
                state.shaman.mesh.position.set(mission.destination.x,state.shaman.mesh.position.y,mission.destination.z);
                gameTestAPI.updateCampaignMission(.1);
                if(!mission.reached)throw new Error('Breach marker did not register the shaman');
                defeatShamans();
            }else if(rule.kind==='assassination'){
                defeatShamans();
            }else if(rule.kind==='capture'||rule.kind==='stronghold'){
                for(const enemy of state.units)if(!window.isAllied(enemy.faction,0))enemy.state='dead';
                for(const site of mission.sites.slice(0,rule.required)){
                    state.shaman.mesh.position.set(site.x,state.shaman.mesh.position.y,site.z);
                    gameTestAPI.updateCampaignMission(rule.seconds);
                    if(!site.captured)throw new Error('Control point did not capture');
                }
                if(rule.kind==='stronghold')defeatShamans();
            }else if(rule.kind==='escort'){
                for(const id of mission.escortIds){
                    const unit=state.units.find(u=>u.id===id);
                    if(!unit)throw new Error('Missing escort follower');
                    unit.mesh.position.set(mission.destination.x,unit.mesh.position.y,mission.destination.z);
                    unit.rigidBody?.setTranslation({x:mission.destination.x,y:unit.mesh.position.y+unit.height/2,z:mission.destination.z},true);
                }
                gameTestAPI.updateCampaignMission(.1);
                if(mission.arrivedIds.length!==rule.followers)throw new Error('Escort arrivals were not recorded');
            }
            if(!gameTestAPI.campaignMissionComplete())throw new Error('Mission conditions were not satisfied');
        },{level,rule:CAMPAIGN_MISSIONS[level]});
        await page.waitForFunction(()=>window.gameWonAlertShown===true,null,{timeout:10000});
        const outcome=await page.evaluate(()=>({max:Number(localStorage.getItem(CONFIG.SAVED_KEYS.MAX_CAMPAIGN_LEVEL)),
            menu:document.getElementById('campaign-menu').style.display,paused:state.isPaused,
            title:document.getElementById('game-dialog-title').textContent,
            message:document.getElementById('game-dialog-message').textContent,
            ending:!document.getElementById('campaign-ending').hidden}));
        if(outcome.max!==Math.min(12,level+1)||!outcome.paused)throw new Error(`Level ${level}: victory state ${JSON.stringify(outcome)}`);
        if(level===12){
            if(!outcome.ending||outcome.menu==='flex')throw new Error(`Level 12: final choice missing ${JSON.stringify(outcome)}`);
            await page.evaluate(()=>{chooseCampaignEnding('return');closeCampaignEnding();});
            if(await page.evaluate(()=>document.getElementById('campaign-menu').style.display)!=='flex')
                throw new Error('Level 12: level menu did not reopen');
        }else if(outcome.menu!=='flex'||outcome.title!=='Campaign Victory'||
            !outcome.message.includes(CAMPAIGN_STORIES[level].outro)){
            throw new Error(`Level ${level}: victory/unlock failed ${JSON.stringify(outcome)}`);
        }
        console.log(`PASS Level ${level}: settings, live simulation, victory and unlock`);
    }
    await page.evaluate(()=>localStorage.setItem(CONFIG.SAVED_KEYS.START_CAMPAIGN,'4'));
    await page.goto(url,{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:60000});
    await page.evaluate(()=>{window.closeHelp();window.closeStoryOverlay();if(state.isPaused)window.togglePause();state.shaman.state='dead';});
    await page.waitForFunction(()=>window.gameOverAlertShown===true,null,{timeout:10000});
    if(await page.evaluate(()=>document.getElementById('game-dialog-title').textContent)!=='Campaign Defeat')
        throw new Error('Level 4 sudden-death loss was not shown');
    if(errors.length)throw new Error('Browser errors: '+errors.join(' | '));
    console.log('PASS Level 4 sudden-death defeat');
    await page.evaluate(()=>localStorage.setItem(CONFIG.SAVED_KEYS.START_CAMPAIGN,'10'));
    await page.goto(url,{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.campaignMission?.level===10,null,{timeout:60000});
    await page.evaluate(()=>{
        window.closeHelp();window.closeStoryOverlay();if(state.isPaused)window.togglePause();
        const mission=state.campaignMission;
        const first=state.units.find(unit=>unit.id===mission.escortIds[0]);
        first.mesh.position.set(mission.destination.x,first.mesh.position.y,mission.destination.z);
        gameTestAPI.updateCampaignMission(.1);
        if(mission.arrivedIds.length!==1)throw new Error('First escort arrival was not counted');
        saveGame();loadGame();
        if(state.campaignMission.arrivedIds.length!==1)throw new Error('Escort arrival was not restored');
        if(state.isPaused)togglePause();
        state.units.find(unit=>unit.id===state.campaignMission.escortIds[1]).state='dead';
    });
    await page.waitForFunction(()=>window.gameOverAlertShown===true,null,{timeout:10000});
    if(await page.evaluate(()=>document.getElementById('game-dialog-title').textContent)!=='Campaign Defeat')
        throw new Error('Level 10 escort loss was not shown');
    console.log('PASS Level 10 partial escort save/load and refugee-loss defeat');
    await page.evaluate(()=>localStorage.setItem(CONFIG.SAVED_KEYS.START_CAMPAIGN,'5'));
    await page.goto(url,{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>window.gameTestAPI&&state.campaignMission?.level===5,null,{timeout:60000});
    await page.evaluate(()=>{
        window.closeHelp();window.closeStoryOverlay();if(state.isPaused)window.togglePause();
        const site=state.campaignMission.sites[0];
        const enemy=state.units.find(unit=>!window.isAllied(unit.faction,0));
        if(!enemy)throw new Error('No enemy to contest conduit');
        state.shaman.mesh.position.set(site.x,state.shaman.mesh.position.y,site.z);
        enemy.mesh.position.set(site.x,enemy.mesh.position.y,site.z);
        gameTestAPI.updateCampaignMission(12);
        if(site.captured||site.progress!==0)throw new Error('Contested conduit was captured');
        enemy.state='dead';
        gameTestAPI.updateCampaignMission(12);
        if(!site.captured)throw new Error('Uncontested conduit was not captured');
    });
    console.log('PASS Conduit capture requires uncontested allied presence');
    if(errors.length)throw new Error('Browser errors: '+errors.join(' | '));
    console.log('PASS 12 campaign levels, progression and no browser runtime errors');
} finally {await browser.close();}
