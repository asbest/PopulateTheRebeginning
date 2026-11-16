// First-use vertex ordering improves locality while preserving triangle order
// and every attribute bit. No simplification, quantization or face reordering.
export function optimizeVertexFetch(geometry){
    const index=geometry.index;if(!index)return geometry;
    const count=geometry.attributes.position.count,remap=new Int32Array(count).fill(-1),order=[];
    for(const value of index.array)if(remap[value]===-1){remap[value]=order.length;order.push(value);}
    for(let i=0;i<count;i++)if(remap[i]===-1){remap[i]=order.length;order.push(i);}
    for(const attribute of Object.values(geometry.attributes)){
        if(attribute.isInterleavedBufferAttribute||attribute.count!==count)return geometry;
    }
    for(const attribute of Object.values(geometry.attributes)){
        const original=attribute.array,next=new original.constructor(original.length),size=attribute.itemSize;
        for(let i=0;i<count;i++)for(let j=0;j<size;j++)next[i*size+j]=original[order[i]*size+j];
        attribute.array=next;attribute.needsUpdate=true;
    }
    for(let i=0;i<index.array.length;i++)index.array[i]=remap[index.array[i]];
    index.needsUpdate=true;return geometry;
}
