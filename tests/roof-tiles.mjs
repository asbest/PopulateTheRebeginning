import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {BARRACKS_ROOF as roof,fitBarracksTiles} from '../art/roof-profile.js';
import {MODEL_FILES} from '../art/startup-manifest.js';
const pack=JSON.parse(await fs.readFile(new URL('../art/blender/mesh-pack.json',import.meta.url)));
const startup=JSON.parse(await fs.readFile(new URL('../'+MODEL_FILES.warrior,import.meta.url)));
for(const [name,models] of [['full',pack.models],['startup',startup.models]]){
 const source=models['building/warrior/root'].thatch;
 const fitted=fitBarracksTiles(source),s=Math.sin(roof.angle),c=Math.cos(roof.angle);
 const rows=new Map();
 for(let i=0;i<source.position.length;i+=3){
  const side=Math.sign(source.position[i+2]);
  const row=Math.round((2.6-source.position[i+1])/.125);
  const key=side+':'+row;
  const x=fitted.position[i],y=fitted.position[i+1],z=fitted.position[i+2];
  const gap=(y-roof.y)*c+(z-side*roof.z)*side*s-roof.thickness/2;
  const along=-(y-roof.y)*side*s+(z-side*roof.z)*c;
  assert.ok(Math.abs(x)<=roof.width/2&&Math.abs(along)<=roof.depth/2,'Tile extends past its roof support');
  const bounds=rows.get(key)||{min:Infinity,max:-Infinity};
  bounds.min=Math.min(bounds.min,gap);bounds.max=Math.max(bounds.max,gap);rows.set(key,bounds);
  assert.ok(Math.abs(Math.hypot(...fitted.normal.slice(i,i+3))-1)<.001,'Tile normal is not normalized');
 }
 assert.equal(rows.size,14);
 for(const row of rows.values()){
  assert.ok(Math.abs(row.min+.003)<.0001,'Tile underside does not touch roof');
  assert.ok(Math.abs(row.max-.057)<.0001,'Tile thickness is incorrect');
 }
 assert.equal(fitted.index,source.index,'Tile correction duplicates geometry');
 console.log(`PASS ${name}: all 14 tile rows rest on their sloping roof plates`);
}
