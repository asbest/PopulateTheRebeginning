import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const arg=process.argv.find(value=>value.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',
        {waitUntil:'load',timeout:90000});
    await page.waitForFunction(()=>window.state?.shaman&&window.gameTestAPI,null,{timeout:90000});
    const result=await page.evaluate(()=>{
        const sea=CONFIG.TERRAIN.WATER_LEVEL;
        const {getBaseHeight,forEachTreeSite}=gameTestAPI;
        const samples={mountain:[],archipelago:[],plateau:[],valley:[]};
        let dry=0,wet=0,high=0,flatHigh=0,max=-Infinity,min=Infinity,maxShortRise=0,sharpest=null;
        for(let x=-360;x<=360;x+=12)for(let z=-360;z<=360;z+=12){
            const h=getBaseHeight(x,z);
            const region=state.simplex.noise2D(x*.004+211,z*.004-173);
            const relief=state.simplex.noise2D(x*.011+47,z*.011-29);
            if(region>.45)samples.mountain.push(h);
            if(region<-.45)samples.archipelago.push(h);
            if(Math.abs(region)<.18&&relief>.4)samples.plateau.push(h);
            if(Math.abs(region)<.18&&relief<-.4)samples.valley.push(h);
            if(h>sea){dry++;if(h>11)high++;}
            else wet++;
            if(h>7&&Math.hypot(getBaseHeight(x+2,z)-getBaseHeight(x-2,z),
                getBaseHeight(x,z+2)-getBaseHeight(x,z-2))<1)flatHigh++;
            max=Math.max(max,h);min=Math.min(min,h);
        }
        // Short-distance rises catch discontinuous terraces and needle-sharp ridges.
        for(let x=-180;x<=180;x+=3)for(let z=-180;z<=180;z+=3){
            const left=getBaseHeight(x-.25,z),right=getBaseHeight(x+.25,z);
            const near=getBaseHeight(x,z-.25),far=getBaseHeight(x,z+.25);
            const rise=Math.max(Math.abs(right-left),Math.abs(far-near));
            if(rise>maxShortRise){maxShortRise=rise;sharpest={x,z,left,right,near,far};}
        }
        const mean=values=>values.reduce((sum,value)=>sum+value,0)/Math.max(1,values.length);
        const treeCounts=[],species=new Set();
        for(let cx=-5;cx<=5;cx++)for(let cz=-5;cz<=5;cz++){
            let count=0;forEachTreeSite(cx,cz,site=>{count++;species.add(site.style);});treeCounts.push(count);
        }
        let ritualSites=0;
        for(let cx=-5;cx<=5;cx++)for(let cz=-5;cz<=5;cz++){
            const group=new THREE.Group();group.userData={};
            gameTestAPI.createRitualSite(group,cx,cz);
            if(group.userData.ritualSite){
                if(group.userData.ritualSite.ring.count!==7)throw new Error('Incomplete stone circle');
                ritualSites++;
            }
        }
        const seam=Math.abs(getBaseHeight(20-.0001,12)-getBaseHeight(20+.0001,12));
        const repeat=getBaseHeight(47,81)===getBaseHeight(47,81);
        return {dry,wet,high,flatHigh,min,max,maxShortRise,sharpest,seam,repeat,
            regions:Object.fromEntries(Object.entries(samples).map(([name,values])=>[name,{count:values.length,mean:mean(values)}])),
            forest:{min:Math.min(...treeCounts),max:Math.max(...treeCounts),occupied:treeCounts.filter(n=>n>0).length,
                species:[...species]},ritualSites};
    });
    if(errors.length||result.dry<300||result.wet<300||result.high<250||result.flatHigh<40||
        result.max-result.min<20||result.maxShortRise>2.6||result.seam>.01||!result.repeat||
        Object.values(result.regions).some(region=>region.count<10)||
        result.regions.mountain.mean<=result.regions.archipelago.mean+2||
        result.forest.max<10||result.forest.min!==0||result.forest.occupied<15||
        result.forest.species.length<3||result.ritualSites<3)
        throw new Error(JSON.stringify({errors,result}));
    console.log('PASS continuous procedural mountains, plateaus, valleys, islands and forests',result);
} finally {
    await browser.close();
}
