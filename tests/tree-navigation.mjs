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
    await page.waitForFunction(()=>window.gameTestAPI&&state.shaman&&
        Object.values(state.chunks).some(chunk=>chunk.userData?.trees?.length),null,{timeout:60000});
    const result=await page.evaluate(()=>{
        state.isPaused=true;
        const waterLevel=CONFIG.TERRAIN.WATER_LEVEL;
        const trees=Object.values(state.chunks).flatMap(chunk=>chunk.userData?.trees||[]);
        let site=null;
        for(const tree of trees)for(const [dx,dz] of [[1,0],[0,1]]){
            const x=tree.mesh.position.x,z=tree.mesh.position.z;
            const start={x:x-dx*3.2,z:z-dz*3.2},end={x:x+dx*3.2,z:z+dz*3.2};
            if([start,end].some(p=>getHeight(p.x,p.z)<waterLevel+1||isBlocked(p.x,p.z)))continue;
            const path=Pathfinder.findPath(new THREE.Vector3(start.x,0,start.z),
                new THREE.Vector3(end.x,0,end.z),false,1.5);
            if(path?.length){site={tree,start,end,path,dx,dz};break;}
        }
        if(!site)throw new Error('No reachable tree crossing found');
        const {tree,start,end,path,dx,dz}=site;
        const radius=.4+.29*tree.mesh.scale.x;
        if(!isBlocked(tree.mesh.position.x,tree.mesh.position.z))throw new Error('Tree trunk is not blocked');
        const points=[start,...path.map(point=>({x:point.x,z:point.z})),end];
        for(let i=1;i<points.length;i++){
            const a=points[i-1],b=points[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/.25);
            for(let j=1;j<=steps;j++){
                const t=j/steps,x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
                if(Math.hypot(x-tree.mesh.position.x,z-tree.mesh.position.z)<radius-.02)
                    throw new Error('Path crosses a tree trunk');
            }
        }
        const follower=new Humanoid(0,'wild',start.x,start.z);
        state.units.push(follower);
        const direction=new THREE.Vector3(dx,0,dz);
        let closest=Infinity;
        for(let frame=0;frame<180;frame++){
            follower.manualMove(direction,1/60);
            state.physicsWorld.timestep=1/60;state.physicsWorld.step();
            follower.update(1/60);
            closest=Math.min(closest,Math.hypot(follower.mesh.position.x-tree.mesh.position.x,
                follower.mesh.position.z-tree.mesh.position.z));
        }
        if(closest<radius-.03)throw new Error('Follower entered tree trunk: '+closest);
        let slope=null;
        const origin=state.shaman.mesh.position;
        for(let x=origin.x-24;x<origin.x+24&&!slope;x+=1.5)for(let z=origin.z-24;z<origin.z+24;z+=1.5){
            const h=getHeight(x,z),east=getHeight(x+1.2,z),west=getHeight(x-1.2,z);
            if(h<gameTestAPI.aiDryHeight()+2.5||east<waterLevel+2||west<waterLevel+2||
                east-h<.48||isBlocked(x,z)||isBlocked(x+.6,z)||isBlocked(x-.6,z))continue;
            slope={x,z};break;
        }
        if(!slope)throw new Error('No dry slope found');
        const climber=new Humanoid(0,'wild',slope.x,slope.z);
        state.units.push(climber);
        climber.manualMove(new THREE.Vector3(1,0,0),.1);
        const uphill=Math.abs(climber.rigidBody.linvel().x);
        climber.rigidBody.setLinvel({x:0,y:0,z:0},true);
        climber.manualMove(new THREE.Vector3(-1,0,0),.1);
        const downhill=Math.abs(climber.rigidBody.linvel().x);
        if(uphill>=downhill*.5)throw new Error(`Uphill movement was too fast: ${uphill}, ${downhill}`);
        return {radius,closest,pathPoints:path.length,slopeHeight:getHeight(slope.x,slope.z),
            rise:getHeight(slope.x+1.2,slope.z)-getHeight(slope.x,slope.z),uphill,downhill};
    });
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('PASS tree collision, route avoidance and slope-aware walking',result);
} finally {
    await browser.close();
}
