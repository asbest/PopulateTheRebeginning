// Off-main-thread A* for AI orders. The browser game remains authoritative for
// movement and validates/smooths the returned route on the main thread.
self.window=self;
importScripts('./vendor/simplex-noise.min.js');

function mulberry32(a){return function(){let t=a+=0x6D2B79F5;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return ((t^t>>>14)>>>0)/4294967296;};}
const simplex=new self.SimplexNoise(mulberry32(12345));
const neighbors=[{x:0,y:1},{x:1,y:0},{x:0,y:-1},{x:-1,y:0},
    {x:1,y:1},{x:1,y:-1},{x:-1,y:1},{x:-1,y:-1}];
let terrain={},pathfinder={},biome='normal',waterState='liquid',waterLevel=1.805,
    visualWaterLevel=.45125,noiseScale=.02,heightMultiplier=1,bridgeHeight=3,bridgeWidth=2.5,
    version=-1,mods=new Map(),buildings=[],heightCache=new Map();

function blend(a,b,value){const t=Math.max(0,Math.min(1,(value-a)/(b-a)));return t*t*(3-2*t);}
function baseHeight(x,z){
    let y=0,ns=noiseScale,hm=heightMultiplier;
    if(biome==='mountain')hm*=terrain.BIOME_MOUNTAIN_HEIGHT_MULT;
    if(biome==='void')hm*=terrain.BIOME_VOID_HEIGHT_MULT;
    if(biome==='jungle')ns*=terrain.BIOME_JUNGLE_NOISE_MULT;
    for(const o of terrain.NOISE_OCTAVES){
        const ridgeDetail=o.factor>=4?.76-.28*blend(5,13,y*hm):1;
        y+=simplex.noise2D(x*ns*o.factor,z*ns*o.factor)*o.amp*ridgeDetail;
    }
    y*=hm;
    if(biome!=='void'&&biome!=='celestial'&&biome!=='cosmic'){
        const region=simplex.noise2D(x*.004+211,z*.004-173);
        const relief=simplex.noise2D(x*.011+47,z*.011-29);
        const land=Math.max(0,Math.min(1,(y-waterLevel+1.5)/4));
        const mountains=blend(.16,.58,region),archipelago=blend(.18,.58,-region);
        const plateau=blend(.18,.55,relief)*(1-mountains);
        y+=(Math.abs(relief)-.38)*(biome==='mountain'?2:1.25)*land;
        y+=mountains*(3.4+Math.abs(relief)*3.8)*(biome==='mountain'?1.4:1);
        y+=plateau*2.5*land;
        const terrace=plateau*land*.74*blend(2,12,y);
        y+=(10-y)*terrace;
        y-=Math.max(0,-relief-.1)*3.2*(1-mountains);
        y-=archipelago*3.2;
    }
    if(biome==='celestial'&&y<terrain.CELESTIAL_PEAK_THRESHOLD)y-=terrain.CELESTIAL_VOID_DROP;
    const bridgeNoise=Math.abs(simplex.noise2D(x*noiseScale*terrain.BRIDGE_NOISE_MULT+100,
        z*noiseScale*terrain.BRIDGE_NOISE_MULT+100));
    y+=(1-blend(0,1,bridgeNoise*bridgeWidth))*bridgeHeight;
    if(y<waterLevel)y-=(waterLevel-y)*terrain.WATER_SMOOTH_FACTOR;
    const aboveCap=Math.max(0,y-terrain.LAND_HEIGHT_CAP);
    y+=aboveCap*terrain.LAND_ABOVE_CAP_SLOPE*blend(0,5,aboveCap);
    const summit=Math.max(0,y-13);
    y-=summit*.24*blend(0,5,summit);
    return y;
}
function terrainMod(x,z){
    if(!mods.size)return 0;
    const x1=Math.floor(x),z1=Math.floor(z),fx=x-x1,fz=z-z1;
    const v11=mods.get(`${x1},${z1}`)||0,v21=mods.get(`${x1+1},${z1}`)||0;
    const v12=mods.get(`${x1},${z1+1}`)||0,v22=mods.get(`${x1+1},${z1+1}`)||0;
    return (v11*(1-fx)+v21*fx)*(1-fz)+(v12*(1-fx)+v22*fx)*fz;
}
function height(x,z){
    const key=(Math.round(x*10)<<16)|(Math.round(z*10)&0xffff);
    if(heightCache.has(key))return heightCache.get(key);
    const value=baseHeight(x,z)+terrainMod(x,z);
    heightCache.set(key,value);if(heightCache.size>20000)heightCache.clear();
    return value;
}
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
self.onmessage=event=>{
    const data=event.data;
    if(data.type==='sync'){
        version=data.version;terrain=data.terrain;pathfinder=data.pathfinder;
        biome=data.biome;waterState=data.waterState;waterLevel=data.waterLevel;
        visualWaterLevel=data.visualWaterLevel;noiseScale=data.noiseScale;
        heightMultiplier=data.heightMultiplier;bridgeHeight=data.bridgeHeight;bridgeWidth=data.bridgeWidth;
        mods=new Map(data.mods);buildings=data.buildings;heightCache.clear();
        self.postMessage({type:'ready',version});
    }else if(data.type==='path'){
        try{
            if(data.version!==version)throw new Error('Outdated navigation snapshot');
            const path=findPath(data.start,data.end,data.isFlying,data.avoidWater,data.waterExit);
            self.postMessage({type:'path',id:data.id,version,path});
        }catch(error){self.postMessage({type:'error',id:data.id,message:String(error)});}
    }
};
