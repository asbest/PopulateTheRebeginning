1. **Fix birds realistic look**:
   - Add eyes to the birds in `spawnBird`. Two black spheres on the head.

2. **Add Airship Rocket Skill**:
   - Add `airship_rocket` action to `ACTIONS`.
   - Update `updateUI` to add `airship_rocket` if airships are selected.
   - Handle `airship_rocket` in `performAction`.
   - Add `rocketCooldown` and `rocketActive` logic in `Humanoid.update` for airships.

3. **Fix Multiplayer Network Error**:
   - Change `new Peer(generateUUID().substr(0, 5), ...)` to `new Peer(...)` without an explicit custom ID, allowing the PeerJS server to auto-generate a valid ID. This prevents ID collisions and regex validation failures that cause immediate network errors.
   - For `joinGame`, change `new Peer(generateUUID().substr(0, 5))` to `new Peer()`.

4. **Pre commit step**:
   - Read pre-commit instructions, run scripts, verify everything.
