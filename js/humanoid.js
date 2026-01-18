import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { state, SpatialHash } from './state.js';
import { AssetCache, getBasicMaterial } from './assets.js';
import { COLORS, WATER_LEVEL } from './constants.js';
import { getHeight, isBlocked } from './utils.js';
import { Pathfinder, smoothPath } from './pathfinder.js';
import { SoundManager } from './audio.js';
import { spawnPulse, spawnHealing, Particle } from './visuals.js';
import { Fireball } from './projectiles.js';

export class Humanoid {
    constructor(faction, type, x, z) {
        this.faction = faction; // 0 = Player, 1 = Enemy
        this.type = type; // 'wild', 'warrior', 'firewarrior', 'spy', 'shaman'
        this.isShaman = (type === 'shaman');

        // Stats
        this.maxHp = 100; this.damage = 5; this.range = 1; this.attackSpeed = 1.0; this.moveSpeed = 6; this.height = 1.5;
        if(type === 'warrior') { this.maxHp = 200; this.damage = 52.5; }
        if(type === 'firewarrior') { this.maxHp = 120; this.damage = 25; this.range = 12; this.attackSpeed = 2.0; }
        if(type === 'shaman') { this.maxHp = 500; this.damage = 30; this.range = 15; this.height = 2.2; }
        if(type === 'airship') { this.maxHp = 500; this.damage = 0; this.moveSpeed = 15; this.isVehicle = true; this.passengers = []; this.capacity = 5; this.height = 2.0; }

        this.hp = this.maxHp; this.recoverTimer = 0;
        this.shielded = false;
        this.invisible = false;
        this.shieldMesh = null;

        // Visuals
        this.mesh = new THREE.Group();
        const skinMat = AssetCache.mats.skin;
        const shirtMat = (faction === 0) ? AssetCache.mats.blueShirt : AssetCache.mats.redShirt;

        // Selection Ring
        this.selectRing = new THREE.Mesh(AssetCache.geos.ring, AssetCache.mats.selectRing);
        this.selectRing.rotation.x = -Math.PI/2; this.selectRing.visible = false; this.mesh.add(this.selectRing);

        // HP Bar
        this.hpGroup = new THREE.Group(); this.hpGroup.position.set(0, 2.3, 0);
        this.hpGroup.add(new THREE.Mesh(AssetCache.geos.hpBack, AssetCache.mats.hpBack));
        const hpMat = (faction === 0) ? AssetCache.mats.hpGreen : AssetCache.mats.hpRed;
        this.hpBar = new THREE.Mesh(AssetCache.geos.hpFront, hpMat);
        this.hpBar.position.x = -0.5; this.hpGroup.add(this.hpBar);
        this.mesh.add(this.hpGroup);

        // Enemy Marker
        if(this.faction === 1) {
            this.marker = new THREE.Mesh(AssetCache.geos.marker, AssetCache.mats.marker);
            this.marker.position.set(0, 6, 0);
            this.mesh.add(this.marker);
        }

        // Body Parts
        if(type === 'airship') {
             // Basket
             const basket = new THREE.Mesh(AssetCache.geos.airshipBasket, new THREE.MeshLambertMaterial({color: COLORS.wood}));
             basket.position.y = 0.5;
             this.mesh.add(basket);
             // Ropes
             const ropeMat = new THREE.MeshLambertMaterial({color: 0x888888});
             const rope1 = new THREE.Mesh(AssetCache.geos.airshipRope, ropeMat);
             rope1.position.set(0.9, 2, 1.4); this.mesh.add(rope1);
             const rope2 = new THREE.Mesh(AssetCache.geos.airshipRope, ropeMat);
             rope2.position.set(-0.9, 2, 1.4); this.mesh.add(rope2);
             const rope3 = new THREE.Mesh(AssetCache.geos.airshipRope, ropeMat);
             rope3.position.set(0.9, 2, -1.4); this.mesh.add(rope3);
             const rope4 = new THREE.Mesh(AssetCache.geos.airshipRope, ropeMat);
             rope4.position.set(-0.9, 2, -1.4); this.mesh.add(rope4);
             // Balloon
             const balloon = new THREE.Mesh(AssetCache.geos.airshipBalloon, new THREE.MeshLambertMaterial({color: 0xEEEEEE}));
             balloon.scale.set(1, 0.8, 1.5);
             balloon.position.set(0, 4.5, 0);
             this.mesh.add(balloon);
        } else {
            this.torso = new THREE.Group(); this.torso.position.y = 0.9; this.mesh.add(this.torso);
            this.torso.add(new THREE.Mesh(AssetCache.geos.torso, shirtMat));
            this.head = new THREE.Group(); this.head.position.y = 0.4; this.torso.add(this.head);
            this.head.add(new THREE.Mesh(AssetCache.geos.head, skinMat));
        }

        // Props
        if(this.isShaman) {
            this.mesh.scale.set(1.5, 1.5, 1.5);
            const mask = new THREE.Mesh(AssetCache.geos.shamanMask, new THREE.MeshLambertMaterial({color: 0xFFD700, emissive: 0x443300}));
            mask.position.z = 0.16; this.head.add(mask);

            const hornMat = new THREE.MeshLambertMaterial({color:0xFFFFFF, emissive: 0x333333});
            const h1 = new THREE.Mesh(AssetCache.geos.shamanHorn, hornMat); h1.position.set(0.15, 0.2, 0); h1.rotation.z = -0.3;
            const h2 = new THREE.Mesh(AssetCache.geos.shamanHorn, hornMat); h2.position.set(-0.15, 0.2, 0); h2.rotation.z = 0.3; this.head.add(h1); this.head.add(h2);

            // Cape for Shaman
            const cape = new THREE.Mesh(AssetCache.geos.cape, new THREE.MeshLambertMaterial({color: 0x330000}));
            cape.position.set(0, -0.1, -0.15); cape.rotation.x = 0.2;
            this.torso.add(cape);

            const light = new THREE.PointLight(0xFFD700, 1, 8);
            light.position.set(0, 2, 0);
            this.mesh.add(light);
        }
        else if (type === 'wild') {
            // Backpack
            const bag = new THREE.Mesh(AssetCache.geos.backpack, new THREE.MeshLambertMaterial({color: 0x8B4513}));
            bag.position.set(0, 0, -0.15);
            this.torso.add(bag);
        }
        else if (type === 'warrior') {
            const helm = new THREE.Mesh(AssetCache.geos.warriorHelm, new THREE.MeshLambertMaterial({color: 0x888888}));
            helm.position.y = 0.1; this.head.add(helm);
            const crest = new THREE.Mesh(AssetCache.geos.warriorCrest, new THREE.MeshLambertMaterial({color: 0xCC0000}));
            crest.position.y = 0.25;
            this.head.add(crest);
        }
        else if (type === 'firewarrior') {
            const mask = new THREE.Mesh(AssetCache.geos.fireMask, new THREE.MeshLambertMaterial({color: 0xFF4500}));
            mask.position.z = 0.16; this.head.add(mask);
            // Glowing eyes
            const eyeMat = new THREE.MeshBasicMaterial({color: 0xFFFF00});
            const eyeL = new THREE.Mesh(AssetCache.geos.fireEye, eyeMat); eyeL.position.set(0.08, 0.05, 0.22);
            const eyeR = new THREE.Mesh(AssetCache.geos.fireEye, eyeMat); eyeR.position.set(-0.08, 0.05, 0.22);
            this.head.add(eyeL); this.head.add(eyeR);
        }
        else if (type === 'spy') {
             // Hood
             const hood = new THREE.Mesh(AssetCache.geos.spyHood, new THREE.MeshLambertMaterial({color: 0x111111}));
             hood.position.y = 0.1;
             this.head.add(hood);
             // Cape
             const cape = new THREE.Mesh(AssetCache.geos.cape, new THREE.MeshLambertMaterial({color: 0x111111}));
             cape.position.set(0, -0.1, -0.15); cape.rotation.x = 0.1;
             this.torso.add(cape);
        }

        if (type !== 'airship') {
            const createLimb = (geo, mat, px, py, pz, h) => {
                const group = new THREE.Group(); group.position.set(px, py, pz);
                const mesh = new THREE.Mesh(geo, mat); mesh.position.y = -h / 2; mesh.castShadow = true;
                group.add(mesh); return group;
            };
            let armMat = skinMat;
            if(this.type === 'firewarrior') armMat = new THREE.MeshLambertMaterial({color: 0xFF4500, emissive: 0xFF2200});
            if(this.type === 'spy') armMat = new THREE.MeshLambertMaterial({color: 0x222222});

            this.armL = createLimb(AssetCache.geos.arm, armMat, 0.26, 0.15, 0, 0.45);
            this.armR = createLimb(AssetCache.geos.arm, armMat, -0.26, 0.15, 0, 0.45);
            this.torso.add(this.armL); this.torso.add(this.armR);

            // Weapons / Tools
            if(type === 'warrior') {
                const sword = new THREE.Mesh(AssetCache.geos.sword, new THREE.MeshLambertMaterial({color: 0xDDDDDD}));
                sword.position.y = -0.3; sword.position.z = 0.1; sword.rotation.x = Math.PI/2;
                this.armR.children[0].add(sword);
                // Shield
                const shield = new THREE.Mesh(AssetCache.geos.shield, new THREE.MeshLambertMaterial({color: 0x8B4513}));
                shield.rotation.z = Math.PI/2; shield.rotation.y = Math.PI/2;
                shield.position.x = 0.15; shield.position.y = -0.2;
                this.armL.children[0].add(shield);
            }
            else if (type === 'wild') {
                const tool = new THREE.Mesh(AssetCache.geos.tool, new THREE.MeshLambertMaterial({color: 0x666666}));
                tool.position.y = -0.3; tool.position.z = 0.1; tool.rotation.x = Math.PI/2;
                this.armR.children[0].add(tool);
            }

            this.legL = createLimb(AssetCache.geos.leg, shirtMat, 0.1, 0.65, 0, 0.55);
            this.legR = createLimb(AssetCache.geos.leg, shirtMat, -0.1, 0.65, 0, 0.55);
            this.mesh.add(this.legL); this.mesh.add(this.legR);
        }

        this.mesh.position.set(x, getHeight(x,z) - 0.1 * this.mesh.scale.y, z);
        state.scene.add(this.mesh);
        this.velocity = new THREE.Vector3(0,0,0);
        this.isGrounded = true; this.target = null; this.attackTarget = null; this.state = 'idle'; this.animTime = Math.random() * 100;
        this.lastAttackTime = 0;
        this.path = []; this.pathIndex = 0; this.pathTimer = 0;
        this.finalDest = null; this.lastPos = new THREE.Vector3(); this.stuckTimer = 0;
        this.deathTimer = 0;
        this.nextTargetCheck = Math.random() * 2.0;
        this.conversionTimer = 0;
        this.originalFaction = null;
    }

    setFaction(newFaction) {
        if (this.faction === newFaction) return;
        this.faction = newFaction;

        // Shirt Color
        const newMat = (this.faction === 0) ? AssetCache.mats.blueShirt : AssetCache.mats.redShirt;
        this.mesh.traverse(c => {
            if(c.isMesh && c.material) {
                 if(c.material === AssetCache.mats.blueShirt || c.material === AssetCache.mats.redShirt) {
                     c.material = newMat;
                 }
                 else if(c.material.color && (c.material.color.getHex() === COLORS.red || c.material.color.getHex() === COLORS.blue)) {
                     c.material = newMat;
                 }
            }
        });

        // HP Bar
        const hpMat = (this.faction === 0) ? AssetCache.mats.hpGreen : AssetCache.mats.hpRed;
        if(this.hpBar) this.hpBar.material = hpMat;

        // Marker
        if(this.faction === 1) {
            if(!this.marker) {
                this.marker = new THREE.Mesh(AssetCache.geos.marker, AssetCache.mats.marker);
                this.marker.position.set(0, 6, 0);
                this.mesh.add(this.marker);
            }
            this.marker.visible = true;
        } else {
            if(this.marker) this.marker.visible = false;
        }
    }

    lookAtTarget(pos) {
        const dx = pos.x - this.mesh.position.x;
        const dz = pos.z - this.mesh.position.z;
        this.mesh.rotation.y = Math.atan2(dx, dz);
    }

    takeDamage(amount) {
        if(this.state === 'dead') return;
        if(this.faction === 0 && state.isGodMode) return;
        if(this.shielded) {
            spawnPulse(this.mesh.position.x, this.mesh.position.y + 1, this.mesh.position.z, 0x00FFFF);
            return;
        }
        this.hp -= amount;
        this.hpBar.scale.x = Math.max(0, this.hp / this.maxHp);
        spawnPulse(this.mesh.position.x, this.mesh.position.y + 1, this.mesh.position.z, 0xFF0000);
        if(this.hp <= 0) this.die();
    }

    setShield(active) {
        this.shielded = active;
        if(active && !this.shieldMesh) {
            this.shieldMesh = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 8), new THREE.MeshBasicMaterial({color: 0x00FFFF, transparent: true, opacity: 0.3}));
            this.shieldMesh.position.y = 1.0;
            this.mesh.add(this.shieldMesh);
        } else if(!active && this.shieldMesh) {
            this.mesh.remove(this.shieldMesh);
            this.shieldMesh = null;
        }
    }

    setInvisibility(active) {
        this.invisible = active;
        this.mesh.traverse(c => {
            if(c.isMesh) {
                c.material.transparent = true;
                c.material.opacity = active ? 0.2 : 1.0;
            }
        });
    }

    die() {
        this.state = 'dead'; this.hpGroup.visible = false; if(this.marker) this.marker.visible = false; this.velocity.set(0, 0, 0);
    }

    applyForce(vec) {
        if(this.state === 'dead') return;
        this.velocity.add(vec); this.isGrounded = false; this.state = 'stunned'; this.recoverTimer = 2.0; this.target = null;
    }

    manualMove(vec) {
        if(this.state === 'dead' || this.state === 'stunned') return;
        const speed = this.moveSpeed;

        // Check collision and water
        let allowed = true;
        if(this.type !== 'airship') {
             // Simple lookahead
             const futureX = this.mesh.position.x + vec.x * speed * 0.1;
             const futureZ = this.mesh.position.z + vec.z * speed * 0.1;
             const futureH = getHeight(futureX, futureZ);
             const safeH = WATER_LEVEL - this.height;

             // If moving into water deeper than unit height
             if(futureH < safeH && getHeight(this.mesh.position.x, this.mesh.position.z) >= safeH) {
                 allowed = false;
             }
             if(isBlocked(futureX, futureZ)) {
                  allowed = false;
             }
        }

        if(allowed) {
            this.velocity.x = vec.x * speed;
            this.velocity.z = vec.z * speed;
            if(vec.lengthSq() > 0.001) {
                this.mesh.rotation.y = Math.atan2(vec.x, vec.z);
            }
        } else {
            this.velocity.x = 0;
            this.velocity.z = 0;
        }

        this.state = 'manual';
        this.target = null;
        this.path = [];
    }

    goto(x, z) {
        if(this.state === 'stunned' || this.state === 'dead') return;
        const end = new THREE.Vector3(x, 0, z);
        this.finalDest = end.clone();
        const isFlying = (this.type === 'airship');
        const rawPath = Pathfinder.findPath(this.mesh.position, end, isFlying, this.height);

        if (rawPath) {
            this.path = smoothPath(rawPath, isFlying, this.height);
            this.pathIndex = 0;
            if(this.path.length > 0) {
                this.target = this.path[0];
                this.state = 'move';
            } else {
                this.target = end; this.state = 'move';
            }
        } else {
            if (isFlying) {
                this.target = end; this.state = 'move';
                this.path = [];
            } else {
                this.state = 'idle';
                this.target = null;
                this.path = [];
            }
        }
    }

    findTarget() {
         let minDist = 1000;
         let closest = null;
         const range = 30;
         const candidates = SpatialHash.query(this.mesh.position.x, this.mesh.position.z, range);

         for(let i=0; i<candidates.length; i++) {
             const u = candidates[i];
             if(u.faction !== this.faction && u.state !== 'dead' && !u.invisible) {
                 const d = this.mesh.position.distanceTo(u.mesh.position);
                 if(d < range && d < minDist) {
                     minDist = d; closest = u;
                 }
             }
         }
         return closest;
    }

    attack() {
        if(!this.attackTarget || this.attackTarget.state === 'dead') {
             this.state = 'idle'; this.attackTarget = null; return;
        }

        this.mesh.lookAt(this.attackTarget.mesh.position.x, this.mesh.position.y, this.attackTarget.mesh.position.z);

        // Animation
        const t = this.animTime * 10;
        this.armR.rotation.x = -Math.PI/2 + Math.sin(t) * 0.5; // Swing

        // Deal damage at right time
        // Simplified: just check cooldown
        if(state.clock.getElapsedTime() - this.lastAttackTime > (1.0/this.attackSpeed)) {
            this.lastAttackTime = state.clock.getElapsedTime();
            if(this.type === 'firewarrior') {
                // Spawn Fireball
                 const startPos = this.mesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
                 const targetPos = this.attackTarget.mesh.position.clone().add(new THREE.Vector3(0, 1, 0));
                 state.projectiles.push(new Fireball(startPos, targetPos, this.faction));
                 SoundManager.playSound('fireball');
            } else {
                // Melee
                this.attackTarget.takeDamage(this.damage);
                SoundManager.playSound('attack');
            }
        }
    }

    update(dt) {
        if(this.state === 'transported') return;

        if (this.conversionTimer > 0) {
            this.conversionTimer -= dt;
            if (this.conversionTimer <= 0) {
                if (this.originalFaction !== null) {
                    this.setFaction(this.originalFaction);
                    this.originalFaction = null;
                    this.state = 'idle'; // Reset state on revert
                    this.attackTarget = null;
                    spawnPulse(this.mesh.position.x, this.mesh.position.y+2, this.mesh.position.z, 0xFF00FF);
                }
                this.conversionTimer = 0;
            }
        }

        this.hpGroup.lookAt(state.camera.position); this.animTime += dt;
        if(!this.isGrounded) this.velocity.y -= 30 * dt;
        else { this.velocity.x *= 0.9; this.velocity.z *= 0.9; }
        this.mesh.position.addScaledVector(this.velocity, dt);

        const groundH = getHeight(this.mesh.position.x, this.mesh.position.z);
        const feetOffset = 0.1 * this.mesh.scale.y;

        if (this.type === 'airship') {
            const targetAlt = Math.max(groundH, WATER_LEVEL) + 8.0; // Fly above water or ground
            const diff = targetAlt - this.mesh.position.y;
            this.velocity.y += diff * dt * 5.0;
            this.velocity.y *= 0.9;
            this.isGrounded = false;
        } else {
            const targetY = groundH - feetOffset;
            if (this.mesh.position.y < targetY) {
                if(this.velocity.y < -15 && this.state !== 'dead' && !this.isShaman) this.takeDamage(20);
                this.mesh.position.y = targetY;
                this.isGrounded = true; this.velocity.y = 0;
                if(this.state === 'stunned' && this.velocity.length() < 1) { this.state = 'idle'; this.mesh.rotation.z = 0; this.mesh.rotation.x = 0; }
            } else if (this.mesh.position.y > targetY + 0.1) { this.isGrounded = false; }
        }

        // Deep Water Damage
        if (this.type !== 'airship' && this.state !== 'dead') {
            const h = getHeight(this.mesh.position.x, this.mesh.position.z);
            const safeH = WATER_LEVEL - this.height;
            if (h < safeH) {
                this.takeDamage(this.maxHp * 0.10 * dt);
            }
        }

        // Building Entry Check for Training
        if(this.type === 'wild' && this.state !== 'dead' && this.faction === 0) {
             state.buildings.forEach(b => {
                 // Check if building is ready to train?
                 // For now instant training logic
                 const dist = this.mesh.position.distanceTo(b.mesh.position);
                 if(dist < 2.0 && b.hp > 0 && !b.training) {
                     let newType = null;
                     if(b.type === 'warrior') newType = 'warrior';
                     if(b.type === 'fire') newType = 'firewarrior';
                     if(b.type === 'spy') newType = 'spy'; // not implemented fully visual wise but logic is here

                     if(newType) {
                         // Enter building
                         this.die(); // Remove old unit
                         state.scene.remove(this.mesh); // Hide immediately
                         this.hp = 0; // Ensure cleaned up

                         // Start training timer on building
                         b.training = true;
                         b.trainTimer = 2.0;
                         b.trainType = newType;
                         b.trainFaction = this.faction;
                         spawnPulse(b.mesh.position.x, b.mesh.position.y+2, b.mesh.position.z, 0x00FF00);
                     }
                 }
             });
        }

        if (this.state === 'dead') {
            this.deathTimer += dt;
            if(this.mesh.rotation.x > -Math.PI/2) this.mesh.rotation.x -= dt * 5;

            if (this.deathTimer > 95) {
                if(this.mesh.position.y > groundH - 2.0) this.mesh.position.y -= dt * 0.5;
            }
            return;
        }

        // Passive Healing near Buildings
        if(this.hp < this.maxHp && this.state !== 'combat') {
            let nearBuilding = false;
            for(let b of state.buildings) {
                if(b.faction === this.faction && !b.dead) {
                    const dist = this.mesh.position.distanceTo(b.mesh.position);
                    if(dist < 8.0) {
                        nearBuilding = true;
                        break;
                    }
                }
            }
            if(nearBuilding) {
                this.hp += dt * 10;
                if(this.hp > this.maxHp) this.hp = this.maxHp;
                this.hpBar.scale.x = Math.max(0, this.hp / this.maxHp);

                this.healTimer = (this.healTimer || 0) + dt;
                if(this.healTimer > 0.5) {
                    spawnHealing(this.mesh.position.x, this.mesh.position.y + 2, this.mesh.position.z);
                    this.healTimer = 0;
                }
            }
        }

        if(this.state === 'stunned') {
            if(this.velocity.length() > 2 || !this.isGrounded) {
                 this.mesh.rotation.x += dt * 5; this.mesh.rotation.z += dt * 3;
                 if(this.legL) {
                    this.legL.rotation.x = Math.sin(this.animTime * 15); this.legR.rotation.x = Math.sin(this.animTime * 15 + Math.PI);
                    this.armL.rotation.x = Math.sin(this.animTime * 15); this.armR.rotation.x = Math.sin(this.animTime * 15 + Math.PI);
                 }
            } else {
                this.recoverTimer -= dt;
                const targetRotX = -Math.PI/2;
                this.mesh.rotation.x += (targetRotX - this.mesh.rotation.x) * 5 * dt;
                this.mesh.rotation.z *= 0.9;
                this.resetAnim();
                if(this.recoverTimer <= 0) {
                    this.state = 'getting_up';
                    this.getUpTimer = 0.5;
                }
            }
        }
        else if(this.state === 'getting_up') {
            this.getUpTimer -= dt;
            const progress = Math.max(0, Math.min(1.0, 1.0 - (this.getUpTimer / 0.5)));
            // Cubic Ease Out: 1 - pow(1 - x, 3)
            const ease = 1 - Math.pow(1 - progress, 3);
            this.mesh.rotation.x = -Math.PI/2 * (1 - ease);
            this.mesh.rotation.z *= 0.8; // Also correct Z tilt
            if (this.getUpTimer <= 0) {
                 this.state = 'idle';
                 this.mesh.rotation.x = 0;
                 this.mesh.rotation.z = 0;
            }
        }
        else if(this.state === 'manual') {
            if(this.velocity.lengthSq() > 0.1) {
                if(this.legL) {
                    const walkSpeed = 10; const amp = 0.8;
                    this.legL.rotation.x = Math.sin(this.animTime * walkSpeed) * amp;
                    this.legR.rotation.x = Math.sin(this.animTime * walkSpeed + Math.PI) * amp;
                    this.armL.rotation.x = Math.sin(this.animTime * walkSpeed + Math.PI) * amp * 0.6;
                    this.armR.rotation.x = Math.sin(this.animTime * walkSpeed) * amp * 0.6;
                }
            } else {
                this.resetAnim();
            }
        }
        else if(this.state === 'combat') {
            if(!this.attackTarget || this.attackTarget.state === 'dead') {
                // Try find new target
                this.attackTarget = this.findTarget();
                if(!this.attackTarget) { this.state = 'idle'; return; }
            }

            const dist = this.mesh.position.distanceTo(this.attackTarget.mesh.position);
            if(dist <= this.range) {
                // In range, attack
                this.velocity.set(0,0,0);
                this.attack();
            } else {
                // Pathfinding for combat
                this.pathTimer += dt;
                let targetPos = this.attackTarget.mesh.position;

                if(this.pathTimer > 1.0) {
                     this.pathTimer = 0;
                     const isFlying = (this.type === 'airship');
                     this.path = Pathfinder.findPath(this.mesh.position, targetPos, isFlying, this.height);
                     this.pathIndex = 0;
                }

                if(this.path && this.path.length > 0 && this.pathIndex < this.path.length) {
                    targetPos = this.path[this.pathIndex];
                    if(this.mesh.position.distanceTo(targetPos) < 1.0) {
                        this.pathIndex++;
                        if(this.pathIndex < this.path.length) targetPos = this.path[this.pathIndex];
                    }
                }

                // Move towards
                const dx = targetPos.x - this.mesh.position.x;
                const dz = targetPos.z - this.mesh.position.z;
                const dir = new THREE.Vector3(dx, 0, dz).normalize();

                // Slope check
                const nextH = getHeight(this.mesh.position.x + dir.x, this.mesh.position.z + dir.z);
                const currentH = getHeight(this.mesh.position.x, this.mesh.position.z);
                const dh = nextH - currentH;

                let canMove = true;
                const safeH = WATER_LEVEL - this.height;
                if (this.type !== 'airship' && nextH < safeH && currentH >= safeH) canMove = false;

                if(canMove) {
                    const slopeFactor = dh > 0 ? (1.0 / (1.0 + dh * 3.0)) : 1.0;
                    const speed = this.moveSpeed * (this.type === 'airship' ? 1.0 : slopeFactor);
                    const targetVelX = dir.x * speed;
                    const targetVelZ = dir.z * speed;
                    this.velocity.x += (targetVelX - this.velocity.x) * 10 * dt;
                    this.velocity.z += (targetVelZ - this.velocity.z) * 10 * dt;

                    const targetRot = Math.atan2(dx, dz);
                    let rotDiff = targetRot - this.mesh.rotation.y;
                    while(rotDiff > Math.PI) rotDiff -= Math.PI*2;
                    while(rotDiff < -Math.PI) rotDiff += Math.PI*2;
                    this.mesh.rotation.y += rotDiff * 10 * dt;
                } else {
                    this.velocity.x *= 0.9;
                    this.velocity.z *= 0.9;
                }

                // Walk Anim
                if(this.legL) {
                    const walkSpeed = 10; const amp = 0.8;
                    this.legL.rotation.x = Math.sin(this.animTime * walkSpeed) * amp;
                    this.legR.rotation.x = Math.sin(this.animTime * walkSpeed + Math.PI) * amp;
                    this.armL.rotation.x = Math.sin(this.animTime * walkSpeed + Math.PI) * amp * 0.6;
                    this.armR.rotation.x = Math.sin(this.animTime * walkSpeed) * amp * 0.6;
                }
            }
        }
        else if(this.state === 'move' && this.target && (this.isGrounded || this.type === 'airship')) {
            // Stuck Detection
            const movedDist = this.mesh.position.distanceTo(this.lastPos);
            if(dt > 0.001) {
                if(movedDist < this.moveSpeed * dt * 0.2) {
                    this.stuckTimer += dt;
                    if(this.stuckTimer > 2.0 && this.finalDest) {
                        this.stuckTimer = 0;
                        const isFlying = (this.type === 'airship');
                        const newPath = Pathfinder.findPath(this.mesh.position, this.finalDest, isFlying, this.height);
                        if (newPath) {
                            this.path = newPath;
                            this.pathIndex = 0;
                            if(this.path.length > 0) this.target = this.path[0];
                        }
                    }
                } else {
                    this.stuckTimer = 0;
                }
            }
            this.lastPos.copy(this.mesh.position);

            let dx = this.target.x - this.mesh.position.x;
            let dz = this.target.z - this.mesh.position.z;
            let dist = Math.sqrt(dx*dx + dz*dz);

            // Update Path
            if(dist < 1.0) {
                 this.pathIndex++;
                 if(this.path && this.pathIndex < this.path.length) {
                     this.target = this.path[this.pathIndex];
                     dx = this.target.x - this.mesh.position.x;
                     dz = this.target.z - this.mesh.position.z;
                     dist = Math.sqrt(dx*dx + dz*dz);
                 } else {
                    this.state = 'idle'; this.velocity.set(0,0,0); this.resetAnim();
                    this.targetBoat = null;
                    this.path = [];
                    return;
                 }
            }

            // Check boat entry while moving (allow early entry)
            if(this.targetBoat && this.targetBoat.state !== 'dead') {
                 // 3D distance check, ignore Y difference essentially for trigger
                 const distSq = (this.mesh.position.x - this.targetBoat.mesh.position.x)**2 + (this.mesh.position.z - this.targetBoat.mesh.position.z)**2;
                 if(distSq < 25.0) { // 5.0 distance squared
                     if(this.targetBoat.loadUnit(this)) {
                         this.targetBoat = null;
                         this.state = 'idle'; this.velocity.set(0,0,0);
                         return;
                     }
                 }
            }

            if(true) {
                const dir = new THREE.Vector3(dx, 0, dz).normalize();

                // Slope check
                const nextH = getHeight(this.mesh.position.x + dir.x, this.mesh.position.z + dir.z);
                const dh = nextH - getHeight(this.mesh.position.x, this.mesh.position.z);

                let canMove = true;
                if(this.type !== 'airship') {
                    const currentH = getHeight(this.mesh.position.x, this.mesh.position.z);
                    const safeH = WATER_LEVEL - this.height;
                    if (nextH < safeH && currentH >= safeH) {
                         if(!this.targetBoat) canMove = false;
                    }
                }

                if(canMove) {
                    const slopeFactor = dh > 0 ? (1.0 / (1.0 + dh * 3.0)) : 1.0;
                    const speed = this.moveSpeed * (this.type === 'airship' ? 1.0 : slopeFactor);
                    const targetVelX = dir.x * speed;
                    const targetVelZ = dir.z * speed;
                    this.velocity.x += (targetVelX - this.velocity.x) * 10 * dt;
                    this.velocity.z += (targetVelZ - this.velocity.z) * 10 * dt;

                    const targetRot = Math.atan2(dx, dz);
                    let rotDiff = targetRot - this.mesh.rotation.y;
                    while(rotDiff > Math.PI) rotDiff -= Math.PI*2;
                    while(rotDiff < -Math.PI) rotDiff += Math.PI*2;
                    this.mesh.rotation.y += rotDiff * 10 * dt;
                } else {
                     this.velocity.x *= 0.9; this.velocity.z *= 0.9;
                     if(this.velocity.lengthSq() < 0.1) {
                         this.state = 'idle'; // Stop moving if hit water/stuck
                         this.resetAnim();
                     }
                }
                this.mesh.rotation.x = 0; this.mesh.rotation.z = 0;
                if(this.legL) {
                    const walkSpeed = 10; const amp = 0.8;
                    this.legL.rotation.x = Math.sin(this.animTime * walkSpeed) * amp;
                    this.legR.rotation.x = Math.sin(this.animTime * walkSpeed + Math.PI) * amp;
                    this.armL.rotation.x = Math.sin(this.animTime * walkSpeed + Math.PI) * amp * 0.6;
                    this.armR.rotation.x = Math.sin(this.animTime * walkSpeed) * amp * 0.6;
                    this.torso.position.y = 0.9 + Math.abs(Math.sin(this.animTime * walkSpeed)) * 0.05;
                }
            }
        } else {
            // Idle Check Aggro
            // All unselected units auto aggro
            if (!state.selectedUnits.includes(this)) {
                if (state.clock.getElapsedTime() > this.nextTargetCheck) {
                    this.nextTargetCheck = state.clock.getElapsedTime() + 0.5 + Math.random() * 0.5;
                    const target = this.findTarget();
                    if(target) {
                        this.attackTarget = target;
                        this.state = 'combat';
                    }
                }
            }

            this.resetAnim();
            if(this.torso) {
                this.torso.position.y = 0.9 + Math.sin(this.animTime * 2) * 0.02;
                this.armL.rotation.z = Math.sin(this.animTime) * 0.05 + 0.1;
                this.armR.rotation.z = -Math.sin(this.animTime) * 0.05 - 0.1;
            }
            // Robust upright correction
            this.mesh.rotation.x *= 0.8; this.mesh.rotation.z *= 0.8;
            if(Math.abs(this.mesh.rotation.x) < 0.01) this.mesh.rotation.x = 0;
            if(Math.abs(this.mesh.rotation.z) < 0.01) this.mesh.rotation.z = 0;
        }

        if(this.type === 'firewarrior' && this.state !== 'dead') {
            if(Math.random() < 0.3) {
                 const spawnFire = (limb) => {
                     const pos = new THREE.Vector3();
                     limb.getWorldPosition(pos);
                     pos.y -= 0.2;
                     const p = new Particle(pos.add(new THREE.Vector3((Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2, (Math.random()-0.5)*0.2)), 0xFF4500, 0.1, 0.5);
                     p.vel.set(0, 1, 0);
                     state.particles.push(p);
                 };
                 if(this.armL) spawnFire(this.armL);
                 if(this.armR) spawnFire(this.armR);
            }
        }
    }
    resetAnim() {
        const lerp = 0.1;
        if(this.legL) this.legL.rotation.x += (0 - this.legL.rotation.x) * lerp;
        if(this.legR) this.legR.rotation.x += (0 - this.legR.rotation.x) * lerp;
        if(this.armL) this.armL.rotation.x += (0 - this.armL.rotation.x) * lerp;
        if(this.armR) this.armR.rotation.x += (0 - this.armR.rotation.x) * lerp;
    }

    loadUnit(u) {
        if(this.passengers.length >= this.capacity) return false;
        this.passengers.push(u);
        u.mesh.visible = false;
        u.state = 'transported';
        u.transportedBy = this;
        return true;
    }

    unload() {
        if(!this.passengers.length) return;

        // Unload below airship if safe, or find safe spot
        const r = 5; // Scan larger area
        for(let i=this.passengers.length-1; i>=0; i--) {
            const p = this.passengers[i];
            // Check directly below first
            let tx = this.mesh.position.x;
            let tz = this.mesh.position.z;
            if (getHeight(tx, tz) < WATER_LEVEL) {
                // Try find land in radius
                let found = false;
                for(let dist=1; dist<=r; dist+=1) {
                    for(let angle=0; angle<Math.PI*2; angle+=0.5) {
                        const scanX = this.mesh.position.x + Math.cos(angle)*dist;
                        const scanZ = this.mesh.position.z + Math.sin(angle)*dist;
                        if(getHeight(scanX, scanZ) >= WATER_LEVEL) {
                            tx = scanX; tz = scanZ; found = true; break;
                        }
                    }
                    if(found) break;
                }
                if(!found) continue; // Can't unload this unit safely yet
            }

            p.mesh.position.set(tx, getHeight(tx, tz), tz);
            p.mesh.visible = true;
            p.state = 'idle';
            p.transportedBy = null;
            this.passengers.splice(i, 1);
            spawnPulse(tx, p.mesh.position.y, tz, 0xFFFFFF);
        }
    }
}
