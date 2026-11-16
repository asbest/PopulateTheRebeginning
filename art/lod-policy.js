import {graphicsSettings} from './graphics-settings.js';
const context={height:600,selected:[],fpv:false};let generation=0;
export function invalidateLod(){generation++;}
let previousCamera,world,projection,previousDetail,previousHeight;const previousSelected=[];
export function beginLod(camera,renderer,state,index){
    context.height=renderer.domElement.height;context.selected=state.selectedUnits||[];context.fpv=state.isFPV;
    const detail=graphicsSettings.profile.detail*graphicsSettings.detailScale;
    let changed=previousCamera!==camera||previousHeight!==context.height||previousDetail!==detail||!world?.equals(camera.matrixWorld)||!projection?.equals(camera.projectionMatrix)||previousSelected.length!==context.selected.length;
    if(!changed)for(let i=0;i<previousSelected.length;i++)if(previousSelected[i]!==context.selected[i]){changed=true;break;}
    if(changed){
        generation++;previousCamera=camera;previousHeight=context.height;previousDetail=detail;
        if(!world){world=camera.matrixWorld.clone();projection=camera.projectionMatrix.clone();}else{world.copy(camera.matrixWorld);projection.copy(camera.projectionMatrix);}
        previousSelected.length=context.selected.length;for(let i=0;i<previousSelected.length;i++)previousSelected[i]=context.selected[i];
    }
    if(index){const list=index.list(state.scene);for(const lod of list.lods)if(!lod.autoUpdate)lod.update(camera);for(const root of list.visualLods)root.userData.updateLod(camera);}
}
export function projectedPixels(camera,height,position,margin=0){
    const e=camera.matrixWorldInverse.elements;
    const depth=Math.max(camera.near,-(e[2]*position.x+e[6]*position.y+e[10]*position.z+e[14])-margin);
    return height*Math.abs(camera.projectionMatrix.elements[5])*.5/(camera.isPerspectiveCamera?depth:1);
}
export function chooseLod(previous,pixels,near,far){
    if(previous===0)return pixels<near*.85?(pixels<far*.85?2:1):0;
    if(previous===1)return pixels>near*1.15?0:pixels<far*.85?2:1;
    return pixels>near*1.15?0:pixels>far*1.15?1:2;
}
export function protectedLod(node){
    for(let p=node;p;p=p.parent)for(const unit of context.selected)if(unit.mesh===p)return true;
    return false;
}
export function configureLod(T,lod,radius,error=0){
    let frame=-1,level=0,lastCamera;const point=new T.Vector3(),matrix=new T.Matrix4(),cameraMatrix=new T.Matrix4();
    lod.autoUpdate=false;
    lod.update=function(camera){
        // Explicit standalone calls (asset tools/tests) remain supported.
        if(frame===generation&&lastCamera===camera&&matrix.equals(this.matrixWorld)&&cameraMatrix.equals(camera.matrixWorld))return;
        frame=generation;lastCamera=camera;matrix.copy(this.matrixWorld);cameraMatrix.copy(camera.matrixWorld);
        point.setFromMatrixPosition(this.matrixWorld);
        const scale=this.matrixWorld.getMaxScaleOnAxis(),perUnit=projectedPixels(camera,context.height,point);
        const detail=Math.max(.1,graphicsSettings.profile.detail*graphicsSettings.detailScale);
        this.userData.lodPixelThreshold=75/detail;
        let next=chooseLod(level,perUnit*radius*scale*2,75/detail,16/detail);
        if(protectedLod(this))next=0;
        const deviation=Array.isArray(error)?error[next]||0:error;
        if(next>0&&deviation*scale*perUnit>.8)next=0;
        level=next;
        this._currentLevel=next;
        for(let i=0;i<this.levels.length;i++)this.levels[i].object.visible=i===next;
        this.userData.activeLod=next;
    };
}
