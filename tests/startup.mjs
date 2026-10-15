import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {fileURLToPath,pathToFileURL} from 'node:url';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const base=process.env.GAME_URL||'http://127.0.0.1:8765';
let failures=0;
const results=[];
const workflowEscape=value=>String(value).replace(/%/g,'%25').replace(/\r/g,'%0D').replace(/\n/g,'%0A');
try{
    for(const [name,options,url] of [
        ['desktop',{},`${base}/PopulateTheRebeginning.html`],
        ['mobile',{viewport:{width:390,height:844},isMobile:true,hasTouch:true,
            userAgent:'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36'},
            `${base}/PopulateTheRebeginning.html`],
        ['mobile PNG fallback',{viewport:{width:390,height:844},isMobile:true,hasTouch:true},
            `${base}/PopulateTheRebeginning.html?textures=png`]
    ]){
        const page=await browser.newPage(options),errors=[],missing=[];
        page.on('pageerror',error=>errors.push(String(error)));
        page.on('console',message=>{if(message.type()==='error'&&/Init failed|WebGL|shader|texture/i.test(message.text()))errors.push(message.text());});
        page.on('response',response=>{if(response.status()>=400&&response.url().startsWith(base))missing.push(`${response.status()} ${response.url()}`);});
        page.on('dialog',dialog=>dialog.accept());
        try{
            await page.goto(url,{waitUntil:'domcontentloaded',timeout:90000});
            await page.waitForFunction(()=>document.querySelector('#loading')?.style.display==='none'&&
                !!window.state?.renderer&&!!window.state?.shaman,null,{timeout:120000,polling:250});
            const result=await page.evaluate(()=>({loading:document.querySelector('#loading')?.style.display,
                renderer:!!window.state?.renderer,shaman:!!window.state?.shaman,textures:window.Art?.textureStatus,
                help:document.querySelector('#help-overlay')?.style.display,
                story:document.querySelector('#story-overlay')?.style.display,
                paused:window.state?.isPaused}));
            if(name==='mobile'){
                await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
                await page.screenshot({path:fileURLToPath(new URL('../test-results/startup-mobile.png',import.meta.url))});
            }
            if(result.help==='flex')throw new Error('Help overlay obscures the campaign welcome screen');
            if(result.story!=='flex')throw new Error('Campaign welcome screen is missing');
            if(name.startsWith('mobile'))await page.locator('#story-overlay button').tap();
            else await page.locator('#story-overlay button').click();
            const playing=await page.evaluate(()=>!state.isPaused&&
                document.querySelector('#help-overlay')?.style.display==='none'&&
                document.querySelector('#story-overlay')?.style.display==='none');
            if(!playing)throw new Error(`Game stayed paused after closing welcome overlays: ${JSON.stringify(result)}`);
            if(errors.length||missing.length)throw new Error(JSON.stringify({result,errors,missing}));
            console.log(`PASS ${name} starts without test mode`,result);
            results.push({name,pass:true,result});
        }catch(error){
            failures++;
            const state=await page.evaluate(()=>({loading:document.querySelector('#loading')?.style.display,
                renderer:!!window.state?.renderer,shaman:!!window.state?.shaman,textures:window.Art?.textureStatus})).catch(()=>null);
            const detail={error:String(error),state,errors,missing};
            results.push({name,pass:false,...detail});
            console.error(`FAIL ${name}`,detail);
            if(process.env.GITHUB_ACTIONS==='true')
                console.log(`::error title=${workflowEscape(name+' startup')}::${workflowEscape(JSON.stringify(detail))}`);
        }finally{await page.close();}
    }
}finally{await browser.close();}
await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});
await fs.writeFile(new URL('../test-results/startup-report.json',import.meta.url),JSON.stringify(results,null,2));
if(failures)process.exitCode=1;
