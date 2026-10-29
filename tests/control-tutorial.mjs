import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 const url=(process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1&tutorial=1';
 await page.goto(url);await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 await page.locator('#story-close').click();
 const step=n=>page.waitForFunction(n=>state.controlTutorial?.step===n,n,{timeout:10000}).catch(e=>{throw new Error('Tutorial step '+n+': '+e);});
 await step(0);
 await page.reload();await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});await page.locator('#story-close').click();
 if(await page.locator('#control-tutorial').count())throw new Error('Unfinished introduction automatically appeared on second start');
 await page.evaluate(()=>showHelp());await page.locator('#help-replay-tutorial').click();await step(0);
 await page.locator('#unit-list .unit-item').first().click();await step(1);
 await page.mouse.move(800,550);await page.mouse.down();await page.mouse.move(950,600,{steps:8});await page.mouse.up();await step(2);
 await page.mouse.wheel(0,-120);await step(3);
 const ground=async()=>page.evaluate(()=>{
  const p=state.shaman.mesh.position,target=gameTestAPI.findNearestLand(p.x+2,p.z+1);
  const projected=new THREE.Vector3(target.x,getSurfaceHeight(target.x,target.z),target.z).project(state.camera);
  return {x:(projected.x+1)*innerWidth/2,y:(1-projected.y)*innerHeight/2};
 });
 // Bring the controlled unit back into view after practicing camera movement.
 await page.evaluate(()=>{state.cameraLookAt.copy(state.shaman.mesh.position);updateCameraPosition();state.camera.updateMatrixWorld(true);});
 let point=await ground();await page.mouse.click(point.x,point.y,{button:'right'});await step(4);
 await page.locator('#btn-heal').click();await step(5);
 point=await ground();await page.mouse.click(point.x,point.y);await step(6);
 await page.locator('#control-tutorial button').click();
 await page.reload();await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});await page.locator('#story-close').click();
 if(await page.locator('#control-tutorial').count())throw new Error('Finished introduction appeared again');
 await page.evaluate(()=>showHelp());await page.locator('#help-replay-tutorial').click();await step(0);
 await page.evaluate(()=>showHelp());await page.locator('#help-replay-tutorial').click();await step(0);
 await page.setViewportSize({width:390,height:700});await page.screenshot({path:'test-results/tutorial-mobile.png'});
 const bounds=await page.locator('#control-tutorial').boundingBox();if(bounds.x<0||bounds.x+bounds.width>390||bounds.y+bounds.height>700)throw new Error('Mobile tutorial is clipped');
 await page.locator('#control-tutorial button').click();
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS interactive selection, camera drag, zoom, move and spell targeting; completion, replay and mobile layout');
}finally{await browser.close();}
