import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage({viewport:{width:320,height:240}});
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
 await page.waitForFunction(()=>window.gameTestAPI&&state.assetsReady,null,{timeout:90000});
 const result=await page.evaluate(()=>{
  state.isPaused=true;const renderer=state.renderer,gl=renderer.getContext();renderer.setPixelRatio(1);
  const flames=gameTestAPI.FirewarriorFlames;flames.init();
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-.6,.6,1.1,-.1,.1,10);camera.position.z=2;
  const mesh=new THREE.InstancedMesh(flames.mesh.geometry,flames.mesh.material,1);
  mesh.setMatrixAt(0,new THREE.Matrix4());mesh.setColorAt(0,new THREE.Color(1,.15,.02));scene.add(mesh);
  const trimmed=mesh.geometry,original=new THREE.PlaneGeometry(1,1);original.translate(0,.5,0);
  const pixels=()=>{renderer.render(scene,camera);const a=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,a);return a;};
  let max=0;
  for(let i=0;i<20;i++){
   mesh.material.uniforms.time.value=i*.073;mesh.geometry=original;const a=pixels();mesh.geometry=trimmed;const b=pixels();
   for(let j=0;j<a.length;j++)max=Math.max(max,Math.abs(a[j]-b[j]));
  }
  if(max>2)throw Error('Trimmed flames changed visible pixels: '+max);
  const fx=gameTestAPI.FireballFxManager;fx.init();
  for(const layer of Object.values(fx.layers))layer.items.length=0;
  fx.add('glow',0,0,0,1,2,0xff4400,0,1,0);fx.update(.1);
  const layer=fx.layers.glow,item=layer.items[0],effects=new THREE.Scene();effects.add(layer.mesh);
  const bounds=layer.mesh.geometry.boundingSphere;
  if(!bounds.containsPoint(new THREE.Vector3(item.x,item.y,item.z))||item.age!==.1)throw Error('Particle bounds or simulation changed');
  camera.position.x=100;camera.updateMatrixWorld(true);
  renderer.render(effects,camera);const culled=renderer.info.render.calls;
  layer.mesh.frustumCulled=false;renderer.render(effects,camera);const unculled=renderer.info.render.calls;
  if(culled!==0||unculled!==1)throw Error(JSON.stringify({culled,unculled}));
  fx.update(.1);if(item.age!==.2)throw Error('Off-screen particle stopped simulating');
  return {flamePixelDifference:max,culled,unculled,offscreenParticleAge:item.age};
 });
 console.log('PASS flame silhouette preserves pixels; off-screen bursts stop drawing while simulation continues '+JSON.stringify(result));
}finally{await browser.close();}
