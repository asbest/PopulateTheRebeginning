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
    const colors=await page.evaluate(()=>{
        state.isPaused=true;
        const originalUnits=state.units;
        const colors=gameTestAPI.CONFIG.FACTION_COLORS;
        const units=colors.map((_,faction)=>({id:`icon-color-${faction}`,type:'warrior',faction,state:'idle',hp:100,maxHp:100}));
        state.units=units;
        const verify=()=>{
            gameTestAPI.updateUnitList();
            for(const unit of units){
                const icon=unit.listItem?.querySelector('.tribal-icon');
                if(!icon)throw new Error(`Missing icon for tribe ${unit.faction}`);
                const expected=colors[unit.faction];
                const actual=getComputedStyle(icon).color;
                const rgb=`rgb(${(expected>>16)&255}, ${(expected>>8)&255}, ${expected&255})`;
                if(actual!==rgb)throw new Error(`Tribe ${unit.faction}: ${actual} instead of ${rgb}`);
            }
        };
        try{
            verify();
            // Reused list entries must also update when their unit changes tribe.
            units[2].faction=3;
            verify();
            return colors.length;
        }finally{
            state.units=originalUnits;
            gameTestAPI.updateUnitList();
        }
    });
    console.log(`PASS unit icons match all ${colors} tribe colors`);
}finally{await browser.close();}
