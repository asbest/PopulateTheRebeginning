import {pathToFileURL} from 'node:url';
import {createRequire} from 'node:module';
const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 page.on('console',m=>{if(m.type()==='error'&&/THREE|Shader|WebGL|Uncaught/i.test(m.text()))errors.push(m.text());});
 page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))errors.push(`${r.status()} ${r.url()}`);});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:90000});
 await page.evaluate(()=>{closeHelp();closeStoryOverlay();state.isPaused=true;});
 const result=await page.evaluate(()=>{
   const p=state.postprocessing,r=state.renderer;
   const draw=()=>p.render(state.scene,state.camera,state.graphicsQuality);
   setGraphicsQuality('high');draw();
   const high=p.status;
   if(high.failed||high.width<1||r.getRenderTarget())throw new Error('Postprocessing failed or leaked render target');
   p.adapt(30);draw();if(p.status.bloom)throw new Error('Bloom remained enabled below budget');
   p.adapt(25);draw();if(p.status.enabled)throw new Error('Direct rendering fallback not enabled');
   p.adapt(50);draw();if(!p.status.enabled||!p.status.bloom)throw new Error('Effects did not recover');
   setGraphicsQuality('low');draw();setGraphicsQuality('high');
   r.setSize(640,400);draw();if(p.status.width!==r.domElement.width)throw new Error('Resize mismatch');
   r.setSize(innerWidth,innerHeight);draw();
   const camera=state.camera;state.camera=state.perspectiveCamera;draw();state.camera=camera;
   return high;
 });
 await page.screenshot({path:'test-results/postprocessing.png'});
 if(errors.length)throw new Error(errors.join('\n'));
 console.log('PASS postprocessing, shader compilation, resize, cameras and FPS fallback '+JSON.stringify(result));
}finally{await browser.close();}
