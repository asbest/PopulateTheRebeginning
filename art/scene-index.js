// Track topology through Object3D's normal mutation APIs. Cached subtree lists
// are shared by rendering consumers; visibility and transforms remain live.
export function createSceneIndex(){
    const tracked=new WeakMap(),lists=new WeakMap(),versions=new WeakMap(),visibility=new WeakMap();let revision=0,generation=0;
    const stats={rebuilds:0,hits:0};
    function changed(node){revision++;for(let p=node;p;p=p.parent)versions.set(p,(versions.get(p)||0)+1);}
    function add(...children){
        const result=tracked.get(this).add.apply(this,children);
        for(const child of children)track(child);changed(this);return result;
    }
    function remove(...children){const result=tracked.get(this).remove.apply(this,children);changed(this);return result;}
    function clear(){const result=tracked.get(this).clear.call(this);changed(this);return result;}
    function track(node){
        if(tracked.has(node))return;
        tracked.set(node,{add:node.add,remove:node.remove,clear:node.clear});node.add=add;node.remove=remove;if(node.clear)node.clear=clear;
        node.addEventListener('removed',()=>changed(node));
        for(const child of node.children)track(child);
    }
    function list(root){
        track(root);let entry=lists.get(root);
        if(entry?.localVersion===(versions.get(root)||0)&&entry.generation===generation){stats.hits++;return entry;}
        if(!entry)entry={nodes:[],meshes:[],lods:[],visualLods:[],visibleNodes:[]};
        entry.nodes.length=entry.meshes.length=entry.lods.length=entry.visualLods.length=0;
        root.traverse(node=>{track(node);entry.nodes.push(node);if(node.isMesh)entry.meshes.push(node);if(node.isLOD)entry.lods.push(node);if(node.userData.updateLod)entry.visualLods.push(node);});
        entry.localVersion=versions.get(root)||0;entry.revision=revision;entry.generation=generation;lists.set(root,entry);stats.rebuilds++;return entry;
    }
    function visibleNodes(root){
        const entry=list(root),result=entry.visibleNodes;result.length=0;
        for(const node of entry.nodes){const shown=node.visible&&(node===root||visibility.get(node.parent));visibility.set(node,shown);if(shown)result.push(node);}
        return result;
    }
    function visible(node,root){for(let p=node;p;p=p.parent){if(!p.visible)return false;if(p===root)return true;}return false;}
    return {list,visible,visibleNodes,stats,invalidate(node){if(node)changed(node);else{revision++;generation++;}},get revision(){return revision;}};
}
