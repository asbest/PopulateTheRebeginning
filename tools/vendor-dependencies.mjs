import fs from 'node:fs/promises';
const base = new URL('../vendor/', import.meta.url);
await fs.mkdir(base,{recursive:true});
const files = [
 ['three.module.js','https://unpkg.com/three@0.128.0/build/three.module.js'],
 ['THREE-LICENSE.txt','https://unpkg.com/three@0.128.0/LICENSE'],
 ['simplex-noise.min.js','https://cdnjs.cloudflare.com/ajax/libs/simplex-noise/2.4.0/simplex-noise.min.js'],
 ['SIMPLEX-LICENSE.txt','https://unpkg.com/simplex-noise@2.4.0/LICENSE'],
 ['peerjs.min.js','https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js'],
 ['PEERJS-LICENSE.txt','https://unpkg.com/peerjs@1.5.2/LICENSE'],
 ['rapier.es.js','https://unpkg.com/@dimforge/rapier3d-compat@0.11.2/rapier.es.js'],
 ['RAPIER-LICENSE.txt','https://unpkg.com/@dimforge/rapier3d-compat@0.11.2/LICENSE']
];
for(const [name,url] of files){
 const response = await fetch(url);
 if(!response.ok)throw new Error(`${name}: HTTP ${response.status}`);
 await fs.writeFile(new URL(name,base),new Uint8Array(await response.arrayBuffer()));
 console.log(name);
}
