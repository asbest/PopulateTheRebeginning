// Procedural boxes of different dimensions share the same vertices/UVs.
// Validate all buffers before replacing dimensions with instance scaling.
// Edited, subdivided or custom geometry always uses its original buffers.
export function createBoxInstances(T){
    const unit=new T.BoxGeometry(1,1,1),cache=new WeakMap();
    function get(geometry){
        let record=cache.get(geometry);
        const position=geometry.attributes.position,normal=geometry.attributes.normal,uv=geometry.attributes.uv;
        let unchanged=record&&record.position===position&&record.normal===normal&&record.uv===uv&&
            record.version===position?.version&&record.normalVersion===normal?.version&&record.uvVersion===uv?.version&&
            record.index===geometry.index&&record.indexVersion===geometry.index?.version&&
            geometry.drawRange.start===0&&geometry.drawRange.count===Infinity&&geometry.groups.length===unit.groups.length;
        if(unchanged&&record.value)for(let i=0;i<unit.groups.length;i++){
            const a=geometry.groups[i],b=unit.groups[i];if(a.start!==b.start||a.count!==b.count||a.materialIndex!==b.materialIndex){unchanged=false;break;}
        }
        if(unchanged)return record.value;
        const p=geometry.parameters;
        let value=null;
        if(geometry.type==='BoxGeometry'&&p&&[p.width,p.height,p.depth].every(v=>v>0&&Number.isFinite(v))&&
            Object.keys(geometry.attributes).length===Object.keys(unit.attributes).length&&
            geometry.index?.count===unit.index.count&&geometry.groups.length===unit.groups.length&&
            geometry.drawRange.start===0&&geometry.drawRange.count===Infinity){
            const scale=[p.width,p.height,p.depth];let valid=true;
            for(const name of Object.keys(unit.attributes)){
                const a=geometry.attributes[name],b=unit.attributes[name];
                if(!a||a.isInterleavedBufferAttribute||a.itemSize!==b.itemSize||a.count!==b.count||a.normalized!==b.normalized){valid=false;break;}
                for(let i=0;i<a.array.length;i++)if(a.array[i]!==Math.fround(b.array[i]*(name==='position'?scale[i%3]:1))){valid=false;break;}
            }
            for(let i=0;valid&&i<unit.index.count;i++)if(geometry.index.array[i]!==unit.index.array[i])valid=false;
            for(let i=0;valid&&i<unit.groups.length;i++){
                const a=geometry.groups[i],b=unit.groups[i];if(a.start!==b.start||a.count!==b.count||a.materialIndex!==b.materialIndex)valid=false;
            }
            if(valid)value={geometry:unit,scale:new T.Vector3(...scale)};
        }
        cache.set(geometry,{position,normal,uv,version:position?.version,normalVersion:normal?.version,uvVersion:uv?.version,
            index:geometry.index,indexVersion:geometry.index?.version,value});return value;
    }
    return {get};
}
