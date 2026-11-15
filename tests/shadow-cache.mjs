import {createRequire} from 'node:module';import {pathToFileURL} from 'node:url';
const arg=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=arg?await import(pathToFileURL(arg).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try{
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.route('**/shadow-fixture.html',r=>r.fulfill({contentType:'text/html',body:'<!doctype html><title>Shadow cache</title>'}));
 await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/shadow-fixture.html');
 const result=await page.evaluate(async()=>{
  const T=await import('./vendor/three.module.js'),{createShadowCache}=await import('./art/shadow-cache.js');
  const renderer=new T.WebGLRenderer({antialias:false});renderer.setSize(320,240);renderer.shadowMap.enabled=true;
  renderer.shadowMap.type=T.PCFSoftShadowMap;document.body.append(renderer.domElement);
  const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,320/240,.1,100),cache=createShadowCache(T);
  camera.position.set(7,6,8);camera.lookAt(0,0,0);scene.add(new T.AmbientLight(0xffffff,.3));
  const sun=new T.DirectionalLight(0xffffff,1);sun.position.set(4,8,3);sun.castShadow=true;sun.shadow.mapSize.set(512,512);
  sun.shadow.camera.left=sun.shadow.camera.bottom=-8;sun.shadow.camera.right=sun.shadow.camera.top=8;
  sun.shadow.camera.updateProjectionMatrix();scene.add(sun);
  const ground=new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshStandardMaterial({color:0xaaaaaa}));
  ground.rotation.x=-Math.PI/2;ground.receiveShadow=true;scene.add(ground);
  const box=new T.Mesh(new T.BoxGeometry(2,2,2),new T.MeshStandardMaterial({color:0x4499ff}));box.position.y=1;box.castShadow=true;scene.add(box);
  scene.onBeforeRender=()=>cache.update(scene,camera,renderer);
  const gl=renderer.getContext();let draws=0;
  const original=gl.drawElements;gl.drawElements=function(...args){draws++;return original.apply(this,args);};
  const render=()=>{draws=0;renderer.render(scene,camera);gl.finish();return draws;};
  const pixels=()=>{const p=new Uint8Array(320*240*4);gl.readPixels(0,0,320,240,gl.RGBA,gl.UNSIGNED_BYTE,p);return p;};
  const checks=[];
  for(const change of [()=>{},()=>box.position.x=2,()=>box.visible=false,()=>{box.visible=true;sun.position.z=-4;},()=>scene.remove(box)]){
   change();cache.enabled=false;const baseline=render(),a=pixels();cache.enabled=true;render();render();const cached=render(),b=pixels();
   let difference=0;for(let i=0;i<a.length;i++)if(Math.abs(a[i]-b[i])>1)difference++;
   if(difference||cached>baseline||box.parent&&box.visible&&cached===baseline)throw Error(JSON.stringify({difference,baseline,cached}));
   checks.push({baseline,cached,difference});
  }
  renderer.dispose();return {checks,stats:cache.stats};
 });
 if(errors.length)throw Error(JSON.stringify(errors));console.log('PASS shadow cache preserves pixels through movement, visibility, light changes and destruction '+JSON.stringify(result));
}finally{await browser.close();}
