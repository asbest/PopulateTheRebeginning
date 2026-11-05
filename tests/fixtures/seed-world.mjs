// Reproduce a complete scenario: terrain uses Web Crypto, while AI and effects
// use Math.random. Keep their streams independent so drawing a cosmetic random
// number cannot select another landscape. Only the terrain's uint32 draw is
// intercepted; UUIDs and other cryptographic consumers retain the native API.
export async function seedWorld(page,seed) {
    await page.addInitScript(seed=>{
        const terrainSeed=seed>>>0;
        const randomValues=crypto.getRandomValues.bind(crypto);
        crypto.getRandomValues=array=>{
            if(array instanceof Uint32Array&&array.length===1){array[0]=terrainSeed;return array;}
            return randomValues(array);
        };
        Math.random=()=>{
            seed=(Math.imul(seed,1664525)+1013904223)>>>0;
            return seed/4294967296;
        };
    },seed);
}
