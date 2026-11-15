// Compare the actual float32 GPU values, rather than double precision poses.
// Only changed contiguous ranges are uploaded; ordering and colours stay exact.
export function createInstanceWriter(T){
    const records=new WeakMap(),names=['instanceMatrix','instanceColor'];
    const stats={matrixUploads:0,colorUploads:0,values:0};
    function write(mesh,name,offset,values,count){
        let attribute=mesh[name];
        if(!attribute){attribute=mesh[name]=new T.InstancedBufferAttribute(new Float32Array(mesh.instanceMatrix.count*3),3);attribute.setUsage(T.DynamicDrawUsage);}
        let record=records.get(attribute);
        if(!record){record={start:Infinity,end:0};records.set(attribute,record);}
        for(let j=0;j<count;j++){
            const value=Math.fround(values[j]),index=offset+j;
            if(attribute.array[index]===value)continue;
            attribute.array[index]=value;record.start=Math.min(record.start,index);record.end=Math.max(record.end,index+1);
        }
    }
    const rgb=new Float32Array(3);
    function flush(mesh){
        for(const name of names){
            const attribute=mesh[name],record=attribute&&records.get(attribute);
            if(!record||record.end===0)continue;
            attribute.updateRange.offset=record.start;attribute.updateRange.count=record.end-record.start;
            attribute.needsUpdate=true;stats[name==='instanceMatrix'?'matrixUploads':'colorUploads']++;
            stats.values+=record.end-record.start;record.start=Infinity;record.end=0;
        }
    }
    return {stats,reset(){stats.matrixUploads=stats.colorUploads=stats.values=0;},
        matrix(mesh,index,matrix){write(mesh,'instanceMatrix',index*16,matrix.elements,16);},
        color(mesh,index,color){rgb[0]=color.r;rgb[1]=color.g;rgb[2]=color.b;write(mesh,'instanceColor',index*3,rgb,3);},flush};
}
