import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';

const modulePath=process.argv.find(arg=>arg.startsWith('--playwright='))?.slice(13);
const {chromium}=modulePath?await import(pathToFileURL(modulePath).href):createRequire(import.meta.url)('playwright');
const browser=await chromium.launch({headless:true,...(process.platform==='win32'?{channel:'chrome'}:{})});
const page=await browser.newPage();
const errors=[];
page.on('pageerror',error=>errors.push(String(error)));
page.on('dialog',dialog=>dialog.accept());
try{
    await page.goto((process.env.GAME_URL||'http://127.0.0.1:8765')+'/PopulateTheRebeginning.html?test=1');
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman&&
        Object.values(state.chunks).some(chunk=>chunk.userData?.trees?.length),null,{timeout:60000});
    const vegetationBudget=await page.evaluate(()=>{
        const palm=Object.values(state.chunks).map(chunk=>chunk.userData?.palms?.mesh).find(Boolean);
        if(!palm)throw new Error('No coastal palm geometry loaded');
        const styles=['broadleaf','umbrella','conifer'].map(style=>{
            const tree=Art.tree(style);tree.updateMatrixWorld(true);
            const crown=tree.children[1].geometry;
            const trunkBox=new THREE.Box3().setFromObject(tree.children[0]);
            const crownBox=new THREE.Box3().setFromObject(tree.children[1]);
            const branches=tree.children.slice(2,6).every(branch=>{
                const box=new THREE.Box3().setFromObject(branch);
                return box.intersectsBox(trunkBox)&&box.intersectsBox(crownBox);
            });
            const positions=crown.getAttribute('position'),indices=crown.index;
            const parent=new Map();
            const key=i=>[positions.getX(i),positions.getY(i),positions.getZ(i)]
                .map(value=>value.toFixed(4)).join(',');
            const root=k=>{while(parent.get(k)!==k)k=parent.get(k);return k;};
            const join=(a,b)=>{a=root(a);b=root(b);if(a!==b)parent.set(a,b);};
            for(let i=0;i<positions.count;i++){const k=key(i);if(!parent.has(k))parent.set(k,k);}
            for(let i=0;i<indices.count;i+=3){const a=key(indices.getX(i)),b=key(indices.getX(i+1)),c=key(indices.getX(i+2));join(a,b);join(a,c);}
            return {style,vertices:positions.count,triangles:indices.count/3,
                components:new Set([...parent.keys()].map(root)).size,
                connectedToTrunk:trunkBox.intersectsBox(crownBox)&&branches};
        });
        const palmPositions=palm.geometry.getAttribute('position');
        const palmRoots=Array.from({length:11},(_,i)=>{
            const x=palmPositions.getX(35+i*14)-.10,z=palmPositions.getZ(35+i*14);
            return Math.hypot(x,z);
        });
        return {styles,
            palmVertices:palm.geometry.attributes.position.count,
            palmTriangles:palm.geometry.index.count/3,
            farthestPalmRoot:Math.max(...palmRoots)};
    });
    if(vegetationBudget.styles.some(tree=>tree.vertices>5760||tree.triangles>1920||
        tree.components!==1||!tree.connectedToTrunk)||vegetationBudget.palmVertices!==189||
        vegetationBudget.palmTriangles!==188||vegetationBudget.farthestPalmRoot>.085)
        throw new Error('Vegetation parts disconnected or geometry budget increased: '+JSON.stringify(vegetationBudget));
    console.log('PASS Tree crowns, branches and palm fronds connect within the original geometry budget',vegetationBudget);
    const first=await page.evaluate(()=>{
        window.closeHelp();window.closeStoryOverlay();
        document.getElementById('pause-menu').style.display='none';
        state.isPaused=true;state.campaignLevel=0;state.mana=1000;
        state.matchSettings.peaceTimeMinutes=0;
        state.cheatUnlimitedRange=true;state.selectedUnits=[state.shaman];
        window.enemyAIs=[];
        const trees=Object.values(state.chunks).flatMap(chunk=>chunk.userData?.trees||[]);
        const tree=trees.find(item=>item.mesh.visible);
        if(!tree)throw new Error('No visible tree to hit');
        window.testTreeId=tree.id;
        const x=tree.mesh.position.x,z=tree.mesh.position.z;
        gameTestAPI.performAction(x,z,'lightning');
        if(!tree.burned||!state.treeBurns.has(tree.id)||tree.originalParts.length<3)
            throw new Error('Lightning did not char all parts of the tree');
        const remaining=state.treeBurns.get(tree.id)-state.treeTime;
        if(Math.abs(remaining-300)>.01)throw new Error(`Wrong regrowth time: ${remaining}`);
        return {id:tree.id,parts:tree.originalParts.length,remaining};
    });
    console.log(`PASS Lightning chars a complete tree for ${first.remaining} game seconds (${first.parts} mesh parts)`);

    const saved=await page.evaluate(()=>{
        const id=testTreeId;
        const before=state.treeBurns.get(id)-state.treeTime;
        saveGame();loadGame();
        state.isPaused=true;
        return before;
    });
    await page.waitForFunction(id=>Object.values(state.chunks).some(chunk=>
        chunk.userData?.trees?.some(tree=>tree.id===id)),first.id,{timeout:15000});
    const persist=await page.evaluate(before=>{
        const id=testTreeId;
        const find=()=>Object.values(state.chunks).flatMap(chunk=>chunk.userData?.trees||[]).find(tree=>tree.id===id);
        if(!find()?.burned||Math.abs(state.treeBurns.get(id)-state.treeTime-before)>1)
            throw new Error(`Saved tree burn or regrowth timer was lost: ${JSON.stringify({burned:find()?.burned,expiry:state.treeBurns.get(id),time:state.treeTime,before})}`);
        const x=find().mesh.position.x,z=find().mesh.position.z;
        if(!isBlocked(x,z))throw new Error('Loaded tree did not block movement after save/load');
        const chunkKey=id.split(':')[0],look=state.cameraLookAt.clone();
        state.cameraLookAt.x+=500;state.cameraLookAt.z+=500;
        gameTestAPI.updateChunks();
        if(state.chunks[chunkKey])throw new Error('Test tree chunk did not unload');
        if(isBlocked(x,z))throw new Error('Unloaded tree still blocks movement');
        state.cameraLookAt.copy(look);
        for(let i=0;i<80&&!state.chunks[chunkKey];i++)gameTestAPI.updateChunks();
        if(!find()?.burned)throw new Error('Tree lost its charred state after chunk streaming');
        if(!isBlocked(x,z))throw new Error('Reloaded tree no longer blocks movement');
        return {remaining:state.treeBurns.get(id)-state.treeTime};
    },saved);
    console.log(`PASS Burned tree and remaining ${persist.remaining.toFixed(1)}s survive save/load and chunk streaming`);

    const regrowth=await page.evaluate(()=>{
        const id=testTreeId;
        const find=()=>Object.values(state.chunks).flatMap(chunk=>chunk.userData?.trees||[]).find(tree=>tree.id===id);
        const tree=find(),x=tree.mesh.position.x,z=tree.mesh.position.z;
        const until=state.treeBurns.get(id)-state.treeTime;
        gameTestAPI.updateTreeRegrowth(until-.05);
        if(!find()?.burned)throw new Error('Tree regrew before five minutes');
        gameTestAPI.burnTreesAt(x,z,.2);
        const renewed=state.treeBurns.get(id)-state.treeTime;
        if(Math.abs(renewed-300)>.01)throw new Error('A second hit did not renew regrowth');
        gameTestAPI.updateTreeRegrowth(299.95);
        if(!find()?.burned)throw new Error('Renewed tree regrew too early');
        gameTestAPI.updateTreeRegrowth(.06);
        if(find()?.burned||state.treeBurns.has(id)||find()?.originalParts)
            throw new Error('Tree did not restore its original model and materials');
        return {renewed};
    });
    console.log(`PASS Tree regrows after five minutes of game time; a new hit resets the timer (${regrowth.renewed}s)`);

    await page.evaluate(()=>{
        const id=testTreeId;
        const tree=Object.values(state.chunks).flatMap(chunk=>chunk.userData?.trees||[]).find(item=>item.id===id);
        const x=tree.mesh.position.x,z=tree.mesh.position.z,chunkKey=id.split(':')[0];
        const look=state.cameraLookAt.clone();
        state.cameraLookAt.x+=500;state.cameraLookAt.z+=500;
        gameTestAPI.updateChunks();
        if(state.chunks[chunkKey])throw new Error('Off-screen tree chunk did not unload');
        state.mana=1000;
        gameTestAPI.performAction(x,z,'lightning');
        if(!state.treeBurns.has(id))throw new Error('Off-screen lightning did not mark its tree');
        state.cameraLookAt.copy(look);
        for(let i=0;i<80&&!state.chunks[chunkKey];i++)gameTestAPI.updateChunks();
        const restored=state.chunks[chunkKey]?.userData.trees.find(item=>item.id===id);
        if(!restored?.burned)throw new Error('Off-screen lightning damage was not visible after streaming');
        gameTestAPI.updateTreeRegrowth(300.01);
        if(restored.burned)throw new Error('Off-screen tree did not regrow');
    });
    console.log('PASS A spell also burns trees outside loaded terrain chunks');

    await page.evaluate(()=>{
        const tree=Object.values(state.chunks).flatMap(chunk=>chunk.userData?.trees||[]).find(item=>item.id===testTreeId);
        const x=tree.mesh.position.x,z=tree.mesh.position.z;
        state.mana=1000;
        gameTestAPI.performAction(x,z,'blast');
        const projectile=state.projectiles.at(-1);
        if(!projectile)throw new Error('Fireball was not cast');
        projectile.mesh.position.set(x,tree.mesh.position.y,z);
        projectile.explode();
        if(!tree.burned)throw new Error('Fireball impact did not burn the regrown tree');
    });
    console.log('PASS A fireball can burn a regrown tree again');

    const pausedAt=await page.evaluate(()=>state.treeTime);
    await page.waitForTimeout(250);
    if(await page.evaluate(()=>state.treeTime)!==pausedAt)throw new Error('Tree regrowth continued while paused');
    console.log('PASS Pausing the game pauses the regrowth timer');
    if(errors.length)throw new Error(errors.join('\n'));
}finally{await browser.close();}
