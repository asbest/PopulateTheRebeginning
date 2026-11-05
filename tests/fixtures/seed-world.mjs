// Reproduce a complete scenario: terrain uses Web Crypto, while AI and effects
// use Math.random. Keep their streams independent so drawing a cosmetic random
// number cannot select another landscape. Only the terrain's uint32 draw is
// intercepted; UUIDs and other cryptographic consumers retain the native API.
export async function seedWorld(page,seed) {
    await page.addInitScript(seed=>{
        const terrainSeed=seed>>>0;
        const requestFrame=requestAnimationFrame.bind(window),cancelFrame=cancelAnimationFrame.bind(window),pending=new Set();
        window.requestAnimationFrame=callback=>{
            const id=requestFrame(time=>{pending.delete(id);callback.call(window,time);});pending.add(id);return id;
        };
        window.stopTestPresentation=()=>{
            for(const id of pending)cancelFrame(id);
            pending.clear();window.requestAnimationFrame=()=>0;
        };
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

// Numerical simulations own every timestep. Stop the real-time presentation
// loop and restart the random stream after asynchronous startup has finished.
export async function startManualSimulation(page,seed) {
    await page.evaluate(seed=>{
        state.isPaused=true;stopTestPresentation();
        // Startup streams chunks over render frames. Finish the entire fixed
        // view here so CI and desktop simulations have identical tree obstacles
        // and colliders, regardless of shader compilation/load duration.
        const passes=(CONFIG.TERRAIN.RENDER_DISTANCE*2+1)**2+1;
        for(let i=0;i<passes;i++)gameTestAPI.updateChunks();
        state.clock.elapsedTime=0;
        Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
        state.heightCache.clear();
        for(const u of state.units){
            u.animTime=0;u.updateTicker=0;u.nextTargetCheck=0;
            u.stuckThreshold=CONFIG.ANIMATION.STUCK_THRESHOLD_BASE+.5;
        }
    },seed);
}
