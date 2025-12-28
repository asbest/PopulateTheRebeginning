
const THREE = {
    Vector3: class {
        constructor(x, y, z) { this.x = x; this.y = y; this.z = z; }
        distanceTo(v) { return Math.sqrt((this.x-v.x)**2 + (this.y-v.y)**2 + (this.z-v.z)**2); }
    },
    Group: class { constructor() { this.position = new THREE.Vector3(0,0,0); } }
};

const buildings = [];
const units = [];

// Mock Building
function createBuilding(x, z, faction) {
    const b = {
        mesh: new THREE.Group(),
        faction: faction,
        dead: false
    };
    b.mesh.position.x = x;
    b.mesh.position.z = z;
    buildings.push(b);
}

// Mock Unit
class Unit {
    constructor(faction) {
        this.faction = faction;
        this.hp = 50;
        this.maxHp = 100;
        this.state = 'idle';
        this.mesh = new THREE.Group();
        this.hpBar = { scale: { x: 0.5 } };
    }

    update(dt) {
        if(this.hp < this.maxHp && this.state !== 'combat') {
            let nearBuilding = false;
            for(let b of buildings) {
                if(b.faction === this.faction && !b.dead) {
                    const dist = this.mesh.position.distanceTo(b.mesh.position);
                    if(dist < 8.0) {
                        nearBuilding = true;
                        break;
                    }
                }
            }
            if(nearBuilding) {
                const oldHp = this.hp;
                this.hp += dt * 5;
                if(this.hp > this.maxHp) this.hp = this.maxHp;
                console.log(`Healed: ${oldHp.toFixed(2)} -> ${this.hp.toFixed(2)}`);
            } else {
                console.log('Not near building');
            }
        }
    }
}

// Test Scenario
console.log('--- Test 1: Unit near friendly building ---');
createBuilding(0, 0, 0); // Player building at 0,0
const u1 = new Unit(0);
u1.mesh.position.x = 2; u1.mesh.position.z = 2; // Distance sqrt(8) ~ 2.82 < 8
u1.update(1.0);

console.log('--- Test 2: Unit far from friendly building ---');
const u2 = new Unit(0);
u2.mesh.position.x = 20; u2.mesh.position.z = 20; // Far
u2.update(1.0);

console.log('--- Test 3: Unit near enemy building ---');
createBuilding(10, 10, 1); // Enemy building
const u3 = new Unit(0);
u3.mesh.position.x = 12; u3.mesh.position.z = 12; // Near enemy
u3.update(1.0);

console.log('--- Test 4: Combat unit ---');
const u4 = new Unit(0);
u4.mesh.position.x = 2; u4.mesh.position.z = 2;
u4.state = 'combat';
u4.update(1.0);
