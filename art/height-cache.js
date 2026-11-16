export function invalidateHeightChunks(cache,chunks,size){
    if(!chunks){cache.clear();return;}
    for(const key of cache.keys()){
        const x=(key>>16)/10,z=((key<<16)>>16)/10;
        for(const chunk of chunks){const comma=chunk.indexOf(','),cx=Number(chunk.slice(0,comma)),cz=Number(chunk.slice(comma+1));
            if(Math.abs(x-cx*size)<=size/2+2&&Math.abs(z-cz*size)<=size/2+2){cache.delete(key);break;}}
    }
}
