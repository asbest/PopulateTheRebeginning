import {projectedPixels,chooseLod} from './lod-policy.js';
// Full perimeter samples join coarse/fine tiles and chunk borders. Matching
// coarse neighbours share a single edge. Authoritative collision data is intact.
export function terrainIndices(T,geometry,res,step,water,shore,maxError=Infinity){
    const p=geometry.attributes.position,depth=geometry.attributes.depth,foam=geometry.attributes.foam;
    const index=[],stride=res+1,id=(x,z)=>z*stride+x,sizes=new Uint8Array(res*res).fill(1),errors=new Float64Array(res*res);
    let maximumError=0,simplified=0,shoreTiles=0,errorTiles=0;
    for(let size=2;size<=step;size*=2)for(let z=0;z<res;z+=size)for(let x=0;x<res;x+=size){
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
        const limit=Math.min(maxError,water?Infinity:step===2?.08:step===4?.16:.32);
        if(size===2){if(protectedShore)shoreTiles++;else if(error>limit)errorTiles++;}
        if(!protectedShore&&error<=limit){
            for(let j=z;j<z+step;j++)for(let i=x;i<x+step;i++){sizes[j*res+i]=step;errors[j*res+i]=error;}
        }
    }
    for(let z=0;z<res;z++)for(let x=0;x<res;x++){
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
    return {attribute:new T.Uint16BufferAttribute(index,1),error:maximumError,simplified,shoreTiles,errorTiles};
}
export function createTerrainLod(T,state,budget,shore,warm=()=>Promise.resolve()){
    const entries=new Set(),point=new T.Vector3(),world=new T.Matrix4(),projection=new T.Matrix4(),clip=new T.Matrix4(),frustum=new T.Frustum();
    let previousCamera,previousHeight,previousFocusX,previousFocusZ,previousFPV,previousEnabled,previousLayers;
    const reasons={disabled:0,offscreen:0,firstPerson:0,focus:0,preparing:0,pixelError:0,shorelineOrDetail:0,active:0};
    const stats={full:0,medium:0,far:0,savedTriangles:0,prepared:0,errors:0,lastError:null,
        reusedFrames:0,updatedEntries:0,reusedEntries:0,cameraMode:null,zoom:1,viewScale:0,
        viewportHeight:0,pixelErrorLimit:.8,reasons,tiles:{coarse:0,protectedShore:0,errorLimited:0},visible:{full:0,medium:0,far:0,savedTriangles:0}};
    state.terrainLodStats=stats;
    const api={enabled:true,stats,register,update};
    function release(result){
        if(!result||result.owned===false)return;
        const temp=new T.BufferGeometry();temp.setIndex(result.attribute);temp.dispose();
    }
    function register(chunk,res){
        for(let i=0;i<2;i++){
            const source=chunk.children[i],geometry=new T.BufferGeometry();
            const proxy=new T.Mesh(geometry,source.material);proxy.name='Terrain render LOD';proxy.raycast=()=>{};proxy.receiveShadow=source.receiveShadow;
            proxy.position.copy(source.position);chunk.add(proxy);
            const e={chunk,source,proxy,res,water:i===1,version:-1,levels:new Map(),pending:new Set(),
                matrix:new T.Matrix4(),dirty:true,generation:0,current:0,active:false};entries.add(e);
            source.visible=false;
            source.geometry.addEventListener('dispose',()=>{
                for(const level of e.levels.values())release(level);
                geometry.attributes={};geometry.index=null;geometry.dispose();entries.delete(e);proxy.parent?.remove(proxy);
                previousCamera=null;
            });
        }
    }
    function update(camera,renderer){
        const height=renderer.domElement.height,focus=state.isFPV?camera.position:state.cameraLookAt;
        const changed=previousCamera!==camera||!world.equals(camera.matrixWorld)||!projection.equals(camera.projectionMatrix)||
            previousHeight!==height||previousFocusX!==focus.x||previousFocusZ!==focus.z||
            previousFPV!==state.isFPV||previousEnabled!==api.enabled||previousLayers!==camera.layers.mask;
        previousCamera=camera;world.copy(camera.matrixWorld);projection.copy(camera.projectionMatrix);
        previousHeight=height;previousFocusX=focus.x;previousFocusZ=focus.z;previousFPV=state.isFPV;previousEnabled=api.enabled;previousLayers=camera.layers.mask;
        let dirty=changed;
        for(const e of entries){
            const g=e.source.geometry,p=g.attributes.position;
            const version=p.version+(g.attributes.depth?.version||0)+(g.attributes.foam?.version||0);
            if(e.version!==version||e.position!==p){
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
            e.active=active;dirty ||= e.dirty;
        }
        if(!dirty){stats.reusedFrames++;stats.updatedEntries=0;stats.reusedEntries=entries.size;return;}
        stats.full=stats.medium=stats.far=stats.savedTriangles=stats.updatedEntries=stats.reusedEntries=0;
        for(const key in reasons)reasons[key]=0;
        stats.tiles.coarse=stats.tiles.protectedShore=stats.tiles.errorLimited=0;
        stats.visible.full=stats.visible.medium=stats.visible.far=stats.visible.savedTriangles=0;
        clip.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse);frustum.setFromProjectionMatrix(clip);
        stats.cameraMode=state.isFPV?'first-person':camera.isOrthographicCamera?'orthographic':'perspective';
        stats.zoom=camera.zoom;stats.viewScale=state.viewScale;stats.viewportHeight=height;
        for(const e of entries){
            if(!e.active){e.dirty=false;continue;}
            if(changed||e.dirty)select(e,camera,height,focus);else stats.reusedEntries++;
            stats[['full','medium','far'][e.current]]++;reasons[e.reason]++;
            stats.savedTriangles+=e.saved||0;
            if(e.inView){
                stats.visible[['full','medium','far'][e.current]]++;stats.visible.savedTriangles+=e.saved||0;
            }
            const result=e.selected;
            if(result){stats.tiles.coarse+=result.simplified;stats.tiles.protectedShore+=result.shoreTiles;stats.tiles.errorLimited+=result.errorTiles;}
        }
    }
    function select(e,camera,height,focus){
            stats.updatedEntries++;e.dirty=false;e.matrix.copy(e.chunk.matrixWorld);
            const g=e.source.geometry;
            point.copy(e.source.position).applyMatrix4(e.chunk.matrixWorld);
            const pixels=projectedPixels(camera,height,point,0)*40;
            let selected=null;
            e.inView=e.shown&&e.proxy.layers.test(camera.layers)&&frustum.intersectsObject(e.proxy);
            e.reason=!api.enabled?'disabled':!e.inView?'offscreen':
                Math.abs(point.x-focus.x)<45&&Math.abs(point.z-focus.z)<45?(state.isFPV?'firstPerson':'focus'):null;
            if(!e.reason){
                e.requested=chooseLod(e.requested||0,pixels,600,300);
                const step=[2,4,8][e.requested],worldError=.8/projectedPixels(camera,height,point,g.boundingSphere?.radius||0);
                // Round downward: a cached variant never exceeds the pixel limit.
                const limit=2**Math.floor(Math.log2(Math.max(Number.MIN_VALUE,worldError))),key=step+'/'+limit;
                if(!e.levels.has(key)&&!e.pending.has(key)&&e.pending.size<2){
                    const gen=e.generation;e.pending.add(key);
                    budget.enqueue('terrain-lod/'+e.proxy.uuid+'/'+gen+'/'+key,async()=>{
                        if(entries.has(e)&&gen===e.generation){
                            const result=terrainIndices(T,g,e.res,step,e.water,shore,limit);
                            result.step=step;
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
                    },0,true).catch(error=>{e.pending.delete(key);stats.errors++;stats.lastError=String(error);console.warn('Terrain LOD kept full detail',error);});
                }
                for(const result of e.levels.values())if(result.simplified&&result.step<=step&&result.error<=worldError&&
                    (!selected||result.attribute.count<selected.attribute.count))selected=result;
                const prepared=e.levels.get(key);
                e.reason=selected?'active':!prepared?'preparing':prepared.errorTiles?'pixelError':'shorelineOrDetail';
            }
            e.current=selected?(selected.step===8?2:1):0;e.selected=selected;
            e.saved=(g.index.count-(selected?.attribute.count||g.index.count))/3;
            e.source.visible=!api.enabled;e.proxy.visible=api.enabled;
            const attribute=selected?.attribute||g.index;
            if(e.proxy.geometry.index!==attribute)e.proxy.geometry.setIndex(attribute);
    }
    return api;
}
