import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs/promises';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:1000,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/shader|webgl/i.test(m.text()))errors.push(m.text());});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 const result=await page.evaluate(async()=>{
  state.isPaused=true;
  const {createTotemFactory}=await import('./art/totem.js');
  const factory=createTotemFactory(THREE,Art.blender.texture('stone','map'));
  let ritual=Object.values(state.chunks).find(chunk=>chunk.userData?.ritualSite)?.userData.ritualSite;
  for(let cx=-4;cx<=4&&!ritual;cx++)for(let cz=-4;cz<=4&&!ritual;cz++){
   const chunk=new THREE.Group();gameTestAPI.createRitualSite(chunk,cx,cz);ritual=chunk.userData.ritualSite;
  }
  if(!ritual?.mesh.getObjectByName('Ancient carved totem')||ritual.stones.length!==7)
   throw new Error('Ritual sites do not use the new monument with their standing stones');
  const totem=factory(),other=factory(),size=new THREE.Box3().setFromObject(totem).getSize(new THREE.Vector3());
  let triangles=0;
  if(size.y<8||size.x<2.5||totem.children.length!==4)throw new Error('Monument size or draw-call budget is wrong');
  totem.children.forEach((mesh,i)=>{
   triangles+=mesh.geometry.attributes.position.count/3;
   if(mesh.geometry!==other.children[i].geometry||mesh.material!==other.children[i].material||!mesh.castShadow||!mesh.receiveShadow)
    throw new Error('Monument does not share geometry/materials or cast shadows');
  });
  if(triangles>5000)throw new Error('Monument geometry exceeds budget');
  const scene=new THREE.Scene();scene.background=new THREE.Color(0x213c48);scene.add(totem);
  const sun=new THREE.DirectionalLight(0xffdfaf,2.5);sun.position.set(6,12,9);scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xc9deef,0x66553c,.8));
  const reference={mesh:new THREE.Group(),type:'shaman',isShaman:true};Characters.build(reference,getFactionColor(0));
  reference.mesh.position.set(2.4,0,0);scene.add(reference.mesh);
  const camera=new THREE.PerspectiveCamera(40,innerWidth/innerHeight,.1,100);camera.position.set(10,7,17);camera.lookAt(.4,3.7,0);
  state.renderer.render(scene,camera);
  return {height:size.y,width:size.x,triangles,drawCalls:4,png:state.renderer.domElement.toDataURL('image/png').split(',')[1]};
 });
 await fs.mkdir('test-results',{recursive:true});await fs.writeFile('test-results/totem-model.png',Buffer.from(result.png,'base64'));delete result.png;
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS monumental totem, shared geometry, shadows and rendering budget '+JSON.stringify(result));
}finally{await browser.close();}
