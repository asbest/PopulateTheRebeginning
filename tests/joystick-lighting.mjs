import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:1200,height:800}});
 await page.addInitScript(()=>localStorage.setItem('graphics-quality','low'));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();state.isPaused=false;state.selectedUnits=[state.shaman];window.enemyAIs=[];
  window.lightSamples={maxError:0,frames:0};
  window.sampleLighting=async frames=>{
   for(let i=0;i<frames;i++){
    await new Promise(resolve=>requestAnimationFrame(resolve));
    const direction=state.sunLight.position.clone().sub(state.sunLight.target.position).normalize();
    const expected=state.chunkWaterMat.uniforms.sunDirection.value.clone().normalize();
    lightSamples.maxError=Math.max(lightSamples.maxError,direction.distanceTo(expected));lightSamples.frames++;
   }
  };
 });
 await page.evaluate(()=>sampleLighting(3));
 const point=await page.evaluate(()=>{const r=document.getElementById('joystick-area').getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2};});
 await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.x+35,point.y-15,{steps:3});
 await page.evaluate(()=>{if(state.joystickVector.length()<.1)throw new Error('Joystick gesture did not reach movement input');return sampleLighting(12);});
 await page.mouse.up();await page.evaluate(()=>sampleLighting(3));
 const result=await page.evaluate(()=>{
  // Camera changes must also preserve lighting in first person.
  state.isPaused=true;state.isFPV=true;state.camera=state.perspectiveCamera;
  for(let i=0;i<5;i++){
   updateCameraPosition();
   const direction=state.sunLight.position.clone().sub(state.sunLight.target.position).normalize();
   lightSamples.maxError=Math.max(lightSamples.maxError,direction.distanceTo(state.chunkWaterMat.uniforms.sunDirection.value.clone().normalize()));
  }
  if(lightSamples.maxError>1e-6)throw new Error('Joystick/camera changed sunlight direction: '+JSON.stringify(lightSamples));
  return lightSamples;
 });
 console.log('PASS sunlight remains consistent before, during and after joystick movement and first-person camera updates '+JSON.stringify(result));
}finally{await browser.close();}
