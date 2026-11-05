import { createTerrainHeight, landscapeBlend } from './terrain-height.js';
// Original terrain maths shared by the main thread and the streaming Worker.
// Positions, normals, colours, water depth and foam retain the same precision.
export function createTerrainKernel(THREE,env) {
const {state,CONFIG,COLORS,CHUNK_SIZE,CHUNK_RES,WATER_LEVEL,VISUAL_WATER_LEVEL}=env;
const _cWater = new THREE.Color(COLORS.water);
const _cSand = new THREE.Color(COLORS.sand);
const _cGrass = new THREE.Color(COLORS.grass);
const _cRock = new THREE.Color(COLORS.rock);
const _cSnow = new THREE.Color(COLORS.snow);
const _cLava = new THREE.Color(COLORS.lava);
const _cPurple = new THREE.Color(0x800080);
const _cBlack = new THREE.Color(0x050505);
const _cGold = new THREE.Color(0xFFD700);
const _cCyan = new THREE.Color(0x00FFFF);
const _cDeepGreen = new THREE.Color(0x004400);
const _col = new THREE.Color();
const _cDryGrass = new THREE.Color(0xb7c67b);
const _cLushGrass = new THREE.Color(0x76b54c);
const _cWetSand = new THREE.Color(0xc6b88f);
const _grassTone = new THREE.Color();
const _shoreTone = new THREE.Color();
const _cRockLinear = _cRock.clone().convertSRGBToLinear();

function landscapeMoisture(x,z) {
    return .5+.5*state.simplex.noise2D(x*.014+71,z*.014-103);
}
function landscapeOpening(x,z) {
    return .5+.5*state.simplex.noise2D(x*.023-139,z*.023+57);
}
function landscapeForest(moisture,opening) {
    return moisture*.7+(1-opening)*.3;
}
const {getBaseHeight,getTerrainMod,getHeight}=createTerrainHeight(env);
function updateChunkWater(wMesh, cx, cz) {
    const geo = wMesh.geometry;
    const pos = geo.attributes.position;
    const foamAttr = geo.attributes.foam;
    const depthAttr = geo.attributes.depth;
    const offX = cx * CHUNK_SIZE;
    const offZ = cz * CHUNK_SIZE;

    for (let i = 0; i < pos.count; i++) {
        const wx = pos.getX(i) + offX;
        const wz = pos.getZ(i) + offZ;
        const h = getHeight(wx, wz);
        depthAttr.setX(i,Math.max(0,VISUAL_WATER_LEVEL-h));

        // A narrow, broken surf line leaves the shallow turquoise water visible.
        const d1 = Math.abs(h - VISUAL_WATER_LEVEL);
        const d2 = Math.abs(h - WATER_LEVEL);
        const dist = Math.min(d1, d2);

        let val = 0;
        if (dist < 1.2) {
            val = 1.0 - dist / 1.2;
            val = Math.pow(val, 0.9);
        }
        foamAttr.setX(i, val);
    }
    foamAttr.needsUpdate = true;
    depthAttr.needsUpdate = true;
}

function updateChunkGeometry(mesh, cx, cz) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const colAttr = geo.attributes.color;
    const patternAttr = geo.attributes.artTerrainPattern;

    const offX = cx * CHUNK_SIZE;
    const offZ = cz * CHUNK_SIZE;

    // Use shared color objects
    const cWater = _cWater;
    const cSand = _cSand;
    const cGrass = _cGrass;
    const cRock = _cRock;
    const cSnow = _cSnow;
    const cLava = _cLava;
    const cPurple = _cPurple;
    const cBlack = _cBlack;
    const cGold = _cGold;
    const cCyan = _cCyan;
    const cDeepGreen = _cDeepGreen;
    const col = _col;

    const biome = state.matchSettings.biome || 'normal';
    const organicBiome=!['void','celestial','cosmic'].includes(biome);
    const smoothBand=(value,lo,hi)=>{
        const t=Math.max(0,Math.min(1,(value-lo)/(hi-lo)));
        return t*t*(3-2*t);
    };

    for(let i=0; i<pos.count; i++) {
         const wx = pos.getX(i) + offX;
         const wz = pos.getZ(i) + offZ;
         let h = getHeight(wx, wz);
         pos.setY(i, h);
         // World-space noise bends material bands without changing terrain physics.
         // The same coordinates on neighboring chunks produce identical colors.
         const broadNoise=state.simplex.noise2D(wx*.065+37,wz*.065-19);
         const detailNoise=state.simplex.noise2D(wx*.23-73,wz*.23+11);
         const moisture=organicBiome?landscapeMoisture(wx,wz):.5;
         const grassTone=_grassTone.copy(_cDryGrass).lerp(cGrass,smoothBand(moisture,.18,.65))
             .lerp(_cLushGrass,smoothBand(moisture,.58,.95)*.68);
         const shoreTone=_shoreTone.copy(cSand).lerp(_cWetSand,smoothBand(moisture,.55,.95)*.45);
         const materialH=h+broadNoise*.72+detailNoise*.24;
         const macro=Math.max(0,Math.min(1,.5+broadNoise*.32+detailNoise*.08-(moisture-.5)*.22));
         const fine=Math.max(0,Math.min(1,.5+detailNoise*.5));
         patternAttr.setXYZW(i,Math.round(macro*255),Math.round(fine*255),128,organicBiome?255:0);

         if(state.matchSettings.liquid==='lava'&&h<VISUAL_WATER_LEVEL+2.5) {
             col.copy(cRock).multiplyScalar(.42).lerp(_cLava,(1-smoothBand(h,VISUAL_WATER_LEVEL,VISUAL_WATER_LEVEL+2.5))*.32);
             patternAttr.setW(i,0);
         } else if (biome === 'winter' || (state.matchSettings && state.matchSettings.winter)) {
             // Ice/Snow World colors
             if (h < WATER_LEVEL) col.copy(cSand).lerp(cSnow, 0.8); // Frosty sand
             else if (materialH < 8.0) col.copy(cSnow);
             else if (materialH < 9.0) col.copy(cSnow).lerp(cRock, smoothBand(materialH,8,9));
             else if (materialH < 13.0) col.copy(cRock);
             else if (materialH < 15.0) col.copy(cRock).lerp(cSnow, smoothBand(materialH,13,15));
             else if (materialH < 19.0) col.copy(cSnow);
             else if (materialH < 21.0) col.copy(cSnow).lerp(cRock, smoothBand(materialH,19,21));
             else col.copy(cRock); // No lava in winter
         } else if (biome === 'night') {
             if (h < WATER_LEVEL) col.copy(cSand).multiplyScalar(0.4);
             else if (materialH < WATER_LEVEL + 1.0) col.copy(shoreTone).lerp(grassTone, smoothBand(materialH,WATER_LEVEL,WATER_LEVEL+1.0)).multiplyScalar(0.4);
             else if (materialH < 8.0) col.copy(grassTone).multiplyScalar(0.4);
             else if (materialH < 9.0) col.copy(grassTone).lerp(cRock, smoothBand(materialH,8.0,9.0)).multiplyScalar(0.5);
             else col.copy(cRock).multiplyScalar(0.5);
         } else if (biome === 'mountain') {
             if (h < WATER_LEVEL) col.copy(cSand);
             else if (materialH < WATER_LEVEL + 1.0) col.copy(cSand).lerp(cRock, smoothBand(materialH,WATER_LEVEL,WATER_LEVEL+1.0));
             else if (materialH < 8.0) col.copy(cRock);
             else if (materialH < 15.0) col.copy(cRock).lerp(cSnow, smoothBand(materialH,8,15));
             else col.copy(cSnow);
         } else if (biome === 'jungle') {
             if (h < WATER_LEVEL) col.copy(cSand).lerp(cDeepGreen, 0.5);
             else if (materialH < WATER_LEVEL + 2.0) col.copy(cDeepGreen);
             else col.copy(cDeepGreen).lerp(cRock, smoothBand(materialH,WATER_LEVEL+2,WATER_LEVEL+12));
         } else if (biome === 'storm') {
             if (h < WATER_LEVEL) col.copy(cSand).lerp(cRock, 0.4);
             else col.copy(grassTone).lerp(cRock, 0.6);
         } else if (biome === 'void') {
             if (h < WATER_LEVEL) col.copy(cBlack);
             else col.copy(cPurple).lerp(cBlack, Math.min(1, (h - WATER_LEVEL) / 12));
         } else if (biome === 'celestial') {
             if (h < WATER_LEVEL) col.copy(cGold).multiplyScalar(0.7);
             else col.copy(cSnow).lerp(cGold, Math.min(1, h / 15));
         } else if (biome === 'cosmic') {
             if (h < WATER_LEVEL) col.copy(cBlack);
             else col.copy(cBlack).lerp(cCyan, Math.min(1, (h - WATER_LEVEL) / 20));
         } else {
             if (h < WATER_LEVEL) col.copy(shoreTone);
             else if (materialH < WATER_LEVEL + 1.3) col.copy(shoreTone).lerp(grassTone, smoothBand(materialH,WATER_LEVEL,WATER_LEVEL+1.3));
             else if (materialH < 11) col.copy(grassTone);
             else if (materialH < 19) col.copy(grassTone).lerp(cRock, smoothBand(materialH,11,19));
             else if (materialH < 36) col.copy(cRock);
             else if (materialH < 42) col.copy(cRock).lerp(cSnow, smoothBand(materialH,36,42));
             else col.copy(cSnow);
         }

         if(h > WATER_LEVEL && organicBiome) {
             const mottling=state.simplex.noise2D(wx*.47+13,wz*.47-31);
             col.offsetHSL(0,0,broadNoise*.025+detailNoise*.012+mottling*.006);
         }
         col.convertSRGBToLinear();

         colAttr.setXYZ(i, col.r, col.g, col.b);
    }

    pos.needsUpdate = true;
    colAttr.needsUpdate = true;
    // Derive normals from the continuous heightfield, including samples just
    // outside chunk borders. Adjacent chunks now share the same edge lighting.
    const normal=geo.attributes.normal,step=CHUNK_SIZE/CHUNK_RES,stride=CHUNK_RES+1;
    for(let z=0;z<=CHUNK_RES;z++)for(let x=0;x<=CHUNK_RES;x++){
        const i=z*stride+x,wx=pos.getX(i)+offX,wz=pos.getZ(i)+offZ,h=pos.getY(i);
        const left=x?pos.getY(i-1):getHeight(wx-step,wz);
        const right=x<CHUNK_RES?pos.getY(i+1):getHeight(wx+step,wz);
        const near=z?pos.getY(i-stride):getHeight(wx,wz-step);
        const far=z<CHUNK_RES?pos.getY(i+stride):getHeight(wx,wz+step);
        const nx=left-right,ny=2*step,nz=near-far,len=Math.hypot(nx,ny,nz)||1;
        const normalY=ny/len;
        normal.setXYZ(i,nx/len,normalY,nz/len);
        if(organicBiome&&h>WATER_LEVEL+.7){
            const exposed=smoothBand(1-normalY,.1,.38)*smoothBand(h,WATER_LEVEL+.7,WATER_LEVEL+3)*.48;
            if(exposed>.001)colAttr.setXYZ(i,
                colAttr.getX(i)*(1-exposed)+_cRockLinear.r*exposed,
                colAttr.getY(i)*(1-exposed)+_cRockLinear.g*exposed,
                colAttr.getZ(i)*(1-exposed)+_cRockLinear.b*exposed);
        }
        const cavity=Math.max(0,Math.min(1,.5+((left+right+near+far)*.25-h)*.42));
        patternAttr.setW(i,Math.round(cavity*255));
    }
    normal.needsUpdate = true;
    patternAttr.needsUpdate = true;
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
}

return {landscapeMoisture,landscapeOpening,landscapeForest,landscapeBlend,
 getBaseHeight,getTerrainMod,getHeight,updateChunkGeometry,updateChunkWater};
}
