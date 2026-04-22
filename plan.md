1. **Fix birds realistic look**:
   - In `spawnBird`, add two small sphere meshes for eyes on the head to make it look more realistic. (e.g. `const eyeGeo = new THREE.SphereGeometry(size * 0.05, 4, 4); ... black color...`)

2. **Add Airship Rocket Skill**:
   - In `ACTIONS`, add `'airship_rocket': { icon: '🚀', label: 'Rckt', cost: 0 }`.
   - In `updateUI`, add `'airship_rocket'` to `visibleActions` when an airship is selected.
   - In `Humanoid` (airship initialization), initialize `this.rocketActive = 0` and `this.rocketCooldown = 0`.
   - In `performAction`, add handling for `action === 'airship_rocket'`. Find airships and activate their rocket if `!u.rocketCooldown || u.rocketCooldown <= 0`. Set `u.rocketActive = 5.0` and `u.rocketCooldown = 30.0`.
   - In `Humanoid.update`, for airships: decrement `rocketCooldown`. If `rocketActive > 0`, decrement it and apply strong upward velocity (`this.velocity.y += 20 * dt`). Add a small fire/pulse particle effect below the ship while rocket is active.

3. **Fix Network Error**:
   - The issue might be related to `new Peer(generateUUID().substr(0, 5))`. The public PeerJS server has become stricter about custom IDs and often disconnects or throws a network error if it thinks the ID conflicts or if the connection is slightly unstable without ICE servers. Wait, actually, the user said "runs always in a network error". The simplest fix is often to just use default `new Peer()` which lets the Peer server allocate a random valid ID, OR the fact that `PeerJS` v1.5.2 sometimes fails connecting to `0.peerjs.com` due to WebSocket issues. Wait, could it be we should use a random string without hyphens properly? Let's just remove the custom ID from `new Peer(...)` and let it auto-generate, which is guaranteed to not conflict and be valid.
     ```javascript
     state.network.peer = new Peer({ debug: 2 });
     ...
     state.network.peer = new Peer();
     ```
     Also, let's catch the error and maybe retry or fallback. Actually, if I just remove `generateUUID().substr(0, 5)` it will use the server's generated ID. I'll test this.
