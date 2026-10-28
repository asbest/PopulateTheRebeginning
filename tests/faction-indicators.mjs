import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage();
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const count=await page.evaluate(()=>{
  state.isPaused=true;
  const colors=gameTestAPI.CONFIG.FACTION_COLORS,p=state.shaman.mesh.position;
  const units=colors.map((_,faction)=>new Humanoid(faction,'warrior',p.x,p.z));
  const renderer=state.renderer,scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-1,1,1,-1,.1,10);
  camera.position.z=2;
  const plane=new THREE.Mesh(new THREE.PlaneGeometry(2,2));scene.add(plane);
  const gl=renderer.getContext(),pixel=new Uint8Array(4),exposure=renderer.toneMappingExposure;
  function verify(unit){
   if(unit.faction===0){if(unit.marker?.visible)throw new Error('Player has an enemy marker');return;}
   if(!unit.marker?.visible||unit.marker.material!==unit.hpBar.material)throw new Error('Marker and health bar do not share tribe color');
   for(const exposure of [.2,2]){
    renderer.toneMappingExposure=exposure;plane.material=unit.marker.material;renderer.render(scene,camera);
    gl.readPixels(Math.floor(gl.drawingBufferWidth/2),Math.floor(gl.drawingBufferHeight/2),1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
    const hex=getFactionColor(unit.faction),expected=[(hex>>16)&255,(hex>>8)&255,hex&255];
    if(expected.some((channel,i)=>Math.abs(channel-pixel[i])>1))throw new Error(`Tribe ${unit.faction}: rendered ${pixel} instead of ${expected}`);
   }
  }
  try{
   units.forEach(verify);
   const unit=units[0];
   for(const faction of [3,7,2,1,0,4]){unit.setFaction(faction);verify(unit);}
   return colors.length;
  }finally{renderer.toneMappingExposure=exposure;plane.geometry.dispose();units.forEach(u=>{u.die();state.scene.remove(u.mesh);});}
 });
 console.log(`PASS overhead indicators match ${count} tribe colors in rendered pixels and after conversion`);
}finally{await browser.close();}
