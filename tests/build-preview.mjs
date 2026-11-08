import {seedWorld} from './fixtures/seed-world.mjs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const path=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=path?await import(pathToFileURL(path).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,channel:'chrome'});
try {
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 await seedWorld(page,98217);
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto('http://127.0.0.1:8765/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 const p=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;state.mana=1000;state.matchSettings.peaceTimeMinutes=0;
  const u=new Humanoid(0,'wild',state.shaman.mesh.position.x+5,state.shaman.mesh.position.z);
  state.units.push(u);state.selectedUnits=[u];updateContextMenus();selectAction('build_temple');
  if(state.visibleActions.includes('build_preacher')||state.visibleActions.includes('build_spy'))throw Error('Retired buildings still in the menu');
  const emblem=Art.building('temple').getObjectByName('Temple roof emblem');
  if(!emblem)throw Error('Roof emblem missing');
  let p;
  for(let dx=-8;dx<=8&&!p;dx+=2)for(let dz=-8;dz<=8;dz+=2){
   const x=u.mesh.position.x+dx,z=u.mesh.position.z+dz;
   if(Math.hypot(dx,dz)>8||getHeight(x,z)<CONFIG.TERRAIN.WATER_LEVEL+2)continue;
   if(state.buildings.some(b=>!b.dead&&Math.hypot(x-b.mesh.position.x,z-b.mesh.position.z)<10))continue;
   p=new THREE.Vector3(x,gameTestAPI.getSurfaceHeight(x,z),z);break;
  }
  if(!p)throw Error('No build site');
  state.cameraLookAt.copy(p);updateCameraPosition();state.scene.updateMatrixWorld(true);state.camera.updateMatrixWorld(true);
  const v=p.clone().project(state.camera);
  return {x:(v.x+1)*640,y:(1-v.y)*400};
 });
 await page.mouse.move(p.x,p.y);
 const preview=await page.evaluate(()=>{
  const mesh=state.scene.getObjectByName('Building placement preview');
  return {visible:mesh?.visible,color:mesh?.children[0].material.color.getHex()};
 });
 if(!preview.visible||preview.color!==0x42e56b)throw Error('Valid preview '+JSON.stringify(preview));
 await page.mouse.move(p.x-16,p.y);
 await page.mouse.down();
 await page.mouse.move(p.x,p.y);
 await page.mouse.up();
 const outcome=await page.evaluate(()=>({
  action:state.currentAction,
  buildings:state.buildings.filter(b=>b.type==='temple'&&b.faction===0).length,
  preview:state.scene.getObjectByName('Building placement preview')?.visible
 }));
 if(outcome.action!=='move'||!outcome.buildings||outcome.preview)
  throw Error('Construction failed '+JSON.stringify(outcome));
 await page.evaluate(()=>selectAction('build_temple'));
 await page.mouse.move(p.x+1,p.y+1);
 const invalid=await page.evaluate(()=>{
  const mesh=state.scene.getObjectByName('Building placement preview');
  return {visible:mesh?.visible,color:mesh?.children[0].material.color.getHex()};
 });
 if(!invalid.visible||invalid.color!==0xff4545)throw Error('Blocked preview '+JSON.stringify(invalid));
 await page.mouse.click(p.x,p.y);
 if(await page.evaluate(()=>state.currentAction)!=='build_temple')
  throw Error('Invalid build lost selected tool');
 if(errors.length)throw Error(errors.join('\n'));
 console.log('PASS roof emblem, green/red preview, drag placement and movement mode',preview,outcome);
}finally{await browser.close();}
