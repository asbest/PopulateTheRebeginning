import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

const sfx=path.resolve(import.meta.dirname,'../sfx');
const durations={
    attack:.28,construct:.46,fireball:.92,explosion:1.12,magic:.86,rumble:1.05,
    lightning:1.36,raise:1.16,lower:1.18,flatten:1.1,landbridge:1.55,
    swamp:1.16,invisibility:.92,shield:.9,hypnotise:1.25,swarm:1.12,
    tornado:1.38,firestorm:1.47,volcano:1.64,heal:1.08,teleport:1.18,
    create:1.08,phantom:1.16,bunny_nibble:.72,bird_call:.84,
    hurt:.36,hurt_heavy:.49,
    swamp_loop:2.72,swarm_loop:2.44,
    tornado_loop:3.12,firestorm_loop:2.76,volcano_loop:2.92
};
const signature=new Set();
for(const [name,duration] of Object.entries(durations)){
    const bytes=await fs.readFile(path.join(sfx,`${name}.wav`));
    assert.equal(bytes.toString('ascii',0,4),'RIFF',`${name} RIFF`);
    assert.equal(bytes.toString('ascii',8,12),'WAVE',`${name} WAVE`);
    assert.equal(bytes.readUInt16LE(20),1,`${name} PCM`);
    assert.equal(bytes.readUInt16LE(22),1,`${name} mono`);
    assert.equal(bytes.readUInt32LE(24),32000,`${name} sample rate`);
    assert.equal(bytes.readUInt16LE(34),16,`${name} sample depth`);
    assert.equal(bytes.readUInt32LE(40),bytes.length-44,`${name} data length`);
    assert.ok(Math.abs((bytes.length-44)/64000-duration)<.001,`${name} duration`);
    let energy=0,peak=0;
    const sample=i=>bytes.readInt16LE(44+i*2)/32768;
    const count=(bytes.length-44)/2;
    for(let i=0;i<count;i++){
        const value=sample(i);energy+=value*value;peak=Math.max(peak,Math.abs(value));
    }
    const rms=Math.sqrt(energy/count);
    assert.ok(rms>.015&&peak>.3&&peak<.9,`${name} audible without clipping: ${rms}, ${peak}`);
    if(name.endsWith('_loop')){
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
console.log(`PASS ${Object.keys(durations).length} distinct, audible game sounds with matching durations and seamless sustained beds`);
