// Read-only snapshots keep Three.js objects monomorphic: accessor interception
// made the real renderer slower. Shared resource signatures are checked once
// per frame; transforms already have subtree versions from StaticTransforms.
const resources=new WeakMap();let frame=0;
export const nextBuildingObservationFrame=()=>++frame;
const nodeKeys=['visible','geometry','material','castShadow','receiveShadow','renderOrder','frustumCulled','onBeforeRender','customDepthMaterial','customDistanceMaterial','matrixAutoUpdate'];
const materialKeys=['version','type','transparent','opacity','clippingPlanes','displacementMap','vertexColors','stencilWrite','blending','normalMap','normalMapType','onBeforeCompile'];
function resourceVersion(object,stamp){
 if(!object)return 0;
 let entry=resources.get(object);
 if(!entry){entry={stamp:0,version:0,values:[],cursor:0,changed:false,
  put(value){const i=this.cursor++;if(this.values[i]!==value){this.values[i]=value;this.changed=true;}}};resources.set(object,entry);}
 if(entry.stamp===stamp)return entry.version;
 entry.stamp=stamp;entry.cursor=0;entry.changed=false;
 if(object.isBufferGeometry){
  entry.put(object.isInstancedBufferGeometry);entry.put(object.index);entry.put(object.index?.version);
  entry.put(object.drawRange.start);entry.put(object.drawRange.count);
  for(const key in object.attributes){const a=object.attributes[key];entry.put(key);entry.put(a);entry.put(a.version);
   entry.put(a.array);entry.put(a.itemSize);entry.put(a.count);entry.put(a.normalized);entry.put(a.isInterleavedBufferAttribute);
  }
  entry.put(null);for(const key in object.morphAttributes){entry.put(key);entry.put(object.morphAttributes[key]);entry.put(object.morphAttributes[key].length);}
 }else for(const key of materialKeys)entry.put(object[key]);
 if(entry.values.length!==entry.cursor){entry.values.length=entry.cursor;entry.changed=true;}
 if(entry.changed)entry.version++;
 return entry.version;
}
export function createBuildingObserver(){
 let version=0,nodes=[],safe=false,checks=0;
 function bind(list){
  const stamp=nextBuildingObservationFrame();nodes=[];safe=false;
  for(const node of list){
   const values=nodeKeys.map(key=>node[key]),geometryVersion=resourceVersion(node.geometry,stamp),materials=Array.isArray(node.material)?node.material:node.material?[node.material]:[];
   nodes.push({node,values,layers:node.layers.mask,geometryVersion,materials:materials.map(material=>({material,version:resourceVersion(material,stamp)}))});
  }
  safe=true;version++;
 }
 function poll(stamp=nextBuildingObservationFrame()){
  checks=0;if(!safe)return;
  for(const r of nodes){checks++;const n=r.node;
   const v=r.values;
   let changed=n.layers.mask!==r.layers||n.visible!==v[0]||n.geometry!==v[1]||n.material!==v[2]||
    n.castShadow!==v[3]||n.receiveShadow!==v[4]||n.renderOrder!==v[5]||n.frustumCulled!==v[6]||
    n.onBeforeRender!==v[7]||n.customDepthMaterial!==v[8]||n.customDistanceMaterial!==v[9]||n.matrixAutoUpdate!==v[10];
   if(!changed)changed=resourceVersion(n.geometry,stamp)!==r.geometryVersion;
   if(!changed)for(const m of r.materials)if(resourceVersion(m.material,stamp)!==m.version){changed=true;break;}
   if(changed){version++;return;}
  }
 }
 return {bind,poll,dispose(){nodes=[];safe=false;},get checks(){return checks;},get version(){return version;},get safe(){return safe;}};
}
