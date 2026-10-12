import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1200,height:800}});
    await page.goto('http://127.0.0.1:8765/PopulateTheRebeginning.html?test=1',{waitUntil:'load'});
    await page.waitForFunction(()=>window.gameTestAPI?.CritterManager?.bunnies.length&&window.gameTestAPI.CritterManager.birds.length,null,{timeout:60000});
    await page.waitForFunction(()=>['fur','feather','ivory','leather','dark','bronze'].every(kind=>
        ['map','normal','roughness'].every(type=>Art.blender.texture(kind,type).image?.width>=1024)),null,{timeout:30000});
    const png=await page.evaluate(()=>{
        const T=THREE,{bunnies,birds}=gameTestAPI.CritterManager;
        const bunny=bunnies[0].mesh,bird=birds[0].mesh;
        const original=[[bunny,bunny.parent,bunny.position.clone(),bunny.rotation.clone()],
            [bird,bird.parent,bird.position.clone(),bird.rotation.clone()]];
        const scene=new T.Scene();scene.background=new T.Color(0x233638);
        scene.add(new T.HemisphereLight(0xdde9e3,0x384044,1.8));
        const sun=new T.DirectionalLight(0xffe1ac,2.6);sun.position.set(-2,5,5);scene.add(sun);
        const rim=new T.DirectionalLight(0x8ad9f0,1.5);rim.position.set(3,3,-3);scene.add(rim);
        const floor=new T.Mesh(new T.PlaneGeometry(8,8),new T.MeshStandardMaterial({color:0x526950,roughness:1}));
        floor.rotation.x=-Math.PI/2;scene.add(floor);
        scene.add(bunny,bird);bunny.position.set(-.8,0,.15);bunny.rotation.set(0,.35,0);
        bird.position.set(.8,1.15,0);bird.rotation.set(0,-.35,0);
        const camera=new T.PerspectiveCamera(35,1.5,.1,100);camera.position.set(0,1.25,4.2);camera.lookAt(0,.63,0);
        state.renderer.render(scene,camera);
        const data=state.renderer.domElement.toDataURL('image/png');
        for(const [mesh,parent,position,rotation] of original){parent.add(mesh);mesh.position.copy(position);mesh.rotation.copy(rotation);}
        return data;
    });
    await fs.writeFile(new URL('../docs/wildlife-preview.png',import.meta.url),Buffer.from(png.split(',')[1],'base64'));
    console.log('docs/wildlife-preview.png');
} finally {await browser.close();}
