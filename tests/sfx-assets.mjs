import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const sfx=path.resolve(import.meta.dirname,'../sfx');
const files=(await fs.readdir(sfx)).filter(file=>file.endsWith('.wav')).sort();
assert.ok(files.length>0,'No sound effects found');
const signature=new Set();
for(const file of files){
    const name=path.basename(file,'.wav');
    const bytes=await fs.readFile(path.join(sfx,file));
    assert.equal(bytes.toString('ascii',0,4),'RIFF',`${name} RIFF`);
    assert.equal(bytes.toString('ascii',8,12),'WAVE',`${name} WAVE`);
    assert.equal(bytes.readUInt16LE(20),1,`${name} PCM`);
    assert.equal(bytes.readUInt16LE(22),1,`${name} mono`);
    assert.equal(bytes.readUInt32LE(24),32000,`${name} sample rate`);
    assert.equal(bytes.readUInt16LE(34),16,`${name} sample depth`);
    assert.equal(bytes.readUInt32LE(40),bytes.length-44,`${name} data length`);
    const loop=name.endsWith('_loop');
    const duration=(bytes.length-44)/64000;
    // Bound the asset budget without tying the test to a specific recording.
    const [minDuration,maxDuration]=loop?[2,3.5]:[.2,1.75];
    assert.ok(duration>=minDuration&&duration<=maxDuration,`${name} duration: ${duration}s`);
    let energy=0,peak=0;
    const sample=i=>bytes.readInt16LE(44+i*2)/32768;
    const count=(bytes.length-44)/2;
    for(let i=0;i<count;i++){
        const value=sample(i);energy+=value*value;peak=Math.max(peak,Math.abs(value));
    }
    const rms=Math.sqrt(energy/count);
    assert.ok(rms>.015&&peak>.3&&peak<.9,`${name} audible without clipping: ${rms}, ${peak}`);
    if(loop){
        const seam=Math.abs(sample(0)-sample(count-1));
        assert.ok(seam<.06,`${name} clicks at its loop seam: ${seam}`);
        for(const [start,end] of [[0,.35],[duration-.35,duration]]){
            let sectionEnergy=0;
            for(let i=Math.floor(start*32000);i<Math.floor(end*32000);i++)sectionEnergy+=sample(i)**2;
            assert.ok(Math.sqrt(sectionEnergy/Math.floor((end-start)*32000))>.01,`${name} loop fades out`);
        }
    }
    const fingerprint=bytes.subarray(44,Math.min(bytes.length,64044)).toString('base64');
    assert.ok(!signature.has(fingerprint),`${name} duplicates another sound`);
    signature.add(fingerprint);
}
console.log(`PASS ${files.length} distinct, audible game sounds with bounded durations and seamless sustained beds`);
