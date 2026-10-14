import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.resolve(fileURLToPath(new URL('../',import.meta.url)));
const output=path.join(root,'sfx');
const sampleRate=32000;
fs.mkdirSync(output,{recursive:true});

function render(name,duration,seed,shape){
    const count=Math.round(duration*sampleRate);
    const samples=new Float32Array(count);
    let randomState=seed,low=0,slow=0,phase=0,phase2=0;
    const noise=()=>{
        randomState^=randomState<<13;randomState^=randomState>>>17;randomState^=randomState<<5;
        return (randomState>>>0)/2147483648-1;
    };
    const band=(input,cutoff,lowCutoff=180)=>{
        low+=(input-low)*(1-Math.exp(-2*Math.PI*cutoff/sampleRate));
        slow+=(input-slow)*(1-Math.exp(-2*Math.PI*lowCutoff/sampleRate));
        return low-slow;
    };
    for(let i=0;i<count;i++){
        const t=i/sampleRate,progress=t/duration;
        const fade=Math.min(1,t/.025,(duration-t)/.035);
        let value=0;
        if(name==='fireball'){
            const sweep=740*Math.pow(150/740,progress);
            phase+=2*Math.PI*sweep/sampleRate;
            phase2+=2*Math.PI*(sweep*.51)/sampleRate;
            const rush=band(noise(),2600*Math.pow(460/2600,progress));
            const body=Math.sin(phase)*.31+Math.sin(phase2)*.15;
            value=(rush*.50+body)*Math.pow(1-progress,1.25);
        }else if(name==='magic'){
            phase+=2*Math.PI*(520+310*progress)/sampleRate;
            phase2+=2*Math.PI*(785+390*progress)/sampleRate;
            const shimmer=band(noise(),3600,1400)*.11;
            value=(Math.sin(phase)*.38+Math.sin(phase2)*.25+shimmer)*Math.pow(1-progress,1.6);
        }else if(name==='explosion'){
            phase+=2*Math.PI*(240*Math.pow(95/240,progress))/sampleRate;
            const blast=band(noise(),1700*Math.pow(350/1700,progress),100);
            value=(blast*.68+Math.sin(phase)*.24)*Math.pow(1-progress,1.7);
        }else if(name==='rumble'){
            phase+=2*Math.PI*(220-55*progress)/sampleRate;
            const grit=band(noise(),650,80);
            value=(grit*.48+Math.sin(phase)*.31)*Math.pow(1-progress,1.35);
        }else if(name==='attack'){
            phase+=2*Math.PI*(430-180*progress)/sampleRate;
            value=(band(noise(),2600,300)*.55+Math.sin(phase)*.26)*Math.pow(1-progress,2.5);
        }else if(name==='construct'){
            const tap=(offset)=>{
                const age=t-offset;
                return age<0||age>.16?0:Math.min(1,age/.008)*Math.pow(1-age/.16,2);
            };
            phase+=2*Math.PI*310/sampleRate;
            value=(band(noise(),1900,250)*.42+Math.sin(phase)*.2)*(tap(0)+tap(.2));
        }
        samples[i]=value*Math.max(0,fade);
    }
    let peak=0;
    for(const sample of samples)peak=Math.max(peak,Math.abs(sample));
    const gain=peak?0.78/peak:0;
    const pcm=Buffer.alloc(44+count*2);
    pcm.write('RIFF',0);pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);
    pcm.writeUInt32LE(16,16);pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);
    pcm.writeUInt32LE(sampleRate,24);pcm.writeUInt32LE(sampleRate*2,28);
    pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);
    pcm.write('data',36);pcm.writeUInt32LE(count*2,40);
    for(let i=0;i<count;i++)pcm.writeInt16LE(Math.round(Math.max(-1,Math.min(1,samples[i]*gain))*32767),44+i*2);
    fs.writeFileSync(path.join(output,`${name}.wav`),pcm);
}

for(const [name,duration,seed] of [
    ['fireball',.78,0x9e3779b9],['magic',.9,0x243f6a88],['explosion',.88,0xb7e15162],
    ['rumble',.95,0x4cf5ad43],['attack',.28,0x1c69b3f7],['construct',.46,0x97de2f5a]
])render(name,duration,seed);
