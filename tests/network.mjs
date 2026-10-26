import fs from 'node:fs/promises';
import path from 'node:path';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const url=process.env.GAME_URL||'http://127.0.0.1:8765';
const errors=[],result={};
let checkpoint='host startup',activePage;
const waitForState=(page,predicate,arg=null,timeout=10000)=>page.waitForFunction(predicate,arg,{timeout,polling:100});
try{
 const host=await browser.newPage({viewport:{width:640,height:480},deviceScaleFactor:1});
 const client=await browser.newPage({viewport:{width:640,height:480},deviceScaleFactor:1});
 result.startup=[];
 for(const [role,page] of [['host',host],['client',client]]){
  checkpoint=`${role} startup`;activePage=page;const started=Date.now();
  page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(`${role}: ${String(e)}`));
  await page.addInitScript(()=>localStorage.setItem('graphics-quality','low'));
  await page.goto(url+'/PopulateTheRebeginning.html?test=1',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>window.gameTestAPI&&window.state?.renderer&&state.shaman&&
   document.getElementById('loading')?.style.display==='none',null,{timeout:120000,polling:100});
  await page.evaluate(()=>{
   window.closeHelp();window.closeStoryOverlay();state.isPaused=true;state.matchSettings.peaceTimeMinutes=0;state.selectedUnits=[state.shaman];
   // Startup has rendered the world. Idle WebGL redraws are irrelevant to packet
   // synchronization and can starve the second browser on software-rendered CI.
   state.renderer.render=()=>{};
   // Stop idle world streaming too. Packet delivery does not require animation
   // frames; all network assertions below poll on timers instead.
   window.requestAnimationFrame=()=>0;
  });
  const ready={role,milliseconds:Date.now()-started};result.startup.push(ready);console.log('NETWORK_READY '+JSON.stringify(ready));
 }
 checkpoint='WebRTC connection';
 const liveSignaling=process.argv.includes('--live-signaling');
 if(liveSignaling){
  await host.evaluate(()=>NetworkManager.startHost());
  await waitForState(host,()=>state.network.id,null,20000);
  const id=await host.evaluate(()=>state.network.id);
  await client.evaluate(id=>NetworkManager.joinGame(id),id);
 }else{
  // Exercise real WebRTC and production sync/input handlers without a public signaling service.
  for(const [page,role] of [[host,'host'],[client,'client']])await page.evaluate(role=>{
   state.network.role=role;window.testPeer=new RTCPeerConnection({iceServers:[]});
   window.attachTestChannel=channel=>{
    channel.onmessage=event=>NetworkManager.handleData(JSON.parse(event.data));
    channel.onopen=()=>{state.network.conn={open:true,send:data=>channel.send(JSON.stringify(data)),close:()=>channel.close()};};
   };
   testPeer.ondatachannel=event=>attachTestChannel(event.channel);
   window.gatherTestDescription=async()=>{
    if(testPeer.iceGatheringState!=='complete')await new Promise(resolve=>testPeer.addEventListener('icegatheringstatechange',()=>{if(testPeer.iceGatheringState==='complete')resolve();}));
    return testPeer.localDescription.toJSON();
   };
  },role);
  const offer=await host.evaluate(async()=>{attachTestChannel(testPeer.createDataChannel('game'));await testPeer.setLocalDescription(await testPeer.createOffer());return gatherTestDescription();});
  const answer=await client.evaluate(async offer=>{await testPeer.setRemoteDescription(offer);await testPeer.setLocalDescription(await testPeer.createAnswer());return gatherTestDescription();},offer);
  await host.evaluate(answer=>testPeer.setRemoteDescription(answer),answer);
 }
 await waitForState(client,()=>state.network.conn?.open,null,20000);
 await waitForState(host,()=>state.network.conn?.open,null,20000);
 await host.evaluate(()=>NetworkManager.sendFullState(true));
 checkpoint='initial state synchronization';
 const unitId=await host.evaluate(()=>state.shaman.id);
 await waitForState(client,id=>state.units.some(u=>u.id===id),unitId);
 const destination=await host.evaluate(()=>{const p=state.shaman.mesh.position;return {x:p.x+3,z:p.z+2};});
 checkpoint='client movement command';
 await client.evaluate(({unitId,destination})=>{const u=state.units.find(u=>u.id===unitId);state.selectedUnits=[u];gameTestAPI.performAction(destination.x,destination.z,'move');},{unitId,destination});
 await waitForState(host,()=>!!state.shaman.finalDest||!!state.shaman.target);
 result.pass=true;result.transport=liveSignaling?'PeerJS public signaling':'Local WebRTC signaling';
 result.tests=['Two-browser WebRTC connection','Initial tribe synchronization','Client command reaches host'];
 await host.evaluate(()=>{state.isPaused=true;state.mana=500;gameTestAPI.SpatialHash.update();});
 checkpoint='client shield command';
 await client.evaluate(()=>{state.isPaused=true;});
 const castPoint=await host.evaluate(()=>({x:state.shaman.mesh.position.x,z:state.shaman.mesh.position.z}));
 await client.evaluate(point=>gameTestAPI.performAction(point.x,point.z,'shield'),castPoint);
 await waitForState(host,()=>state.shaman.shielded);
 const spent=await host.evaluate(()=>state.mana);if(spent!==480)throw new Error('Host shield mana '+spent);
 await host.evaluate(()=>NetworkManager.sendFullState());
 await waitForState(client,id=>{const unit=state.units.find(u=>u.id===id);return unit?.shielded&&unit.shieldMesh?.parent===unit.mesh;},unitId);
 result.tests.push('Client spell executes on host with correct mana','Shield visual status synchronizes to client');
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('NETWORK_PASS '+JSON.stringify(result));
}catch(e){
 result.pass=false;result.checkpoint=checkpoint;result.error=String(e.stack||e);result.errors=errors;
 result.progress=await activePage?.evaluate(()=>({readyState:document.readyState,api:!!window.gameTestAPI,
  renderer:!!window.state?.renderer,shaman:!!window.state?.shaman,loading:document.getElementById('loading')?.textContent,
  textures:window.Art?.textureStatus,dialog:document.querySelector('#game-dialog:not([hidden])')?.textContent})).catch(()=>null);
 console.error('NETWORK_FAIL '+JSON.stringify({checkpoint,progress:result.progress,errors})+'\n'+result.error);
}
finally{await browser.close();await fs.mkdir(new URL('../test-results/',import.meta.url),{recursive:true});await fs.writeFile(new URL('../test-results/network-report.json',import.meta.url),JSON.stringify(result,null,2));}
process.exitCode=result.pass?0:1;
