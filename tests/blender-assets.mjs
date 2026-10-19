import fs from 'node:fs/promises';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(a=>a.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
await fs.access(new URL('../art/blender/Overhaul.blend',import.meta.url));
const pack=JSON.parse(await fs.readFile(new URL('../art/blender/mesh-pack.json',import.meta.url),'utf8'));
if(pack.version!==2||!Object.values(pack.models).every(model=>Object.values(model).every(part=>
    part.index?.length>0&&part.position.length/3<=part.index.length)))throw new Error('Indexed Blender export is incomplete');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],missing=[];
    page.on('pageerror',e=>errors.push(String(e)));
    page.on('response',r=>{if(r.status()===404)missing.push(r.url());});
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1',{waitUntil:'load',timeout:60000});
    await page.waitForFunction(()=>window.gameTestAPI&&window.state?.renderer&&window.Art?.blender?.models,null,{timeout:90000});
    const result=await page.evaluate(async()=>{
        await Promise.all([Art.ready,Characters.ready]);
        const keys=Object.keys(Art.blender.models);
        const required=[...['hut','spy','tower','warrior','fire','shipyard'].map(k=>'building/'+k+'/root'),
            ...['wild','warrior','shaman','firewarrior','spy'].flatMap(k=>['torso','head','armL','armR','legL','legR'].map(p=>'character/'+k+'/'+p)),
            'character/airship/root','tree/trunk','tree/crown','critter/bunny/root','critter/bird/root',
            ...['body','head','earL','earR','frontLegL','frontLegR','hindLegL','hindLegR','tail'].map(k=>'critter/bunny/'+k),
            ...['body','head','wingL','wingR','tail'].map(k=>'critter/bird/'+k),
            ...['stem','center','petal','tulip'].map(k=>'prop/flower/'+k)];
        const absent=required.filter(k=>!keys.includes(k));
        if(absent.length)throw new Error('Missing Blender models: '+absent.join(','));
        const count=node=>{let total=0;node.traverse(n=>{if(n.userData.blenderAsset)total++;});return total;};
        const buildings=['hut','spy','tower','warrior','fire','shipyard'].map(kind=>({kind,details:count(Art.building(kind))}));
        if(buildings.some(b=>b.details<1))throw new Error('Building detail was not attached');
        const probe=Art.building('hut'),lod=probe.getObjectByName('Blender detail LOD building/hut/root');
        const camera=new THREE.PerspectiveCamera();probe.updateMatrixWorld(true);
        camera.position.set(0,0,150);camera.updateMatrixWorld(true);lod.update(camera);
        if(lod.levels[0].object.visible)throw new Error('Distant detail was not culled');
        camera.position.set(0,0,8);camera.updateMatrixWorld(true);lod.update(camera);
        if(!lod.levels[0].object.visible)throw new Error('Close detail was not restored');
        const roles=['wild','warrior','shaman','firewarrior','spy','airship'].map(type=>{const u={mesh:new THREE.Group(),type};Characters.build(u,0x387bb7);return {type,details:count(u.mesh)};});
        if(roles.some(r=>r.details<2))throw new Error('Character detail was not attached');
        const tree=Art.tree();
        if(count(tree.children[0])<1||count(tree.children[1])!==0)
            throw new Error('Tree trunk detail or the continuous burnable crown is missing');
        const birdWing=state.scene.getObjectByName('Blender detail LOD critter/bird/wingL');
        if(!birdWing||birdWing.parent.parent.children[0].visible)throw new Error('Animated bird wing did not replace the old flat plane');
        const wildlife=gameTestAPI.CritterManager;
        const bunny=wildlife.bunnies[0],bird=wildlife.birds[0];
        if(!bunny?.rig||!bird?.head||!birdWing)throw new Error('Articulated wildlife rigs were not spawned');
        const rabbitCoats=new Set(wildlife.bunnies.map(a=>a.mesh.userData.coatName));
        const birdPlumages=new Set(wildlife.birds.map(a=>a.mesh.userData.coatName));
        const rabbitBack=bunny.mesh.getObjectByName('Blender critter/bunny/body fur')?.material;
        const rabbitBelly=bunny.mesh.getObjectByName('Blender critter/bunny/body ivory')?.material;
        const birdBack=bird.mesh.getObjectByName('Blender critter/bird/body feather')?.material;
        const birdBelly=bird.mesh.getObjectByName('Blender critter/bird/body ivory')?.material;
        if(rabbitCoats.size<4||birdPlumages.size<4||!rabbitBack||!rabbitBelly||!birdBack||!birdBelly||
            rabbitBack.color.getHex()===rabbitBelly.color.getHex()||birdBack.color.getHex()===birdBelly.color.getHex()||
            rabbitBack.map!==Art.blender.texture('fur','map')||
            birdBack.map!==Art.blender.texture('feather','map'))
            throw new Error('Wildlife materials lack natural coat variation and detail: '+JSON.stringify({rabbitCoats:[...rabbitCoats],birdPlumages:[...birdPlumages],
                rabbitBack:rabbitBack?.color.getHexString(),rabbitBelly:rabbitBelly?.color.getHexString(),
                birdBack:birdBack?.color.getHexString(),birdBelly:birdBelly?.color.getHexString()}));
        if(CONFIG.CRITTERS.BUNNY_COUNT!==15||CONFIG.CRITTERS.BIRD_COUNT!==10)
            throw new Error('Wildlife population was not halved: '+JSON.stringify({bunnies:CONFIG.CRITTERS.BUNNY_COUNT,birds:CONFIG.CRITTERS.BIRD_COUNT}));
        const focus=wildlife.focus(),nearBunnies=wildlife.bunnies.filter(a=>Math.hypot(a.mesh.position.x-focus.x,a.mesh.position.z-focus.z)<CONFIG.CRITTERS.BUNNY_SPAWN_RANGE*.55).length,
            nearBirds=wildlife.birds.filter(a=>Math.hypot(a.mesh.position.x-focus.x,a.mesh.position.z-focus.z)<CONFIG.CRITTERS.BIRD_SPAWN_RANGE*.55).length;
        const bunnySize=new THREE.Box3().setFromObject(bunny.mesh).getSize(new THREE.Vector3()),birdSize=new THREE.Box3().setFromObject(bird.mesh).getSize(new THREE.Vector3());
        if(nearBunnies<CONFIG.CRITTERS.BUNNY_COUNT*.75||nearBirds<CONFIG.CRITTERS.BIRD_COUNT*.75||bunny.mesh.name!=='Wild rabbit'||bird.mesh.name!=='Wild bird'||
            bunnySize.length()<.7||birdSize.length()<1.4)throw new Error('Wildlife is not visible near the camera: '+JSON.stringify({nearBunnies,nearBirds,bunnySize,birdSize}));
        const animalParts=['body','head','earL','earR','frontLegL','frontLegR','hindLegL','hindLegR','tail'];
        for(const key of animalParts) {
            const lod=bunny.mesh.getObjectByName('Blender detail LOD critter/bunny/'+key);
            if(!lod)throw new Error('Missing bunny rig part '+key);
        }
        for(const key of ['body','head','wingL','wingR','tail']) {
            if(!bird.mesh.getObjectByName('Blender detail LOD critter/bird/'+key))throw new Error('Missing bird rig part '+key);
        }
        bunny.timer=0;
        let maxHop=0,earMotion=0,wingMotion=0,minClearance=Infinity;
        const initialEar=bunny.rig.userData.joints.ears[0].rotation.x;
        const initialWing=bird.leftWing.rotation.z;
        for(let i=0;i<70;i++) {
            wildlife.update(1/60);
            const ground=getHeight(bunny.mesh.position.x,bunny.mesh.position.z);
            maxHop=Math.max(maxHop,bunny.mesh.position.y-ground);
            minClearance=Math.min(minClearance,bunny.mesh.position.y-ground);
            earMotion=Math.max(earMotion,Math.abs(bunny.rig.userData.joints.ears[0].rotation.x-initialEar));
            wingMotion=Math.max(wingMotion,Math.abs(bird.leftWing.rotation.z-initialWing));
        }
        if(maxHop<.1||minClearance<-.04||earMotion<.05||wingMotion<.1)
            throw new Error('Wildlife animation or terrain contact failed: '+JSON.stringify({maxHop,minClearance,earMotion,wingMotion}));
        if(!Number.isFinite(bird.mesh.position.y)||bird.mesh.position.y<getHeight(bird.mesh.position.x,bird.mesh.position.z)+7)
            throw new Error('Bird lost flight clearance');
        bunny.mesh.position.x=focus.x+CONFIG.CRITTERS.BUNNY_RESPAWN_DIST+2;
        bird.mesh.position.x=focus.x+CONFIG.CRITTERS.BIRD_RESPAWN_DIST+2;
        wildlife.update(1/60);
        if(wildlife.bunnies.includes(bunny)||wildlife.birds.includes(bird))
            throw new Error('Wildlife failed to respawn after leaving the map');
        const textures=['grass','stone','wood','thatch','skin','cloth','rope','leather','bronze','ivory','dark','ember','foliage','fur','feather','sand','cliff','dirt','mud','gravel','moss'].map(kind=>{
            const normal=Art.blender.texture(kind,'normal'),rough=Art.blender.texture(kind,'roughness'),albedo=Art.blender.texture(kind,'map');
            return {kind,albedo:[albedo.image?.width,albedo.image?.height],normal:[normal.image?.width,normal.image?.height],rough:[rough.image?.width,rough.image?.height]};
        });
        return {keys:keys.length,buildings,roles,treeDetails:count(tree),wildlife:{maxHop,minClearance,earMotion,wingMotion,
            rabbitCoats:[...rabbitCoats],birdPlumages:[...birdPlumages],nearBunnies,nearBirds,bunnySize,birdSize},textures};
    });
    await page.waitForFunction(()=>['grass','stone','wood','thatch','skin','cloth','rope','leather','bronze','ivory','dark','ember','foliage','fur','feather','sand','cliff','dirt','mud','gravel','moss'].every(k=>
        ['map','normal','roughness'].every(type=>Art.blender.texture(k,type).image?.width>=1000)),null,{timeout:30000});
    if(errors.length||missing.length)throw new Error(JSON.stringify({errors,missing}));
    console.log('PASS indexed Blender model integration and twenty-one full-resolution PBR material sets',result);
} finally {await browser.close();}
