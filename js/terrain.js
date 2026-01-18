import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { state } from './state.js';
import { CHUNK_SIZE, CHUNK_RES, RENDER_DISTANCE, COLORS, WATER_LEVEL, VISUAL_WATER_LEVEL } from './constants.js';
import { getHeight, getBaseHeight } from './utils.js';
import { Particle } from './visuals.js';

let chunkTerrainMat, chunkWaterGeo, chunkWaterMat;

// Shared objects for performance
const _cWater = new THREE.Color(COLORS.water);
const _cSand = new THREE.Color(COLORS.sand);
const _cGrass = new THREE.Color(COLORS.grass);
const _cRock = new THREE.Color(COLORS.rock);
const _cSnow = new THREE.Color(COLORS.snow);
const _cLava = new THREE.Color(COLORS.lava);
const _col = new THREE.Color();

export function initTerrainResources() {
    chunkTerrainMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: false });
    chunkWaterGeo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES/2, CHUNK_RES/2);

    const waterVertexShader = `
        uniform float time;
        varying vec2 vUv;
        void main() {
            vUv = uv;
            vec4 worldPosition = modelMatrix * vec4(position, 1.0);
            vec3 pos = position;

            float height = 0.0;
            // Primary wave
            height += sin(worldPosition.x * 0.5 + time) * 0.15;
            height += sin(worldPosition.z * 0.4 + time) * 0.15;

            // Secondary detail wave
            height += sin(worldPosition.x * 1.5 + time * 1.5) * 0.05;
            height += sin(worldPosition.z * 1.2 + time * 1.3) * 0.05;

            pos.z += height;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
    `;
    const waterFragmentShader = `
        uniform vec3 color;
        varying vec2 vUv;
        void main() {
            gl_FragColor = vec4(color, 0.6);
        }
    `;
    chunkWaterMat = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(COLORS.water) }
        },
        vertexShader: waterVertexShader,
        fragmentShader: waterFragmentShader,
        transparent: true,
        side: THREE.DoubleSide
    });

    // Assign to state to update time in loop
    state.chunkWaterMat = chunkWaterMat;
}

export function burnTreesAt(x, z, radius) {
    Object.values(state.chunks).forEach(chunk => {
        if(chunk.userData && chunk.userData.trees) {
            chunk.userData.trees.forEach(tree => {
                if(tree.burned) return;
                const dist = Math.sqrt((tree.mesh.position.x - x)**2 + (tree.mesh.position.z - z)**2);
                if(dist < radius) {
                    tree.burned = true;
                    // Charred visual
                    const t = tree.mesh.children[0]; // Trunk
                    const l = tree.mesh.children[1]; // Leaves
                    t.material = t.material.clone();
                    t.material.color.setHex(0x111111); // Black trunk

                    l.material = l.material.clone();
                    l.material.color.setHex(0x222222); // Charred leaves
                    l.scale.set(0.8, 0.5, 0.8); // Shriveled

                    // Smoke
                    for(let i=0; i<3; i++) {
                        const p = new Particle(tree.mesh.position.clone().add(new THREE.Vector3(0, 2, 0)), 0x333333, 0.2, 2.0, -1);
                        state.particles.push(p);
                    }
                }
            });
        }
    });
}

export function modifyTerrain(centerX, centerZ, radius, amount) {
    const rSq = radius * radius;
    const modifiedChunks = new Set();
    for(let x = Math.floor(centerX - radius); x <= Math.ceil(centerX + radius); x++) {
        for(let z = Math.floor(centerZ - radius); z <= Math.ceil(centerZ + radius); z++) {
            const distSq = (x - centerX)**2 + (z - centerZ)**2;
            if (distSq <= rSq) {
                const falloff = 1 - (distSq / rSq);
                const key = `${x},${z}`;
                const currentMod = state.terrainMods.get(key) || 0;
                state.terrainMods.set(key, currentMod + (amount * falloff));
                const cx = Math.round(x / CHUNK_SIZE);
                const cz = Math.round(z / CHUNK_SIZE);
                modifiedChunks.add(`${cx},${cz}`);
            }
        }
    }

    // Check if buildings collapse
    state.buildings.forEach(b => {
        const groundH = getHeight(b.mesh.position.x, b.mesh.position.z);
        if(Math.abs(groundH - b.mesh.position.y) > 1.0) {
            b.takeDamage(100); // Collapse damage
        }
    });
    return modifiedChunks;
}

export function updateChunks(force = false, specificChunks = null) {
    if (!chunkTerrainMat) initTerrainResources();

    const cx = Math.round(state.cameraLookAt.x / CHUNK_SIZE);
    const cz = Math.round(state.cameraLookAt.z / CHUNK_SIZE);
    const activeKeys = new Set();
    let createdCount = 0;
    const MAX_CHUNKS_PER_FRAME = 2;

    for(let x = -RENDER_DISTANCE; x <= RENDER_DISTANCE; x++) {
        for(let z = -RENDER_DISTANCE; z <= RENDER_DISTANCE; z++) {
            const key = (cx+x) + "," + (cz+z);
            activeKeys.add(key);
            if(!state.chunks[key] || (force && (!specificChunks || specificChunks.has(key)))) {

                if(state.chunks[key] && force) {
                    // Reuse existing chunk geometry
                    if(state.chunks[key].children[0]) {
                        updateChunkGeometry(state.chunks[key].children[0], cx+x, cz+z);
                    }
                    updateChunkTrees(state.chunks[key], cx+x, cz+z);
                } else {
                    if (!state.chunks[key] && createdCount >= MAX_CHUNKS_PER_FRAME) continue;

                    if(state.chunks[key]) {
                        state.scene.remove(state.chunks[key]);
                        // Only dispose terrain geometry (child 0), water (child 1) is shared
                        if(state.chunks[key].children[0] && state.chunks[key].children[0].geometry) state.chunks[key].children[0].geometry.dispose();
                    }
                    state.chunks[key] = createChunk(cx+x, cz+z);
                    state.scene.add(state.chunks[key]);
                    createdCount++;
                }
            }
        }
    }
    if(!force) {
        for(let key in state.chunks) {
            if(!activeKeys.has(key)) {
                state.scene.remove(state.chunks[key]);
                // Only dispose terrain geometry
                if(state.chunks[key].children[0] && state.chunks[key].children[0].geometry) state.chunks[key].children[0].geometry.dispose();
                delete state.chunks[key];
            }
        }
    }
}

function updateChunkGeometry(mesh, cx, cz) {
    const geo = mesh.geometry;
    const pos = geo.attributes.position;
    const colAttr = geo.attributes.color;

    const offX = cx * CHUNK_SIZE;
    const offZ = cz * CHUNK_SIZE;

    // Use shared color objects
    const cWater = _cWater;
    const cSand = _cSand;
    const cGrass = _cGrass;
    const cRock = _cRock;
    const cSnow = _cSnow;
    const cLava = _cLava;
    const col = _col;

    for(let i=0; i<pos.count; i++) {
         const wx = pos.getX(i) + offX;
         const wz = pos.getZ(i) + offZ;
         let h = getHeight(wx, wz);
         pos.setY(i, h);

         if (h < WATER_LEVEL) col.copy(cSand);
         else if (h < WATER_LEVEL + 1.0) col.copy(cSand).lerp(cGrass, h - WATER_LEVEL);
         else if (h < 8.0) col.copy(cGrass);
         else if (h < 9.0) col.copy(cGrass).lerp(cRock, h - 8.0);
         else if (h < 13.0) col.copy(cRock);
         else if (h < 15.0) col.copy(cRock).lerp(cSnow, (h - 13.0) / 2.0);
         else if (h < 19.0) col.copy(cSnow);
         else if (h < 21.0) col.copy(cSnow).lerp(cLava, (h - 19.0) / 2.0);
         else col.copy(cLava);

         if(h > 2.5) col.offsetHSL(0, 0, (Math.random()-0.5)*0.03);

         colAttr.setXYZ(i, col.r, col.g, col.b);
    }

    pos.needsUpdate = true;
    colAttr.needsUpdate = true;
    geo.computeVertexNormals();
}

function updateChunkTrees(chunk, cx, cz) {
    if (!chunk.userData || !chunk.userData.trees) return;
    const trees = chunk.userData.trees;

    for (let i = trees.length - 1; i >= 0; i--) {
        const treeData = trees[i];
        const tMesh = treeData.mesh;
        const h = getHeight(tMesh.position.x, tMesh.position.z);
        tMesh.position.y = h;

        // Hide if underwater
        tMesh.visible = (h >= WATER_LEVEL);
    }
}

function createChunk(cx, cz) {
    const grp = new THREE.Group();
    const geo = new THREE.PlaneGeometry(CHUNK_SIZE, CHUNK_SIZE, CHUNK_RES, CHUNK_RES);
    geo.rotateX(-Math.PI/2);

    // Init colors buffer
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const offX = cx * CHUNK_SIZE; const offZ = cz * CHUNK_SIZE;
    const mesh = new THREE.Mesh(geo, chunkTerrainMat);
    mesh.position.set(offX, 0, offZ); mesh.receiveShadow = true;
    grp.add(mesh);

    // Fill data
    updateChunkGeometry(mesh, cx, cz);

    const wMesh = new THREE.Mesh(chunkWaterGeo, chunkWaterMat);
    wMesh.rotation.x = -Math.PI/2; wMesh.position.set(offX, VISUAL_WATER_LEVEL, offZ);
    grp.add(wMesh);

    grp.userData = { trees: [] };
    for(let k=0; k<3; k++) {
        if(Math.random() > 0.5) {
             const lx = (Math.random()-0.5)*CHUNK_SIZE; const lz = (Math.random()-0.5)*CHUNK_SIZE;
             const h = getHeight(lx+offX, lz+offZ);
             if(h > 3 && h < 8) {
                const treeGroup = new THREE.Group();
                treeGroup.position.set(lx+offX, h, lz+offZ);

                const t = new THREE.Mesh(new THREE.CylinderGeometry(0.15,0.25,1,5), new THREE.MeshLambertMaterial({color:0x8B4513}));
                t.position.y = 0.5; t.castShadow = true;

                const l = new THREE.Mesh(new THREE.ConeGeometry(0.9,2.8,5), new THREE.MeshLambertMaterial({color:0x006400}));
                l.position.y = 1.9; l.castShadow = true;

                treeGroup.add(t); treeGroup.add(l);
                grp.add(treeGroup);

                grp.userData.trees.push({
                    mesh: treeGroup,
                    burned: false
                });
             }
        }
    }
    return grp;
}
