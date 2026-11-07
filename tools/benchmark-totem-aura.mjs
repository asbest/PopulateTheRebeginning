import {seedWorld} from '../tests/fixtures/seed-world.mjs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const arg=process.argv.find(value=>value.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const b=await chromium.launch({headless:true,channel:'chrome'});
try{
 const page=await b.newPage({viewport:{width:1280,height:800}}),errors=[];
 await seedWorld(page,98217);
 page.on('pageerror',e=>errors.push(String(e)));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 const r=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;
  const center=state.shaman.mesh.position.clone(),sites=[];
  for(let x=-50;x<50&&sites.length<12;x++)for(let z=-50;z<50&&sites.length<12;z++){
   const g=new THREE.Group();gameTestAPI.createRitualSite(g,x,z);
   const site=g.userData.ritualSite;if(!site)continue;
   site.mesh.position.set(center.x+(sites.length%4-1.5)*8,center.y,center.z+(Math.floor(sites.length/4)-1)*8);
   state.scene.add(g);sites.push(site);
  }
  const all=sites.map(s=>s.mesh.getObjectByName('Totem healing aura'));
  if(all.length!==12||all.some(a=>!a))throw Error('Aura fixtures missing');
  const prewarmed=(state.renderer.properties.get(all[0].material).programs?.size||0)>0;
  state.camera=new THREE.PerspectiveCamera(55,1.6,.1,1000);
  state.camera.position.set(center.x+18,center.y+35,center.z+35);
  state.camera.lookAt(center.x,center.y,center.z);state.camera.updateMatrixWorld(true);
  const sample=visible=>{
   all.forEach(a=>a.visible=visible);const ms=[];
   for(let i=0;i<6;i++){const t=performance.now();state.renderer.render(state.scene,state.camera);state.renderer.getContext().finish();if(i>0)ms.push(performance.now()-t);}
   ms.sort((a,b)=>a-b);return {ms:ms[2],calls:state.renderer.info.render.calls,programs:state.renderer.info.programs.length};
  };
  const without=sample(false),withAura=sample(true),again=sample(false),againAura=sample(true);
  if(all.some(a=>a.geometry!==all[0].geometry||a.material!==all[0].material||
      a.geometry.attributes.position.count!==36))throw Error('Totems do not share the full aura resources');
  return {without,withAura,again,againAura,sites:sites.length,prewarmed};
 });
 if(errors.length||!r.prewarmed||r.withAura.calls-r.without.calls!==12||r.againAura.calls-r.again.calls!==12||
    r.withAura.programs!==r.without.programs||r.againAura.programs!==r.without.programs)
  throw Error(JSON.stringify({errors,result:r}));
 console.log('PASS twelve totem auras share resources and use precompiled shaders',JSON.stringify(r));
}finally{await b.close()}
