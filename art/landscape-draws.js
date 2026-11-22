const categories=['terrain','water','grass','stones','bushes','palms','flowers','trees','buildings','characters','bakedShadows','other'];

function category(object){
    for(let node=object;node;node=node.parent){
        const kind=node.userData.landscapeKind;
        if(kind)return kind;
    }
    return 'other';
}

// Scope the hook to one recorded world render. Use the renderer's actual
// counters, including groups and instances, rather than estimating from meshes.
export function measureLandscapeDraws(renderer,scene,camera,render=()=>renderer.render(scene,camera),detailed=true){
    const main={},shadows={};
    if(detailed)for(const kind of categories){main[kind]={calls:0,triangles:0};shadows[kind]={calls:0,triangles:0};}
    const info=renderer.info.render,draw=renderer.renderBufferDirect,shadowMap=renderer.shadowMap,shadowRender=shadowMap.render;
    let pass=main,shadowCpuMs=0,shadowCalls=0;
    if(detailed)renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
        const calls=info.calls,triangles=info.triangles;
        draw.call(this,camera,scene,geometry,material,object,group);
        const count=pass[category(object)];
        count.calls+=info.calls-calls;
        count.triangles+=info.triangles-triangles;
    };
    shadowMap.render=function(...args){
        const start=performance.now(),calls=info.calls;
        pass=shadows;
        try{return shadowRender.apply(this,args);}
        finally{pass=main;shadowCpuMs+=performance.now()-start;shadowCalls+=info.calls-calls;}
    };
    try{render();}
    finally{if(detailed)renderer.renderBufferDirect=draw;shadowMap.render=shadowRender;}
    return {main,shadows,shadowCpuMs,shadowCalls};
}
