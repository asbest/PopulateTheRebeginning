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
  const grass=covers.reduce((n,c)=>n+(c.grass?.mesh?.count||0),0),stones=covers.reduce((n,c)=>n+(c.stones?.mesh?.count||0),0);
  const bases=covers.find(c=>c.grass?.mesh)?.grass.mesh.geometry.attributes.aBasePos;
  const contacts=[];state.shaman.mesh.traverse(n=>{if(n.userData?.contactShadow)contacts.push(n);});
  const hut=gameTestAPI.createBuilding('hut',state.shaman.mesh.position.x+6,state.shaman.mesh.position.z,0);
  hut.mesh.traverse(n=>{if(n.userData?.contactShadow)contacts.push(n);});
  const water=state.chunkWaterMat,tree=Art.tree(),treeMaterial=tree.children[1].material;
  const firstWind=Art.uniforms.windTime.value;Art.uniforms.windTime.value=firstWind+1;
  return {chunks:chunks.length,grass,stones,basePositions:bases?.count||0,contacts:contacts.length,
   sky:state.skyDome?.name,rim:state.rimLight?.intensity,quality:state.graphicsQuality,
   water:{depthWrite:water.depthWrite,hasFresnel:/fresnel/.test(water.fragmentShader),hasWaveNormal:/vWaveNormal/.test(water.vertexShader)},
   wind:{cache:treeMaterial.customProgramCacheKey?.(),advanced:Art.uniforms.windTime.value>firstWind}};
 });
 if(errors.length||result.grass<100||result.stones<10||result.basePositions<1||result.contacts<2||
    result.sky!=='Procedural atmosphere'||!result.rim||result.water.depthWrite||!result.water.hasFresnel||!result.water.hasWaveNormal||
    result.wind.cache!=='island-tree-wind-v1'||!result.wind.advanced||!result.quality?.maxPixelRatio)
   throw new Error(JSON.stringify({errors,result}));
 console.log('PASS layered environment rendering, instancing, water, atmosphere, contact and adaptive quality',result);
}finally{await browser.close();}
