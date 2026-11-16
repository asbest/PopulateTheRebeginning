// Vertex clustering selects existing vertices. UV and normal bins preserve
// seams. Only index buffers change, so materials/colours stay on their sources.
export function makeMeshLod(T,source,fraction=.035){
    if(!source.boundingSphere)source.computeBoundingSphere();
    const g=new T.BufferGeometry();for(const key in source.attributes)g.setAttribute(key,source.attributes[key]);
    if(!source.index){g.setIndex(null);return {geometry:source,error:0};}
    source.computeBoundingBox();const size=source.boundingBox.getSize(new T.Vector3()),cell=Math.max(size.x,size.y,size.z)*fraction;
    if(!cell)return {geometry:source,error:0};
    const p=source.attributes.position,n=source.attributes.normal,uv=source.attributes.uv,remap=new Uint32Array(p.count),cells=new Map();let error=0;
    for(let i=0;i<p.count;i++){
        const key=[Math.floor(p.getX(i)/cell),Math.floor(p.getY(i)/cell),Math.floor(p.getZ(i)/cell),
            uv?Math.floor(uv.getX(i)*8):0,uv?Math.floor(uv.getY(i)*8):0,
            n?Math.round(n.getX(i)*2):0,n?Math.round(n.getY(i)*2):0,n?Math.round(n.getZ(i)*2):0].join(',');
        let j=cells.get(key);if(j===undefined){j=i;cells.set(key,j);}remap[i]=j;
        error=Math.max(error,Math.hypot(p.getX(i)-p.getX(j),p.getY(i)-p.getY(j),p.getZ(i)-p.getZ(j)));
    }
    const indices=[];for(let i=0;i<source.index.count;i+=3){const a=remap[source.index.getX(i)],b=remap[source.index.getX(i+1)],c=remap[source.index.getX(i+2)];if(a!==b&&b!==c&&a!==c)indices.push(a,b,c);}
    if(indices.length>=source.index.count)return {geometry:source,error:0};
    const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),before=new T.Vector3(),after=new T.Vector3();
    for(let i=0;i<source.index.count;i+=3){
        const x=source.index.getX(i),y=source.index.getX(i+1),z=source.index.getX(i+2);
        if(remap[x]===remap[y]||remap[y]===remap[z]||remap[x]===remap[z])continue;
        a.fromBufferAttribute(p,x);b.fromBufferAttribute(p,y);c.fromBufferAttribute(p,z);before.crossVectors(b.sub(a),c.sub(a));
        a.fromBufferAttribute(p,remap[x]);b.fromBufferAttribute(p,remap[y]);c.fromBufferAttribute(p,remap[z]);after.crossVectors(b.sub(a),c.sub(a));
        if(before.dot(after)<=0)return {geometry:source,error:0};
    }
    g.setIndex(indices);g.boundingBox=source.boundingBox.clone();g.boundingSphere=source.boundingSphere.clone();
    return {geometry:g,error};
}
