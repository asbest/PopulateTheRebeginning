import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>localStorage.setItem('graphics-quality','low'));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(()=>{
  state.isPaused=true;
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x25404c);scene.add(new THREE.HemisphereLight(0xffffff,0x6e6248,1));
  const sun=new THREE.DirectionalLight(0xffedcf,2.5);sun.position.set(3,6,8);scene.add(sun);
  const roles=['shaman','warrior','preacher','spy','firewarrior'],report=[];
  for(const [i,type] of roles.entries()){
   const u=new Humanoid(0,type,0,0);state.units.push(u);
   const right=u.armR.userData.lower,held=u.staffGrip||u.weaponGrip||u.preacherGrip||u.daggerGrip;
   let maxGap=0;
   for(const phase of [0,.28,.5,.64,1])for(const heading of [0,1.3,3.14]){
    u.mesh.rotation.y=heading;u.armR.rotation.x=-.3-phase*2;right.rotation.x=-.7+phase*.6;
    u.armL.rotation.x=-phase;u.armL.userData.lower.rotation.x=-.4;
    if(type==='warrior')gameTestAPI.Locomotion.animateCombat(u,phase);
    if(u.staffGrip)u.staffGrip.rotation.x=phase*Math.PI;
    u.mesh.updateMatrixWorld(true);
    if(held){
     const gap=held.getWorldPosition(new THREE.Vector3()).distanceTo(right.userData.gripPoint.getWorldPosition(new THREE.Vector3()));maxGap=Math.max(maxGap,gap);
     if(held.parent!==right||gap>1e-6||right.userData.palm.name!=='GrippingHand')throw new Error(type+' weapon detached from grasp');
     const palm=right.userData.palm;palm.geometry.computeBoundingBox();
     if(!palm.geometry.boundingBox.containsPoint(palm.worldToLocal(held.getWorldPosition(new THREE.Vector3()))))
      throw new Error(type+' grip lies outside the actual hand geometry');
    }
    if(type==='firewarrior'&&u.mesh.getObjectByName('FireFocus').getWorldPosition(new THREE.Vector3()).distanceTo(right.userData.gripPoint.getWorldPosition(new THREE.Vector3()))>1e-6)
     throw new Error('Fire focus left the throwing palm');
    if(u.shieldGrip&&u.shieldGrip.getWorldPosition(new THREE.Vector3()).distanceTo(u.armL.userData.lower.userData.gripPoint.getWorldPosition(new THREE.Vector3()))>1e-6)
     throw new Error('Shield handle left the palm');
   }
   if(type==='spy'&&!u.mesh.getObjectByName('DaggerHandle'))throw new Error('Dagger lacks a handle');
   if(type==='warrior'&&!u.mesh.getObjectByName('ShieldHandle'))throw new Error('Shield lacks a handle');
   u.mesh.rotation.set(0,0,0);u.armR.rotation.set(-.3,0,-.06);right.rotation.set(-.3,0,0);
   u.armL.rotation.set(-.15,0,.07);u.armL.userData.lower.rotation.set(-.4,0,0);
   if(u.staffGrip)u.staffGrip.rotation.x=.6;if(u.shieldGrip)u.shieldGrip.rotation.set(0,0,0);
   scene.add(u.mesh);u.mesh.position.set((i-2)*1.55,0,0);
   report.push({type,maxGripGap:maxGap});
  }
  const camera=new THREE.PerspectiveCamera(35,innerWidth/innerHeight,.1,50);camera.position.set(3.5,2.9,9);camera.lookAt(0,1.2,0);
  state.renderer.render(scene,camera);
  return {report,png:state.renderer.domElement.toDataURL('image/png').split(',')[1]};
 });
 await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/weapon-grips.png',Buffer.from(result.png,'base64'));
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS palm-bound weapons and shields throughout combat poses '+JSON.stringify(result.report));
}finally{await browser.close();}
