// Compare exact local edit inputs before rebuilding a loaded chunk. The two
// extra world units include interpolation support and normal samples at edges.
export function createTerrainRefresh(env){
    const records=new WeakMap(),scratch=[],attributes=['position','normal','color','artTerrainPattern','foam','depth'];
    const stats={reused:0,rebuilt:0};
    return {stats,update(mesh,cx,cz,build){
        const {state,CONFIG,CHUNK_SIZE,COLORS}=env,settings=state.matchSettings;
        const signature=JSON.stringify([settings,CONFIG.TERRAIN,COLORS]);
        scratch.length=0;
        const half=CHUNK_SIZE/2+2;
        for(let x=Math.floor(cx*CHUNK_SIZE-half);x<=Math.ceil(cx*CHUNK_SIZE+half);x++)
            for(let z=Math.floor(cz*CHUNK_SIZE-half);z<=Math.ceil(cz*CHUNK_SIZE+half);z++){
                const value=state.terrainMods.get(`${x},${z}`);
                if(value!==undefined){scratch.push(x,z,value);}
            }
        const g=mesh.geometry,old=records.get(mesh);
        let same=old&&old.cx===cx&&old.cz===cz&&old.geometry===g&&old.signature===signature&&old.simplex===state.simplex&&old.perm===state.simplex?.perm&&old.noise===state.simplex?.noise2D&&old.mods.length===scratch.length;
        if(same)for(let i=0;i<attributes.length;i++){
            const a=g.attributes[attributes[i]];if(a!==old.attributes[i]||a?.version!==old.versions[i]){same=false;break;}
        }
        if(same)for(let i=0;i<scratch.length;i++)if(scratch[i]!==old.mods[i]){same=false;break;}
        if(same){stats.reused++;return false;}
        build(mesh,cx,cz);stats.rebuilt++;
        const record=old||{mods:[],attributes:[],versions:[]};record.mods.length=scratch.length;
        for(let i=0;i<scratch.length;i++)record.mods[i]=scratch[i];
        Object.assign(record,{cx,cz,geometry:g,signature,simplex:state.simplex,perm:state.simplex?.perm,noise:state.simplex?.noise2D});
        for(let i=0;i<attributes.length;i++){const a=g.attributes[attributes[i]];record.attributes[i]=a;record.versions[i]=a?.version;}
        records.set(mesh,record);return true;
    }};
}
