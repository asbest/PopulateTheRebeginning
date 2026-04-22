Wait, why did `test_uuid.py` fail with `generateUUID is not defined`?
Because `PopulateTheRebeginning.html` has EVERYTHING wrapped inside some scope? Or because the main game loop crashes/doesn't expose `generateUUID` to `window`?
Ah! `generateUUID` is just a global function, but maybe it's let/const? No, `function generateUUID() {` creates a global if it's at top level. But wait, it's defined inside `<script type="module">`!

In `PopulateTheRebeginning.html`:
```javascript
<script type="module">
import * as THREE from 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.module.js';
...
function generateUUID() { ... }
```
Functions in a `type="module"` script are NOT globally exposed! They are scoped to the module!
BUT `NetworkManager.startHost` and `joinGame` are exposed to window:
```javascript
window.NetworkManager = NetworkManager;
window.startHost = () => NetworkManager.startHost();
```
Ah! So `startHost` works, but `Peer` might be failing inside.
Wait, let's look at `PopulateTheRebeginning.html` again.
Line 689: `state.network.peer = new Peer(generateUUID().substr(0, 5), {`
Is `Peer` globally exposed? `https://unpkg.com/peerjs@1.5.2/dist/peerjs.min.js` does define a global `Peer`.
But what if the `Peer` server just rejects the ID sometimes, or wait. The problem is simple. The prompt states "Repair multiplayer that runs always in a network error."

If I use `new Peer()` without arguments, the server generates a random valid ID. Then I can just use that.
```javascript
        state.network.peer = new Peer({ debug: 2 });
```
Why not just let PeerJS assign the ID?
Let's see if that's what's causing the network error.
Wait, another thing: PeerJS defaults to its own server, which is notoriously flaky for some users. However, "runs always in a network error" usually means it immediately hits an error.
Let's check if the issue is because `generateUUID().substr(0, 5)` returns something with a hyphen at the end, or similar, that the PeerJS server rejects?
Actually, `generateUUID` returns e.g. `e7d1b-....`. So the first 5 characters can be `e7d1b`. Valid.
Wait, PeerJS IDs can be letters and numbers.
Let's change `Peer(...)` to let the server pick an ID to test.

Wait, I will write the plan now.
