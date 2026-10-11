import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const url=process.env.GAME_URL||'http://127.0.0.1:8765';
const errors=[],result={};
try{
 const host=await browser.newPage(),client=await browser.newPage();
 for(const page of [host,client]){
  page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(url+'/PopulateTheRebeginning.html?test=1',{waitUntil:'load',timeout:60000});
  await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,{timeout:60000});
  await page.evaluate(()=>{window.closeHelp();window.closeStoryOverlay();});
 }
 await host.evaluate(()=>NetworkManager.startHost());
 await host.waitForFunction(()=>state.network.id,{timeout:20000});
 const id=await host.evaluate(()=>state.network.id);
 await client.evaluate(id=>NetworkManager.joinGame(id),id);
 await client.waitForFunction(()=>state.network.conn?.open,{timeout:20000});
 await host.waitForFunction(()=>state.network.conn?.open,{timeout:20000});
 const unitId=await host.evaluate(()=>state.shaman.id);
 await client.waitForFunction(id=>state.units.some(u=>u.id===id),unitId,{timeout:10000});
 const destination=await host.evaluate(()=>{const p=state.shaman.mesh.position;return {x:p.x+3,z:p.z+2};});
 await client.evaluate(({unitId,destination})=>{const u=state.units.find(u=>u.id===unitId);state.selectedUnits=[u];gameTestAPI.performAction(destination.x,destination.z,'move');},{unitId,destination});
 await host.waitForFunction(()=>!!state.shaman.finalDest||!!state.shaman.target,{timeout:10000});
 result.pass=true;result.tests=['PeerJS host signaling','Two-browser WebRTC connection','Initial tribe synchronization','Client command reaches host'];
 await host.evaluate(()=>{state.isPaused=true;state.mana=500;});
 await client.evaluate(()=>{state.isPaused=true;});
 const castPoint=await host.evaluate(()=>({x:state.shaman.mesh.position.x,z:state.shaman.mesh.position.z}));
 await client.evaluate(point=>gameTestAPI.performAction(point.x,point.z,'shield'),castPoint);
 await host.waitForFunction(()=>state.shaman.shielded,{},{timeout:10000});
 const spent=await host.evaluate(()=>state.mana);if(spent!==480)throw new Error('Host shield mana '+spent);
 await host.evaluate(()=>NetworkManager.sendFullState());
 await client.waitForFunction(id=>state.units.find(u=>u.id===id)?.shielded,unitId,{timeout:10000});
 result.tests.push('Client spell executes on host with correct mana','Shield visual status synchronizes to client');
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('NETWORK_PASS '+JSON.stringify(result));
}catch(e){result.pass=false;result.error=String(e);result.errors=errors;console.error('NETWORK_FAIL '+String(e));}
finally{await browser.close();await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../test-results/network-report.json',import.meta.url),JSON.stringify(result,null,2));}
process.exitCode=result.pass?0:1;
