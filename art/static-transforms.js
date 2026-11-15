// Freeze local matrices, but retain support for ordinary position/rotation/scale
// edits. Synchronize before scene.updateMatrixWorld, not after the render starts.
export function createStaticTransforms(index){
    const saved=new WeakMap(),rootVersions=new WeakMap(),roots=new Set();let records=[],spare=[],epoch=0;
    let rootRevision=-1,topology=-1,revision=0,scene;
    const stats={checked:0,composed:0};
    function compose(r){
        const n=r.node,p=n.position,q=n.quaternion,s=n.scale,v=r.values;
        if(v[0]===p.x&&v[1]===p.y&&v[2]===p.z&&v[3]===q.x&&v[4]===q.y&&v[5]===q.z&&v[6]===q.w&&v[7]===s.x&&v[8]===s.y&&v[9]===s.z)return;
        v[0]=p.x;v[1]=p.y;v[2]=p.z;v[3]=q.x;v[4]=q.y;v[5]=q.z;v[6]=q.w;v[7]=s.x;v[8]=s.y;v[9]=s.z;
        n.updateMatrix();stats.composed++;
    }
    function world(parents,children){const r=saved.get(this);compose(r);return r.world.call(this,parents,children);}
    function restore(r){
        r.node.matrixAutoUpdate=r.auto;
        if(r.node.updateWorldMatrix===world)r.node.updateWorldMatrix=r.world;
        saved.delete(r.node);
    }
    function add(root){if(!roots.has(root)){roots.add(root);revision++;}}
    function remove(root){if(roots.delete(root)){
        for(const node of index.list(root).nodes){const r=saved.get(node);if(r)restore(r);}
        revision++;
    }}
    function sync(){
        for(const root of roots)if(root!==scene&&!root.parent){remove(root);}
        if(rootRevision===revision&&topology!==index.revision){
            let changed=false;
            for(const root of roots)if(root!==scene&&rootVersions.get(root)!==index.list(root).revision){changed=true;break;}
            if(!changed)topology=index.revision;
        }
        if(rootRevision!==revision||topology!==index.revision){
            const previous=records;records=spare;spare=previous;records.length=0;epoch++;
            for(const root of roots){
              const nodes=root===scene?[scene]:index.list(root).nodes;
              if(root!==scene)rootVersions.set(root,index.list(root).revision);
              for(const node of nodes){
                // Explicit/manual matrices belong to their original owner.
                let r=saved.get(node);
                if(!r&&node.matrixAutoUpdate){r={node,auto:true,world:node.updateWorldMatrix,values:new Float64Array(10).fill(NaN)};saved.set(node,r);node.updateWorldMatrix=world;}
                if(r){node.matrixAutoUpdate=false;r.epoch=epoch;records.push(r);}
              }
            }
            for(const r of previous)if(r.epoch!==epoch)restore(r);
            previous.length=0;
            rootRevision=revision;topology=index.revision;
        }
        stats.checked=records.length;stats.composed=0;
        for(const r of records)compose(r);
    }
    function bind(root){
        for(const old of roots)remove(old);
        scene=root;const update=root.updateMatrixWorld;
        root.updateMatrixWorld=function(force){sync();return update.call(this,force);};
        // The scene itself must not force unchanged static descendants dirty.
        add(root);
    }
    // Scene is a special root: its dynamic children must not be frozen.
    return {add,remove,stats,bind,sync,get scene(){return scene;}};
}
