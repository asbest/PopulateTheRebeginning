import { LANDSCAPES } from './landscape-profiles.js';

export function landscapeBlend(a,b,value) {
    const t=Math.max(0,Math.min(1,(value-a)/(b-a)));
    return t*t*(3-2*t);
}


// One continuous height field for rendering, physics and both Workers.
export function createTerrainHeight(env) {
const {state,CONFIG,WATER_LEVEL,NOISE_SCALE,HEIGHT_MULTIPLIER,BRIDGE_WIDTH,BRIDGE_HEIGHT}=env;

let orientationSeed=null,rotationCos=1,rotationSin=0;
function getBaseHeight(x, z) {
    if (!state.simplex) return 0;
    const profile=LANDSCAPES[state.matchSettings?.terrainProfile];
    if(profile) {
        // Rotate and stretch the continuous world field, never individual chunks.
        const seed=state.matchSettings.terrainSeed||0;
        if(seed!==orientationSeed){orientationSeed=seed;const angle=(seed%6283)*.001;rotationCos=Math.cos(angle);rotationSin=Math.sin(angle);}
        const px=x*rotationCos-z*rotationSin;
        z=(x*rotationSin+z*rotationCos)/profile.stretch;
        x=px*profile.stretch;
    }
    let y = 0;
    let ns = NOISE_SCALE;
    let hm = HEIGHT_MULTIPLIER;

    const TC = CONFIG.TERRAIN;
    const biome = (state.matchSettings && state.matchSettings.biome) ? state.matchSettings.biome : 'normal';
    if (biome === 'mountain') hm *= TC.BIOME_MOUNTAIN_HEIGHT_MULT;
    if (biome === 'void') hm *= TC.BIOME_VOID_HEIGHT_MULT;
    if (biome === 'jungle') ns *= TC.BIOME_JUNGLE_NOISE_MULT;

    if(profile){ns*=profile.scale;hm*=profile.height;}

    for (let o of TC.NOISE_OCTAVES) {
        // Preserve lowland detail while reducing small serrations on high ridges.
        const ridgeDetail=o.factor>=4 ? .76-.28*landscapeBlend(5,13,y*hm) : 1;
        y += state.simplex.noise2D(x * ns * o.factor, z * ns * o.factor) * o.amp * ridgeDetail;
    }

    y *= hm;

    if (profile||(biome!=='void'&&biome!=='celestial'&&biome!=='cosmic')) {
        // One slow field groups hills into mountain, plateau and archipelago
        // regions. All terms use world coordinates, so mesh and collider agree.
        const region=state.simplex.noise2D(x*.004+211,z*.004-173);
        const relief=state.simplex.noise2D(x*.011+47,z*.011-29);
        const land=Math.max(0,Math.min(1,(y-WATER_LEVEL+1.5)/4));
        const mountains=landscapeBlend(.16,.58,region)*(profile?.mountains??1);
        const archipelago=landscapeBlend(.18,.58,-region)*(profile?.islands??1);
        const plateau=landscapeBlend(.18,.55,relief)*(1-Math.min(1,mountains))*(profile?.terraces??1);
        y+=(Math.abs(relief)-.38)*(biome==='mountain'?2.0:1.25)*land;
        y+=mountains*(3.4+Math.abs(relief)*3.8)*(biome==='mountain'?1.4:1);
        y+=plateau*2.5*land;
        // Flatten only elevated ground; the feathered mask retains walkable
        // slopes around the rim instead of making an impassable vertical wall.
        const terrace=Math.min(1,plateau*land*.74*landscapeBlend(2,12,y));
        y+=(10-y)*terrace;
        y-=Math.max(0,-relief-.1)*3.2*(1-Math.min(1,mountains))*(profile?.valleys??1);
        y-=archipelago*3.2;
    }

    if (!profile && biome === 'celestial') {
        if (y < TC.CELESTIAL_PEAK_THRESHOLD) y -= TC.CELESTIAL_VOID_DROP;
    }

    const bridgeNoise = Math.abs(state.simplex.noise2D(x * NOISE_SCALE * TC.BRIDGE_NOISE_MULT + 100, z * NOISE_SCALE * TC.BRIDGE_NOISE_MULT + 100));
    // A rounded crest avoids the cusp at the zero contour of abs(noise).
    const finalBridgeHeight = (1-landscapeBlend(0,1,bridgeNoise*BRIDGE_WIDTH)) * BRIDGE_HEIGHT;
    y += finalBridgeHeight*(profile?.bridges??1);
    if(profile) {
        y+=profile.uplift;
        if(profile.channel) {
            const channel=Math.abs(state.simplex.noise2D(x*.006+317,z*.006-97));
            y-=profile.channel*(1-landscapeBlend(.035,.22,channel));
        }
    }

    if (y < WATER_LEVEL) y -= (WATER_LEVEL - y) * TC.WATER_SMOOTH_FACTOR;
    const aboveCap=Math.max(0,y-TC.LAND_HEIGHT_CAP);
    y+=aboveCap*TC.LAND_ABOVE_CAP_SLOPE*landscapeBlend(0,5,aboveCap);
    const summit=Math.max(0,y-13);
    y-=summit*.24*landscapeBlend(0,5,summit);
    return y;
}

function getTerrainMod(x, z) {
    if (state.terrainMods.size === 0) return 0;
    const x1 = Math.floor(x);
    const z1 = Math.floor(z);
    const x2 = x1 + 1;
    const z2 = z1 + 1;

    const fx = x - x1;
    const fz = z - z1;

    const v11 = state.terrainMods.get(`${x1},${z1}`) || 0;
    const v21 = state.terrainMods.get(`${x2},${z1}`) || 0;
    const v12 = state.terrainMods.get(`${x1},${z2}`) || 0;
    const v22 = state.terrainMods.get(`${x2},${z2}`) || 0;

    // Bilinear interpolation
    const i1 = v11 * (1 - fx) + v21 * fx;
    const i2 = v12 * (1 - fx) + v22 * fx;
    return i1 * (1 - fz) + i2 * fz;
}

function getHeight(x, z) {
    const qx = Math.round(x * 10);
    const qz = Math.round(z * 10);
    const cacheKey = (qx << 16) | (qz & 0xFFFF);
    if (state.heightCache.has(cacheKey)) return state.heightCache.get(cacheKey);
    let h = getBaseHeight(x, z);
    h += getTerrainMod(x, z);
    state.heightCache.set(cacheKey, h);
    if (state.heightCache.size > 20000) state.heightCache.clear();
    return h;
}
return {getBaseHeight,getTerrainMod,getHeight};
}
