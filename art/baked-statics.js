// Ground decals use a fixed atlas of soft silhouettes. Tile geometry is baked
// against the terrain and rebuilt only on a change of source or terrain.
function makeAtlas(T){
    const tile=64, pixels=new Uint8Array(tile*tile*3*4);
    function ellipse(x,y,cx,cy,rx,ry){
        return Math.max(0,1-Math.hypot((x-cx)/rx,(y-cy)/ry));
    }
    for(let kind=0;kind<3;kind++)for(let y=0;y<tile;y++)for(let x=0;x<tile;x++){
        const u=2*(x+.5)/tile-1,v=2*(y+.5)/tile-1;
        let shape;
        if(kind===0){
            shape=Math.max(ellipse(u,v,.12,0,.8,.71),ellipse(u,v,-.32,.26,.45,.5),
                ellipse(u,v,.48,-.28,.4,.45));
        }else if(kind===1){
            shape=ellipse(u,v,.05,0,.65,.6);
            for(let i=0;i<5;i++){
                const angle=i*Math.PI*2/5,cos=Math.cos(angle),sin=Math.sin(angle);
                shape=Math.max(shape,ellipse(u*cos+v*sin,-u*sin+v*cos,.37,0,.52,.22));
            }
        }else{
            shape=1-Math.max(Math.abs((u-.12)*1.19),Math.abs(v)*1.23);
        }
        const edge=Math.max(0,Math.min(1,shape*2.5));
        const offset=(y*tile*3+kind*tile+x)*4;
        pixels.set([20,28,31,Math.round(124*edge*edge*(3-2*edge))],offset);
    }
    const texture=new T.DataTexture(pixels,tile*3,tile,T.RGBAFormat);
    texture.minFilter=texture.magFilter=T.LinearFilter;
    texture.needsUpdate=true;
    return texture;
}

export function createBakedStatics(T,state,index,{chunkSize,heightAt,waterLevel}){
    const entries=new Map(),authoredCast=new WeakMap(),contactLayers=new WeakMap(),rootVersions=new WeakMap();
    const buildingShapes=new WeakMap();
    const stats={mode:'baked',tiles:0,decals:0,rebuilt:0};
    state.staticShadowStats=stats;
    let scene,tier,topology=-1,material,seen=0;
    const keyAt=(x,z)=>Math.round(x/chunkSize)+','+Math.round(z/chunkSize);

    function restoreCaster(root){
        root.traverse(node=>{
            if(authoredCast.get(node)){node.castShadow=true;authoredCast.delete(node);}
        });
    }
    function syncRoot(root,isBaked,burned=false){
        if(!root)return;
        const list=index.list(root),old=rootVersions.get(root);
        if(old?.revision===list.revision&&old.baked===isBaked&&old.burned===burned)return;
        rootVersions.set(root,{revision:list.revision,baked:isBaked,burned});
        for(const node of list.meshes){
            if(isBaked||burned){
                if(node.castShadow){authoredCast.set(node,true);node.castShadow=false;}
            }else if(authoredCast.get(node)){node.castShadow=true;authoredCast.delete(node);}
            if(!node.userData.contactShadow)continue;
            if(isBaked&&!contactLayers.has(node)){
                contactLayers.set(node,node.layers.mask);
                node.layers.set(28);
            }else if(!isBaked&&contactLayers.has(node)){
                if(node.layers.mask===(1<<28))node.layers.mask=contactLayers.get(node);
                contactLayers.delete(node);
            }
        }
    }
    function invalidate(x,z){
        const entry=entries.get(keyAt(x,z));
        if(entry)entry.dirty=true;
    }
    function invalidateTerrain(x,z){
        const cx=Math.round(x/chunkSize),cz=Math.round(z/chunkSize);
        for(let dz=-1;dz<=1;dz++)for(let dx=-1;dx<=1;dx++){
            const entry=entries.get((cx+dx)+','+(cz+dz));
            if(entry)entry.dirty=true;
        }
    }
    function invalidateCaster(root){
        rootVersions.delete(root);
        topology=-1;
        invalidate(root.position.x,root.position.z);
    }
    function release(entry){
        if(!entry.mesh)return;
        entry.mesh.parent?.remove(entry.mesh);entry.mesh.geometry.dispose();entry.mesh=null;
    }
    function tile(key){
        let entry=entries.get(key);
        if(!entry){
            const [x,z]=key.split(',').map(Number);
            entry={x:x*chunkSize,z:z*chunkSize,dirty:true,buildings:[],next:[],chunk:null};
            entries.set(key,entry);
        }
        entry.seen=seen;
        return entry;
    }
    function bake(entry){
        release(entry);entry.count=0;entry.dirty=false;
        const positions=[],uvs=[],indices=[],step=4,water=waterLevel();
        function stamp(kind,x,z,width,depth,angle){
            const base=positions.length/3,first=indices.length,cos=Math.cos(angle),sin=Math.sin(angle),heights=[];
            const offsetX=kind===2?width*.12:width*.16,offsetZ=depth*.12;
            for(let row=0;row<=step;row++)for(let col=0;col<=step;col++){
                const u=col/step,v=row/step,lx=(u-.5)*width,lz=(v-.5)*depth;
                const wx=x+lx*cos-lz*sin+offsetX,wz=z+lx*sin+lz*cos+offsetZ;
                const y=heightAt(wx,wz);
                heights.push(y);
                positions.push(wx-entry.x,y+.045,wz-entry.z);
                uvs.push((kind*64+.5+u*63)/192,(.5+v*63)/64);
            }
            for(let row=0;row<step;row++)for(let col=0;col<step;col++){
                const a=row*(step+1)+col,b=a+step+1;
                if(Math.min(heights[a],heights[b],heights[a+1])>=water)indices.push(base+a,base+b,base+a+1);
                if(Math.min(heights[b],heights[b+1],heights[a+1])>=water)indices.push(base+b,base+b+1,base+a+1);
            }
            if(indices.length>first)entry.count++;
        }
        const chunk=entry.chunk;
        if(chunk?.visible){
            for(const {mesh,burned} of chunk.userData.trees||[])if(mesh.visible&&!burned){
                stamp(0,mesh.position.x,mesh.position.z,5.6*mesh.scale.x,4.7*mesh.scale.z,.38);
            }
            const palms=chunk.userData.palms;
            if(palms?.mesh.visible)for(let i=0;i<palms.mesh.count;i++){
                const palm=palms.data[i];
                if((state.treeBurns.get(palm.id)||0)<=state.treeTime&&palms.mesh.instanceMatrix.array[i*16+5]>0)
                    stamp(1,palm.x,palm.z,5.8*palm.scale,5*palm.scale,palm.rotation);
            }
        }
        for(const building of entry.buildings){
            const {position,rotation}=building.mesh,size=building.collisionRadius;
            const scale=building.underConstruction ? .81 : 1;
            stamp(2,position.x,position.z,size*2.65*scale,size*2.35*scale,rotation.y);
        }
        if(!indices.length)return;
        if(!material)material=new T.MeshBasicMaterial({map:makeAtlas(T),transparent:true,depthWrite:false,
            polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false});
        const geometry=new T.BufferGeometry();
        geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
        geometry.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
        geometry.setIndex(indices);geometry.computeBoundingSphere();
        const mesh=new T.Mesh(geometry,material);
        mesh.name='Baked tree and building shadows';
        mesh.userData.landscapeKind='bakedShadows';
        mesh.position.set(entry.x,0,entry.z);mesh.renderOrder=1;mesh.raycast=()=>{};
        scene.add(mesh);mesh.updateMatrixWorld(true);entry.mesh=mesh;
    }
    function update(){
        if(!state.scene)return;
        if(scene!==state.scene){
            for(const entry of entries.values())release(entry);
            entries.clear();scene=state.scene;topology=-1;
        }
        const currentTier=state.graphicsQuality?.tier||'high',baked=currentTier!=='ultra';
        const modeChanged=currentTier!==tier,sync=modeChanged||topology!==index.revision;
        tier=currentTier;stats.mode=baked?'baked':'dynamic';
        stats.tiles=stats.decals=stats.rebuilt=0;
        if(!baked){
            for(const entry of entries.values())release(entry);
            entries.clear();
            if(sync){
                for(const chunk of Object.values(state.chunks)){
                    for(const tree of chunk.userData.trees||[])syncRoot(tree.mesh,false,tree.burned);
                    syncRoot(chunk.userData.palms?.mesh,false);
                }
                for(const building of state.buildings)syncRoot(building.mesh,false);
            }
            topology=index.revision;
            return;
        }
        seen++;
        for(const entry of entries.values())entry.next.length=0;
        for(const key in state.chunks){
            const chunk=state.chunks[key],entry=tile(key);
            if(entry.chunk!==chunk||entry.visible!==chunk.visible||modeChanged){
                entry.chunk=chunk;entry.visible=chunk.visible;entry.dirty=true;
            }
            if(sync){
                for(const tree of chunk.userData.trees||[])syncRoot(tree.mesh,true,tree.burned);
                syncRoot(chunk.userData.palms?.mesh,true);
            }
        }
        for(const building of state.buildings){
            if(building.dead||!building.mesh.parent)continue;
            if(sync)syncRoot(building.mesh,true);
            if(!building.mesh.visible)continue;
            const {x,z}=building.mesh.position,angle=building.mesh.rotation.y,entry=tile(keyAt(x,z));
            entry.next.push(building);
            const shape=buildingShapes.get(building);
            if(!shape||shape.x!==x||shape.z!==z||shape.angle!==angle||shape.construction!==building.underConstruction){
                buildingShapes.set(building,{x,z,angle,construction:building.underConstruction});entry.dirty=true;
            }
        }
        for(const [key,entry] of entries){
            if(entry.seen!==seen){release(entry);entries.delete(key);continue;}
            if(entry.chunk&&state.chunks[key]!==entry.chunk){entry.chunk=null;entry.dirty=true;}
            if(entry.buildings.length!==entry.next.length||entry.next.some((b,i)=>b!==entry.buildings[i]))entry.dirty=true;
            [entry.next,entry.buildings]=[entry.buildings,entry.next];
            if(entry.dirty){bake(entry);stats.rebuilt++;}
            if(entry.mesh){stats.tiles++;stats.decals+=entry.count;}
        }
        topology=index.revision;
    }
    return {update,invalidate,invalidateTerrain,invalidateCaster,restoreCaster,stats};
}
