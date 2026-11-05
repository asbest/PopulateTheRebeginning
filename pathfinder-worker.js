// Off-main-thread A* for AI orders. The browser game remains authoritative for
// movement and validates/smooths the returned route on the main thread.
import {createTerrainHeight} from './art/terrain-height.js';
self.window=self;
const noiseReady=import('./vendor/simplex-noise.min.js');

let heightField=null;
const neighbors=[{x:0,y:1},{x:1,y:0},{x:0,y:-1},{x:-1,y:0},
    {x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1}];
let terrain={},pathfinder={},biome='normal',waterState='liquid',waterLevel=1.805,
    visualWaterLevel=.45125,noiseScale=.02,heightMultiplier=1,bridgeHeight=3,bridgeWidth=2.5,
    version=-1,mods=new Map(),buildings=[],heightCache=new Map();

function height(x,z){return heightField.getHeight(x,z);}
function nearbyBuildings(x,z){
    return buildings.filter(b=>(x-b.x)**2+(z-b.z)**2<(b.radius||2)**2+16);
}
function blocked(x,z){
    return nearbyBuildings(x,z).some(b=>(x-b.x)**2+(z-b.z)**2<(b.radius||2)**2);
}
function walkableLine(a,b,avoidWater){
    const dx=b.x-a.x,dz=b.z-a.z,dist=Math.hypot(dx,dz),steps=Math.ceil(dist/(avoidWater?.25:1));
    if(steps<=1)return true;
    const safeH=avoidWater&&waterState!=='frozen'?visualWaterLevel+.45:waterLevel-pathfinder.WATER_SAFE_DEPTH;
    for(let i=1;i<steps;i++){
        const x=a.x+dx*i/steps,z=a.z+dz*i/steps;
        if(height(x,z)<safeH||blocked(x,z))return false;
    }
    return true;
}
class Heap{
    constructor(){this.items=[];}
    push(item){const a=this.items;let i=a.length;a.push(item);while(i>0){const p=(i-1)>>1;if(a[p].f<=item.f)break;a[i]=a[p];i=p;}a[i]=item;}
    pop(){const a=this.items,top=a[0],end=a.pop();if(a.length){let i=0;while(true){let c=i*2+1;if(c>=a.length)break;if(c+1<a.length&&a[c+1].f<a[c].f)c++;if(a[c].f>=end.f)break;a[i]=a[c];i=c;}a[i]=end;}return top;}
    get size(){return this.items.length;}
}
function findPath(start,end,isFlying,avoidWater,waterExit){
    const grid=pathfinder.GRID_SIZE;
    let startNode={x:Math.round(start.x/grid),y:Math.round(start.z/grid)};
    const endNode={x:Math.round(end.x/grid),y:Math.round(end.z/grid)};
    const startBlocked=!isFlying&&blocked(start.x,start.z);
    const dryRoute=avoidWater&&waterState!=='frozen';
    const safeH=dryRoute?visualWaterLevel+.45:waterLevel-pathfinder.WATER_SAFE_DEPTH;
    if(dryRoute&&height(end.x,end.z)<safeH)return null;
    if(dryRoute&&height(start.x,start.z)>=safeH&&
        (height(startNode.x*grid,startNode.y*grid)<safeH||
         !walkableLine(start,{x:startNode.x*grid,z:startNode.y*grid},true))){
        let best=null,bestDistance=Infinity;
        for(let dx=-2;dx<=2;dx++)for(let dy=-2;dy<=2;dy++){
            const gx=startNode.x+dx,gy=startNode.y+dy,point={x:gx*grid,z:gy*grid};
            if(height(point.x,point.z)<safeH||(!startBlocked&&!walkableLine(start,point,true)))continue;
            const distance=(point.x-start.x)**2+(point.z-start.z)**2;
            if(distance<bestDistance){best={x:gx,y:gy};bestDistance=distance;}
        }
        if(best)startNode=best;
    }
    if(startNode.x===endNode.x&&startNode.y===endNode.y)return [];
    const heap=new Heap(),open=new Map(),closed=new Set();
    const key=(x,y)=>(x&0xffff)<<16|(y&0xffff);
    startNode.h=height(startNode.x*grid,startNode.y*grid);
    startNode.g=0;startNode.f=0;heap.push(startNode);open.set(key(startNode.x,startNode.y),startNode);
    let iterations=0;
    while(heap.size){
        if(++iterations>pathfinder.MAX_ITERATIONS)break;
        const current=heap.pop(),currentKey=key(current.x,current.y);
        if(closed.has(currentKey))continue;
        open.delete(currentKey);closed.add(currentKey);
        if(current.x===endNode.x&&current.y===endNode.y){
            const route=[];let node=current;
            while(node.parent){route.push([node.x*grid,node.y*grid]);node=node.parent;}
            route.reverse();
            if(dryRoute&&Math.hypot(start.x-startNode.x*grid,start.z-startNode.y*grid)>.5)
                route.unshift([startNode.x*grid,startNode.y*grid]);
            return route;
        }
        for(const offset of neighbors){
            const nx=current.x+offset.x,ny=current.y+offset.y,nKey=key(nx,ny);
            if(closed.has(nKey))continue;
            const old=open.get(nKey),wx=nx*grid,wz=ny*grid;
            let h=old?.h;
            if(!old){
                h=height(wx,wz);
                if(!isFlying&&h<safeH&&!waterExit)continue;
                const targetDistance=Math.hypot(nx-endNode.x,ny-endNode.y);
                if(!isFlying&&targetDistance>pathfinder.TARGET_PROXIMITY&&blocked(wx,wz)){
                    const canExit=startBlocked&&nearbyBuildings(wx,wz).every(b=>{
                        const origin=(start.x-b.x)**2+(start.z-b.z)**2;
                        const next=(wx-b.x)**2+(wz-b.z)**2;
                        const radiusSq=(b.radius||2)**2;
                        return next>=radiusSq||
                            (origin<radiusSq&&next>=origin);
                    });
                    if(!canExit)continue;
                }
            }
            if(dryRoute&&!isFlying&&height((current.x+nx)*grid*.5,(current.y+ny)*grid*.5)<safeH)continue;
            if(Math.abs(offset.x)===1&&Math.abs(offset.y)===1&&!isFlying){
                const h1=height((current.x+offset.x)*grid,current.y*grid);
                const h2=height(current.x*grid,(current.y+offset.y)*grid);
                if((h1<safeH||h2<safeH)&&!waterExit)continue;
            }
            let cost=Math.hypot(offset.x,offset.y)+Math.abs(h-current.h)*pathfinder.SLOPE_COST_FACTOR;
            if(h<waterLevel&&waterState!=='frozen')cost+=pathfinder.WATER_COST_PENALTY;
            const g=current.g+cost;
            if(!old||g<old.g){
                const node={x:nx,y:ny,parent:current,g,h,f:g+Math.hypot(nx-endNode.x,ny-endNode.y)};
                heap.push(node);open.set(nKey,node);
            }
        }
    }
    return null;
}
self.onmessage=async event=>{
    const data=event.data;
    try{await noiseReady;}catch(error){self.postMessage({type:'error',id:data.id,message:String(error)});return;}
    if(data.type==='sync'){
        version=data.version;terrain=data.terrain;pathfinder=data.pathfinder;
        biome=data.biome;waterState=data.waterState;waterLevel=data.waterLevel;
        visualWaterLevel=data.visualWaterLevel;noiseScale=data.noiseScale;
        heightMultiplier=data.heightMultiplier;bridgeHeight=data.bridgeHeight;bridgeWidth=data.bridgeWidth;
        mods=new Map(data.mods);buildings=data.buildings;heightCache.clear();
        const seed=data.noise;
        const phase=Number.isInteger(data.settings?.terrainSeed)?data.settings.terrainSeed>>>0:0;
        const simplex=seed?new self.SimplexNoise(()=>.5):{noise2D:(x,y)=>Math.sin(x+phase)*Math.cos(y)};
        if(seed){simplex.perm=new Uint8Array(seed.perm);simplex.permMod12=new Uint8Array(seed.permMod12);}
        heightField=createTerrainHeight({state:{simplex,terrainMods:mods,heightCache,matchSettings:data.settings||{biome}},
            CONFIG:{TERRAIN:terrain},WATER_LEVEL:waterLevel,NOISE_SCALE:noiseScale,
            HEIGHT_MULTIPLIER:heightMultiplier,BRIDGE_HEIGHT:bridgeHeight,BRIDGE_WIDTH:bridgeWidth});
        self.postMessage({type:'ready',version});
    }else if(data.type==='path'){
        try{
            if(data.version!==version)throw new Error('Outdated navigation snapshot');
            const path=findPath(data.start,data.end,data.isFlying,data.avoidWater,data.waterExit);
            self.postMessage({type:'path',id:data.id,version,path});
        }catch(error){self.postMessage({type:'error',id:data.id,message:String(error)});}
    }
};
