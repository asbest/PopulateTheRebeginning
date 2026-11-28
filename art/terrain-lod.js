import {projectedPixels,chooseLod} from './lod-policy.js';
const FIRST_PERSON_PREPARATION_LIMIT=12;
// Full perimeter samples join coarse/fine tiles and chunk borders. Matching
// coarse neighbours share a single edge. Authoritative collision data is intact.
export function terrainIndices(T,geometry,res,step,water,shore,maxError=Infinity,screenBudget=false,dryInterior=false){
    const p=geometry.attributes.position,depth=geometry.attributes.depth,foam=geometry.attributes.foam;
    const index=[],stride=res+1,id=(x,z)=>z*stride+x,sizes=new Uint8Array(res*res).fill(1),errors=new Float64Array(res*res);
    let maximumError=0,simplified=0,shoreTiles=0,errorTiles=0,occludedTriangles=0;
    for(let size=2;!dryInterior&&size<=step;size*=2)for(let z=0;z<res;z+=size)for(let x=0;x<res;x+=size){
        const step=size;
        const a=p.getY(id(x,z)),b=p.getY(id(x+step,z)),c=p.getY(id(x,z+step)),d=p.getY(id(x+step,z+step));
        let error=0,min=Infinity,max=-Infinity,coast=false;
        for(let j=0;j<=step;j++)for(let i=0;i<=step;i++){
            const k=id(x+i,z+j),h=p.getY(k),u=i/step,v=j/step;
            error=Math.max(error,Math.abs(h-((a*(1-u)+b*u)*(1-v)+(c*(1-u)+d*u)*v)));
            min=Math.min(min,h);max=Math.max(max,h);
            if(water&&(depth.getX(k)<2||foam.getX(k)>0))coast=true;
        }
        // Includes the deviation between the bilinear patch and the fan.
        error=error*2+Math.abs(a-b-c+d)/4;
        // Include wave interpolation through the strongest storm state, not
        // merely the flat CPU water vertices. Shoreline foam remains full detail.
        if(water)error=Math.max(error,step===2?.06:step===4?.22:.85);
        const protectedShore=water?coast:min<shore+1.5&&max>shore-2;
        const limit=Math.min(maxError,water||screenBudget?Infinity:step===2?.08:step===4?.16:.32);
        if(size===2){if(protectedShore)shoreTiles++;else if(error>limit)errorTiles++;}
        if(!protectedShore&&error<=limit){
            for(let j=z;j<z+step;j++)for(let i=x;i<x+step;i++){sizes[j*res+i]=step;errors[j*res+i]=error;}
        }
    }
    for(let z=0;z<res;z++)for(let x=0;x<res;x++){
        // Supported waves move sideways less than .22 units. A whole grid cell
        // around the perimeter retains the original cross-chunk wave overlap.
        if(dryInterior&&x>0&&z>0&&x<res-1&&z<res-1){occludedTriangles+=2;continue;}
        const step=sizes[z*res+x];
        if(step===1){
            const k=id(x,z);index.push(k,k+stride,k+1,k+stride,k+stride+1,k+1);
            continue;
        }
        if(x%step||z%step)continue;
        simplified++;maximumError=Math.max(maximumError,errors[z*res+x]);
        const ring=[];
        // Only equally sized aligned neighbours omit intermediate edge points.
        // Every mixed-size edge retains all samples on both sides.
        const left=x>0&&sizes[z*res+x-1]===step?step:1,bottom=z+step<res&&sizes[(z+step)*res+x]===step?step:1;
        const right=x+step<res&&sizes[z*res+x+step]===step?step:1,top=z>0&&sizes[(z-1)*res+x]===step?step:1;
        for(let j=0;j<step;j+=left)ring.push(id(x,z+j));
        for(let i=0;i<step;i+=bottom)ring.push(id(x+i,z+step));
        for(let j=step;j>0;j-=right)ring.push(id(x+step,z+j));
        for(let i=step;i>0;i-=top)ring.push(id(x+i,z));
        const center=id(x+step/2,z+step/2);
        for(let i=0;i<ring.length;i++)index.push(center,ring[i],ring[(i+1)%ring.length]);
    }
    return {attribute:new T.Uint16BufferAttribute(index,1),error:maximumError,simplified,shoreTiles,errorTiles,occludedTriangles};
}

// Low waves are vertically displaced by at most .48 world units.
// Keep every shoreline sample and all cross-chunk edge samples. Only skip
// tiles that are entirely covered by terrain, using the current land heights.
export function compactWaterIndices(T,land,res,shore,detail='low'){
    const step=4,stride=res+1,id=(x,z)=>z*stride+x;
    const fullWaves=detail!=='low';
    const tiles=res/step,types=new Uint8Array(tiles*tiles),indices=[];
    let occludedTriangles=0,simplified=0,shoreTiles=0;
    for(let z=0;z<tiles;z++)for(let x=0;x<tiles;x++){
        let min=Infinity,max=-Infinity;
        const edge=x===0||z===0||x===tiles-1||z===tiles-1;
        for(let j=0;j<=step;j++)for(let i=0;i<=step;i++){
            const height=land.getY(id(x*step+i,z*step+j));
            min=Math.min(min,height);max=Math.max(max,height);
        }
        // Full waves move sideways. Guard dry interiors with one sample
        // around each tile and keep the original overlap at chunk borders.
        let dry=min>shore+1;
        if(dry&&fullWaves){
            dry=!edge;
            const sx=x*step,sz=z*step;
            for(let i=-1;i<=step+1&&dry;i++){
                dry=land.getY(id(sx+i,sz-1))>shore+1&&land.getY(id(sx+i,sz+step+1))>shore+1&&
                    land.getY(id(sx-1,sz+i))>shore+1&&land.getY(id(sx+step+1,sz+i))>shore+1;
            }
        }
        const type=dry?0:detail==='near'||max>=shore-(fullWaves?3:2)?1:2;
        types[z*tiles+x]=type;
        if(type===0)occludedTriangles+=step*step*2;
        else if(type===1)shoreTiles++;
        else simplified++;
    }
    for(let z=0;z<tiles;z++)for(let x=0;x<tiles;x++){
        const type=types[z*tiles+x],sx=x*step,sz=z*step;
        if(type===0)continue;
        if(type===1){
            for(let j=0;j<step;j++)for(let i=0;i<step;i++){
                const k=id(sx+i,sz+j);
                indices.push(k,k+stride,k+1,k+stride,k+stride+1,k+1);
            }
            continue;
        }
        const ring=[],center=id(sx+step/2,sz+step/2);
        const left=x===0||types[z*tiles+x-1]===1?1:step;
        const bottom=z===tiles-1||types[(z+1)*tiles+x]===1?1:step;
        const right=x===tiles-1||types[z*tiles+x+1]===1?1:step;
        const top=z===0||types[(z-1)*tiles+x]===1?1:step;
        for(let i=0;i<step;i+=left)ring.push(id(sx,sz+i));
        for(let i=0;i<step;i+=bottom)ring.push(id(sx+i,sz+step));
        for(let i=step;i>0;i-=right)ring.push(id(sx+step,sz+i));
        for(let i=step;i>0;i-=top)ring.push(id(sx+i,sz));
        for(let i=0;i<ring.length;i++)indices.push(center,ring[i],ring[(i+1)%ring.length]);
    }
    return {attribute:new T.Uint16BufferAttribute(indices,1),step,simplified,shoreTiles,errorTiles:0,occludedTriangles};
}
export function createTerrainLod(T,state,budget,shore,warm=()=>Promise.resolve()){
    const entries=new Set(),point=new T.Vector3(),world=new T.Matrix4(),projection=new T.Matrix4(),clip=new T.Matrix4(),frustum=new T.Frustum();
    const hiddenWater={attribute:new T.Uint16BufferAttribute([],1),step:4,owned:false,simplified:0,shoreTiles:0,errorTiles:0};
    let previousCamera,previousHeight,previousFocusX,previousFocusZ,previousFPV,previousEnabled,previousLayers,previousOverview;
    let pendingFirstPerson=0,previousWaterTier,preparedWaterThisFrame=false;
    const reasons={disabled:0,offscreen:0,firstPerson:0,focus:0,preparing:0,pixelError:0,shorelineOrDetail:0,active:0};
    const stats={full:0,medium:0,far:0,savedTriangles:0,prepared:0,errors:0,lastError:null,
        reusedFrames:0,updatedEntries:0,reusedEntries:0,pendingFirstPerson:0,cameraMode:null,zoom:1,viewScale:0,
        viewportHeight:0,pixelErrorLimit:.8,overviewEnabled:true,occludedWaterTriangles:0,reasons,tiles:{coarse:0,protectedShore:0,errorLimited:0},visible:{full:0,medium:0,far:0,savedTriangles:0,occludedWaterTriangles:0}};
    state.terrainLodStats=stats;
    const api={enabled:true,overviewEnabled:true,stats,register,update};
    function release(result){
        if(!result||result.owned===false)return;
        const temp=new T.BufferGeometry();temp.setIndex(result.attribute);temp.dispose();
    }
    function register(chunk,res){
        let landProxy;
        for(let i=0;i<2;i++){
            const source=chunk.children[i],geometry=new T.BufferGeometry();
            const proxy=new T.Mesh(geometry,source.material);proxy.name='Terrain render LOD';proxy.raycast=()=>{};proxy.receiveShadow=source.receiveShadow;
            proxy.userData.landscapeKind=source.userData.landscapeKind=i===0?'terrain':'water';
            proxy.position.copy(source.position);chunk.add(proxy);
            const e={chunk,source,proxy,res,water:i===1,version:-1,levels:new Map(),pending:new Set(),
                landProxy,matrix:new T.Matrix4(),dirty:true,generation:0,current:0,active:false};entries.add(e);
            if(i===0)landProxy=proxy;
            source.visible=false;
            source.geometry.addEventListener('dispose',()=>{
                for(const level of e.levels.values())release(level);
                for(const level of e.compactWater?.values()||[])release(level);
                geometry.attributes={};geometry.index=null;geometry.dispose();entries.delete(e);proxy.parent?.remove(proxy);
                previousCamera=null;
            });
        }
    }
    function update(camera,renderer){
        const height=renderer.domElement.height,focus=state.isFPV?camera.position:state.cameraLookAt;
        const tier=state.graphicsQuality?.tier;
        const changed=previousCamera!==camera||!world.equals(camera.matrixWorld)||!projection.equals(camera.projectionMatrix)||
            previousHeight!==height||previousFocusX!==focus.x||previousFocusZ!==focus.z||
            previousFPV!==state.isFPV||previousEnabled!==api.enabled||previousLayers!==camera.layers.mask||previousOverview!==api.overviewEnabled||
            previousWaterTier!==tier;
        previousWaterTier=tier;
        previousCamera=camera;world.copy(camera.matrixWorld);projection.copy(camera.projectionMatrix);
        previousHeight=height;previousFocusX=focus.x;previousFocusZ=focus.z;previousFPV=state.isFPV;previousEnabled=api.enabled;previousLayers=camera.layers.mask;
        previousOverview=api.overviewEnabled;stats.overviewEnabled=api.overviewEnabled;
        let dirty=changed;
        for(const e of entries){
            const g=e.source.geometry,p=g.attributes.position;
            const land=e.water?e.chunk.children[0].geometry.attributes.position:null;
            if(land&&(e.landPosition!==land||e.landVersion!==land.version)){
                for(const level of e.compactWater?.values()||[])release(level);
                e.compactWater?.clear();
                e.minimumLand=Infinity;for(let i=0;i<land.count;i++)e.minimumLand=Math.min(e.minimumLand,land.getY(i));
                e.landPosition=land;e.landVersion=land.version;e.dirty=true;
            }
            // Even strength 2 stays below .86 high and .22 sideways. All terrain
            // samples above shore+2 imply every rendered land triangle is dry.
            const supportedWaves=e.water&&Math.abs(p.getX(1)-p.getX(0))>=.25&&
                (e.source.material.uniforms?.waveStrength?.value??1)<=2;
            if(e.supportedWaves!==supportedWaves){e.supportedWaves=supportedWaves;e.dirty=true;}
            const dry=api.overviewEnabled&&supportedWaves&&e.minimumLand>shore+2;
            const version=p.version+(g.attributes.depth?.version||0)+(g.attributes.foam?.version||0)+(land?.version||0);
            if(e.version!==version||e.position!==p||e.dryInterior!==dry){
                e.dryInterior=dry;
                e.version=version;e.position=p;e.current=0;e.generation++;e.dirty=true;
                for(const level of e.levels.values())release(level);e.levels.clear();
                // Shared authoritative attributes only need binding after an edit.
                for(const key in g.attributes)e.proxy.geometry.setAttribute(key,g.attributes[key]);
                if(!g.boundingSphere)g.computeBoundingSphere();
                e.proxy.geometry.boundingSphere=g.boundingSphere;e.proxy.geometry.boundingBox=g.boundingBox;
            }
            const active=!!e.chunk.parent;
            if(e.active!==active||!e.matrix.equals(e.chunk.matrixWorld))e.dirty=true;
            if(e.proxy.material!==e.source.material){e.proxy.material=e.source.material;e.dirty=true;}
            const shown=e.chunk.visible&&e.proxy.material.visible!==false;
            if(e.shown!==shown){e.shown=shown;e.dirty=true;}
            if(e.waitingForSlot&&pendingFirstPerson<FIRST_PERSON_PREPARATION_LIMIT)e.dirty=true;
            e.active=active;dirty ||= e.dirty;
        }
        if(!dirty){stats.reusedFrames++;stats.updatedEntries=0;stats.reusedEntries=entries.size;return;}
        stats.full=stats.medium=stats.far=stats.savedTriangles=stats.updatedEntries=stats.reusedEntries=0;
        for(const key in reasons)reasons[key]=0;
        stats.tiles.coarse=stats.tiles.protectedShore=stats.tiles.errorLimited=0;
        stats.occludedWaterTriangles=0;
        stats.visible.full=stats.visible.medium=stats.visible.far=stats.visible.savedTriangles=stats.visible.occludedWaterTriangles=0;
        preparedWaterThisFrame=false;
        clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(clip);
        stats.cameraMode=state.isFPV?'first-person':camera.isOrthographicCamera?'orthographic':'perspective';
        stats.zoom=camera.zoom;stats.viewScale=state.viewScale;stats.viewportHeight=height;
        for(const e of entries){
            if(!e.active){e.dirty=false;continue;}
            if(changed||e.dirty)select(e,camera,height,focus,tier);else stats.reusedEntries++;
            stats[['full','medium','far'][e.current]]++;reasons[e.reason]++;
            stats.savedTriangles+=e.saved||0;
            stats.occludedWaterTriangles+=e.selected?.occludedTriangles||0;
            if(e.inView){
                stats.visible[['full','medium','far'][e.current]]++;stats.visible.savedTriangles+=e.saved||0;
                stats.visible.occludedWaterTriangles+=e.selected?.occludedTriangles||0;
            }
            const result=e.selected;
            if(result){stats.tiles.coarse+=result.simplified;stats.tiles.protectedShore+=result.shoreTiles;stats.tiles.errorLimited+=result.errorTiles;}
        }
    }
    function select(e,camera,height,focus,tier){
            stats.updatedEntries++;e.dirty=false;e.matrix.copy(e.chunk.matrixWorld);
            e.waitingForSlot=false;e.requestedKey=null;
            const g=e.source.geometry;
            point.copy(e.source.position).applyMatrix4(e.chunk.matrixWorld);
            const pixels=projectedPixels(camera,height,point,0)*40;
            const overview=api.overviewEnabled&&!state.isFPV&&pixels<600;
            let selected=null;
            e.inView=e.shown&&e.proxy.layers.test(camera.layers)&&frustum.intersectsObject(e.proxy);
            e.reason=!api.enabled?'disabled':!e.inView?'offscreen':
                !overview&&Math.abs(point.x-focus.x)<45&&Math.abs(point.z-focus.z)<45?(state.isFPV?'firstPerson':'focus'):null;
            const low=tier==='low',cellSize=Math.abs(e.position.getX(1)-e.position.getX(0));
            const medium=tier==='medium'&&e.supportedWaves;
            // Only cull occluded High water against the exact land mesh. Keep
            // every visible wave vertex, including the chunk overlap.
            const high=tier==='high'&&state.isFPV&&camera.isPerspectiveCamera&&e.supportedWaves&&api.overviewEnabled&&
                e.landProxy?.geometry.index===e.chunk.children[0].geometry.index;
            if(api.enabled&&e.inView&&(low||medium||high)&&e.water&&e.landPosition?.count===(e.res+1)**2&&e.res%4===0){
                const waterLevel=e.source.position.y;
                e.compactWater??=new Map();
                if(e.compactWaterLevel!==waterLevel){
                    for(const level of e.compactWater.values())release(level);
                    e.compactWater.clear();e.compactWaterLevel=waterLevel;
                }
                const halfWidth=cellSize*e.res*.5;
                const near=Math.max(Math.abs(point.x-focus.x),Math.abs(point.z-focus.z))-halfWidth<24;
                const detail=low?'low':high||near&&(state.isFPV||state.viewScale<=30)?'near':'far';
                let compact=e.compactWater.get(detail);
                if(!compact&&high&&preparedWaterThisFrame)e.dirty=true;
                else if(!compact){
                    if(high)preparedWaterThisFrame=true;
                    compact=low&&e.minimumLand>waterLevel+1?{...hiddenWater,occludedTriangles:g.index.count/3}
                        :compactWaterIndices(T,e.landPosition,e.res,waterLevel,detail);
                    e.compactWater.set(detail,compact);
                }
                if(compact&&compact.attribute.count<g.index.count){selected=compact;e.reason='active';}
            }else if(!e.reason||api.enabled&&e.inView&&e.dryInterior){
                e.requested=chooseLod(e.requested||0,pixels,600,300);
                const step=e.dryInterior?1:[2,4,8][e.requested],worldError=.8/projectedPixels(camera,height,point,g.boundingSphere?.radius||0);
                // Round downward: a cached variant never exceeds the pixel limit.
                const limit=2**Math.floor(Math.log2(Math.max(Number.MIN_VALUE,worldError))),key=e.dryInterior?'dry':step+'/'+limit+'/'+overview;
                const firstPerson=state.isFPV&&camera.isPerspectiveCamera;
                e.requestedKey=key;
                const needsPreparation=!e.levels.has(key)&&!e.pending.has(key)&&e.pending.size<2;
                e.waitingForSlot=needsPreparation&&firstPerson&&pendingFirstPerson>=FIRST_PERSON_PREPARATION_LIMIT;
                if(needsPreparation&&!e.waitingForSlot){
                    const gen=e.generation;e.pending.add(key);
                    if(firstPerson)stats.pendingFirstPerson=++pendingFirstPerson;
                    budget.enqueue('terrain-lod/'+e.proxy.uuid+'/'+gen+'/'+key,async()=>{
                        if(entries.has(e)&&gen===e.generation&&(!firstPerson||e.requestedKey===key)){
                            const result=terrainIndices(T,g,e.res,step,e.water,shore,limit,overview,e.dryInterior);
                            result.step=step;result.overview=overview;
                            if(result.attribute.count>=g.index.count){result.attribute=g.index;result.owned=false;result.simplified=0;}
                            const prepared=new T.BufferGeometry();
                            for(const name in g.attributes)prepared.setAttribute(name,g.attributes[name]);
                            prepared.setIndex(result.attribute);prepared.boundingSphere=g.boundingSphere;
                            const mesh=new T.Mesh(prepared,e.source.material);mesh.receiveShadow=e.source.receiveShadow;
                            const detach=()=>{prepared.attributes={};prepared.index=null;prepared.dispose();};
                            g.addEventListener('dispose',detach);
                            try{if(result.owned!==false)await warm(mesh);
                                if(entries.has(e)&&gen===e.generation){
                                    e.levels.set(key,result);e.dirty=true;stats.prepared++;
                                    // Bound memory while retaining the active variant.
                                    while(e.levels.size>3){
                                        const oldest=[...e.levels.keys()].find(k=>e.levels.get(k)!==e.selected&&k!==key);
                                        release(e.levels.get(oldest));e.levels.delete(oldest);
                                    }
                                }else release(result);
                            }catch(error){release(result);throw error;}
                            finally{g.removeEventListener('dispose',detach);detach();}
                        }
                        e.pending.delete(key);e.dirty=true;
                    },0,true).catch(error=>{e.pending.delete(key);stats.errors++;stats.lastError=String(error);console.warn('Terrain LOD kept full detail',error);})
                        .finally(()=>{if(firstPerson)stats.pendingFirstPerson=--pendingFirstPerson;});
                }
                for(const result of e.levels.values())if((result.simplified||result.occludedTriangles)&&(result.occludedTriangles||result.overview===overview)&&result.step<=step&&result.error<=worldError&&
                    (!selected||result.attribute.count<selected.attribute.count))selected=result;
                const prepared=e.levels.get(key);
                e.reason=selected?'active':!prepared?'preparing':prepared.errorTiles?'pixelError':'shorelineOrDetail';
            }
            e.current=selected?(selected.step===8?2:1):0;e.selected=selected;
            e.saved=(g.index.count-(selected?.attribute.count||g.index.count))/3;
            e.source.visible=!api.enabled;e.proxy.visible=api.enabled&&selected?.attribute.count!==0;
            const attribute=selected?.attribute||g.index;
            if(e.proxy.geometry.index!==attribute)e.proxy.geometry.setIndex(attribute);
    }
    return api;
}
