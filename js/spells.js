import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { state } from './state.js';
import { COLORS, ACTIONS, CHUNK_SIZE } from './constants.js';
import { getHeight, getBaseHeight, getTerrainMod, findNearestLand } from './utils.js';
import { modifyTerrain, updateChunks, burnTreesAt } from './terrain.js';
import { SoundManager } from './audio.js';
import { spawnExplosion, spawnPulse, spawnHealing, Particle, CloudManager } from './visuals.js';
import { getBasicMaterial, AssetCache } from './assets.js';
import { Fireball } from './projectiles.js';
import { Humanoid } from './humanoid.js';

export class ActiveEffect {
    constructor() {}
    update(dt) { return false; }
}

export class Volcano extends ActiveEffect {
    constructor(x, z, faction) {
        super();
        this.x = x; this.z = z;
        this.faction = faction;
        this.timer = 15.0;
        this.interval = 0;
        SoundManager.playSound('explosion');
        // Initial rise
        const mods = modifyTerrain(x, z, 8, 5);
        updateChunks(true, mods);
    }
    update(dt) {
        this.timer -= dt;
        this.interval += dt;

        // Visuals
        if(Math.random() < 0.5) {
            const dist = Math.random() * 4;
            const angle = Math.random() * Math.PI * 2;
            const px = this.x + Math.cos(angle) * dist;
            const pz = this.z + Math.sin(angle) * dist;
            const h = getHeight(px, pz);
            const p = new Particle(new THREE.Vector3(px, h, pz), COLORS.lava, 0.3 + Math.random()*0.3, 1.5);
            p.vel.set((Math.random()-0.5)*4, Math.random()*8+4, (Math.random()-0.5)*4);
            state.particles.push(p);
        }

        if(this.interval > 0.2) {
            this.interval = 0;
            // Continually raise/modify
            const mods = modifyTerrain(this.x, this.z, 5, 0.2);
            updateChunks(true, mods);

            burnTreesAt(this.x, this.z, 10);

            // Push & Damage
            state.units.forEach(u => {
                const dist = u.mesh.position.distanceTo(new THREE.Vector3(this.x, u.mesh.position.y, this.z));
                if(dist < 10 && u.faction !== this.faction) {
                    const dir = u.mesh.position.clone().sub(new THREE.Vector3(this.x, u.mesh.position.y, this.z)).normalize();
                    u.applyForce(dir.multiplyScalar(20).add(new THREE.Vector3(0, 10, 0)));
                    if (!u.isShaman) u.takeDamage(5);
                }
            });
            state.buildings.forEach(b => {
                 const dist = b.mesh.position.distanceTo(new THREE.Vector3(this.x, b.mesh.position.y, this.z));
                 if(dist < 10 && b.faction !== this.faction) b.takeDamage(10);
            });
        }
        return this.timer > 0;
    }
}

export class Swamp extends ActiveEffect {
    constructor(x, z, faction) {
        super();
        this.pos = new THREE.Vector3(x, getHeight(x,z)+0.1, z);
        this.faction = faction;
        this.timer = 30.0;
        this.radius = 4.0;

        const geo = new THREE.CylinderGeometry(this.radius, this.radius, 0.2, 16);
        const mat = new THREE.MeshBasicMaterial({color: 0x2F4F4F, transparent: true, opacity: 0.8});
        this.mesh = new THREE.Mesh(geo, mat);
        this.mesh.position.copy(this.pos);
        state.scene.add(this.mesh);
        SoundManager.playSound('magic');
    }
    update(dt) {
        this.timer -= dt;

        // Visual pulse
        this.mesh.scale.setScalar(1.0 + Math.sin(this.timer * 2) * 0.05);

        // Kill units
        for(let i = state.units.length-1; i>=0; i--) {
            const u = state.units[i];
            if(u.state !== 'dead' && !u.isShaman && u.faction !== this.faction) {
                const dist = Math.sqrt((u.mesh.position.x - this.pos.x)**2 + (u.mesh.position.z - this.pos.z)**2);
                if(dist < this.radius * 0.8) {
                     u.takeDamage(10000); // Instant death
                     spawnPulse(u.mesh.position.x, u.mesh.position.y, u.mesh.position.z, 0x000000);
                }
            }
        }

        if(this.timer <= 0) {
            state.scene.remove(this.mesh);
            return false;
        }
        return true;
    }
}

export class Tornado extends ActiveEffect {
    constructor(x, z, faction) {
        super();
        this.pos = new THREE.Vector3(x, getHeight(x,z), z);
        this.faction = faction;
        this.timer = 20.0;
        this.moveDelay = 5.0;
        this.angle = Math.random() * Math.PI * 2;
        this.mesh = new THREE.Group();

        for(let i=0; i<20; i++) {
            const p = new THREE.Mesh(AssetCache.geos.particle, getBasicMaterial(0xAAAAAA));
            p.scale.set(0.5, 0.5, 0.5);
            p.userData = { yOff: i * 0.5, r: 1 + i*0.2, ang: i };
            this.mesh.add(p);
        }
        state.scene.add(this.mesh);
        SoundManager.playSound('rumble');
    }
    update(dt) {
        this.timer -= dt;

        if (this.moveDelay > 0) {
            this.moveDelay -= dt;
        } else {
            // Move Randomly
            this.angle += (Math.random()-0.5) * 2 * dt;
            const speed = 8;
            this.pos.x += Math.cos(this.angle) * speed * dt;
            this.pos.z += Math.sin(this.angle) * speed * dt;
        }
        this.pos.y = getHeight(this.pos.x, this.pos.z);

        this.mesh.position.copy(this.pos);

        // Animate Visuals
        this.mesh.children.forEach(c => {
             c.userData.ang += dt * 10;
             c.position.set(Math.cos(c.userData.ang)*c.userData.r, c.userData.yOff, Math.sin(c.userData.ang)*c.userData.r);
        });

        // Physics
        state.units.forEach(u => {
            const d = u.mesh.position.distanceTo(this.pos);
            if(d < 5 && u.faction !== this.faction) {
                 u.applyForce(new THREE.Vector3((Math.random()-0.5)*10, 25, (Math.random()-0.5)*10));
                 u.takeDamage(5);
            }
        });
        state.buildings.forEach(b => {
             const d = b.mesh.position.distanceTo(this.pos);
             if(d < 5 && b.faction !== this.faction) b.takeDamage(5);
        });

        if(this.timer <= 0) {
            state.scene.remove(this.mesh);
            return false;
        }
        return true;
    }
}

export class Swarm extends ActiveEffect {
    constructor(x, z, faction) {
        super();
        this.pos = new THREE.Vector3(x, getHeight(x,z)+3, z);
        this.faction = faction;
        this.timer = 14.0;
        this.particles = [];
        for(let i=0; i<30; i++) {
            const p = new THREE.Mesh(AssetCache.geos.particle, getBasicMaterial(0x000000));
            p.scale.set(0.2, 0.2, 0.2);
            p.position.set((Math.random()-0.5)*4, (Math.random()-0.5)*2, (Math.random()-0.5)*4);
            this.particles.push({mesh: p, off: p.position.clone()});
            state.scene.add(p);
        }
    }
    update(dt) {
        this.timer -= dt;

        // Move towards nearest enemy
        let closest = null; let minDist = 50;
        state.units.forEach(u => {
             if(u.faction !== this.faction && u.state !== 'dead') {
                 const d = u.mesh.position.distanceTo(this.pos);
                 if(d < minDist) { minDist = d; closest = u; }
             }
        });

        if(closest) {
             const dir = closest.mesh.position.clone().add(new THREE.Vector3(0,2,0)).sub(this.pos).normalize();
             this.pos.addScaledVector(dir, 10 * dt);
        }

        // Update particles
        this.particles.forEach(p => {
            p.off.applyAxisAngle(new THREE.Vector3(0,1,0), dt * 2);
            p.mesh.position.copy(this.pos).add(p.off);
        });

        // Damage
        state.units.forEach(u => {
            const d = u.mesh.position.distanceTo(this.pos);
            if(d < 4 && u.faction !== this.faction) {
                u.takeDamage(25 * dt);
            }
        });

        if(this.timer <= 0) {
            this.particles.forEach(p => state.scene.remove(p.mesh));
            return false;
        }
        return true;
    }
}

export class Firestorm extends ActiveEffect {
    constructor(x, z, faction) {
        super();
        this.x = x; this.z = z;
        this.faction = faction;
        this.timer = 10.0;
        this.interval = 0;
    }
    update(dt) {
        this.timer -= dt;
        this.interval += dt;
        if(this.interval > 0.5) {
            this.interval = 0;
            const rx = this.x + (Math.random()-0.5)*15;
            const rz = this.z + (Math.random()-0.5)*15;
            const start = new THREE.Vector3(rx, 40, rz);
            const end = new THREE.Vector3(rx, getHeight(rx, rz), rz);
            state.projectiles.push(new Fireball(start, end, this.faction));
            SoundManager.playSound('fireball');
        }
        return this.timer > 0;
    }
}

export function castLandbridge(caster, x, z) {
    if (!caster || !caster.mesh) return;
    const start = caster.mesh.position.clone();
    const targetH = getHeight(start.x, start.z);
    const dist = Math.sqrt((x - start.x)**2 + (z - start.z)**2);
    const steps = Math.ceil(dist);
    const dirX = (x - start.x) / dist;
    const dirZ = (z - start.z) / dist;

    const allMods = new Set();
    const r = 4; // Radius 4 for width 8

    for(let i=0; i<=steps; i++) {
        const px = start.x + dirX * i;
        const pz = start.z + dirZ * i;

        for(let ix = Math.floor(px - r); ix <= Math.ceil(px + r); ix++) {
            for(let iz = Math.floor(pz - r); iz <= Math.ceil(pz + r); iz++) {
                if((ix - px)**2 + (iz - pz)**2 <= r*r) {
                    const key = `${ix},${iz}`;
                    const base = getBaseHeight(ix, iz);
                    state.terrainMods.set(key, targetH - base);
                    const cx = Math.round(ix / CHUNK_SIZE);
                    const cz = Math.round(iz / CHUNK_SIZE);
                    allMods.add(`${cx},${cz}`);
                }
            }
        }
    }

    // Building collapse check
    state.buildings.forEach(b => {
        const groundH = getHeight(b.mesh.position.x, b.mesh.position.z);
        if(Math.abs(groundH - b.mesh.position.y) > 1.0) {
            b.takeDamage(100);
        }
    });

    updateChunks(true, allMods);
    SoundManager.playSound('rumble');
}

export function executeSpell(type, x, z, caster) {
    if (!caster || !caster.mesh) return;

    if (caster.faction === 1 && caster.isShaman) {
        if(window.showEnemySpellIcon) window.showEnemySpellIcon(type);
    }

    if (type === 'blast') {
        const startPos = caster.mesh.position.clone().add(new THREE.Vector3(0, 2, 0));
        const h = getHeight(x, z);
        const targetPos = new THREE.Vector3(x, h, z);
        state.projectiles.push(new Fireball(startPos, targetPos, caster.faction));
        SoundManager.playSound('fireball');

        const dx = targetPos.x - caster.mesh.position.x;
        const dz = targetPos.z - caster.mesh.position.z;
        caster.mesh.rotation.y = Math.atan2(dx, dz);
    }
    else if (type === 'raise') {
        const mods = modifyTerrain(x, z, 5, 2.0);
        updateChunks(true, mods);
        spawnExplosion(x, getHeight(x, z), z, 0x00FF00, 10);
        SoundManager.playSound('rumble');
    }
    else if (type === 'lower') {
        const mods = modifyTerrain(x, z, 5, -2.0);
        updateChunks(true, mods);
        spawnExplosion(x, getHeight(x, z), z, 0x0000FF, 10);
        SoundManager.playSound('rumble');
    }
    else if (type === 'volcano') {
        state.activeEffects.push(new Volcano(x, z, caster.faction));
        SoundManager.playSound('explosion');
    }
    else if (type === 'heal') {
        SoundManager.playSound('magic');
        spawnPulse(x, getHeight(x, z), z, 0xFF69B4);
        state.units.forEach(u => {
            if(u.faction === caster.faction && u.state !== 'dead') {
                const dist = u.mesh.position.distanceTo(new THREE.Vector3(x, u.mesh.position.y, z));
                if(dist < 8) {
                    u.hp = u.maxHp;
                    u.hpBar.scale.x = 1.0;
                    spawnHealing(u.mesh.position.x, u.mesh.position.y + 2, u.mesh.position.z);
                }
            }
        });
    }
    else if (type === 'create') {
        SoundManager.playSound('magic');
        const safe = findNearestLand(x, z);
        const u = new Humanoid(caster.faction, 'wild', safe.x, safe.z);
        state.units.push(u);
        spawnPulse(u.mesh.position.x, u.mesh.position.y, u.mesh.position.z, 0xFFFFFF);
    }
    else if (type === 'teleport') {
        SoundManager.playSound('magic');
        const h = getHeight(x, z);
        spawnPulse(x, h, z, 0x0000FF);
        caster.mesh.position.set(x, h, z);
        caster.state = 'idle';
        caster.velocity.set(0, 0, 0);
        caster.path = [];
        caster.isGrounded = true;
    }
    else if (type === 'tornado') {
        state.activeEffects.push(new Tornado(x, z, caster.faction));
    }
    else if (type === 'swarm') {
        state.activeEffects.push(new Swarm(x, z, caster.faction));
        SoundManager.playSound('magic');
    }
    else if (type === 'firestorm') {
        state.activeEffects.push(new Firestorm(x, z, caster.faction));
    }
    else if (type === 'shield') {
        SoundManager.playSound('magic');
        spawnPulse(x, getHeight(x, z), z, 0x00FFFF);
        state.units.forEach(u => {
            if(u.faction === caster.faction) {
                const dist = u.mesh.position.distanceTo(new THREE.Vector3(x, u.mesh.position.y, z));
                if(dist < 8) {
                    u.setShield(true);
                    setTimeout(() => u.setShield(false), 20000); // 20s
                }
            }
        });
    }
    else if (type === 'invisibility') {
        SoundManager.playSound('magic');
        state.units.forEach(u => {
            if(u.faction === caster.faction) {
                const dist = u.mesh.position.distanceTo(new THREE.Vector3(x, u.mesh.position.y, z));
                if(dist < 8) {
                    u.setInvisibility(true);
                    setTimeout(() => u.setInvisibility(false), 30000); // 30s
                }
            }
        });
    }
    else if (type === 'hypnotise') {
        SoundManager.playSound('magic');
        spawnPulse(x, getHeight(x, z), z, 0xFF00FF);
        state.units.forEach(u => {
            if(u.faction !== caster.faction && !u.isShaman) {
                 const dist = u.mesh.position.distanceTo(new THREE.Vector3(x, u.mesh.position.y, z));
                 if(dist < 8) {
                     if (u.originalFaction === null) u.originalFaction = u.faction;
                     u.setFaction(caster.faction);
                     u.conversionTimer = 10.0;
                     u.state = 'idle'; u.attackTarget = null;
                     spawnPulse(u.mesh.position.x, u.mesh.position.y+2, u.mesh.position.z, 0xFF00FF);
                 }
            }
        });
    }
    else if (type === 'flatten') {
        // Flatten to average
        let totalH = 0; let count = 0;
        const r = 5;
        for(let ix = Math.floor(x - r); ix <= Math.ceil(x + r); ix++) {
            for(let iz = Math.floor(z - r); iz <= Math.ceil(z + r); iz++) {
                if((ix-x)**2 + (iz-z)**2 <= r*r) {
                    totalH += getHeight(ix, iz); count++;
                }
            }
        }
        if(count > 0) {
            const avg = totalH / count;
            const modifiedChunks = new Set();
            for(let ix = Math.floor(x - r); ix <= Math.ceil(x + r); ix++) {
                for(let iz = Math.floor(z - r); iz <= Math.ceil(z + r); iz++) {
                     if((ix-x)**2 + (iz-z)**2 <= r*r) {
                        const current = getHeight(ix, iz);
                        const key = `${ix},${iz}`;
                        const mod = state.terrainMods.get(key) || 0;
                        state.terrainMods.set(key, mod + (avg - current));
                        const cx = Math.round(ix / CHUNK_SIZE);
                        const cz = Math.round(iz / CHUNK_SIZE);
                        modifiedChunks.add(`${cx},${cz}`);
                     }
                }
            }
            updateChunks(true, modifiedChunks);
            SoundManager.playSound('rumble');
        }
    }
    else if (type === 'landbridge') {
        castLandbridge(caster, x, z);
    }
    else if (type === 'swamp') {
         state.activeEffects.push(new Swamp(x, z, caster.faction));
         SoundManager.playSound('magic');
    }
    else if (type === 'lightning') {
        SoundManager.playSound('explosion');
        // Visual Line
        const geo = new THREE.CylinderGeometry(0.5, 0.1, 30, 8);
        const mat = new THREE.MeshBasicMaterial({color: 0xFFFFFF, transparent: true, opacity: 0.8});
        const bolt = new THREE.Mesh(geo, mat);
        bolt.position.set(x, getHeight(x,z) + 15, z);
        state.scene.add(bolt);
        setTimeout(() => state.scene.remove(bolt), 100);
        spawnExplosion(x, getHeight(x,z), z, 0xFFFFFF, 20);

        // Damage
        let hit = false;
        burnTreesAt(x, z, 5); // Burn trees
        state.units.forEach(u => {
             const dist = u.mesh.position.distanceTo(new THREE.Vector3(x, u.mesh.position.y, z));
             if(dist < 4 && u.faction !== caster.faction) {
                 u.takeDamage(400);
                 hit = true;
             }
        });
        state.buildings.forEach(b => {
             const dist = b.mesh.position.distanceTo(new THREE.Vector3(x, b.mesh.position.y, z));
             if(dist < 4 && b.faction !== caster.faction) {
                 b.takeDamage(400);
                 hit = true;
             }
        });
    }
}

window.executeSpell = executeSpell;
window.castLandbridge = castLandbridge;
