import fs from 'node:fs/promises';
const base = new URL('../vendor/', import.meta.url);
await fs.mkdir(base,{recursive:true});
const files = [
 ['three.module.js','https://unpkg.com/three@0.128.0/build/three.module.js'],
 ['THREE-LICENSE.txt','https://unpkg.com/three@0.128.0/LICENSE'],
 ['KTX2Loader.js','https://unpkg.com/three@0.128.0/examples/jsm/loaders/KTX2Loader.js'],
 ['BasisTextureLoader.js','https://unpkg.com/three@0.128.0/examples/jsm/loaders/BasisTextureLoader.js'],
 ['libs/ktx-parse.module.js','https://unpkg.com/three@0.128.0/examples/jsm/libs/ktx-parse.module.js'],
 ['KTX-PARSE-LICENSE.txt','https://unpkg.com/ktx-parse@0.2.1/LICENSE'],
 ['libs/zstddec.module.js','https://unpkg.com/three@0.128.0/examples/jsm/libs/zstddec.module.js'],
 ['ZSTD-LICENSE.txt','https://raw.githubusercontent.com/donmccurdy/zstddec/main/LICENSE'],
 ['basis/basis_transcoder.js','https://unpkg.com/three@0.128.0/examples/js/libs/basis/basis_transcoder.js'],
 ['basis/basis_transcoder.wasm','https://unpkg.com/three@0.128.0/examples/js/libs/basis/basis_transcoder.wasm'],
 ['BASIS-LICENSE.txt','https://raw.githubusercontent.com/BinomialLLC/basis_universal/master/LICENSE'],
 ['simplex-noise.min.js','https://cdnjs.cloudflare.com/ajax/libs/simplex-noise/2.4.0/simplex-noise.min.js'],
 ['SIMPLEX-LICENSE.txt','https://unpkg.com/simplex-noise@2.4.0/LICENSE'],
 ['peerjs.min.js','https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'],
 ['PEERJS-LICENSE.txt','https://unpkg.com/peerjs@1.5.2/LICENSE'],
 ['PEERJS-JS-BINARYPACK-LICENSE.txt','https://unpkg.com/peerjs-js-binarypack@2.1.0/LICENSE'],
 ['WEBRTC-ADAPTER-LICENSE.txt','https://unpkg.com/webrtc-adapter@8.2.3/LICENSE.md'],
 ['SDP-LICENSE.txt','https://unpkg.com/sdp@3.2.0/LICENSE'],
 ['EVENTEMITTER3-LICENSE.txt','https://unpkg.com/eventemitter3@4.0.7/LICENSE'],
 ['rapier.es.js','https://unpkg.com/@dimforge/rapier3d-compat@0.11.2/rapier.es.js'],
 ['RAPIER-LICENSE.txt','https://unpkg.com/@dimforge/rapier3d-compat@0.11.2/LICENSE']
];
for(const [name,url] of files){
 const response = await fetch(url);
 if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
 const target=new URL(name,base);
 await fs.mkdir(new URL('./',target),{recursive:true});
 let contents=new Uint8Array(await response.arrayBuffer());
 if(name==='KTX2Loader.js')contents=new TextEncoder().encode(new TextDecoder().decode(contents)
     .replace("from 'three'","from './three.module.js'")
     .replace("from '../libs/ktx-parse.module.js'","from './libs/ktx-parse.module.js'")
     .replace("from '../libs/zstddec.module.js'","from './libs/zstddec.module.js'"));
 if(name==='BasisTextureLoader.js')contents=new TextEncoder().encode(new TextDecoder().decode(contents)
     .replace("from 'three'","from './three.module.js'"));
 await fs.writeFile(target,contents);
 console.log(name);
}
