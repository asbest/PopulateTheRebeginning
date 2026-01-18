import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { COLORS } from './constants.js';

export const MaterialCache = new Map();

export function getBasicMaterial(color) {
    if (!MaterialCache.has(color)) {
        MaterialCache.set(color, new THREE.MeshBasicMaterial({color: color}));
    }
    return MaterialCache.get(color);
}

export const AssetCache = {
    geos: {
        particle: new THREE.BoxGeometry(1, 1, 1),
        cloud: new THREE.DodecahedronGeometry(1, 1),
        ring: new THREE.RingGeometry(0.5, 0.6, 16),
        hpBack: new THREE.PlaneGeometry(1.0, 0.15),
        hpFront: new THREE.PlaneGeometry(1.0, 0.15).translate(0.5, 0, 0),
        marker: new THREE.ConeGeometry(0.3, 1.0, 4).rotateX(Math.PI),
        torso: new THREE.BoxGeometry(0.4, 0.5, 0.25),
        head: new THREE.BoxGeometry(0.25, 0.3, 0.3),
        arm: new THREE.BoxGeometry(0.12, 0.45, 0.12),
        leg: new THREE.BoxGeometry(0.13, 0.55, 0.13),
        airshipBasket: new THREE.BoxGeometry(2, 1, 3),
        airshipRope: new THREE.CylinderGeometry(0.05, 0.05, 3),
        airshipBalloon: new THREE.SphereGeometry(2.5, 16, 16),
        shamanMask: new THREE.BoxGeometry(0.3, 0.35, 0.1),
        shamanHorn: new THREE.ConeGeometry(0.04, 0.3, 4),
        cape: new THREE.BoxGeometry(0.4, 0.6, 0.05),
        backpack: new THREE.BoxGeometry(0.3, 0.3, 0.15),
        warriorHelm: new THREE.SphereGeometry(0.22, 8, 8, 0, Math.PI * 2, 0, Math.PI/2),
        warriorCrest: new THREE.BoxGeometry(0.05, 0.15, 0.3),
        fireMask: new THREE.BoxGeometry(0.25, 0.25, 0.1),
        fireEye: new THREE.SphereGeometry(0.03, 4, 4),
        spyHood: new THREE.ConeGeometry(0.25, 0.4, 4),
        sword: new THREE.BoxGeometry(0.05, 0.6, 0.1),
        shield: new THREE.CylinderGeometry(0.25, 0.25, 0.05, 8),
        tool: new THREE.BoxGeometry(0.05, 0.4, 0.05)
    },
    mats: {
        skin: new THREE.MeshLambertMaterial({color: COLORS.skin}),
        blueShirt: new THREE.MeshLambertMaterial({color: COLORS.blue}),
        redShirt: new THREE.MeshLambertMaterial({color: COLORS.red}),
        hpBack: new THREE.MeshBasicMaterial({color: 0x880000}),
        hpGreen: new THREE.MeshBasicMaterial({color: 0x00FF00}),
        hpRed: new THREE.MeshBasicMaterial({color: 0xFF0000}),
        selectRing: new THREE.MeshBasicMaterial({color: 0x00FF00, side: THREE.DoubleSide}),
        marker: new THREE.MeshBasicMaterial({color: 0xFF0000})
    }
};
