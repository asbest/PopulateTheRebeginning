import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1600,height:900}});
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',{waitUntil:'load'});
    await page.waitForFunction(()=>window.gameTestAPI?.CritterManager?.bunnies.length>=12&&
        window.gameTestAPI.CritterManager.birds.length>=8,null,{timeout:60000});
    await page.waitForFunction(()=>Art.blender.texture('fur','map').image?.width>=1000&&
        Art.blender.texture('feather','map').image?.width>=1000,null,{timeout:30000});
    const png=await page.evaluate(()=>{
        const T=THREE,{bunnies,birds}=gameTestAPI.CritterManager;
        const unique=animals=>[...new Map(animals.map(animal=>[animal.mesh.userData.coatName,animal.mesh])).values()];
        const rabbits=unique(bunnies).slice(0,5),flyers=unique(birds).slice(0,5);
        if(rabbits.length!==5||flyers.length!==5)throw new Error('Not all wildlife color variants spawned');
        const animals=[...rabbits,...flyers];
        const original=animals.map(mesh=>({mesh,parent:mesh.parent,position:mesh.position.clone(),rotation:mesh.rotation.clone()}));
        const scene=new T.Scene();scene.background=new T.Color(0x9fc7dc);
        scene.add(new T.HemisphereLight(0xe9f2e4,0x4c5d52,1.5));
        const sun=new T.DirectionalLight(0xffdcac,2.5);sun.position.set(-5,9,7);scene.add(sun);
        const rim=new T.DirectionalLight(0x8bc6de,.8);rim.position.set(6,4,-5);scene.add(rim);
        const floor=new T.Mesh(new T.PlaneGeometry(38,28),new T.MeshStandardMaterial({color:0x64834f,roughness:1}));
        floor.rotation.x=-Math.PI/2;scene.add(floor);
        rabbits.forEach((mesh,i)=>{scene.add(mesh);mesh.position.set((i-2)*2.25,0,5);mesh.rotation.set(0,.28,0);});
        flyers.forEach((mesh,i)=>{scene.add(mesh);mesh.position.set(i<3?(i-1)*4:(i-3.5)*4,
            i<3?3.4:2.1,i<3?-2:1);mesh.rotation.set(0,-.25,0);});
        const camera=new T.PerspectiveCamera(42,1600/900,.1,100);
        camera.position.set(0,3.5,15);camera.lookAt(0,1.8,0);
        state.renderer.render(scene,camera);
        const image=state.renderer.domElement.toDataURL('image/png');
        for(const {mesh,parent,position,rotation} of original){parent.add(mesh);mesh.position.copy(position);mesh.rotation.copy(rotation);}
        return image;
    });
    await fs.writeFile(new URL('../docs/wildlife-variants.png',import.meta.url),Buffer.from(png.split(',')[1],'base64'));
    console.log('docs/wildlife-variants.png');
} finally {await browser.close();}
