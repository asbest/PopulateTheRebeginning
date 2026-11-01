import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:320}}),requests=[],errors=[];
 let offline=false;
 page.on('pageerror',e=>errors.push(String(e)));
 await page.route('https://countapi.mileshilliard.com/api/v1/**',route=>{
  const url=route.request().url();requests.push(url);
  const value=url.endsWith('-total')?'1200':url.includes('-year-')?'600':url.includes('-month-')?'12':'5';
  return route.fulfill({status:offline?503:200,contentType:'application/json',body:JSON.stringify(offline?{error:'offline'}:{value})});
 });
 const url=(process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1';
 await page.goto(url);await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 if(requests.length)throw new Error('Local test launch polluted production counters');
 await page.evaluate(()=>{closeHelp();closeStoryOverlay();state.isPaused=false;togglePause();document.getElementById('cheat-menu').style.display='flex';});
 await page.locator('#stats-dashboard button').click();
 await page.waitForFunction(()=>state.visitCount===1200);
 const verify=()=>page.evaluate(()=>{
  gameTestAPI.updateUI();gameTestAPI.updateUI();
  const values=['count','year','month','week'].map(k=>document.getElementById(`visit-${k}-display`).textContent);
  if(values.join(',')!=='1200,600,12,5')throw new Error('Statistics display is stale: '+values);
 });
 await verify();
 if(requests.length!==4||requests.some(url=>!url.includes('/get/')))throw new Error('Refresh incremented visits or duplicated requests');
 offline=true;await page.evaluate(()=>refreshStats());await verify();
 if(!await page.locator('#visit-stats-status').textContent().then(s=>s.includes('unavailable')))throw new Error('No failure status');
 await page.reload();await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});await verify();
 if(requests.length!==8)throw new Error('Reloading the test game contacted production statistics');
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS Scrollable cheat-menu statistics show global values, refresh read-only, retain offline cache and exclude test startups');
}finally{await browser.close();}
