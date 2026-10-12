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
    await page.waitForFunction(()=>window.state?.renderer&&window.Art?.blender?.models,null,{timeout:60000});
    const result=await page.evaluate(async()=>{
        await Promise.all([Art.ready,Characters.ready]);
        const keys=Object.keys(Art.blender.models);
        const required=[...['hut','spy','tower','warrior','fire','shipyard'].map(k=>'building/'+k+'/root'),
            ...['wild','warrior','shaman','firewarrior','spy'].flatMap(k=>['torso','head','armL','armR','legL','legR'].map(p=>'character/'+k+'/'+p)),
            'character/airship/root','tree/trunk','tree/crown','critter/bunny/root','critter/bird/root',
            'critter/bird/wingL','critter/bird/wingR','critter/bird/tail',
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
        if(count(tree.children[0])<1||count(tree.children[1])<1)throw new Error('Tree detail was not attached to burnable trunk/crown');
        const birdWing=state.scene.getObjectByName('Blender detail LOD critter/bird/wingL');
        if(!birdWing||birdWing.parent.parent.children[0].visible)throw new Error('Animated bird wing did not replace the old flat plane');
        const textures=['grass','stone','wood','thatch','skin','cloth','rope','leather','bronze','ivory','dark','ember','foliage','fur','feather','sand','cliff'].map(kind=>{
            const normal=Art.blender.texture(kind,'normal'),rough=Art.blender.texture(kind,'roughness'),albedo=Art.blender.texture(kind,'map');
            return {kind,albedo:[albedo.image?.width,albedo.image?.height],normal:[normal.image?.width,normal.image?.height],rough:[rough.image?.width,rough.image?.height]};
        });
        return {keys:keys.length,buildings,roles,treeDetails:count(tree),birdWing:true,textures};
    });
    await page.waitForFunction(()=>['grass','stone','wood','thatch','skin','cloth','rope','leather','bronze','ivory','dark','ember','foliage','fur','feather','sand','cliff'].every(k=>
        ['map','normal','roughness'].every(type=>Art.blender.texture(k,type).image?.width>=1000)),null,{timeout:30000});
    if(errors.length||missing.length)throw new Error(JSON.stringify({errors,missing}));
    console.log('PASS indexed Blender model integration and seventeen full-resolution PBR material sets',result);
} finally {await browser.close();}
