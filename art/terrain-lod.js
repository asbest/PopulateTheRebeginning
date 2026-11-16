import {projectedPixels,chooseLod} from './lod-policy.js';
// Full perimeter samples join coarse/fine tiles and chunk borders. Matching
// coarse neighbours share a single edge. Authoritative collision data is intact.
export function terrainIndices(T,geometry,res,step,water,shore){
    const p=geometry.attributes.position,depth=geometry.attributes.depth,foam=geometry.attributes.foam;
    const index=[],stride=res+1,id=(x,z)=>z*stride+x,tiles=res/step,coarseTiles=new Uint8Array(tiles*tiles);
    let maximumError=water?(step===4?.10:.30):0,simplified=0;
    for(let z=0;z<res;z+=step)for(let x=0;x<res;x+=step){
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
        const coarse=water?!coast:!(min<shore+1.5&&max>shore-2)&&error<=(step===4?.16:.32);
        if(coarse){coarseTiles[z/step*tiles+x/step]=1;simplified++;maximumError=Math.max(maximumError,error);}
    }
    for(let z=0;z<res;z+=step)for(let x=0;x<res;x+=step){
        const tx=x/step,tz=z/step,coarse=coarseTiles[tz*tiles+tx];
        if(!coarse){
            for(let j=z;j<z+step;j++)for(let i=x;i<x+step;i++){const k=id(i,j);index.push(k,k+stride,k+1,k+stride,k+stride+1,k+1);}
            continue;
        }
        const ring=[];
        const left=tx>0&&coarseTiles[tz*tiles+tx-1]?step:1,bottom=tz+1<tiles&&coarseTiles[(tz+1)*tiles+tx]?step:1;
        const right=tx+1<tiles&&coarseTiles[tz*tiles+tx+1]?step:1,top=tz>0&&coarseTiles[(tz-1)*tiles+tx]?step:1;
        for(let j=0;j<step;j+=left)ring.push(id(x,z+j));
        for(let i=0;i<step;i+=bottom)ring.push(id(x+i,z+step));
        for(let j=step;j>0;j-=right)ring.push(id(x+step,z+j));
        for(let i=step;i>0;i-=top)ring.push(id(x+i,z));
        const center=id(x+step/2,z+step/2);
        for(let i=0;i<ring.length;i++)index.push(center,ring[i],ring[(i+1)%ring.length]);
    }
    return {attribute:new T.Uint16BufferAttribute(index,1),error:maximumError,simplified};
}
export function createTerrainLod(T,state,budget,shore,warm=()=>Promise.resolve()){
    const entries=new Set(),point=new T.Vector3();
    const stats={full:0,medium:0,far:0,savedTriangles:0,prepared:0,errors:0,lastError:null};
    state.terrainLodStats=stats;
    const api={enabled:true,stats,register,update};
    function register(chunk,res){
        for(let i=0;i<2;i++){
            const source=chunk.children[i],geometry=new T.BufferGeometry();
            const proxy=new T.Mesh(geometry,source.material);proxy.name='Terrain render LOD';proxy.raycast=()=>{};proxy.receiveShadow=source.receiveShadow;
            proxy.position.copy(source.position);chunk.add(proxy);
            const e={chunk,source,proxy,res,water:i===1,version:-1,levels:[],pending:new Set(),current:0};entries.add(e);
            source.visible=false;
            source.geometry.addEventListener('dispose',()=>{
                for(const level of e.levels)if(level&&level.owned!==false){geometry.setIndex(level.attribute);geometry.attributes={};geometry.dispose();}
                geometry.attributes={};geometry.index=null;geometry.dispose();entries.delete(e);proxy.parent?.remove(proxy);
            });
        }
    }
    function update(camera,renderer){
        stats.full=stats.medium=stats.far=stats.savedTriangles=0;
        const height=renderer.domElement.height;
        for(const e of entries){
            if(!e.chunk.parent)continue;
            const g=e.source.geometry,p=g.attributes.position;
            if(!g.boundingSphere)g.computeBoundingSphere();
            // Attribute objects remain authoritative for physics/raycasting.
            for(const key in g.attributes)e.proxy.geometry.setAttribute(key,g.attributes[key]);
            e.proxy.geometry.boundingSphere=g.boundingSphere;e.proxy.geometry.boundingBox=g.boundingBox;
            const version=p.version+(g.attributes.depth?.version||0)+(g.attributes.foam?.version||0);
            if(e.version!==version){e.version=version;e.current=0;e.generation=(e.generation||0)+1;
                // Dispose only owned index buffers; never shared terrain attributes.
                for(const level of e.levels)if(level&&level.owned!==false){const temp=new T.BufferGeometry();temp.setIndex(level.attribute);temp.dispose();}
                e.levels=[];
            }
            point.copy(e.source.position).applyMatrix4(e.chunk.matrixWorld);
            const pixels=projectedPixels(camera,height,point,0)*40;
            let desired=api.enabled&&!state.isFPV?chooseLod(e.current,pixels,600,300):0;
            // Keep the area around the strategy focus at full detail.
            const focus=state.isFPV?camera.position:state.cameraLookAt;
            if(Math.abs(point.x-focus.x)<45&&Math.abs(point.z-focus.z)<45)desired=0;
            if(desired){
                const requested=desired;desired=0;
                for(let level=requested;level>0;level--){const gen=e.generation;
                if(!e.levels[level]&&!e.pending.has(level)){
                    e.pending.add(level);
                    budget.enqueue('terrain-lod/'+e.proxy.uuid+'/'+gen+'/'+level,async()=>{
                        if(entries.has(e)&&gen===e.generation){
                            const result=terrainIndices(T,g,e.res,level===1?4:8,e.water,shore);
                            if(!result.simplified){e.levels[level]={attribute:g.index,error:0,simplified:0,owned:false};e.pending.delete(level);return;}
                            const prepared=new T.BufferGeometry();
                            for(const name in g.attributes)prepared.setAttribute(name,g.attributes[name]);
                            prepared.setIndex(result.attribute);prepared.boundingSphere=g.boundingSphere;
                            const mesh=new T.Mesh(prepared,e.source.material);mesh.receiveShadow=e.source.receiveShadow;
                            const release=()=>{prepared.attributes={};prepared.index=null;prepared.dispose();};
                            g.addEventListener('dispose',release);
                            try{await warm(mesh);
                                if(entries.has(e)&&gen===e.generation){e.levels[level]=result;stats.prepared++;}
                                else {const unused=new T.BufferGeometry();unused.setIndex(result.attribute);unused.dispose();}
                            }finally{g.removeEventListener('dispose',release);release();}
                        }
                        e.pending.delete(level);
                    },0,true).catch(error=>{e.pending.delete(level);stats.errors++;stats.lastError=String(error);console.warn('Terrain LOD kept full detail',error);});
                }
                const selected=e.levels[level];
                if(selected?.simplified&&projectedPixels(camera,height,point,g.boundingSphere?.radius||0)*selected.error<=.8){desired=level;break;}
                }
            }
            e.current=desired;e.source.visible=!api.enabled;e.proxy.visible=api.enabled;
            const selected=e.levels[desired];e.proxy.geometry.setIndex(selected?.attribute||g.index);
            // draw range and source.index never change: collision topology stays full.
            stats[['full','medium','far'][desired]]++;
            stats.savedTriangles+=(g.index.count-(selected?.attribute.count||g.index.count))/3;
        }
    }
    return api;
}
