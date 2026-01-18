import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { state, SpatialHash } from './state.js';
import { CHUNK_SIZE, CHUNK_RES, RENDER_DISTANCE, NOISE_SCALE, MIN_ZOOM, MAX_ZOOM, WATER_LEVEL, VISUAL_WATER_LEVEL, COLORS, BUILDING_COSTS } from './constants.js';
import { SoundManager } from './audio.js';
import { updateUI, updateUnitList, updateUnitListSelection, updateContextMenus, selectAction, setupJoystick, setupKeyboard, setupCheats, performAction } from './ui.js';
import { CloudManager, spawnPulse, spawnHealing, spawnExplosion, Particle } from './visuals.js';
import { updateChunks, initTerrainResources, getBaseHeight, getHeight, createChunk, burnTreesAt, modifyTerrain } from './terrain.js';
import { EnemyAI } from './ai.js';
import { Humanoid } from './humanoid.js';
import { Pathfinder } from './pathfinder.js';
import { createBuilding } from './building.js';
import { mulberry32, findNearestLand } from './utils.js';
import { Fireball } from './projectiles.js';
import { Volcano, Swamp, Tornado, Swarm, Firestorm } from './spells.js';

if(typeof SimplexNoise !== 'undefined') {
    state.simplex = new SimplexNoise(mulberry32(12345));
} else if (window.SimplexNoise) {
    state.simplex = new window.SimplexNoise(mulberry32(12345));
} else {
    console.warn("SimplexNoise missing, using fallback");
    state.simplex = { noise2D: (x,y) => Math.sin(x)*Math.cos(y) };
}

window.onload = () => setTimeout(init, 100);

const enemyAI = new EnemyAI();

function init() {
    try {
        const loadingEl = document.getElementById('loading');
        if(loadingEl) loadingEl.style.display = 'none';

        state.clock = new THREE.Clock();
        state.cameraLookAt = new THREE.Vector3(0, 0, 0);

        state.rangeRing = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true), new THREE.MeshBasicMaterial({color: 0xFFFFFF, transparent: true, opacity: 0.15, side: THREE.DoubleSide, depthWrite: false}));
        state.rangeRing.visible = false;

        initTerrainResources();

        state.scene = new THREE.Scene();
        state.scene.background = new THREE.Color(0x87CEEB);
        state.scene.fog = new THREE.Fog(0x87CEEB, 20, 150);

        const aspect = window.innerWidth / window.innerHeight;
        state.orthoCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, -500, 1000);
        state.perspectiveCamera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
        state.camera = state.orthoCamera;
        updateCameraZoom();

        state.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
        state.renderer.setSize(window.innerWidth, window.innerHeight);
        state.renderer.shadowMap.enabled = true;
        state.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        document.body.appendChild(state.renderer.domElement);

        const amb = new THREE.AmbientLight(0xffffff, 0.6);
        state.scene.add(amb);
        state.scene.add(state.rangeRing);
        const sun = new THREE.DirectionalLight(0xffffff, 0.7);
        sun.position.set(50, 100, 40);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 1024; sun.shadow.mapSize.height = 1024;
        sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
        sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
        sun.shadow.bias = -0.0005;
        state.scene.add(sun);

        state.raycaster = new THREE.Raycaster();

        findSafeSpawnAndStart();

        const c = state.renderer.domElement;
        c.addEventListener('mousedown', onPointerDown);
        window.addEventListener('mousemove', onPointerMove);
        window.addEventListener('mouseup', onPointerUp);
        c.addEventListener('touchstart', onTouchStart, {passive: false});
        window.addEventListener('touchmove', onTouchMove, {passive: false});
        window.addEventListener('touchend', onPointerUp);
        c.addEventListener('wheel', onWheel, {passive: false});
        window.addEventListener('resize', onResize);

        setupJoystick();
        setupKeyboard();
        setupCheats();
        selectAction('move');
        updateContextMenus();
        CloudManager.init();

        window.addEventListener('contextmenu', e => e.preventDefault());

        animate();
    } catch(e) {
        console.error("Init failed:", e);
        alert("Game failed to start: " + e.message);
    }
}

window.togglePause = function() {
    state.isPaused = !state.isPaused;
    const btn = document.getElementById('btn-pause');
    if(btn) btn.innerText = state.isPaused ? '▶️' : '⏸️';
    const menu = document.getElementById('pause-menu');
    if(menu) menu.style.display = state.isPaused ? 'flex' : 'none';
}

window.newGame = function() {
    if(confirm("Are you sure? Unsaved progress will be lost.")) {
        location.reload();
    }
}

window.saveGame = function() {
    const data = {
        mana: state.mana,
        terrainMods: Array.from(state.terrainMods.entries()),
        cameraLookAt: {x: state.cameraLookAt.x, y: state.cameraLookAt.y, z: state.cameraLookAt.z},
        enemyAI: {
            timer: enemyAI.timer,
            state: enemyAI.state,
            baseX: enemyAI.baseX,
            baseZ: enemyAI.baseZ,
            lastBridgeTime: enemyAI.lastBridgeTime,
            lastSpellTime: enemyAI.lastSpellTime
        },
        units: state.units.map(u => ({
            faction: u.faction,
            type: u.type,
            x: u.mesh.position.x,
            z: u.mesh.position.z,
            hp: u.hp,
            state: u.state,
            dead: u.state === 'dead',
            deathTimer: u.deathTimer,
            conversionTimer: u.conversionTimer,
            originalFaction: u.originalFaction,
            passengers: (u.passengers || []).map(p => ({
                faction: p.faction, type: p.type, hp: p.hp
            }))
        })),
        buildings: state.buildings.map(b => ({
            type: b.type,
            faction: b.faction,
            x: b.mesh.position.x,
            z: b.mesh.position.z,
            hp: b.hp,
            constructionTimer: b.constructionTimer,
            underConstruction: b.underConstruction
        }))
    };
    localStorage.setItem('populous_save', JSON.stringify(data));
    alert('Game Saved!');
}

window.loadGame = function() {
    const json = localStorage.getItem('populous_save');
    if(!json) { alert("No save found!"); return; }

    try {
        const data = JSON.parse(json);

        state.units.forEach(u => state.scene.remove(u.mesh));
        state.units.length = 0;
        state.buildings.forEach(b => state.scene.remove(b.mesh));
        state.buildings.length = 0;
        state.activeEffects.forEach(e => { if(e.mesh) state.scene.remove(e.mesh); });
        state.activeEffects.length = 0;
        state.projectiles.forEach(p => state.scene.remove(p.mesh));
        state.projectiles.length = 0;
        state.particles.forEach(p => state.scene.remove(p.mesh));
        state.particles.length = 0;
        state.selectedUnits = [];

        state.mana = data.mana;
        updateUI();

        state.cameraLookAt.set(data.cameraLookAt.x, data.cameraLookAt.y, data.cameraLookAt.z);
        updateCameraPosition();

        state.terrainMods.clear();
        const allMods = new Set();
        data.terrainMods.forEach(([k, v]) => {
            state.terrainMods.set(k, v);
            const [ix, iz] = k.split(',').map(Number);
            const cx = Math.round(ix / CHUNK_SIZE);
            const cz = Math.round(iz / CHUNK_SIZE);
            allMods.add(`${cx},${cz}`);
        });
        updateChunks(true, allMods);

        enemyAI.timer = data.enemyAI.timer || 0;
        enemyAI.state = data.enemyAI.state || 'build';
        enemyAI.baseX = data.enemyAI.baseX || 0;
        enemyAI.baseZ = data.enemyAI.baseZ || 0;
        enemyAI.lastBridgeTime = data.enemyAI.lastBridgeTime || 0;
        enemyAI.lastSpellTime = data.enemyAI.lastSpellTime || 0;

        data.buildings.forEach(bData => {
             createBuilding(bData.type, bData.x, bData.z, bData.faction, false);
             const b = state.buildings[state.buildings.length - 1];
             b.hp = bData.hp;
             b.constructionTimer = bData.constructionTimer;
             b.underConstruction = bData.underConstruction;
             b.hpBar.scale.x = Math.max(0, b.hp / b.maxHp);
             if(b.underConstruction) {
                 const progress = 1.0 - (b.constructionTimer / b.totalBuildTime);
                 b.visualMesh.scale.y = Math.max(0.01, progress);
             }
        });

        data.units.forEach(uData => {
            if(uData.dead) return;
            const u = new Humanoid(uData.faction, uData.type, uData.x, uData.z);
            u.hp = uData.hp;
            u.state = uData.state === 'dead' ? 'idle' : uData.state;
            u.hpBar.scale.x = Math.max(0, u.hp / u.maxHp);
            if (uData.conversionTimer !== undefined) u.conversionTimer = uData.conversionTimer;
            if (uData.originalFaction !== undefined) u.originalFaction = uData.originalFaction;
            state.units.push(u);
            if(u.isShaman && u.faction === 0) state.shaman = u;

            if(uData.passengers && uData.passengers.length > 0) {
                uData.passengers.forEach(pData => {
                    const p = new Humanoid(pData.faction, pData.type, uData.x, uData.z);
                    p.hp = pData.hp;
                    state.units.push(p);
                    u.loadUnit(p);
                });
            }
        });

        togglePause();
        alert("Game Loaded!");
    } catch(e) {
        console.error(e);
        alert("Failed to load save: " + e.message);
    }
}

function onPointerDown(e) {
    SoundManager.init();
    if(SoundManager.ctx.state === 'suspended') SoundManager.ctx.resume();
    state.isDragging = true;
    state.dragStart = {x: e.clientX, y: e.clientY};
    state.tapStart = {x: e.clientX, y: e.clientY};
    state.dragButton = e.button || 0;
}

function onTouchStart(e) {
    e.preventDefault();
    if(e.targetTouches.length === 1) onPointerDown(e.targetTouches[0]);
    else if(e.targetTouches.length === 2) {
        SoundManager.init();
        if(SoundManager.ctx.state === 'suspended') SoundManager.ctx.resume();
        state.isDragging = false;
        const dx = e.targetTouches[0].clientX - e.targetTouches[1].clientX;
        const dy = e.targetTouches[0].clientY - e.targetTouches[1].clientY;
        state.pinchStartDist = Math.sqrt(dx*dx+dy*dy);
        state.pinchStartScale = state.viewScale;
        state.pinchStartAngle = Math.atan2(dy, dx);
        state.rotateStartCamera = state.cameraRotation;
    }
}

function onPointerMove(e) {
    if(!state.isDragging) return;
    const dx = e.clientX - state.dragStart.x;
    const dy = e.clientY - state.dragStart.y;

    if (state.dragButton === 2) {
         if(state.isFPV) {
             const speed = 0.005;
             state.fpvYaw -= dx * speed;
             state.fpvPitch -= dy * speed;
             state.fpvPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, state.fpvPitch));
             updateCameraPosition();
         } else {
             const speed = 0.005;
             state.cameraRotation += dx * speed;
             updateCameraPosition();
         }
    } else {
         if(state.isFPV) {
             const speed = 0.005;
             state.fpvYaw -= dx * speed;
             state.fpvPitch -= dy * speed;
             state.fpvPitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, state.fpvPitch));
             updateCameraPosition();
         } else {
             const fwd = new THREE.Vector3(); state.camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
             const rgt = new THREE.Vector3(); rgt.crossVectors(fwd, state.camera.up); rgt.y = 0; rgt.normalize();
             const speed = 0.002 * state.viewScale;
             state.cameraLookAt.addScaledVector(rgt, -dx * speed);
             state.cameraLookAt.addScaledVector(fwd, dy * speed);
             updateCameraPosition();
         }
    }
    state.dragStart = {x: e.clientX, y: e.clientY};
}

function onTouchMove(e) {
    if (e.target !== state.renderer.domElement) return;
    if(e.targetTouches.length === 1) {
        e.preventDefault();
        onPointerMove(e.targetTouches[0]);
    } else if(e.targetTouches.length === 2) {
        e.preventDefault();
        const dx = e.targetTouches[0].clientX - e.targetTouches[1].clientX;
        const dy = e.targetTouches[0].clientY - e.targetTouches[1].clientY;

        const dist = Math.sqrt(dx*dx+dy*dy);
        if(state.pinchStartDist > 0) {
            const newScale = state.pinchStartScale * (state.pinchStartDist / dist);
            if(state.isFPV) {
                 if(newScale > MIN_ZOOM + 2) {
                     state.isFPV = false; state.camera = state.orthoCamera;
                     state.viewScale = MIN_ZOOM + 1;
                 }
            } else {
                state.viewScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newScale));
                if (state.viewScale <= MIN_ZOOM && state.selectedUnits.length > 0) {
                     state.isFPV = true; state.camera = state.perspectiveCamera;
                     state.fpvYaw = state.cameraRotation + Math.PI; state.fpvPitch = -0.2;
                }
            }
        }

        const currentAngle = Math.atan2(dy, dx);
        const delta = currentAngle - state.pinchStartAngle;
        if(!state.isFPV) {
            state.cameraRotation = state.rotateStartCamera + delta;
        } else {
            state.fpvYaw = state.rotateStartCamera + delta;
        }

        updateCameraZoom();
        updateCameraPosition();
    }
}

function onPointerUp(e) {
    if (e.type === 'touchend' && e.target !== state.renderer.domElement) return;
    state.isDragging = false;
    let x = e.clientX || (e.changedTouches ? e.changedTouches[0].clientX : 0);
    let y = e.clientY || (e.changedTouches ? e.changedTouches[0].clientY : 0);
    if(Math.sqrt((x-state.tapStart.x)**2 + (y-state.tapStart.y)**2) < 10) handleTap(x, y, e.button === 2);
}

function handleTap(x, y, isRightClick) {
    const mouse = new THREE.Vector2((x/window.innerWidth)*2-1, -(y/window.innerHeight)*2+1);
    state.raycaster.setFromCamera(mouse, state.camera);

    const meshes = [];
    for(let k in state.chunks) meshes.push(state.chunks[k].children[0]);
    const terrainHits = state.raycaster.intersectObjects(meshes);

    const unitMeshes = [];
    const meshToUnit = new Map();
    state.units.forEach(u => {
        if(u.state !== 'dead') {
            u.mesh.traverse(c => {
                 if(c.isMesh) {
                     unitMeshes.push(c);
                     meshToUnit.set(c, u);
                 }
            });
        }
    });
    const unitHits = state.raycaster.intersectObjects(unitMeshes);

    let action = state.currentAction;
    if(isRightClick) action = 'move';

    if (action === 'select') {
        if (unitHits.length > 0) {
            const hitUnit = meshToUnit.get(unitHits[0].object);
            if(hitUnit) {
                if(hitUnit.faction === 0) {
                    if(state.multiSelectMode) {
                        if(state.selectedUnits.includes(hitUnit)) {
                             state.selectedUnits = state.selectedUnits.filter(x => x !== hitUnit);
                             hitUnit.selectRing.visible = false;
                        } else {
                             state.selectedUnits.push(hitUnit);
                             hitUnit.selectRing.visible = true;
                        }
                    } else {
                        state.selectedUnits.forEach(u => u.selectRing.visible = false);
                        state.selectedUnits = [hitUnit];
                        hitUnit.selectRing.visible = true;
                    }
                    updateContextMenus();
                    return;
                }
            }
        }

        if(terrainHits.length > 0 && !state.multiSelectMode) {
            state.selectedUnits.forEach(u => u.selectRing.visible = false);
            state.selectedUnits = [];
            updateContextMenus();
        }
    } else {
        if(action === 'move' && unitHits.length > 0) {
             const hitUnit = meshToUnit.get(unitHits[0].object);

             if(hitUnit && hitUnit.type === 'airship' && hitUnit.faction === 0) {
                 if(state.selectedUnits.length > 0) {
                     state.selectedUnits.forEach(u => {
                         if(u.type !== 'airship' && !u.isShaman) {
                             u.goto(hitUnit.mesh.position.x, hitUnit.mesh.position.z);
                             u.targetBoat = hitUnit;
                         }
                     });
                     spawnPulse(hitUnit.mesh.position.x, hitUnit.mesh.position.y, hitUnit.mesh.position.z, 0x00FF00);
                     return;
                 }
             }

             if(hitUnit && hitUnit.faction === 1) {
                 if(state.selectedUnits.length > 0) {
                    state.selectedUnits.forEach(u => {
                        if(!u.isShaman) {
                            u.attackTarget = hitUnit;
                            u.state = 'combat';
                        }
                    });
                    spawnPulse(hitUnit.mesh.position.x, hitUnit.mesh.position.y, hitUnit.mesh.position.z, 0xFF0000);
                    return;
                }
             }
        }

        if(terrainHits.length > 0) {
             performAction(terrainHits[0].point.x, terrainHits[0].point.z, action);
        }
    }
}

function onWheel(e) {
    if(state.isFPV) {
        if(e.deltaY > 0) {
            state.isFPV = false;
            state.camera = state.orthoCamera;
            state.viewScale = MIN_ZOOM + 1;
            updateCameraZoom();
            updateCameraPosition();
        }
    } else {
        if (state.viewScale <= MIN_ZOOM && e.deltaY < 0 && state.selectedUnits.length > 0) {
             state.isFPV = true;
             state.camera = state.perspectiveCamera;
             state.fpvYaw = state.cameraRotation + Math.PI;
             state.fpvPitch = -0.2;
             updateCameraPosition();
        } else {
            state.viewScale = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, state.viewScale + e.deltaY * 0.05));
            updateCameraZoom();
            updateCameraPosition();
        }
    }
}

function updateCameraZoom() {
    const aspect = window.innerWidth / window.innerHeight;
    state.orthoCamera.left = -state.viewScale*aspect;
    state.orthoCamera.right = state.viewScale*aspect;
    state.orthoCamera.top = state.viewScale;
    state.orthoCamera.bottom = -state.viewScale;
    state.orthoCamera.updateProjectionMatrix();

    state.perspectiveCamera.aspect = aspect;
    state.perspectiveCamera.updateProjectionMatrix();
}

function updateCameraPosition() {
    if(state.isFPV) {
         if(state.selectedUnits.length === 0 || state.selectedUnits[0].state === 'dead') {
             state.isFPV = false; state.camera = state.orthoCamera;
         } else {
             const u = state.selectedUnits[0];
             const headH = (u.isShaman ? 2.1 : 1.4);
             const pos = u.mesh.position.clone().add(new THREE.Vector3(0, headH, 0));

             const offsetDist = 0.5;
             pos.x -= Math.sin(state.fpvYaw) * offsetDist;
             pos.z -= Math.cos(state.fpvYaw) * offsetDist;

             state.perspectiveCamera.position.copy(pos);
             state.perspectiveCamera.rotation.set(state.fpvPitch, state.fpvYaw, 0, 'YXZ');
         }
    }

    if(!state.isFPV) {
        const dist = 42.4;
        const offsetX = Math.sin(state.cameraRotation) * dist;
        const offsetZ = Math.cos(state.cameraRotation) * dist;
        const targetX = state.cameraLookAt.x + offsetX;
        const targetZ = state.cameraLookAt.z + offsetZ;
        let targetY = 25 + (state.viewScale / MAX_ZOOM) * 35;
        const groundUnderCamera = getHeight(targetX, targetZ);
        if(targetY < groundUnderCamera + 5) { targetY = groundUnderCamera + 5; }
        state.orthoCamera.position.set(targetX, targetY, targetZ);
        state.orthoCamera.lookAt(state.cameraLookAt);
    }
}

function onResize() { updateCameraZoom(); state.renderer.setSize(window.innerWidth, window.innerHeight); }

function findSafeSpawnAndStart() {
    let r = 0; let found = false;
    for(let i=0; i<50; i++) { if(getHeight(r, r) > 2.5) { found = true; break; } r += 20; }
    if(!found) r = 0;
    state.cameraLookAt.set(r, 0, r); updateCameraPosition(); updateChunks();
    createShaman(r, r);

    enemyAI.init(-r - 40, -r - 40);
}

function createShaman(x, z) {
    const safe = findNearestLand(x, z);
    state.shaman = new Humanoid(0, 'shaman', safe.x, safe.z);
    state.units.push(state.shaman);
}

let lastAliveCount = -1;

function animate() {
    requestAnimationFrame(animate); const dt = Math.min(state.clock.getDelta(), 0.1);

    if(!state.isPaused) {
    SpatialHash.update();
    CloudManager.update(dt);

    const inputVector = state.joystickVector.clone().add(state.keyboardVector).clampLength(0, 1);
    if(inputVector.lengthSq() > 0.001 && state.selectedUnits.length > 0) {
         const camDir = new THREE.Vector3();
         state.camera.getWorldDirection(camDir);
         camDir.y = 0; camDir.normalize();
         const camRight = new THREE.Vector3().crossVectors(camDir, new THREE.Vector3(0,1,0)).normalize();

         const moveDir = camDir.clone().multiplyScalar(-inputVector.y)
            .add(camRight.clone().multiplyScalar(inputVector.x));
         moveDir.normalize();

         state.selectedUnits.forEach(u => u.manualMove(moveDir));
    }

    const playerBraves = state.units.filter(u => u.faction === 0 && u.type === 'wild').length;
    const playerHouses = state.buildings.filter(b => b.faction === 0 && b.type === 'hut' && !b.underConstruction).length;
    const manaRate = 1.0 + (playerBraves * 0.2) + (playerHouses * 0.2);

    if (isNaN(state.mana)) state.mana = 0;
    if(state.mana < 100) { state.mana += dt * manaRate; if(isNaN(state.mana)) state.mana = 0; updateUI(); }

    if(state.chunkWaterMat && state.chunkWaterMat.uniforms) state.chunkWaterMat.uniforms.time.value += dt;
    }

    if (state.shaman && state.shaman.state !== 'dead') {
        const spells = ['blast', 'lightning', 'raise', 'lower', 'flatten', 'landbridge', 'swamp', 'invisibility', 'shield', 'hypnotise', 'swarm', 'tornado', 'firestorm', 'volcano', 'heal', 'create'];
        if (spells.includes(state.currentAction)) {
            state.rangeRing.visible = true;
            if (state.cheatUnlimitedRange) {
                state.rangeRing.scale.set(1000, 1, 1000);
            } else {
                const r = 10.0 + state.shaman.mesh.position.y;
                state.rangeRing.scale.set(r, 60, r);
            }
            state.rangeRing.position.set(state.shaman.mesh.position.x, state.shaman.mesh.position.y - 30, state.shaman.mesh.position.z);
        } else {
            state.rangeRing.visible = false;
        }
    } else {
        state.rangeRing.visible = false;
    }

    updateChunks();
    if(!state.isPaused) {
    enemyAI.update(dt);
    state.units.forEach(u => u.update(dt));
    state.buildings.forEach(b => b.update(dt));

    const inputVector = state.joystickVector.clone().add(state.keyboardVector).clampLength(0, 1);
    if(inputVector.lengthSq() > 0.001 && state.selectedUnits.length > 0) {
        const center = new THREE.Vector3();
        state.selectedUnits.forEach(u => center.add(u.mesh.position));
        center.divideScalar(state.selectedUnits.length);
        state.cameraLookAt.lerp(center, dt * 5.0);
        updateCameraPosition();
    }

    if(state.isFPV) updateCameraPosition();

    for(let i = state.activeEffects.length-1; i>=0; i--) {
        if(!state.activeEffects[i].update(dt)) state.activeEffects.splice(i, 1);
    }

    for(let i = state.buildings.length-1; i>=0; i--) { if(state.buildings[i].dead) state.buildings.splice(i, 1); }

    for(let i = state.units.length-1; i>=0; i--) {
        if(state.units[i].state === 'dead') {
            if (state.units[i].deathTimer > 100) {
                 state.scene.remove(state.units[i].mesh);
                 state.units.splice(i, 1);
            }
        }
    }

    state.units.forEach(u => {
        if (u.isShaman && u.state === 'dead' && !u.respawnComplete) {
            if (!u.respawnPending) {
                u.respawnPending = true;
                u.respawnTimer = 30.0;
            } else {
                u.respawnTimer -= dt;
                if (u.respawnTimer <= 0) {
                    const braves = state.units.filter(b => b.faction === u.faction && b.type === 'wild' && b.state !== 'dead');
                    if (braves.length > 0) {
                        const brave = braves[Math.floor(Math.random() * braves.length)];
                        const safe = findNearestLand(brave.mesh.position.x, brave.mesh.position.z);

                        const newShaman = new Humanoid(u.faction, 'shaman', safe.x, safe.z);
                        state.units.push(newShaman);
                        spawnPulse(newShaman.mesh.position.x, newShaman.mesh.position.y, newShaman.mesh.position.z, 0xFFD700);
                        SoundManager.playSound('magic');

                        if (u.faction === 0) {
                            state.shaman = newShaman;
                        }

                        u.respawnComplete = true;
                    } else {
                        if (u.faction === 0) {
                            if(!window.gameOverAlertShown) {
                                alert("GAME OVER - Shaman dead and no followers left.");
                                window.gameOverAlertShown = true;
                            }
                            u.respawnTimer = 100000;
                        } else {
                            u.respawnComplete = true;
                        }
                    }
                }
            }
        }
    });

    const currentAlive = state.units.filter(u => u.state !== 'dead').length;
    if(currentAlive !== lastAliveCount) {
        updateUnitList();
        lastAliveCount = currentAlive;
    }

    for(let i = state.projectiles.length-1; i>=0; i--) { if(!state.projectiles[i].update(dt)) state.projectiles.splice(i, 1); }
    for(let i = state.particles.length-1; i>=0; i--) { if(!state.particles[i].update(dt)) state.particles.splice(i, 1); }
    }

    updateUnitListSelection();
    state.renderer.render(state.scene, state.camera);
}
