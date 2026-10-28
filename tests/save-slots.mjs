import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:390,height:700}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 await page.evaluate(()=>{closeHelp();closeStoryOverlay();state.isPaused=true;openSaveSlots('load');});
 if(await page.locator('#save-slots [data-slot]:disabled').count()!==10)throw new Error('Empty slots can be loaded');
 await page.keyboard.press('Escape');
 await page.evaluate(()=>{
  for(let i=1;i<=10;i++){state.mana=i*10;if(!saveGame(i))throw new Error('Save failed: '+i);}
  for(let i=1;i<=10;i++){state.isPaused=true;if(!loadGame(i)||state.mana!==i*10)throw new Error('Slot data crossed: '+i);}
  if(saveGame(0)||loadGame(11))throw new Error('Invalid slot accepted');
  const key=gameTestAPI.CONFIG.SAVED_KEYS.SAVE_DATA;
  const legacy=JSON.parse(localStorage.getItem(key));delete legacy.savedAt;localStorage.setItem(key,JSON.stringify(legacy));
  state.isPaused=true;openSaveSlots('save');
 });
 if(await page.locator('#save-slots [data-slot]').count()!==10)throw new Error('Missing slot choices');
 if(!(await page.locator('#save-slots [data-slot="1"]').innerText()).includes('Earlier save'))throw new Error('Legacy save missing');
 await page.locator('#save-slots [data-slot="1"]').click();
 await page.locator('#game-dialog-cancel').click();
 if(!await page.locator('#save-slots').isVisible())throw new Error('Cancel closed slot selection');
 await page.evaluate(()=>state.mana=777);
 await page.locator('#save-slots [data-slot="1"]').click();
 await page.locator('#game-dialog-confirm').click();
 await page.evaluate(()=>{if(!loadGame(1)||state.mana!==777)throw new Error('Overwrite failed');state.isPaused=true;openSaveSlots('load');});
 await page.locator('#save-slots [data-slot="10"]').click();
 await page.locator('#game-dialog-confirm').click();
 if(await page.locator('#save-slots').count())throw new Error('Slot dialog remained open after load');
 await page.reload();await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 await page.evaluate(()=>{
  state.isPaused=true;if(!loadGame()||state.mana!==100)throw new Error('Selected slot was not retained across reload');
  const key=gameTestAPI.CONFIG.SAVED_KEYS.SAVE_DATA;
  localStorage.setItem(key+'.slot.3','broken');
  openSaveSlots('load');
 });
 if(!await page.locator('#save-slots [data-slot="3"]').isDisabled())throw new Error('Corrupt slot enabled');
 await page.screenshot({path:'test-results/save-slots-mobile.png'});
 await page.keyboard.press('Escape');
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS ten independent save slots, legacy saves, overwrite confirmation, mobile selection, corruption and reload');
}finally{await browser.close();}
