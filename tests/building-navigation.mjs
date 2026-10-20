import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
try {
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman,null,{timeout:60000});
    const result=await page.evaluate(()=>{
        state.isPaused=true;
        gameTestAPI.PathWorker.disable();
        for(const unit of state.units){unit.die();state.scene.remove(unit.mesh);}
        state.units=[];
        for(const building of state.buildings)state.scene.remove(building.mesh);
        state.buildings=[];
        gameTestAPI.BuildingSpatialHash.markDirty();
        for(let x=-15;x<=15;x++)for(let z=-15;z<=15;z++)
            state.terrainMods.set(`${x},${z}`,6-gameTestAPI.getBaseHeight(x,z));
        state.heightCache.clear();gameTestAPI.updateChunks(true);
        for(const chunk of Object.values(state.chunks))for(const tree of chunk.userData?.trees||[])tree.mesh.visible=false;
        const building=gameTestAPI.createBuilding('warrior',0,0,0,false);
        building.underConstruction=false;building.visualMesh.scale.y=1;
        gameTestAPI.BuildingSpatialHash.markDirty();gameTestAPI.BuildingSpatialHash.update();
        const radius=building.collisionRadius;
        const manual=new Humanoid(0,'warrior',-7,0);state.units.push(manual);
        let nearest=Infinity,nearestFrame=-1,nearestPosition=null;
        for(let frame=0;frame<180;frame++){
            manual.manualMove(new THREE.Vector3(1,0,0),1/60);
            state.physicsWorld.timestep=1/60;state.physicsWorld.step();manual.update(1/60);
            const distance=Math.hypot(manual.mesh.position.x,manual.mesh.position.z);
            if(distance<nearest){nearest=distance;nearestFrame=frame;nearestPosition={x:manual.mesh.position.x,z:manual.mesh.position.z};}
        }
        if(nearest<radius-.03)throw new Error(`Manual unit crossed building footprint: ${nearest}, radius ${radius}, frame ${nearestFrame}, position ${JSON.stringify(nearestPosition)}, final ${manual.mesh.position.x}, blocked ${isBlocked(nearestPosition.x,nearestPosition.z)}`);
        const routed=new Humanoid(0,'warrior',-7,-1);state.units.push(routed);
        routed.goto(7,-1);
        if(routed.state!=='move')throw new Error('No route around building');
        let closest=Infinity;
        for(let frame=0;frame<900;frame++){
            state.physicsWorld.timestep=1/60;state.physicsWorld.step();routed.update(1/60);
            closest=Math.min(closest,Math.hypot(routed.mesh.position.x,routed.mesh.position.z));
            if(routed.mesh.position.x>6)break;
        }
        if(closest<radius-.03)throw new Error(`Routed unit crossed building footprint: ${closest}, radius ${radius}`);
        if(routed.mesh.position.x<6)throw new Error(`Routed unit did not pass building: ${routed.mesh.position.x}, ${routed.mesh.position.z}`);
        building.destroy(false);gameTestAPI.BuildingSpatialHash.update();
        manual.placeOnGround(-12,-12);
        const crossing=new Humanoid(0,'warrior',-7,0);state.units.push(crossing);
        for(let frame=0;frame<540;frame++){
            crossing.manualMove(new THREE.Vector3(1,0,0),1/60);
            state.physicsWorld.timestep=1/60;state.physicsWorld.step();crossing.update(1/60);
        }
        if(crossing.mesh.position.x<3)throw new Error('Destroyed building still blocks movement: '+crossing.mesh.position.x);
        return {radius,nearest,closest,destinationX:routed.mesh.position.x,crossingX:crossing.mesh.position.x};
    });
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('PASS building collision and route avoidance',result);
} finally {
    await browser.close();
}
