import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
import {NodeBasisEncoder} from 'ktx2-encoder';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const directories=['art/blender','art/materials'];
const extras=['art/character-cloth.png','art/character-skin-v2.png'];
const match=process.argv.find(arg=>arg.startsWith('--match='))?.slice(8);
const encoder=new NodeBasisEncoder();
const sources=[...extras];
for(const directory of directories){
    for(const entry of await fs.readdir(path.join(root,directory))){
        if(/\.(png|webp)$/i.test(entry))sources.push(`${directory}/${entry}`);
    }
}
let originalBytes=0,compressedBytes=0;
for(const source of sources.sort()){
    if(match&&!source.includes(match))continue;
    const input=path.join(root,source);
    const output=input.replace(/\.(png|webp)$/i,'.ktx2');
    const bytes=await fs.readFile(input);
    const normal=/-normal\.png$/i.test(source);
    const linear=normal||/-roughness\.png$/i.test(source);
    const highFidelity=normal||/-photo\.webp$/i.test(source);
    const result=await encoder.encode(new Uint8Array(bytes),{
        isUASTC:highFidelity,
        needSupercompression:highFidelity,
        uastcLDRQualityLevel:2,
        qualityLevel:255,
        compressionLevel:2,
        isNormalMap:normal,
        isPerceptual:!linear,
        isSetKTX2SRGBTransferFunc:!linear,
        generateMipmap:true,
        imageDecoder:async inputBytes=>{
            const image=sharp(inputBytes);
            const info=await image.metadata();
            const width=Math.ceil(info.width/4)*4;
            const height=Math.ceil(info.height/4)*4;
            const {data,info:decoded}=await image.resize(width,height,{kernel:'lanczos3'}).ensureAlpha()
                .raw().toBuffer({resolveWithObject:true});
            return {data:new Uint8Array(data),width:decoded.width,height:decoded.height};
        }
    });
    if(Buffer.from(result).subarray(0,12).toString('hex')!=='ab4b5458203230bb0d0a1a0a')
        throw new Error(`Invalid KTX2 header: ${source}`);
    await fs.writeFile(output,result);
    originalBytes+=bytes.length;compressedBytes+=result.length;
    console.log(`${source} ${Math.round(bytes.length/1024)} KiB -> ${Math.round(result.length/1024)} KiB`);
}
console.log(`KTX2: ${Math.round(originalBytes/1024/1024)} MiB source -> ${Math.round(compressedBytes/1024/1024)} MiB compressed`);
