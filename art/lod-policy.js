import {graphicsSettings} from './graphics-settings.js';
const context={height:600,selected:[],selectedRoots:new Set(),fpv:false};let generation=0;
const stats={checked:0,updated:0,reused:0,culled:0};
export function invalidateLod(){generation++;}
let previousDetail,previousHeight,previousProjection,previousCamera;const previousSelected=[],previousSelectedRoots=[];
export function beginLod(camera,renderer,state,index,visibility=null){
    stats.checked=stats.updated=stats.reused=stats.culled=0;state.modelLodStats=stats;
    context.height=renderer.domElement.height;context.selected=state.selectedUnits||[];context.fpv=state.isFPV;
    const detail=graphicsSettings.profile.detail*graphicsSettings.detailScale;
    const projection=camera.projectionMatrix.elements[5];
    let changed=previousHeight!==context.height||previousDetail!==detail||previousSelected.length!==context.selected.length||
        previousCamera!==camera||previousProjection!==projection;
    if(!changed)for(let i=0;i<previousSelected.length;i++)if(previousSelected[i]!==context.selected[i]||previousSelectedRoots[i]!==context.selected[i].mesh){changed=true;break;}
    if(changed){
        generation++;previousHeight=context.height;previousDetail=detail;
        previousCamera=camera;previousProjection=projection;
        previousSelected.length=previousSelectedRoots.length=context.selected.length;for(let i=0;i<previousSelected.length;i++){previousSelected[i]=context.selected[i];previousSelectedRoots[i]=context.selected[i].mesh;}
        context.selectedRoots.clear();for(const unit of context.selected)context.selectedRoots.add(unit.mesh);
    }
    visibility?.begin(camera,renderer);
    const demand=camera.isOrthographicCamera?generation:undefined;
    if(index){const list=index.list(state.scene);for(const lod of list.lods)if(!lod.autoUpdate){
        if(visibility&&!visibility.allow(lod)){stats.culled++;continue;}
        if(visibility?.reuse?.(lod,demand)){stats.reused++;continue;}
        stats.checked++;if(lod.update(camera)===false)stats.reused++;else stats.updated++;
    }for(const root of list.visualLods){
        if(visibility&&!visibility.allow(root)){stats.culled++;continue;}
        if(visibility?.reuse?.(root,demand)){stats.reused++;continue;}
        stats.checked++;if(root.userData.updateLod(camera)===false)stats.reused++;else stats.updated++;
    }}
}
export function projectedPixels(camera,height,position,margin=0){
    if(!camera.isPerspectiveCamera)return height*Math.abs(camera.projectionMatrix.elements[5])*.5;
    const e=camera.matrixWorldInverse.elements;
    const depth=Math.max(camera.near,-(e[2]*position.x+e[6]*position.y+e[10]*position.z+e[14])-margin);
    return height*Math.abs(camera.projectionMatrix.elements[5])*.5/(camera.isPerspectiveCamera?depth:1);
}
export function projectedCoverPixels(camera,height,mesh,sphere,box){
    if(!camera.isPerspectiveCamera||!mesh.coverBounds)return projectedPixels(camera,height,sphere.center,sphere.radius);
    // Use the front of the entire cover batch, including blades at its nearest edge.
    box.copy(mesh.coverBounds).applyMatrix4(mesh.matrixWorld);
    const view=camera.matrixWorldInverse.elements;
    const margin=(Math.abs(view[2])*(box.max.x-box.min.x)+Math.abs(view[6])*(box.max.y-box.min.y)+
        Math.abs(view[10])*(box.max.z-box.min.z))*.5;
    return projectedPixels(camera,height,sphere.center,margin);
}
export function chooseLod(previous,pixels,near,far){
    if(previous===0)return pixels<near*.85?(pixels<far*.85?2:1):0;
    if(previous===1)return pixels>near*1.15?0:pixels<far*.85?2:1;
    return pixels>near*1.15?0:pixels>far*1.15?1:2;
}
export function protectedLod(node){
    for(let p=node;p;p=p.parent)if(context.selectedRoots.has(p))return true;
    return false;
}
export function configureLod(T,lod,radius,error=0){
    let frame=-1,level=0,lastCamera,lastDemand;const point=new T.Vector3();
    lod.autoUpdate=false;
    lod.update=function(camera){
        // Explicit standalone calls (asset tools/tests) remain supported.
        point.setFromMatrixPosition(this.matrixWorld);
        const scale=this.matrixWorld.getMaxScaleOnAxis(),perUnit=projectedPixels(camera,context.height,point);
        const demand=Math.fround(scale*perUnit);
        // A translated/rotated sphere has the same projected size in an
        // orthographic view. Cache the actual LOD input, not every pose matrix.
        if(frame===generation&&lastCamera===camera&&lastDemand===demand)return false;
        frame=generation;lastCamera=camera;lastDemand=demand;
        const detail=Math.max(.1,graphicsSettings.profile.detail*graphicsSettings.detailScale);
        this.userData.lodPixelThreshold=75/detail;
        let next=chooseLod(level,perUnit*radius*scale*2,75/detail,16/detail);
        if(protectedLod(this))next=0;
        const deviation=Array.isArray(error)?error[next]||0:error;
        if(next>0&&deviation*scale*perUnit>.8)next=0;
        level=next;
        this._currentLevel=next;
        if(this.userData.activeLod!==next)for(let i=0;i<this.levels.length;i++)this.levels[i].object.visible=i===next;
        this.userData.activeLod=next;
        return true;
    };
}
