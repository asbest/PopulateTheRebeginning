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
 await page.goto('http://127.0.0.1:8765/PopulateTheRebeginning.html?test=1',{timeout:90000});
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,{},{timeout:90000});
 const detail=await page.evaluate(()=>{
  closeHelp();closeStoryOverlay();state.isPaused=true;
  const p=state.shaman.mesh.position;
  const hut=gameTestAPI.createBuilding('hut',p.x+5,p.z+2,0);
  hut.underConstruction=false;hut.visualMesh.scale.y=1;
  state.cameraLookAt.copy(hut.mesh.position);
  state.viewScale=8;
  const aspect=innerWidth/innerHeight;
  Object.assign(state.orthoCamera,{left:-8*aspect,right:8*aspect,top:8,bottom:-8});
  state.orthoCamera.updateProjectionMatrix();window.updateCameraPosition();gameTestAPI.updateChunks(true);
  const images=[];hut.mesh.traverse(child=>{if(child.isMesh&&child.material?.map?.image)images.push([child.material.map.image.width,child.material.map.image.height]);});
  return {images,viewScale:state.viewScale};
 });
 await page.waitForTimeout(1000);
 await fs.mkdir(path.join(root,'test-results'),{recursive:true});
 await page.screenshot({path:path.join(root,'test-results/materials-close.png')});
 const assets=await Promise.all(['grass','stone','thatch','wood'].map(async name=>({name,bytes:(await fs.stat(path.join(root,'art/materials',name+'.png'))).size})));
 const report={pass:errors.length===0&&detail.images.some(([w,h])=>w>=1000&&h>=1000)&&assets.every(a=>a.bytes>1000000),detail,assets,errors};
 await fs.writeFile(path.join(root,'test-results/materials-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report));process.exitCode=report.pass?0:1;
}finally{await browser.close();}
