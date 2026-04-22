The task requires three things:
1. Make birds look more realistic by having a head, eyes, body, and tail.
2. Add a skill for airships to accelerate upwards with a rocket for 5s, with a 30s cooldown.
3. Fix multiplayer always running into a network error.

For #1 (Birds):
The current `spawnBird` actually already adds a body, head, beak, tail, wings. Wait, if it already does, what does the user mean? "The birds shall look more realistic with a body head, tail and eyes." Maybe we just need to add eyes?
Let's see what it has:
- Body: `ConeGeometry`
- Head: `SphereGeometry`
- Beak: `ConeGeometry`
- Tail: `PlaneGeometry`
Let's add eyes (two small black spheres on the head).

For #2 (Airship Rocket):
- Add `'airship_rocket': { icon: '🚀', label: 'Rckt', cost: 0 }` to `ACTIONS`.
- Add rocket state to airship units: `this.rocketCooldown = 0;`, `this.rocketActive = 0;` inside `Humanoid` initialization or update.
- In `performAction`, if `action === 'airship_rocket'`, find all selected airships, and if `!u.rocketCooldown` (or `<= 0`), set `u.rocketActive = 5.0` and `u.rocketCooldown = 30.0`.
- In `Humanoid.update`, if `this.rocketCooldown > 0` subtract `dt`. If `this.rocketActive > 0` subtract `dt`, add force upward (`this.velocity.y += 20 * dt;`), and maybe spawn a pulse/particle underneath.
- Update UI to show `airship_rocket` when `hasSelection` has airships.

For #3 (Multiplayer Network Error):
In `PopulateTheRebeginning.html`:
```javascript
        state.network.peer.on('error', (err) => {
             document.getElementById('mp-status').innerText = "Error: " + err.type;
        });
```
When using `new Peer(...)`, some IDs are unavailable on the free PeerJS server or we need reliable ICE servers. But wait, `generateUUID().substr(0, 5)` can create things like `3a2f-` which might be invalid. Wait, `Math.random() * 16 | 0` generates valid hex. What if we use a longer string without hyphens? `generateUUID().replace(/-/g, '').substring(0, 10)`?
Also, wait! A major issue is `generateUUID` function has `Math.random` and `generateUUID` is available globally. BUT wait, look at my test script `test_mp3.py` which printed `ReferenceError: generateUUID is not defined`! No, that was because I passed it inside `page_host.evaluate` string as raw JS without copying the implementation.
Wait, another reason for "runs always in a network error" - when you click "Multiplayer", you have to input a Host ID. If you input an incorrect Host ID, `peer.connect(hostId)` will fail to connect. Wait! It fails with `peer-unavailable`.

Look at my `test_mp_join.py` where client tried to connect, and got `Error: peer-unavailable`. Why? Because the `test_mp_join.py` did `peer.connect(hostId)` but `hostId` was literally `None`. Wait, `host_id = page_host.evaluate("state.network.id")` returned `None`! Why? Because the host `peer.on('open')` was not called yet, or the host disconnected, or the host `startHost` threw an exception!
Wait! In `test_mp_join.py` the host generated a WebGL readpixels error, but let's recheck `PopulateTheRebeginning.html`.
Wait, in `test_mp4.py` the Host ID was `None`. So `peer.on('open', ...)` is NEVER CALLED!
Why is `peer.on('open')` never called?
Let's look at `PeerJS` issues. "PeerJS: Socket open", "PeerJS: Server message received: {type: OPEN}".
Ah! In my `check_peer.html`, it worked and printed `OPEN: hello-123`.
Wait, if I use `new Peer("hello-123")` it works. If I use `new Peer(generateUUID().substr(0, 5))`, does it work?
Let's see what `generateUUID().substr(0, 5)` generates. `12345-` - Wait, `generateUUID` returns `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`. So the first 5 characters are `xxxxx`. They are just 5 hex digits! e.g., `a1b2c`. This is perfectly valid.
Wait! What if we use `new Peer(generateUUID().substr(0, 5))` and it FAILS with `network` error? Let's write a script to check exactly what error it returns when connecting to PeerJS.
Wait, PeerJS doc: "If you don't pass in an id, one will be generated for you."
Why not just use `new Peer()` for the host, and read `state.network.peer.id`?
Actually, `state.network.peer.on('error')` gets `err.type == "network"` if there is an issue with the free PeerJS server, OR `err.type == "peer-unavailable"` if the client tries to join an invalid ID.
But the user says "runs always in a network error".
Wait, could it be CORS? No, PeerJS server is WSS.
What if `err.type` is `network` because we passed an options object with `{ debug: 2 }` and PeerJS expects more config? No, `{ debug: 2 }` is valid.
Let's modify `test_mp4.py` to wait for the host ID correctly.
