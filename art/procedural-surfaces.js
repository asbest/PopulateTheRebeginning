// Small repeatable surfaces generated once, including neutral normal/roughness maps.
export function createProceduralSurfaces(T){
    const cache=new Map();
    const palette={grass:[111,144,67],foliage:[143,166,93],sand:[231,214,171],cliff:[177,168,147],
        stone:[184,179,160],wood:[179,145,99],thatch:[204,181,122],dirt:[155,128,91],mud:[112,97,76],
        gravel:[164,153,130],moss:[124,147,82],bronze:[213,192,149],dark:[132,140,143],
        leather:[183,155,118],fur:[207,197,177],feather:[215,213,197],skin:[244,230,213],cloth:[239,233,213],ember:[247,173,92]};
    return function surface(url){
        const name=url.split('/').at(-1).toLowerCase();
        const kind=Object.keys(palette).find(key=>name.includes(key))||'cloth';
        const normal=name.includes('normal'),rough=name.includes('roughness');
        const key=kind+'/'+(normal?'normal':rough?'rough':'color');
        if(cache.has(key))return cache.get(key);
        const size=64,canvas=document.createElement('canvas');canvas.width=canvas.height=size;
        const context=canvas.getContext('2d'),pixels=context.createImageData(size,size);
        let seed=947;
        for(let y=0;y<size;y++)for(let x=0;x<size;x++){
            seed=(Math.imul(seed,1664525)+1013904223)>>>0;
            const noise=(seed/4294967296-.5)*12;
            let grain=noise;
            if(kind==='wood')grain+=Math.sin(x*.8+Math.sin(y*.098)*1.2)*13;
            if(kind==='cloth'||kind==='thatch')grain+=(x%4===0||y%4===0)?-13:3;
            if(kind==='stone')grain+=(y%16===0||(x+(Math.floor(y/16)%2)*16)%32===0)?-22:0;
            const index=(y*size+x)*4;
            for(let channel=0;channel<3;channel++)
                pixels.data[index+channel]=normal?[128,128,255][channel]:rough?205:palette[kind][channel]+grain;
            pixels.data[index+3]=255;
        }
        context.putImageData(pixels,0,0);
        const texture=new T.CanvasTexture(canvas);texture.userData={procedural:true};
        texture.wrapS=texture.wrapT=T.RepeatWrapping;
        cache.set(key,texture);return texture;
    };
}
