import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { state } from './state.js';
import { COLORS, BUILDING_COSTS, WATER_LEVEL, CHUNK_SIZE } from './constants.js';
import { getHeight, getBaseHeight, findNearestLand } from './utils.js';
import { updateChunks } from './terrain.js';
import { Humanoid } from './humanoid.js';
import { spawnPulse, spawnExplosion } from './visuals.js';
import { SoundManager } from './audio.js';

export function createBuilding(type, x, z, faction = 0, autoUpdate = true, isLoading = false) {
    if(!isLoading && getHeight(x, z) < WATER_LEVEL) return null;

    if(!isLoading) SoundManager.playSound('construct');
    const baseH = getHeight(x, z);
    const radius = 3;

    // Auto-Leveling
    if(!isLoading) {
        const modifiedChunks = new Set();
        for(let ix = Math.floor(x - radius); ix <= Math.ceil(x + radius); ix++) {
            for(let iz = Math.floor(z - radius); iz <= Math.ceil(z + radius); iz++) {
                const dist = Math.sqrt((ix-x)**2 + (iz-z)**2);
                if(dist <= radius) {
                    const key = `${ix},${iz}`;
                    const naturalH = getBaseHeight(ix, iz);
                    const targetMod = baseH - naturalH;
                    state.terrainMods.set(key, targetMod);
                    const cx = Math.round(ix / CHUNK_SIZE);
                    const cz = Math.round(iz / CHUNK_SIZE);
                    modifiedChunks.add(`${cx},${cz}`);
                }
            }
        }
        if(autoUpdate) updateChunks(true, modifiedChunks);
    }

    const group = new THREE.Group();
    group.position.set(x, baseH, z);

    let mesh, maxHp;
    if (type === 'hut') { mesh = buildHut(); maxHp = 100; }
    else if (type === 'tower') { mesh = buildTower(); maxHp = 150; }
    else if (type === 'warrior') { mesh = buildBarracks(); maxHp = 250; }
    else if (type === 'fire') { mesh = buildFireTemple(); maxHp = 300; }
    else if (type === 'spy') { mesh = buildSpyHut(); maxHp = 200; }
    else if (type === 'shipyard') { mesh = buildShipyard(); maxHp = 350; }

    if(mesh) {
        group.add(mesh);

        // HP Bar for Building
        const hpGroup = new THREE.Group();
        hpGroup.position.set(0, 5, 0); // High above the building
        const bgMesh = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.3), new THREE.MeshBasicMaterial({color: 0x880000}));
        hpGroup.add(bgMesh);
        const fgGeo = new THREE.PlaneGeometry(2.0, 0.3); fgGeo.translate(1.0, 0, 0);
        const hpBar = new THREE.Mesh(fgGeo, new THREE.MeshBasicMaterial({color: 0x00FF00}));
        hpBar.position.x = -1.0;
        hpGroup.add(hpBar);
        group.add(hpGroup);

        state.scene.add(group);

        // Construction logic
        const buildTime = BUILDING_COSTS[type] || 5; // Default 5s if not found
        if(!isLoading) mesh.scale.y = 0.01; // Start flat only if new

        const building = {
            mesh: group,
            visualMesh: mesh,
            hpBar: hpBar,
            hpGroup: hpGroup,
            type: type,
            faction: faction,
            hp: maxHp,
            maxHp: maxHp,
            constructionTimer: buildTime,
            totalBuildTime: buildTime,
            underConstruction: true,
            takeDamage: function(amount) {
                this.hp -= amount;
                this.hpBar.scale.x = Math.max(0, this.hp / this.maxHp);
                spawnPulse(this.mesh.position.x, this.mesh.position.y + 2, this.mesh.position.z, 0xFF4500);
                if(this.hp <= 0) {
                    this.destroy();
                }
            },
            destroy: function() {
                this.dead = true;
                state.scene.remove(this.mesh);
                spawnExplosion(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z, COLORS.wood, 20);
                SoundManager.playSound('explosion');
            },
            update: function(dt) {
                this.hpGroup.lookAt(state.camera.position);

                if(this.underConstruction) {
                    this.constructionTimer -= dt;
                    const progress = 1.0 - (this.constructionTimer / this.totalBuildTime);
                    this.visualMesh.scale.y = Math.max(0.01, progress);

                    if(this.constructionTimer <= 0) {
                        this.underConstruction = false;
                        this.visualMesh.scale.y = 1.0;
                        spawnExplosion(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z, 0xFFFFFF, 10);

                        // On Complete Logic
                        if(this.type === 'hut') {
                            // Spawn initial brave
                            const safe = findNearestLand(this.mesh.position.x + 2, this.mesh.position.z + 2, 10);
                            const u = new Humanoid(this.faction, 'wild', safe.x, safe.z);
                            state.units.push(u);
                            spawnPulse(u.mesh.position.x, u.mesh.position.y, u.mesh.position.z, 0xFFFFFF);
                        }
                    }
                    return; // Skip other updates while building
                }

                if(this.training) {
                    this.trainTimer -= dt;
                    if(this.trainTimer <= 0) {
                        this.training = false;
                        const safe = findNearestLand(this.mesh.position.x + 2, this.mesh.position.z + 2, 10);
                        const u = new Humanoid(this.trainFaction, this.trainType, safe.x, safe.z);
                        state.units.push(u);
                        spawnPulse(u.mesh.position.x, u.mesh.position.y, u.mesh.position.z, 0xFFD700);
                    }
                }
            }
        };

        state.buildings.push(building);
        if(!isLoading) spawnExplosion(x, baseH, z, 0xFFD700, 15);
        return building;
    }
    return null;
}

// --- BUILDING MODELS ---
function buildHut() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.4, 1.5, 8), new THREE.MeshLambertMaterial({color: COLORS.wood})); base.position.y = 0.75; base.castShadow = true; g.add(base);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1.5, 8), new THREE.MeshLambertMaterial({color: COLORS.straw})); roof.position.y = 1.5 + 0.75; roof.castShadow = true; g.add(roof);
    const door = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.0, 0.2), new THREE.MeshLambertMaterial({color: 0x220000})); door.position.set(0, 0.5, 1.2); g.add(door);
    return g;
}
function buildTower() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.0, 4, 6), new THREE.MeshLambertMaterial({color: COLORS.wood})); body.position.y = 2; body.castShadow = true; g.add(body);
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.2, 0.5, 6), new THREE.MeshLambertMaterial({color: COLORS.wood})); plat.position.y = 3.8; g.add(plat);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.0, 6), new THREE.MeshLambertMaterial({color: COLORS.straw})); roof.position.y = 4.5; g.add(roof);
    return g;
}
function buildBarracks() {
    const g = new THREE.Group();
    const walls = new THREE.Mesh(new THREE.BoxGeometry(3, 1.5, 2), new THREE.MeshLambertMaterial({color: COLORS.stone})); walls.position.y = 0.75; walls.castShadow = true; g.add(walls);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.2, 1.5, 4), new THREE.MeshLambertMaterial({color: COLORS.red})); roof.position.y = 1.5 + 0.75; roof.rotation.y = Math.PI/4; roof.scale.set(1, 1, 0.7); g.add(roof);
    return g;
}
function buildFireTemple() {
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.8, 1.2, 8), new THREE.MeshLambertMaterial({color: 0x444444})); base.position.y = 0.6; g.add(base);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 2, 8), new THREE.MeshLambertMaterial({color: COLORS.yellow})); roof.position.y = 1.2 + 1; g.add(roof);
    return g;
}
function buildSpyHut() {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 3, 1.2), new THREE.MeshLambertMaterial({color: 0x222222})); body.position.y = 1.5; g.add(body);
    const roof = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), new THREE.MeshLambertMaterial({color: COLORS.blue, emissive: 0x000044})); roof.position.y = 3.2; g.add(roof);
    return g;
}
function buildShipyard() {
    const g = new THREE.Group();
    // Dock platform
    const dock = new THREE.Mesh(new THREE.BoxGeometry(3, 0.5, 4), new THREE.MeshLambertMaterial({color: COLORS.wood}));
    dock.position.y = 0.25; g.add(dock);
    // Small crane/post
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 3), new THREE.MeshLambertMaterial({color: COLORS.stone}));
    post.position.set(1, 1.5, 1); g.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 0.2), new THREE.MeshLambertMaterial({color: COLORS.wood}));
    arm.position.set(0, 3, 1); g.add(arm);
    return g;
}
