import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';

export const state = {
    scene: null,
    camera: null,
    renderer: null,
    raycaster: null,
    orthoCamera: null,
    perspectiveCamera: null,
    isFPV: false,
    fpvYaw: 0,
    fpvPitch: 0,
    clock: null,
    simplex: null,

    // Game State
    chunks: {},
    terrainMods: new Map(),
    units: [],

    particles: [],
    projectiles: [],
    buildings: [],
    activeEffects: [],

    shaman: null,
    rangeRing: null,
    selectedUnits: [],
    cameraLookAt: null,
    viewScale: 35,
    currentAction: 'select',
    mana: 100,

    isDragging: false,
    dragStart: { x: 0, y: 0 },
    tapStart: { x: 0, y: 0 },
    dragButton: 0,
    pinchStartDist: 0,
    pinchStartScale: 35,
    pinchStartAngle: 0,
    rotateStartCamera: 0,
    cameraRotation: Math.PI / 4,
    multiSelectMode: false,
    joystickVector: new THREE.Vector2(0, 0),
    keyboardVector: new THREE.Vector2(0, 0),
    isPaused: false,

    // Cheats
    cheatUnlimitedRange: false,
    isGodMode: false
};

// SpatialHash
export const SpatialHash = {
    cellSize: 20,
    cells: new Map(),
    update: function() {
        this.cells.clear();
        for(let i=0; i<state.units.length; i++) {
            const u = state.units[i];
            if(u.state !== 'dead') {
                const cx = Math.floor(u.mesh.position.x / this.cellSize);
                const cz = Math.floor(u.mesh.position.z / this.cellSize);
                const key = `${cx},${cz}`;
                if (!this.cells.has(key)) this.cells.set(key, []);
                this.cells.get(key).push(u);
            }
        }
    },
    query: function(x, z, radius) {
        const results = [];
        const cx = Math.floor(x / this.cellSize);
        const cz = Math.floor(z / this.cellSize);
        const r = Math.ceil(radius / this.cellSize);
        for(let i = cx - r; i <= cx + r; i++) {
            for(let j = cz - r; j <= cz + r; j++) {
                const key = `${i},${j}`;
                if (this.cells.has(key)) {
                    const cellUnits = this.cells.get(key);
                    for(let k=0; k<cellUnits.length; k++) {
                         results.push(cellUnits[k]);
                    }
                }
            }
        }
        return results;
    }
};

// Expose to window for compatibility and debug
window.chunks = state.chunks;
window.terrainMods = state.terrainMods;
window.units = state.units;
window.buildings = state.buildings;
window.activeEffects = state.activeEffects;
window.joystickVector = state.joystickVector;
window.keyboardVector = state.keyboardVector;
