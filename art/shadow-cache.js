// Reuse a shadow map only if every input is unchanged. Dynamic, skinned and
// custom-shader casters retain the normal renderer path. Never lower cadence.
export function createShadowCache(T){
    let previous=[],current=[],matrices=[],used=0,misses=0,cooldown=0,boundRenderer;
    const lights=[];
    const stats={reused:0,updated:0,bypassed:0};
    function value(v){current.push(v);}
    function matrix(m){
        let saved=matrices[used];if(!saved)saved=matrices[used]=new T.Matrix4();used++;
        const same=saved.equals(m);saved.copy(m);return same;
    }
    function texture(t){
        value(t);value(t?.version);if(!t)return;
        value(t.offset.x);value(t.offset.y);value(t.repeat.x);value(t.repeat.y);
        value(t.center.x);value(t.center.y);value(t.rotation);value(t.flipY);
    }
    return {stats,enabled:true,
        update(scene,camera,renderer,index=null){
            if(!renderer.shadowMap.enabled||renderer.getRenderTarget())return;
            if(!this.enabled){scene.traverseVisible(n=>{if(n.isLight&&n.castShadow)n.shadow.autoUpdate=true;});misses=cooldown=0;return;}
            if(boundRenderer!==renderer){
                boundRenderer=renderer;previous.length=0;
                renderer.domElement?.addEventListener('webglcontextrestored',()=>{previous.length=0;misses=cooldown=0;});
            }
            // Moving scenes cannot reuse the map. Avoid paying for a graph scan
            // every combat frame; the original full-rate shadow pass remains on.
            if(cooldown){cooldown--;for(const light of lights)light.shadow.autoUpdate=true;previous.length=0;stats.bypassed++;return;}
            current.length=0;used=0;let same=matrix(camera.matrixWorld),unsafe=false;
            lights.length=0;
            same=matrix(camera.projectionMatrix)&&same;
            value(renderer.shadowMap.type);value(camera.layers.mask);
            if(renderer.clippingPlanes?.length)unsafe=true;
            const visit=node=>{
                if(node.isLight&&node.castShadow){
                    lights.push(node);value(node);value(node.distance);value(node.angle);same=matrix(node.matrixWorld)&&same;
                    if(node.target)same=matrix(node.target.matrixWorld)&&same;
                    const shadow=node.shadow;value(shadow.mapSize.x);value(shadow.mapSize.y);
                    value(shadow.bias);value(shadow.normalBias);value(shadow.radius);value(shadow.map);
                    const c=shadow.camera;value(c.near);value(c.far);value(c.zoom);value(c.left);value(c.right);value(c.top);value(c.bottom);
                    same=matrix(shadow.camera.projectionMatrix)&&same;
                }
                if(!(node.isMesh||node.isLine||node.isPoints)||!node.castShadow||
                    !node.userData.shadowOnly&&!node.layers.test(camera.layers))return;
                value(node);value(node.geometry);value(node.count);same=matrix(node.matrixWorld)&&same;
                value(node.instanceMatrix?.version);value(node.instanceColor?.version);
                value(node.geometry.index?.version);value(node.geometry.drawRange.start);value(node.geometry.drawRange.count);value(node.geometry.instanceCount);
                for(const group of node.geometry.groups){value(group.start);value(group.count);value(group.materialIndex);}
                for(const key in node.geometry.attributes)value(node.geometry.attributes[key].version);
                if(node.isSkinnedMesh||node.morphTargetInfluences||node.customDepthMaterial||node.customDistanceMaterial)unsafe=true;
                const check=m=>{
                    value(m);value(m.version);value(m.visible);value(m.side);value(m.shadowSide);
                    value(m.alphaTest);value(m.opacity);texture(m.map);texture(m.alphaMap);value(m.displacementMap);
                    if(m.displacementMap||m.clippingPlanes?.length||m.isShaderMaterial)unsafe=true;
                };
                if(Array.isArray(node.material))for(const m of node.material)check(m);else check(node.material);
            };
            if(index){for(const node of index.visibleNodes(scene))visit(node);}
            else scene.traverseVisible(visit);
            if(current.length!==previous.length)same=false;
            if(same)for(let i=0;i<current.length;i++)if(current[i]!==previous[i]){same=false;break;}
            for(const light of lights){
                const shadow=light.shadow;
                // Respect explicit invalidation, context restoration and resizing.
                const update=unsafe||!same||!shadow.map||shadow.needsUpdate||renderer.shadowMap.needsUpdate;
                shadow.autoUpdate=update;
                if(update)stats.updated++;else stats.reused++;
            }
            if(unsafe||!same){if(++misses>=4){cooldown=60;misses=0;}}else misses=0;
            if(matrices.length>Math.max(64,used*2))matrices.length=used;
            const swap=previous;previous=current;current=swap;
        }
    };
}
