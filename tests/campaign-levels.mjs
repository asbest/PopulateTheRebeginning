import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {CAMPAIGN_STORIES} from '../art/campaign-story.js';

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
                infiniteMana:settings.infiniteMana,doubleSpeed:settings.doubleSpeed,
                factions:factions.length,story:document.getElementById('story-title').innerText,
                objective:document.getElementById('story-objective').textContent,
                overlay:document.getElementById('story-overlay').style.display,
                shaman:state.shaman.state,physics:!!state.physicsWorld};
            window.closeHelp();window.closeStoryOverlay();
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
            !setup.objective.includes(CAMPAIGN_STORIES[level].objective)||setup.overlay!=='flex'||
            setup.shaman==='dead'||!setup.physics)
            throw new Error(`Level ${level}: incomplete start ${JSON.stringify(setup)}`);
        await page.waitForTimeout(1400);
        const played=await page.evaluate(()=>({updates:campaignProbe.updates,alive:state.units.filter(u=>u.state!=='dead').length,
            mana:state.mana,renderer:!!state.renderer.getContext(),paused:state.isPaused}));
        if(played.updates<1||played.alive<2||!played.renderer||played.paused||!Number.isFinite(played.mana))
            throw new Error(`Level ${level}: simulation failed ${JSON.stringify(played)}`);
        await page.evaluate(()=>{
            for(const ai of window.enemyAIs)ai.update=()=>{};
            for(const unit of state.units)if(!window.isAllied(unit.faction,0))unit.state='dead';
        });
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
    console.log('PASS 12 campaign levels, progression and no browser runtime errors');
} finally {await browser.close();}
