import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { state } from './state.js';
import { WATER_LEVEL } from './constants.js';
import { findNearestLand, getHeight } from './utils.js';
import { createBuilding } from './building.js';
import { Humanoid } from './humanoid.js';
import { Pathfinder } from './pathfinder.js';
import { executeSpell } from './spells.js';

export class EnemyAI {
    constructor() {
        this.timer = 0;
        this.state = 'build'; // 'build', 'attack'
        this.baseX = 0;
        this.baseZ = 0;
        this.lastBridgeTime = 0;
        this.lastSpellTime = 0;
        this.lastPathCheckTime = 0;
        this.hasPathToPlayer = false;
    }

    init(x, z) {
        // Ensure base is on land
        const startSafe = findNearestLand(x, z, 50);
        this.baseX = startSafe.x;
        this.baseZ = startSafe.z;

        // Create initial base
        createBuilding('hut', this.baseX, this.baseZ, 1);
        // Create Enemy Shaman
        const shamanSafe = findNearestLand(this.baseX - 5, this.baseZ - 5, 20);
        state.units.push(new Humanoid(1, 'shaman', shamanSafe.x, shamanSafe.z));
        // Create initial Brave
        const braveSafe = findNearestLand(this.baseX + 2, this.baseZ + 2, 10);
        state.units.push(new Humanoid(1, 'wild', braveSafe.x, braveSafe.z));

        // Create a tower
        const towerSafe = findNearestLand(this.baseX + 5, this.baseZ + 5, 20);
        createBuilding('tower', towerSafe.x, towerSafe.z, 1);
    }

    update(dt) {
        this.timer += dt;
        if(this.timer > 5.0) {
            this.timer = 0;
            this.think();
        }
        this.updateShaman(dt);
    }

    updateShaman(dt) {
        const myShaman = state.units.find(u => u.faction === 1 && u.isShaman && u.state !== 'dead');
        const playerShaman = state.units.find(u => u.faction === 0 && u.isShaman);

        if (myShaman && playerShaman && playerShaman.state !== 'dead') {
            // If moving along a valid path, don't bridge (prefer land path)
            if (myShaman.state === 'move' && myShaman.path && myShaman.path.length > 0) return;

            // Bridge Logic - Frequent check
            if (state.clock.getElapsedTime() - this.lastBridgeTime > 1.0) {
                if (state.clock.getElapsedTime() - this.lastPathCheckTime > 1.0) {
                    this.lastPathCheckTime = state.clock.getElapsedTime();
                    this.hasPathToPlayer = !!Pathfinder.findPath(myShaman.mesh.position, playerShaman.mesh.position, false, myShaman.height);
                }
                if (this.hasPathToPlayer) return;

                const dir = playerShaman.mesh.position.clone().sub(myShaman.mesh.position).normalize();

                // Cast Bridge or Raise
                const castPos = myShaman.mesh.position.clone().addScaledVector(dir, 5.0);
                const h = getHeight(castPos.x, castPos.z);
                if (h < WATER_LEVEL) {
                    executeSpell('raise', castPos.x, castPos.z, myShaman);
                } else {
                    executeSpell('landbridge', castPos.x, castPos.z, myShaman);
                }
                this.lastBridgeTime = state.clock.getElapsedTime();
            }
        }
    }

    think() {
        // Get Enemy Units
        const myUnits = state.units.filter(u => u.faction === 1 && u.state !== 'dead');
        const myBuildings = state.buildings.filter(b => b.faction === 1 && !b.dead);

        // 1. Train Units
        // If I have Braves and Buildings, train.
        // Simplified: Just spawn occasionally for challenge.
        if(Math.random() < 0.3) {
             const type = Math.random() > 0.5 ? 'warrior' : 'firewarrior';
             const spawnX = this.baseX + (Math.random()-0.5)*10;
             const spawnZ = this.baseZ + (Math.random()-0.5)*10;
             const safe = findNearestLand(spawnX, spawnZ);
             state.units.push(new Humanoid(1, type, safe.x, safe.z));
        }

        // 2. Expand Base
        const myBraves = myUnits.filter(u => u.type === 'wild');
        // Aggressive expansion: always try if we have at least one building and one brave (busy or idle)
        if (myBuildings.length < 15 && myBraves.length > 0) {
            // Try up to 10 times to find a spot per think cycle
            for(let attempt=0; attempt<10; attempt++) {
                // Pick a brave as reference to satisfy "build only near brave"
                const ref = myBraves[Math.floor(Math.random() * myBraves.length)];
                const angle = Math.random() * Math.PI * 2;
                const dist = 2 + Math.random() * 6; // Closer range (2-8) to ensure brave is "nearby" (within 10)
                let tx = ref.mesh.position.x + Math.cos(angle) * dist;
                let tz = ref.mesh.position.z + Math.sin(angle) * dist;

                // Snap to land (function is hoisted and available)
                const safe = findNearestLand(tx, tz, 20);
                tx = safe.x; tz = safe.z;

                // Check land validity again (just in case)
                if (getHeight(tx, tz) >= WATER_LEVEL) {
                    // Check spacing
                    let clear = true;
                    for (let b of state.buildings) {
                        if (!b.dead && b.mesh.position.distanceTo(new THREE.Vector3(tx, b.mesh.position.y, tz)) < 6.0) {
                            clear = false; break;
                        }
                    }
                    if (clear) {
                        const types = ['hut', 'tower', 'warrior', 'fire', 'spy', 'shipyard'];
                        const type = types[Math.floor(Math.random() * types.length)];
                        createBuilding(type, tx, tz, 1);
                        break; // Built one, stop trying this frame
                    }
                }
            }
        }

        // 4. Random Movement for Expansion (Braves)
        const idleBraves = myUnits.filter(u => u.type === 'wild');
        idleBraves.forEach(u => {
            if(u.state === 'idle' && Math.random() < 0.5) { // 50% chance to move if idle
                 const dist = 10 + Math.random() * 20;
                 const angle = Math.random() * Math.PI * 2;
                 const tx = u.mesh.position.x + Math.cos(angle) * dist;
                 const tz = u.mesh.position.z + Math.sin(angle) * dist;
                 const safe = findNearestLand(tx, tz, 20);
                 u.goto(safe.x, safe.z);
            }
        });

        // 3. Attack Player
        if(myUnits.length > 5) {
            // Send some to attack player shaman
            const attackers = myUnits.filter(u => u.type !== 'wild' && u.state === 'idle');
            const target = state.shaman;
            if(target && target.state !== 'dead') {
                attackers.forEach(u => {
                    u.goto(target.mesh.position.x, target.mesh.position.z);
                    u.attackTarget = target;
                    u.state = 'combat'; // Force combat state approach
                });
            }
        }

        // 4. Shaman Logic (Spells & Move)
        const myShaman = myUnits.find(u => u.isShaman);
        const target = state.shaman; // Player shaman
        if(myShaman && target && target.state !== 'dead') {
            const dist = myShaman.mesh.position.distanceTo(target.mesh.position);

            // Offensive Spells
            const spellRange = 10.0 + myShaman.mesh.position.y;
            if (state.clock.getElapsedTime() - this.lastSpellTime > 5.0) {
                if (dist < spellRange) {
                    const offensiveSpells = ['blast', 'lightning', 'tornado', 'swarm', 'firestorm'];
                    const spell = offensiveSpells[Math.floor(Math.random() * offensiveSpells.length)];
                    executeSpell(spell, target.mesh.position.x, target.mesh.position.z, myShaman);
                    this.lastSpellTime = state.clock.getElapsedTime();
                }
            }

            // Move shaman to attack if idle
            // Check cooldown
            if (state.clock.getElapsedTime() - this.lastBridgeTime > 2.0) {
                // Check if path already exists
                if (!Pathfinder.findPath(myShaman.mesh.position, target.mesh.position, false, myShaman.height)) {
                    // Check for water in path
                    const steps = 10;
                    const dir = target.mesh.position.clone().sub(myShaman.mesh.position).normalize();

                    for(let i=1; i<=steps; i++) {
                        const checkPos = myShaman.mesh.position.clone().addScaledVector(dir, i * 4.0); // Check ahead 40 units
                        if (getHeight(checkPos.x, checkPos.z) < WATER_LEVEL) {
                            // Raise land
                            executeSpell('raise', checkPos.x, checkPos.z, myShaman);
                            this.lastBridgeTime = state.clock.getElapsedTime();
                            break;
                        }
                    }
                }
            }

            // Also move shaman to attack if idle
            if (myShaman.state === 'idle' && dist > 20) {
                 myShaman.goto(target.mesh.position.x, target.mesh.position.z);
            }
        }
    }
}
