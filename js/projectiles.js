import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { state } from './state.js';
import { getHeight, burnTreesAt } from './terrain.js';
import { spawnExplosion, Particle } from './visuals.js';
import { SoundManager } from './audio.js';

export class Fireball {
    constructor(start, end, faction) {
        this.mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 8), new THREE.MeshBasicMaterial({color: 0xFF4500}));
        this.mesh.position.copy(start); this.target = end; this.dir = end.clone().sub(start).normalize();
        this.faction = faction;
        this.speed = 25; this.active = true; this.trailTimer = 0;
        state.scene.add(this.mesh);
    }
    update(dt) {
        if(!this.active) return false;
        const moveDist = this.speed * dt;
        const distToTarget = this.mesh.position.distanceTo(this.target);

        if (distToTarget <= moveDist || getHeight(this.mesh.position.x, this.mesh.position.z) > this.mesh.position.y) {
             this.mesh.position.copy(this.target); // Snap to target for visual
             this.explode();
             return false;
        }

        this.mesh.position.addScaledVector(this.dir, moveDist); this.trailTimer += dt;
        if(this.trailTimer > 0.05) {
            state.particles.push(new Particle(this.mesh.position, 0xFFA500, 0.05, 0.5));
            this.trailTimer = 0;
        }
        return true;
    }
    explode() {
        state.scene.remove(this.mesh); this.active = false;
        spawnExplosion(this.mesh.position.x, this.mesh.position.y, this.mesh.position.z, 0xFF4500, 20);
        SoundManager.playSound('explosion');
        const impactPos = this.mesh.position;
        burnTreesAt(impactPos.x, impactPos.z, 8); // Burn trees
        // Units
        state.units.forEach(u => {
            const d = u.mesh.position.distanceTo(impactPos);
            if(d < 8) {
                if (u.faction !== this.faction) {
                    const forceDir = u.mesh.position.clone().sub(impactPos).normalize(); const force = (8 - d) * 3;
                    forceDir.multiplyScalar(force); forceDir.y += force * 0.5;
                    u.applyForce(forceDir); u.takeDamage(27);
                }
            }
        });
        // Buildings
        state.buildings.forEach(b => {
            const d = b.mesh.position.distanceTo(impactPos);
            if(d < 8 && b.faction !== this.faction) {
                b.takeDamage(75); // Fireball deals 75 damage to buildings
            }
        });
    }
}
