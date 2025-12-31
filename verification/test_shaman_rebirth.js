const THREE = {
    Vector3: class {
        constructor(x=0,y=0,z=0) { this.x=x; this.y=y; this.z=z; }
        distanceTo(v) { return Math.sqrt((this.x-v.x)**2 + (this.z-v.z)**2); }
    },
    Group: class { constructor() { this.position = new THREE.Vector3(); } },
    Mesh: class { constructor() { this.position = new THREE.Vector3(); } }
};

// Mock globals
global.window = {};
global.alert = (msg) => console.log("ALERT:", msg);
global.SoundManager = { playSound: () => {} };
global.units = [];
global.shaman = null;
global.createShaman = (x, z) => {
    // console.log(`Creating new shaman at ${x}, ${z}`);
    const newShaman = {
        state: 'idle',
        mesh: { position: new THREE.Vector3(x, 0, z) },
        type: 'shaman',
        faction: 0
    };
    global.shaman = newShaman;
    global.units.push(newShaman);
};

// Simulation state
let gameOverShown = false;

function simulateFrame(dt) {
    if (global.shaman && global.shaman.state === 'dead') {
         if (!global.shaman.respawnPending) {
             global.shaman.respawnPending = true;
             global.shaman.respawnTimer = 3.0;
         } else {
             global.shaman.respawnTimer -= dt;
             if (global.shaman.respawnTimer <= 0) {
                 const braves = global.units.filter(u => u.faction === 0 && u.type === 'wild' && u.state !== 'dead');
                 if (braves.length > 0) {
                     const brave = braves[Math.floor(Math.random() * braves.length)];
                     console.log("Respawning shaman near brave");
                     global.createShaman(brave.mesh.position.x, brave.mesh.position.z);
                 } else {
                     if(!gameOverShown) {
                         global.alert("GAME OVER - Shaman dead and no followers left.");
                         gameOverShown = true;
                     }
                 }
                 global.shaman.respawnTimer = 100000;
             }
         }
    }
}

// Test Case 1: Rebirth with Braves
console.log("--- Test Case 1: Rebirth with Braves ---");
global.units = [];
global.createShaman(0,0);
global.units.push({ faction: 0, type: 'wild', state: 'idle', mesh: { position: new THREE.Vector3(10, 0, 10) } }); // Brave 1
global.shaman.state = 'dead'; // Kill Shaman

for(let i=0; i<40; i++) { // Run for 4 seconds (0.1s steps)
    simulateFrame(0.1);
}

if(global.shaman.state === 'idle' && global.shaman.mesh.position.x === 10) {
    console.log("PASS: Shaman reborn at brave location.");
} else {
    console.log("FAIL: Shaman state:", global.shaman.state, "Position:", global.shaman.mesh.position);
}

// Test Case 2: Game Over (No Braves)
console.log("\n--- Test Case 2: Game Over (No Braves) ---");
global.units = [];
gameOverShown = false;
global.createShaman(0,0);
global.shaman.state = 'dead'; // Kill Shaman

for(let i=0; i<40; i++) {
    simulateFrame(0.1);
}
// Expect alert output above
if(gameOverShown) {
    console.log("PASS: Game Over triggered.");
} else {
    console.log("FAIL: Game Over not triggered.");
}
