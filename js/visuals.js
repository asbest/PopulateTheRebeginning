import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { state } from './state.js';
import { AssetCache, getBasicMaterial } from './assets.js';
import { getHeight } from './utils.js';

export class Particle {
    constructor(pos, color, size, life, gravity = 20) {
        this.mesh = new THREE.Mesh(AssetCache.geos.particle, getBasicMaterial(color));
        this.mesh.position.copy(pos);
        this.mesh.scale.set(size, size, size);
        this.vel = new THREE.Vector3((Math.random()-0.5)*10, Math.random()*10+5, (Math.random()-0.5)*10);
        this.life = life; this.gravity = gravity;
        state.scene.add(this.mesh);
    }
    update(dt) {
        this.vel.y -= this.gravity * dt; this.mesh.position.addScaledVector(this.vel, dt);
        this.mesh.rotation.x += dt*2; this.mesh.rotation.y += dt*2; this.life -= dt;
        const h = getHeight(this.mesh.position.x, this.mesh.position.z);
        if(this.mesh.position.y < h) { this.mesh.position.y = h; this.vel.y *= -0.5; this.vel.x *= 0.8; this.vel.z *= 0.8; }
        if(this.life <= 0) { state.scene.remove(this.mesh); return false; } return true;
    }
}

export const CloudManager = {
    clouds: [],
    init: function() {
        for(let i=0; i<15; i++) {
            this.spawnCloud(true);
        }
    },
    spawnCloud: function(randomPos=false) {
        const group = new THREE.Group();
        const chunks = 3 + Math.random() * 5;
        const mat = new THREE.MeshLambertMaterial({color: 0xFFFFFF, transparent: true, opacity: 0.85, flatShading: false});

        for(let j=0; j<chunks; j++) {
            const size = 2 + Math.random() * 3;
            const mesh = new THREE.Mesh(AssetCache.geos.cloud, mat);
            mesh.scale.set(size, size, size);
            mesh.position.set((Math.random()-0.5)*10, (Math.random()-0.5)*2, (Math.random()-0.5)*6);
            group.add(mesh);
        }

        let x, z;
        if(randomPos) {
            x = (Math.random() - 0.5) * 400;
            z = (Math.random() - 0.5) * 400;
        } else {
            x = -200 - Math.random() * 50; // Start far left
            z = (Math.random() - 0.5) * 400;
        }
        const y = 30 + Math.random() * 15;

        group.position.set(x, y, z);
        group.scale.setScalar(1.5 + Math.random());

        state.scene.add(group);
        this.clouds.push({ mesh: group, speed: 1 + Math.random() * 2 });
    },
    update: function(dt) {
        for(let i = this.clouds.length - 1; i >= 0; i--) {
            const c = this.clouds[i];
            c.mesh.position.x += c.speed * dt;
            if(c.mesh.position.x > 250) {
                 state.scene.remove(c.mesh);
                 this.clouds.splice(i, 1);
                 this.spawnCloud();
            }
        }
    }
};

export function spawnExplosion(x, y, z, color, count) { for(let i=0; i<count; i++) state.particles.push(new Particle(new THREE.Vector3(x, y, z), color, 0.1+Math.random()*0.1, 1.0+Math.random())); }
export function spawnPulse(x, y, z, color) { state.particles.push(new Particle(new THREE.Vector3(x, y+0.5, z), color, 0.05, 0.5)); }
export function spawnHealing(x, y, z) {
    const p = new Particle(new THREE.Vector3(x, y, z), 0x00FF00, 0.1, 1.0, -2);
    p.vel.set((Math.random()-0.5)*2, 1.0, (Math.random()-0.5)*2);
    state.particles.push(p);
}
