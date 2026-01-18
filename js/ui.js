import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
import { state } from './state.js';
import { ACTIONS, UNIT_ICONS, BUILDING_COSTS, WATER_LEVEL } from './constants.js';
import { SoundManager } from './audio.js';
import { createBuilding } from './building.js';
import { executeSpell } from './spells.js';
import { Humanoid } from './humanoid.js';
import { isBraveNearby, getHeight, findNearestLand } from './utils.js';
import { spawnPulse } from './visuals.js';

// --- UI FUNCTIONS ---

export function updateUI() {
    const manaText = document.getElementById('mana-text');
    const manaFill = document.getElementById('mana-fill');
    if(manaText) manaText.innerText = Math.floor(state.mana);
    if(manaFill) manaFill.style.width = state.mana + '%';
}

export function showEnemySpellIcon(spellType) {
    const queue = document.getElementById('enemy-spell-queue');
    const action = ACTIONS[spellType];
    if(queue && action) {
        const item = document.createElement('div');
        item.className = 'enemy-spell-item';
        item.innerHTML = action.icon;
        queue.appendChild(item);

        setTimeout(() => {
            if(item.parentNode === queue) {
                queue.removeChild(item);
            }
        }, 5000);
    }
}
window.showEnemySpellIcon = showEnemySpellIcon;

export function selectAction(action) {
    if (state.currentAction === action && action !== 'move') {
        state.currentAction = 'move';
    } else {
        state.currentAction = action;
    }
    document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
    const btn = document.getElementById(`btn-${state.currentAction}`);
    if(btn) btn.classList.add('active');
}
window.selectAction = selectAction;

export function unloadSelected() {
    if(state.selectedUnits.length === 1 && state.selectedUnits[0].type === 'airship') {
        state.selectedUnits[0].unload();
    }
}
window.unloadSelected = unloadSelected;

export function updateUnitList() {
    const list = document.getElementById('unit-list');
    list.innerHTML = '';

    // Sort: Shaman first, then Player units, then Enemy units
    const sortedUnits = [...state.units].sort((a,b) => {
        if (a.isShaman && !b.isShaman) return -1;
        if (!a.isShaman && b.isShaman) return 1;
        if (a.faction !== b.faction) return a.faction - b.faction;
        return 0;
    });

    sortedUnits.forEach(u => {
        if(u.state === 'dead') return;

        const item = document.createElement('div');
        item.className = 'unit-item';
        if(u.faction === 1) item.classList.add('enemy');
        if(state.selectedUnits.includes(u)) item.classList.add('selected');

        const icon = UNIT_ICONS[u.type] || '?';
        item.innerText = icon;

        // HP Bar
        const hpDiv = document.createElement('div');
        hpDiv.className = 'hp-indicator';
        const hpVal = document.createElement('div');
        hpVal.className = 'hp-val';
        hpVal.style.width = (u.hp / u.maxHp * 100) + '%';
        hpDiv.appendChild(hpVal);
        item.appendChild(hpDiv);

        item.onclick = (e) => {
            e.stopPropagation();

            if(u.faction === 0) {
                 if(state.multiSelectMode) {
                     if(state.selectedUnits.includes(u)) {
                         state.selectedUnits = state.selectedUnits.filter(x => x !== u);
                         u.selectRing.visible = false;
                     } else {
                         state.selectedUnits.push(u);
                         u.selectRing.visible = true;
                     }
                 } else {
                     if (state.selectedUnits.length === 1 && state.selectedUnits[0] === u) {
                         u.selectRing.visible = false;
                         state.selectedUnits = [];
                     } else {
                         state.selectedUnits.forEach(x => x.selectRing.visible = false);
                         state.selectedUnits = [u];
                         u.selectRing.visible = true;
                     }
                 }
                 selectAction('move');
                 updateContextMenus();
            }
            updateUnitListSelection();
        };

        item.ondblclick = (e) => {
            e.stopPropagation();
            state.cameraLookAt.copy(u.mesh.position);
        };

        u.listItem = item;
        u.hpValItem = hpVal;
        list.appendChild(item);
    });
}

export function updateUnitListSelection() {
    state.units.forEach(u => {
        if(u.listItem) {
            if(state.selectedUnits.includes(u)) u.listItem.classList.add('selected');
            else u.listItem.classList.remove('selected');

            if(u.hpValItem) u.hpValItem.style.width = Math.max(0, (u.hp / u.maxHp * 100)) + '%';
        }
    });
}

export function updateContextMenus() {
    const menu = document.getElementById('right-menu');
    menu.innerHTML = '';

    const hasShaman = state.selectedUnits.some(u => u.isShaman);
    const hasBrave = state.selectedUnits.some(u => u.type === 'wild');
    const hasSelection = state.selectedUnits.length > 0;
    const hasAirship = state.selectedUnits.length === 1 && state.selectedUnits[0].type === 'airship';

    // Unload Button Visibility
    const unloadBtn = document.getElementById('btn-unload');
    if(unloadBtn) unloadBtn.style.display = (hasAirship && state.selectedUnits[0].passengers.length > 0) ? 'flex' : 'none';

    let visibleActions = [];

    if (hasShaman) {
        visibleActions = ['blast', 'lightning', 'raise', 'lower', 'flatten', 'landbridge', 'swamp', 'invisibility', 'shield', 'hypnotise', 'swarm', 'tornado', 'firestorm', 'volcano', 'heal', 'teleport', 'create'];
    } else if (hasBrave) {
        visibleActions = ['build_hut', 'build_tower', 'build_warrior', 'build_fire', 'build_spy', 'build_shipyard', 'build_airship'];
    }

    visibleActions.forEach(act => {
         const data = ACTIONS[act];
         if(!data) return;

         const btn = document.createElement('div');
         btn.className = 'action-btn';
         btn.id = `btn-${act}`;
         btn.innerHTML = `${data.icon}<span class="label">${data.label} (${data.cost})</span>`;
         if(state.currentAction === act) btn.classList.add('active');

         btn.onclick = (e) => {
             e.stopPropagation();
             selectAction(act);
         };
         menu.appendChild(btn);
    });
}

export function performAction(x, z, action = state.currentAction) {
    if(action === 'move') {
        if(state.selectedUnits.length > 0) {
            state.selectedUnits.forEach(u => {
                u.goto(x, z);
                u.attackTarget = null;
            });
            spawnPulse(x, getHeight(x, z), z, 0xFFFFFF);
        }
        return;
    }

    // Prevent building on water
    if (action.startsWith('build_') && getHeight(x, z) < WATER_LEVEL) return;

    // Prevent building if no brave nearby
    if (action.startsWith('build_') && !isBraveNearby(0, x, z, 10)) return;

    const spells = ['blast', 'lightning', 'raise', 'lower', 'flatten', 'landbridge', 'swamp', 'invisibility', 'shield', 'hypnotise', 'swarm', 'tornado', 'firestorm', 'volcano', 'heal', 'teleport', 'create'];

    // Range Check for Spells
    if (spells.includes(action)) {
        if (!state.shaman || state.shaman.state === 'dead') return;
        if (!state.cheatUnlimitedRange) {
            const maxRange = 10.0 + state.shaman.mesh.position.y;
            const dist = Math.sqrt((x - state.shaman.mesh.position.x)**2 + (z - state.shaman.mesh.position.z)**2);
            if (dist > maxRange) return;
        }
    }

    const costs = {
        blast: 10, lightning: 50, raise: 5, lower: 5, flatten: 10, landbridge: 20,
        swamp: 15, invisibility: 20, shield: 20, hypnotise: 50, swarm: 20, tornado: 60, firestorm: 80, volcano: 90, heal: 10, teleport: 90, create: 100,
        build_hut: BUILDING_COSTS.hut, build_tower: BUILDING_COSTS.tower, build_warrior: BUILDING_COSTS.warrior,
        build_fire: BUILDING_COSTS.fire, build_spy: BUILDING_COSTS.spy, build_shipyard: BUILDING_COSTS.shipyard, build_airship: 25
    };
    const cost = costs[action];
    if (cost === undefined || isNaN(cost)) return;
    if (state.mana < cost) return;
    state.mana -= cost;
    updateUI();

    if (spells.includes(action)) {
        executeSpell(action, x, z, state.shaman);
    }
    else if (action === 'build_airship') {
        // Build Airship
        // Find nearest shipyard
        let nearest = null; let minD = 50;
        state.buildings.forEach(b => {
            if(b.type === 'shipyard' && b.faction === 0 && !b.underConstruction) {
                const d = Math.sqrt((b.mesh.position.x - x)**2 + (b.mesh.position.z - z)**2);
                if(d < minD) { minD = d; nearest = b; }
            }
        });

        if(nearest) {
             const safe = findNearestLand(x, z);
             const h = getHeight(safe.x, safe.z);
             const airship = new Humanoid(0, 'airship', safe.x, safe.z);
             // Airship height override
             airship.mesh.position.y = Math.max(h, 10);
             state.units.push(airship);
             spawnPulse(x, h, z, 0xFFFFFF);
             SoundManager.playSound('construct');
        } else {
             // No shipyard nearby
        }
    }
    else if (action === 'unload') {
        if(state.selectedUnits.length === 1 && state.selectedUnits[0].type === 'airship') {
            state.selectedUnits[0].unload();
        }
    }
    else if (action.startsWith('build_')) {
        const type = action.replace('build_', '');
        createBuilding(type, x, z);
    }
}

// Input Handling
export function setupCheats() {
    const el = document.getElementById('mana-bar');
    let clicks = 0;
    let lastTime = 0;
    if(el) {
        el.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent propagation if needed
            const now = Date.now();
            if (now - lastTime < 500) {
                clicks++;
            } else {
                clicks = 1;
            }
            lastTime = now;

            if (clicks >= 10) {
                document.getElementById('cheat-menu').style.display = 'flex';
                clicks = 0;
                SoundManager.playSound('magic');
                alert("Cheats Unlocked! Check Pause Menu.");
            }
        });
    }
}

export function setupKeyboard() {
    const keys = { w: false, a: false, s: false, d: false };
    const update = () => {
        state.keyboardVector.set(0, 0);
        if(keys.w) state.keyboardVector.y -= 1;
        if(keys.s) state.keyboardVector.y += 1;
        if(keys.a) state.keyboardVector.x -= 1;
        if(keys.d) state.keyboardVector.x += 1;
    };
    window.addEventListener('keydown', (e) => {
        const k = e.key.toLowerCase();
        if(keys.hasOwnProperty(k)) { keys[k] = true; update(); }
    });
    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if(keys.hasOwnProperty(k)) { keys[k] = false; update(); }
    });
}

export function setupJoystick() {
    const area = document.getElementById('joystick-area');
    const knob = document.getElementById('joystick-knob');
    let startX = 0, startY = 0;
    let active = false;

    const handleStart = (x, y) => {
        active = true;
        startX = x; startY = y;
        knob.style.transition = 'none';
    };

    const handleMove = (x, y) => {
        if(!active) return;
        const maxDist = 50;
        let dx = x - startX;
        let dy = y - startY;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if(dist > maxDist) {
            dx = (dx / dist) * maxDist;
            dy = (dy / dist) * maxDist;
        }
        knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        state.joystickVector.set(dx / maxDist, dy / maxDist);
    };

    const handleEnd = () => {
        active = false;
        knob.style.transition = 'transform 0.2s';
        knob.style.transform = `translate(-50%, -50%)`;
        state.joystickVector.set(0, 0);
    };

    area.addEventListener('touchstart', e => {
        e.preventDefault();
        if(e.targetTouches.length > 0) handleStart(e.targetTouches[0].clientX, e.targetTouches[0].clientY);
    }, {passive:false});
    area.addEventListener('touchmove', e => {
        e.preventDefault();
        if(e.targetTouches.length > 0) handleMove(e.targetTouches[0].clientX, e.targetTouches[0].clientY);
    }, {passive:false});
    area.addEventListener('touchend', e => { e.preventDefault(); handleEnd(); });

    area.addEventListener('mousedown', e => { handleStart(e.clientX, e.clientY); });
    window.addEventListener('mousemove', e => { if(active) handleMove(e.clientX, e.clientY); });
    window.addEventListener('mouseup', e => { if(active) handleEnd(); });
}

export function toggleMultiSelect() {
    state.multiSelectMode = !state.multiSelectMode;
    const btn = document.getElementById('btn-multiselect');
    if(state.multiSelectMode) {
         btn.classList.add('active');
    } else {
         btn.classList.remove('active');
    }
}
window.toggleMultiSelect = toggleMultiSelect;

window.cheatMana = function() {
    state.mana = 10000;
    updateUI();
    alert("Mana set to 10000");
}
window.cheatRange = function() {
    state.cheatUnlimitedRange = true;
    alert("Unlimited Spell Range Enabled");
}
window.cheatImmortal = function() {
    state.isGodMode = true;
    alert("God Mode Enabled");
}
window.cheatDisable = function() {
    state.cheatUnlimitedRange = false;
    state.isGodMode = false;
    alert("Cheats Disabled");
}
