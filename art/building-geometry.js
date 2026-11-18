// Bake only anonymous, opaque, static direct children of freshly authored
// buildings/rigs. Named landmarks, banners, effects and packed-model LODs stay live.
export function createBuildingGeometry(T){
    const cache=new Map(),identities=new WeakMap();let sequence=0;
    function identity(value){if(!value)return 0;if(!identities.has(value))identities.set(value,++sequence);return identities.get(value);}
    const stats={builds:0,hits:0,removedParts:0,errors:0};
    const api={enabled:true,stats,merge};
    function supported(n){
        const g=n.geometry,m=n.material;
        return n.isMesh&&!n.name&&n.visible&&n.children.length===0&&Object.keys(n.userData).length===0&&
            !n.isInstancedMesh&&!n.isSkinnedMesh&&!n.customDepthMaterial&&!n.customDistanceMaterial&&
            m?.type==='MeshStandardMaterial'&&!m.transparent&&m.opacity===1&&!m.clippingPlanes?.length&&
            m.emissive.getHex()===0&&m.onBeforeCompile===T.Material.prototype.onBeforeCompile&&
            n.onBeforeRender===T.Object3D.prototype.onBeforeRender&&g?.isBufferGeometry&&!g.isInstancedBufferGeometry&&
            !Object.keys(g.morphAttributes).length&&g.drawRange.start===0&&g.drawRange.count===Infinity&&
            Object.keys(g.attributes).sort().join(',')==='normal,position,uv'&&
            g.attributes.position.itemSize===3&&g.attributes.normal.itemSize===3&&g.attributes.uv.itemSize===2&&
            g.attributes.normal.count===g.attributes.position.count&&g.attributes.uv.count===g.attributes.position.count&&
            Object.values(g.attributes).every(a=>!a.isInterleavedBufferAttribute&&!a.normalized&&a.array instanceof Float32Array);
    }
    function bake(parts){
        const geometries=parts.map(n=>n.geometry.clone().applyMatrix4(n.matrix));
        const output=new T.BufferGeometry(),indices=[];
        let offset=0;
        try{
            for(const key of ['position','normal','uv']){
                const size=key==='uv'?2:3,array=new Float32Array(geometries.reduce((n,g)=>n+g.attributes[key].array.length,0));
                let cursor=0;for(const g of geometries){array.set(g.attributes[key].array,cursor);cursor+=g.attributes[key].array.length;}
                output.setAttribute(key,new T.BufferAttribute(array,size));
            }
            for(const g of geometries){
                const count=g.index?.count||g.attributes.position.count;
                for(let i=0;i<count;i++)indices.push(offset+(g.index?g.index.getX(i):i));
                offset+=g.attributes.position.count;
            }
            output.setIndex(indices);output.computeBoundingBox();output.computeBoundingSphere();return output;
        }catch(error){output.dispose();throw error;}
        finally{for(const g of geometries)g.dispose();}
    }
    function merge(root,kind){
        if(!api.enabled)return root;
        const groups=new Map(),replacements=[];
        try{
            for(const n of root.children){
                if(!supported(n))continue;n.updateMatrix();if(!(n.matrix.determinant()>0))continue;
                const key=[n.material.uuid,n.castShadow,n.receiveShadow,n.renderOrder,n.layers.mask,n.frustumCulled].join('|');
                if(!groups.has(key))groups.set(key,[]);groups.get(key).push(n);
            }
            for(const [group,parts]of groups){
                if(parts.length<2)continue;
                // Equal shapes share buffers even across types/material colours.
                // Material/render flags still determine each separate draw group.
                const key=parts.map(n=>[n.geometry.uuid,identity(n.geometry.attributes.position),n.geometry.attributes.position.version,
                    identity(n.geometry.attributes.normal),n.geometry.attributes.normal.version,identity(n.geometry.attributes.uv),
                    n.geometry.attributes.uv.version,identity(n.geometry.index),n.geometry.index?.version,...n.matrix.elements].join(',')).join(';');
                let geometry=cache.get(key);
                if(!geometry){geometry=bake(parts);cache.set(key,geometry);stats.builds++;}else stats.hits++;
                const source=parts[0],mesh=new T.Mesh(geometry,source.material);
                mesh.name='Merged building '+kind;mesh.castShadow=source.castShadow;mesh.receiveShadow=source.receiveShadow;
                mesh.renderOrder=source.renderOrder;mesh.layers.mask=source.layers.mask;mesh.frustumCulled=source.frustumCulled;
                mesh.userData.sharedGeometry=true;mesh.userData.mergedBuildingStatic=true;mesh.userData.sourcePartCount=parts.length;
                replacements.push({mesh,parts});
            }
        }catch(error){stats.errors++;console.warn('Building merge unavailable; keeping original parts',error);return root;}
        // Publish only complete replacements; unsupported geometry keeps its
        // existing renderer path. Shared originals are never disposed here.
        for(const {mesh,parts}of replacements){for(const n of parts)root.remove(n);root.add(mesh);stats.removedParts+=parts.length-1;}
        return root;
    }
    return api;
}
