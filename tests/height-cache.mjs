import assert from 'node:assert/strict';
import {createTerrainHeight} from '../art/terrain-height.js';
import {CAMPAIGN_LANDSCAPES} from '../art/landscape-profiles.js';

const TERRAIN={NOISE_OCTAVES:[{factor:1,amp:1},{factor:4,amp:.2}],
    BRIDGE_NOISE_MULT:.5,WATER_SMOOTH_FACTOR:.5,LAND_HEIGHT_CAP:15,LAND_ABOVE_CAP_SLOPE:.2};
function field(profile){
    return createTerrainHeight({state:{simplex:{noise2D:(x,z)=>Math.sin(x*.7+z*.3)},
        matchSettings:{terrainSeed:184711,terrainProfile:profile},heightCache:new Map(),
        terrainMods:new Map([['0,0',2],['1,0',1],['-1,-1',3]])},
        CONFIG:{TERRAIN},WATER_LEVEL:1.8,NOISE_SCALE:.02,HEIGHT_MULTIPLIER:12,BRIDGE_WIDTH:2,BRIDGE_HEIGHT:3});
}
for(const profile of [undefined,...CAMPAIGN_LANDSCAPES]){
    for(const [x,z] of [[0,0],[1.2,-4.7],[-6.4,12.3],[32,-16]]){
        const a=field(profile),b=field(profile);
        // Rendering, feet and navigation visit different points in the same
        // cache cell. Their order must not choose its authoritative height.
        a.getHeight(x+.011,z-.019);b.getHeight(x-.031,z+.027);
        assert.equal(a.getHeight(x,z),b.getHeight(x,z),`${profile}: cache depends on first visitor`);
        assert.equal(a.getHeight(x+.049,z-.049),b.getHeight(x-.049,z+.049));
        assert.equal(a.getHeight(x,z),a.getBaseHeight(x,z)+a.getTerrainMod(x,z));
    }
}
console.log('PASS order-independent terrain height cache for legacy terrain and all twelve landscape profiles');
