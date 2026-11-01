import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/shader|webgl/i.test(m.text()))errors.push(m.text());});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1&assets=full');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(()=>{
  state.isPaused=true;
  const fire=Art.building('fire'),warrior=Art.building('warrior'),otherFire=Art.building('fire'),otherWarrior=Art.building('warrior');
  const flame=fire.getObjectByName('RoofFlame'),emblem=warrior.getObjectByName('Roof club and shield');
  if(!flame||!emblem||flame.position.y<4||emblem.position.y<2.8)throw new Error('Roof landmarks missing or misplaced');
  if(flame.geometry!==otherFire.getObjectByName('RoofFlame').geometry||flame.material!==otherFire.getObjectByName('RoofFlame').material||
      emblem.children.some((mesh,i)=>mesh.geometry!==otherWarrior.getObjectByName('Roof club and shield').children[i].geometry))throw new Error('Roof landmarks do not share geometry');
  if(flame.material.uniforms.time!==Art.uniforms.windTime||fire.getObjectByName('Roof fire beacon').children.length!==2||emblem.children.length!==3)
   throw new Error('Flame update or draw-call budget is wrong');
  for(const faction of [0,1,2,3]){
   const shield=Art.building('warrior',getFactionColor(faction)).getObjectByName('Roof tribe shield');
   const actual=shield.material.color.clone().convertLinearToSRGB(),expected=getFactionColor(faction);
   if([actual.r*255,actual.g*255,actual.b*255].some((value,i)=>Math.abs(value-((expected>>(16-i*8))&255))>1))throw new Error('Roof shield has wrong tribe color');
  }
  const p=state.shaman.mesh.position,building=gameTestAPI.createBuilding('fire',p.x+8,p.z+8,0,false,true);
  if(!building||building.roofFlame.visible)throw new Error('Unfinished building has a burning roof flame');
  building.update(building.totalBuildTime+1);if(!building.roofFlame.visible)throw new Error('Completed building did not light its roof flame');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x294651);
  fire.position.x=3;warrior.position.x=-3;scene.add(fire,warrior);
  scene.add(new THREE.HemisphereLight(0xffffff,0x67583b,.9));const sun=new THREE.DirectionalLight(0xffefd3,2.6);sun.position.set(5,10,8);scene.add(sun);
  const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,100);camera.position.set(9,8,15);camera.lookAt(0,3.1,0);
  Art.uniforms.windTime.value=1;state.renderer.render(scene,camera);const before=state.renderer.domElement.toDataURL('image/png');
  Art.uniforms.windTime.value=2.3;state.renderer.render(scene,camera);const after=state.renderer.domElement.toDataURL('image/png');
  if(before===after)throw new Error('Roof flame did not flicker');
  return {flameDrawCalls:2,weaponDrawCalls:3,png:after.split(',')[1]};
 });
 await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/roof-landmarks.png',Buffer.from(result.png,'base64'));delete result.png;
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS animated roof flame, tribe shield and club, construction and shared geometry '+JSON.stringify(result));
}finally{await browser.close();}
