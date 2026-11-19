// Snapshot packed shadow color *and* its depth buffer. Dynamic casters then
// depth-test against the original static result in Three's normal shadow pass.
export function installTreeShadowCache(T,state,renderer){
    const shadowMap=renderer.shadowMap,render=shadowMap.render,gl=renderer.getContext();
    const stats={supported:!!(renderer.capabilities.isWebGL2&&gl.blitFramebuffer),hits:0,builds:0,errors:0,lastCpuMs:0,reason:'startup'};
    state.treeShadowCacheStats=stats;
    const api={enabled:true,minCpuMs:.75,stats,dispose};
    let target,previousLight='',previousKey='',stable=0,storedKey='',verified=false,movingFrames=0,baselineCpuMs=0;
    const release=()=>{target?.dispose();target=null;storedKey='';verified=false;};
    renderer.domElement.addEventListener('webglcontextlost',release);
    function dispose(){
        release();
        renderer.domElement.removeEventListener('webglcontextlost',release);
        shadowMap.render=render;
    }
    function lightSignature(light,camera){
        const shadow=light.shadow;
        return [shadowMap.type,camera.layers.mask,shadow.mapSize.x,shadow.mapSize.y,
            ...light.matrixWorld.elements,...light.target.matrixWorld.elements,...shadow.camera.projectionMatrix.elements].join('|');
    }
    function renderOriginal(lights,scene,camera){
        const start=performance.now();
        try{return render.call(shadowMap,lights,scene,camera);}
        finally{stats.lastCpuMs=performance.now()-start;baselineCpuMs=baselineCpuMs*.75+stats.lastCpuMs*.25;}
    }
    function restoreDepth(source,destination){
        const src=renderer.properties.get(source).__webglFramebuffer;
        const dst=renderer.properties.get(destination).__webglFramebuffer;
        if(!src||!dst)throw Error('Shadow framebuffer unavailable');
        // Three r128 tracks READ separately from FRAMEBUFFER. Use paired raw
        // binds here so its logical framebuffer cache stays untouched.
        gl.bindFramebuffer(gl.READ_FRAMEBUFFER,src);
        try{
            // Validate the copy itself. A previously queued driver error must
            // not be mistaken for an incompatible depth buffer.
            if(!verified)for(let i=0;i<8;i++){
                const prior=gl.getError();
                if(prior===gl.NO_ERROR)break;
                stats.priorGlError=prior;
            }
            gl.blitFramebuffer(0,0,source.width,source.height,0,0,destination.width,destination.height,
                gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT,gl.NEAREST);
            if(!verified){
                const error=gl.getError();
                if(error!==gl.NO_ERROR)throw Error('Shadow framebuffer copy unsupported: '+error);
            }
            verified=true;
        }finally{gl.bindFramebuffer(gl.READ_FRAMEBUFFER,dst);}
    }
    shadowMap.render=function(lights,scene,camera){
        const light=lights[0],shadow=light?.shadow;
        const permitted=api.enabled&&stats.supported&&!gl.isContextLost()&&scene===state.scene&&lights.length===1&&
            light?.isDirectionalLight&&shadowMap.type!==T.VSMShadowMap&&shadowMap.enabled&&shadow.map&&
            (shadow.autoUpdate||shadow.needsUpdate)&&(shadowMap.autoUpdate||shadowMap.needsUpdate)&&
            !renderer.clippingPlanes.length&&!renderer.getRenderTarget()&&shadow.map.width<=2048&&shadow.map.height<=2048;
        if(!permitted){
            stats.reason='original';
            return renderOriginal(lights,scene,camera);
        }
        const lightKey=lightSignature(light,camera);
        if(previousLight!==lightKey){
            previousLight=lightKey;stable=0;stats.reason='light-changed';
            if(target&&++movingFrames>=120)release();
            return renderOriginal(lights,scene,camera);
        }
        movingFrames=0;
        if(!target&&baselineCpuMs<api.minCpuMs){
            stats.reason='low-cost';
            return renderOriginal(lights,scene,camera);
        }
        // Only authored opaque tree batches are cacheable. Unbatched,
        // alpha-tested and moving objects stay in the normal pass.
        const trees=scene.children.filter(mesh=>mesh.userData.staticTreeShadow&&mesh.visible&&mesh.castShadow&&
            mesh.layers.test(camera.layers)&&mesh.material.visible&&!mesh.material.alphaTest&&!mesh.material.displacementMap&&
            !mesh.material.clippingPlanes?.length&&!mesh.customDepthMaterial);
        if(trees.length<16){
            stats.reason='sparse';stable=0;previousKey='';if(target)release();
            return renderOriginal(lights,scene,camera);
        }
        const key=lightKey+'|'+trees.map(mesh=>[mesh.id,mesh.count,mesh.geometry.id,mesh.material.id,mesh.material.version,
            mesh.material.side,mesh.material.shadowSide,mesh.instanceMatrix.version,mesh.geometry.index?.version,
            ...mesh.matrixWorld.elements].join(',')).join(';');
        if(previousKey!==key){
            previousKey=key;stable=0;stats.reason='scene-changed';
            return renderOriginal(lights,scene,camera);
        }
        if(++stable<2){stats.reason='stabilizing';return renderOriginal(lights,scene,camera);}
        const originalMap=shadow.map,draw=renderer.renderBufferDirect,clear=renderer.clear;
        const treeSet=new Set(trees);
        const start=performance.now();
        try{
            if(storedKey!==key){
                if(!target||target.width!==originalMap.width||target.height!==originalMap.height){
                    release();target=originalMap.clone();
                }
                shadow.map=target;
                renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
                    if(treeSet.has(object))return draw.call(this,camera,scene,geometry,material,object,group);
                };
                render.call(this,lights,scene,camera);
                shadow.map=originalMap;
                shadow.needsUpdate=true;shadowMap.needsUpdate=true;
                storedKey=key;stats.builds++;
            }else stats.hits++;
            renderer.clear=function(...args){
                if(renderer.getRenderTarget()===originalMap)restoreDepth(target,originalMap);
                else clear.apply(this,args);
            };
            renderer.renderBufferDirect=function(camera,scene,geometry,material,object,group){
                if(!treeSet.has(object))return draw.call(this,camera,scene,geometry,material,object,group);
            };
            render.call(this,lights,scene,camera);
            stats.reason='reused-static';
        }catch(error){
            api.enabled=false;stats.errors++;stats.reason='fallback';stats.lastError=String(error);release();
            shadow.map=originalMap;shadow.needsUpdate=true;shadowMap.needsUpdate=true;
            renderer.clear=clear;renderer.renderBufferDirect=draw;renderer.setRenderTarget(null);
            console.warn('Tree shadow cache unavailable',error);
            render.call(this,lights,scene,camera);
        }finally{
            shadow.map=originalMap;renderer.clear=clear;renderer.renderBufferDirect=draw;
            stats.lastCpuMs=performance.now()-start;
        }
    };
    return api;
}
