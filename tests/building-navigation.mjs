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
        const first=gameTestAPI.createBuilding('hut',0,10,0,false);
        if(!first)throw new Error('Could not build first hut');
        if(gameTestAPI.createBuilding('hut',6,10,0,false))throw new Error('Direct construction accepted a blocked passage');
        const brave=new Humanoid(0,'wild',4,16);state.units.push(brave);
        state.mana=100;
        const before=state.buildings.filter(b=>!b.dead).length;
        gameTestAPI.performAction(6,10,'build_hut');
        if(state.mana!==100||state.buildings.filter(b=>!b.dead).length!==before)
            throw new Error('Rejected construction consumed mana or created a building');
        gameTestAPI.performAction(8.5,10,'build_hut');
        const second=state.buildings.at(-1);
        if(second===first||second.type!=='hut'||state.mana!==85)throw new Error('Valid spaced construction failed');
        const gap=8.5-first.collisionRadius-second.collisionRadius;
        if(gap<3)throw new Error('Passage between buildings is too narrow: '+gap);
        const route=Pathfinder.findPath(new THREE.Vector3(4.25,0,5),new THREE.Vector3(4.25,0,14));
        if(!route?.some(point=>point.z>=9&&point.z<=11&&point.x>first.collisionRadius&&point.x<8.5-second.collisionRadius))
            throw new Error('Pathfinder did not route through the passage');
        const walker=new Humanoid(0,'warrior',4.25,5);state.units.push(walker);
        for(let frame=0;frame<480&&walker.mesh.position.z<14;frame++){
            walker.manualMove(new THREE.Vector3(0,0,1),1/60);
            state.physicsWorld.timestep=1/60;state.physicsWorld.step();walker.update(1/60);
            if(walker.mesh.position.z>8&&walker.mesh.position.z<12&&
                (Math.hypot(walker.mesh.position.x,walker.mesh.position.z-10)<first.collisionRadius||
                 Math.hypot(walker.mesh.position.x-8.5,walker.mesh.position.z-10)<second.collisionRadius))
                throw new Error('Walker entered a building footprint');
        }
        if(walker.mesh.position.z<14)throw new Error('Walker could not pass between buildings: '+walker.mesh.position.z);
        state.selectedUnits=[brave];state.selectedBuilding=null;gameTestAPI.updateContextMenus();
        const buildMenuDemolish=document.getElementById('btn-demolish_building');
        if(!buildMenuDemolish)throw new Error('Build menu has no demolition action');
        buildMenuDemolish.click();
        if(state.currentAction!=='demolish_building')throw new Error('Demolition targeting did not activate');
        state.camera.position.set(4.25,25,25);state.camera.lookAt(4.25,6,10);
        state.camera.updateMatrixWorld(true);state.scene.updateMatrixWorld(true);
        const target=first.mesh.position.clone().add(new THREE.Vector3(0,.5,0)).project(state.camera);
        gameTestAPI.handleTap((target.x+1)*innerWidth/2,(1-target.y)*innerHeight/2,false,false);
        if(!first.dead||state.currentAction!=='select')throw new Error('Targeted demolition did not remove the house');
        state.selectedUnits=[];state.selectedBuilding=second;gameTestAPI.updateContextMenus();
        if(getComputedStyle(document.getElementById('right-menu')).display!=='none'||state.visibleActions.length)
            throw new Error('Menu remained visible without a selected unit');
        state.selectedBuilding=null;state.selectedUnits=[brave];gameTestAPI.updateContextMenus();
        document.getElementById('btn-demolish_building').click();
        const secondTarget=second.mesh.position.clone().add(new THREE.Vector3(0,.5,0)).project(state.camera);
        gameTestAPI.handleTap((secondTarget.x+1)*innerWidth/2,(1-secondTarget.y)*innerHeight/2,false,false);
        if(!second.dead)throw new Error('Demolition from the build menu failed');
        if(!gameTestAPI.createBuilding('hut',0,10,0,false))throw new Error('Demolished site stayed blocked');
        return {radius,nearest,closest,destinationX:routed.mesh.position.x,crossingX:crossing.mesh.position.x,gap,passageZ:walker.mesh.position.z};
    });
    const terrainIntegrity=await page.evaluate(()=>{
        for(const u of state.units){u.die();state.scene.remove(u.mesh);}state.units=[];
        for(const b of state.buildings)state.scene.remove(b.mesh);state.buildings=[];
        gameTestAPI.BuildingSpatialHash.markDirty();
        for(let x=10;x<=30;x++)for(let z=10;z<=30;z++)
            state.terrainMods.set(`${x},${z}`,6+(x-20)*.5+(z-20)*.2-gameTestAPI.getBaseHeight(x,z));
        state.cameraLookAt.set(20,8,20);state.heightCache.clear();gameTestAPI.updateChunks(true);
        for(let i=0;i<10;i++)gameTestAPI.updateChunks();
        const keys=['0,0','1,0','0,1','1,1'],res=gameTestAPI.CONFIG.TERRAIN.CHUNK_RES,stride=res+1;
        for(const key of keys){const geo=state.chunks[key].children[0].geometry;geo.computeBoundingSphere();geo.computeBoundingBox();}
        state.cameraLookAt.set(400,6,400);
        const house=gameTestAPI.createBuilding('hut',23,23);
        if(!house)throw new Error('Seam construction failed');
        const edge=state.chunks['0,1'].children[0].geometry.attributes.position;
        const other=state.chunks['1,1'].children[0].geometry.attributes.position;
        let maxSeam=0;
        for(let row=0;row<=res;row++)maxSeam=Math.max(maxSeam,Math.abs(edge.getY(row*stride+res)-other.getY(row*stride)));
        if(maxSeam>.001)throw new Error('Building opened the shared terrain edge: '+maxSeam);
        const mods=gameTestAPI.modifyTerrain(23,23,4,80);gameTestAPI.updateChunks(true,mods);
        let vertices=0;
        for(const key of keys){
            const geo=state.chunks[key].children[0].geometry,p=geo.attributes.position;
            if(geo.index.count!==res*res*6)throw new Error('Terrain triangles disappeared');
            for(let i=0;i<p.count;i++){
                const vertex=new THREE.Vector3().fromBufferAttribute(p,i);
                if(!geo.boundingBox.containsPoint(vertex)||vertex.distanceTo(geo.boundingSphere.center)>geo.boundingSphere.radius+.001)
                    throw new Error('Deformed terrain lies outside its culling bounds');
                vertices++;
            }
        }
        state.scene.updateMatrixWorld(true);
        for(const x of [19.9,20,20.1,22,23,24])for(const z of [20,22,23,24]){
            const h=getSurfaceHeight(x,z),ray=new THREE.Raycaster(new THREE.Vector3(x,h+100,z),new THREE.Vector3(0,-1,0),0,200);
            const hits=ray.intersectObjects(keys.map(key=>state.chunks[key].children[0]));
            if(!hits.length||Math.abs(hits[0].point.y-h)>.01)throw new Error('Visible terrain has a hole or seam at '+x+','+z);
            const cx=Math.round(x/40),cz=Math.round(z/40),collider=state.terrainColliders.get(`${cx},${cz}`);
            const hit=collider.castRay(new RAPIER.Ray({x,y:h+100,z},{x:0,y:-1,z:0}),200,true);
            if(hit<0||Math.abs(hit-100)>.03)throw new Error('Building terrain collider differs from the surface');
        }
        return {maxSeam,vertices};
    });
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('PASS building collision and route avoidance',result);
    console.log('PASS building terrain stays joined with complete triangles, bounds and matching colliders',terrainIntegrity);
} finally {
    await browser.close();
}
