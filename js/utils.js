import { state } from './state.js';
import { NOISE_SCALE, WATER_LEVEL } from './constants.js';

export function mulberry32(a) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

export function getBaseHeight(x, z) {
    if (!state.simplex) return 0;
    let y = 0;
    y += state.simplex.noise2D(x * NOISE_SCALE, z * NOISE_SCALE) * 12;
    y += state.simplex.noise2D(x * NOISE_SCALE * 2, z * NOISE_SCALE * 2) * 4;
    y += state.simplex.noise2D(x * NOISE_SCALE * 4, z * NOISE_SCALE * 4) * 1.5;

    // Continuous smoothing
    if (y < WATER_LEVEL) y -= (WATER_LEVEL - y) * 0.2;
    if (y > 8.0) y += (y - 8.0) * 0.5;
    return y;
}

export function getTerrainMod(x, z) {
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

export function getHeight(x, z) {
    let h = getBaseHeight(x, z);
    h += getTerrainMod(x, z);
    return h;
}

export function isBlocked(x, z) {
    for(let b of state.buildings) {
        if(!b.dead && !b.underConstruction) {
             const dx = x - b.mesh.position.x;
             const dz = z - b.mesh.position.z;
             if (dx*dx + dz*dz < 4.0) return true; // Radius 2.0 squared
        }
    }
    return false;
}

export function isBraveNearby(faction, x, z, radius) {
    for(let u of state.units) {
        if(u.faction === faction && u.type === 'wild' && u.state !== 'dead') {
            const dist = Math.sqrt((u.mesh.position.x - x)**2 + (u.mesh.position.z - z)**2);
            if(dist <= radius) return true;
        }
    }
    return false;
}

export function findNearestLand(x, z, maxRadius = 20) {
    if(getHeight(x, z) >= WATER_LEVEL) return {x, z};

    // Spiral search
    for(let r = 2; r <= maxRadius; r += 2) {
        const steps = Math.floor(2 * Math.PI * r / 2); // roughly 2 unit spacing
        for(let i = 0; i < steps; i++) {
            const angle = (i / steps) * Math.PI * 2;
            const nx = x + Math.cos(angle) * r;
            const nz = z + Math.sin(angle) * r;
            if(getHeight(nx, nz) >= WATER_LEVEL) return {x: nx, z: nz};
        }
    }
    return {x, z}; // Fallback
}
