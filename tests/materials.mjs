import fs from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const root=path.resolve(import.meta.dirname,'..'),errors=[];
try {
 const page=await browser.newPage({viewport:{width:1440,height:900}});
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/shader|webgl|texture/i.test(m.text()))errors.push(m.text());});
 page.on('requestfailed',r=>errors.push(`${r.url()}: ${r.failure()?.errorText}`));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',{timeout:90000});
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,{},{timeout:90000});
 const detail=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;
  const p=state.shaman.mesh.position;
  const hut=gameTestAPI.createBuilding('hut',p.x+5,p.z+2,0);
  hut.update(hut.totalBuildTime+1);
  state.cameraLookAt.copy(hut.mesh.position);
  state.viewScale=8;
  const aspect=innerWidth/innerHeight;
  Object.assign(state.orthoCamera,{left:-8*aspect,right:8*aspect,top:8,bottom:-8});
  state.orthoCamera.updateProjectionMatrix();window.updateCameraPosition();gameTestAPI.updateChunks(true);
  const images=[];hut.mesh.traverse(child=>{if(child.isMesh&&child.material?.map?.image)images.push([child.material.map.image.width,child.material.map.image.height]);});
  const terrainSamples=[];
  for(const chunk of Object.values(state.chunks)){
   const mesh=chunk?.children?.[0],position=mesh?.geometry?.attributes?.position,color=mesh?.geometry?.attributes?.color;
   if(!position||!color)continue;
   for(let i=0;i<position.count;i+=97){
    const h=position.getY(i),r=color.getX(i),g=color.getY(i),b=color.getZ(i);
    if(h>CONFIG.TERRAIN.WATER_LEVEL+2&&h<17)terrainSamples.push({r,g,b,h});
   }
  }
  const luminance=terrainSamples.map(c=>.2126*c.r+.7152*c.g+.0722*c.b);
  const range=luminance.length?Math.max(...luminance)-Math.min(...luminance):0;
  const terrainMaterial=Object.values(state.chunks).find(chunk=>chunk?.children?.[0]?.material)?.children[0].material;
  const shader={uniforms:{},vertexShader:'#include <begin_vertex>',
   fragmentShader:'#include <color_fragment>\n#include <roughnessmap_fragment>\n#include <normal_fragment_maps>'};
  terrainMaterial.onBeforeCompile(shader);
  let normalSeamError=0,patterns=0;
  for(const [key,chunk] of Object.entries(state.chunks)){
   const terrain=chunk.children[0],pattern=terrain.geometry.getAttribute('artTerrainPattern');
   if(pattern?.count===terrain.geometry.attributes.position.count)patterns++;
   const [cx,cz]=key.split(',').map(Number),neighbor=state.chunks[`${cx+1},${cz}`];
   if(!neighbor)continue;
   const a=terrain.geometry.attributes.normal,b=neighbor.children[0].geometry.attributes.normal,stride=CONFIG.TERRAIN.CHUNK_RES+1;
   for(let z=0;z<stride;z++)for(let axis=0;axis<3;axis++){
    const read=['getX','getY','getZ'][axis];
    normalSeamError=Math.max(normalSeamError,
     Math.abs(a[read](z*stride+stride-1)-b[read](z*stride)));
   }
  }
  return {images,viewScale:state.viewScale,grass:CONFIG.COLORS.grass,terrainSamples:terrainSamples.length,grassVariation:range,
   shaderVersion:terrainMaterial?.customProgramCacheKey?.(),patterns,chunks:Object.keys(state.chunks).length,normalSeamError,
   terrainTextureReads:(shader.fragmentShader.match(/texture2D\(/g)||[]).length,
   shoreLevel:terrainMaterial.userData.shoreUniform.value,visualWaterLevel:CONFIG.TERRAIN.VISUAL_WATER_LEVEL,
   cliffSize:[shader.uniforms.artRock.value.image?.width,shader.uniforms.artRock.value.image?.height],
   sandSize:[shader.uniforms.artSand.value.image?.width,shader.uniforms.artSand.value.image?.height]};
 });
 await page.waitForTimeout(1000);
 await fs.mkdir(path.join(root,'test-results'),{recursive:true});
 await page.screenshot({path:path.join(root,'test-results/materials-close.png')});
 const assets=await Promise.all(['grass','stone','thatch','wood'].map(async name=>({name,bytes:(await fs.stat(path.join(root,'art/materials',name+'.png'))).size})));
 const terrainLayers=await Promise.all(['dirt','mud','gravel','moss'].map(async name=>({name,
  albedo:(await fs.stat(path.join(root,'art/blender',name+'-albedo.png'))).size,
  normal:(await fs.stat(path.join(root,'art/blender',name+'-normal.png'))).size,
  roughness:(await fs.stat(path.join(root,'art/blender',name+'-roughness.png'))).size})));
 const report={pass:errors.length===0&&detail.images.some(([w,h])=>w>=1000&&h>=1000)&&assets.every(a=>a.bytes>1000000)&&
  terrainLayers.every(a=>a.albedo>400000&&a.normal>200000&&a.roughness>100000)&&
  detail.grass===0x65bd38&&detail.terrainSamples>10&&detail.grassVariation>.01&&detail.shaderVersion==='island-terrain-detail-v7'&&
  detail.patterns===detail.chunks&&detail.normalSeamError<.001&&detail.terrainTextureReads<=8&&
  Math.abs(detail.shoreLevel-detail.visualWaterLevel)<.00001&&
  detail.cliffSize[0]===1024&&detail.sandSize[0]===1024,
  detail,assets,terrainLayers,errors};
 await fs.writeFile(path.join(root,'test-results/materials-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));process.exitCode=report.pass?0:1;
}finally{await browser.close();}
