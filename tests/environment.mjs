import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/shader|webgl/i.test(m.text()))errors.push(m.text());});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',{waitUntil:'load',timeout:90000});
 await page.waitForFunction(()=>window.state?.shaman&&Object.keys(state.chunks).length>0,null,{timeout:90000});
 await page.waitForTimeout(1200);
 const result=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();
  const chunks=Object.values(state.chunks),covers=chunks.map(c=>c.userData?.groundCover).filter(Boolean);
  const grass=covers.reduce((n,c)=>n+(c.grass?.mesh?.count||0),0),stones=covers.reduce((n,c)=>n+(c.stones?.mesh?.count||0),0),
   bushes=covers.reduce((n,c)=>n+(c.bushes?.mesh?.count||0),0);
  const bases=covers.find(c=>c.grass?.mesh)?.grass.mesh.geometry.attributes.aBasePos;
  const contacts=[];state.shaman.mesh.traverse(n=>{if(n.userData?.contactShadow)contacts.push(n);});
  const hut=gameTestAPI.createBuilding('hut',state.shaman.mesh.position.x+6,state.shaman.mesh.position.z,0);
  hut.mesh.traverse(n=>{if(n.userData?.contactShadow)contacts.push(n);});
  const construction={name:hut.constructionRig?.name,parts:hut.constructionRig?.children.length};
  hut.takeDamage(hut.maxHp*.45,true);const damaged=hut.damageVisual?.visible;
  const marksBefore=gameTestAPI.SurfaceMarks.marks.length;
  gameTestAPI.SurfaceMarks.add(hut.mesh.position.x,hut.mesh.position.z,{radius:1,life:2});
  const water=state.chunkWaterMat,tree=Art.tree(),treeMaterial=tree.children[1].material;
  const firstWind=Art.uniforms.windTime.value;Art.uniforms.windTime.value=firstWind+1;
  const cloud=gameTestAPI.CloudManager.clouds[0],cloudBefore=cloud.mesh.position.clone(),puffBefore=cloud.puffs[0].mesh.position.y;
  gameTestAPI.CloudManager.update(.5);
  const cloudMotion={distance:cloud.mesh.position.distanceTo(cloudBefore),puff:Math.abs(cloud.puffs[0].mesh.position.y-puffBefore),shadow:cloud.shadow.userData.cloudShadow};
  let shore=null;for(let x=-160;x<=160&&!shore;x+=3)for(let z=-160;z<=160;z+=3){const h=getHeight(x,z);if(Math.min(Math.abs(h-CONFIG.TERRAIN.VISUAL_WATER_LEVEL),Math.abs(h-CONFIG.TERRAIN.WATER_LEVEL))<.3){shore={x,z};break;}}
  if(shore){state.cameraLookAt.set(shore.x,0,shore.z);for(let i=0;i<180;i++)gameTestAPI.WaterSprayManager.update(1/60);}
  const spray={alive:Array.from(gameTestAPI.WaterSprayManager.life||[]).filter(v=>v>0).length,name:gameTestAPI.WaterSprayManager.points?.name};
  const low=window.setGraphicsQuality('low'),lowGrass=covers.reduce((n,c)=>n+(c.grass?.mesh?.count||0),0);
  const ultra=window.setGraphicsQuality('ultra');window.setGraphicsQuality('high');
  return {chunks:chunks.length,grass,stones,bushes,basePositions:bases?.count||0,contacts:contacts.length,construction,damaged,
   marksAdded:gameTestAPI.SurfaceMarks.marks.length-marksBefore,
   sky:state.skyDome?.name,rim:state.rimLight?.intensity,quality:state.graphicsQuality,
   profiles:{low:{tier:low.tier,grass:lowGrass,pixel:low.maxPixelRatio},ultra:{tier:ultra.tier,pixel:ultra.maxPixelRatio}},
   water:{depthWrite:water.depthWrite,hasFresnel:/fresnel/.test(water.fragmentShader),hasWaveNormal:/vWaveNormal/.test(water.vertexShader),
    vertical:/pos\.y\+=height/.test(water.vertexShader),gerstner:/horizontal/.test(water.vertexShader),breakers:/shoreFoam/.test(water.fragmentShader)},
   cloudMotion,spray,skyShader:{scattering:/horizonHaze/.test(state.skyDome.material.fragmentShader),
    cirrus:/skyFbm/.test(state.skyDome.material.fragmentShader),night:/nightMix/.test(state.skyDome.material.fragmentShader)},
   wind:{cache:treeMaterial.customProgramCacheKey?.(),advanced:Art.uniforms.windTime.value>firstWind}};
 });
 if(errors.length||result.grass<100||result.stones<10||result.bushes<10||result.basePositions<1||result.contacts<2||
    result.construction.name!=='Construction scaffolding'||result.construction.parts<10||!result.damaged||result.marksAdded!==1||
    result.profiles.low.tier!=='low'||result.profiles.low.grass>=result.grass||result.profiles.ultra.tier!=='ultra'||result.profiles.ultra.pixel<1.8||
    result.sky!=='Procedural atmosphere'||!result.rim||result.water.depthWrite||!result.water.hasFresnel||!result.water.hasWaveNormal||
    !result.water.vertical||!result.water.gerstner||!result.water.breakers||result.cloudMotion.distance<=0||result.cloudMotion.puff<=0||!result.cloudMotion.shadow||
    result.spray.name!=='Shore spray'||result.spray.alive<1||!result.skyShader.scattering||!result.skyShader.cirrus||!result.skyShader.night||
    result.wind.cache!=='island-tree-wind-v1'||!result.wind.advanced||!result.quality?.maxPixelRatio)
   throw new Error(JSON.stringify({errors,result}));
 console.log('PASS layered environment rendering, instancing, water, atmosphere, contact and adaptive quality',result);
}finally{await browser.close();}
