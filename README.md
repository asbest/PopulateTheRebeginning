# PopulateTheRebeginning

Full browser game (static hosting / GitHub Pages):
https://asbest.github.io/PopulateTheRebeginning/PopulateTheRebeginning.html

## Local play

Requires Node.js 22 or newer. From this repository:

```sh
node tools/serve.mjs
```

Open **http://127.0.0.1:8765/**. The entry point stays on the current host and the complete game runs in the browser. Graphics, music, physics and JavaScript dependencies are included in the repo. Single-player needs no CDN or internet connection once served locally. Online multiplayer uses the existing PeerJS signaling service and needs internet access.

Do not open the HTML directly via `file://`; browsers require HTTP for JavaScript modules. To publish on GitHub Pages, serve the repository root. No build step is needed.

The visual renewal follows the readable tribal silhouettes of *Populous: The Beginning*, with newly authored meshes, materials, vector icons and title art. The original campaign, unit statistics, mana costs, terrain mechanics and multiplayer mode remain in the browser game.

The character bodies are fully replaced: sculpted faces, articulated limbs, copper-haired shaman, warrior, fire warrior, spy and wild follower. A revised 1254 × 1254 skin texture, embroidered cloth, leather, bronze and strand-detailed hair materials add surface detail. Faces have finer eyes, ears and nose profiles. Preview and rotate the actual models at **http://127.0.0.1:8765/art/characters.html**. Reload an already open game tab to load the latest models.

The gallery includes Gehen/Rennen, Seitenansicht, Laufen/Pause and uphill/downhill controls. Characters use predicted forward touchdown, a shared pelvis, opposite arm swing and heel-to-toe foot roll. The first step starts at the correct support position. Locomotion uses smooth heading, distance-driven steps, articulated ankles and terrain-aware legs. Ground colliders use the exact visible mesh and physics runs at a fixed 60 Hz.

The enemy AI keeps builders and a defensive reserve, expands onto reachable land, trains a mixture of warriors, fire warriors and spies, responds to raids and retreats with injured units. It also replaces lost workers and uses terrain bridges when its army cannot reach the opponent. The normal landscape uses vivid green hills, golden beaches and layered blue water, with rock and snow reserved for higher elevations. Huts have layered reed eaves, framed windows and stone footings; the warrior house has a timber gable. Trees have branched trunks and varied leaf clusters.

The complete game runs on Three.js. The four 1254 × 1254 source textures are in `art/materials/`. Grass uses a world-space surface pattern; roofs, walls and timber have mipmaps, anisotropic filtering and surface relief so they remain readable from the RTS camera.

## 3D models

The editable Blender 5.2 source is [`art/blender/Overhaul.blend`](art/blender/Overhaul.blend). Its exported model pack adds sculpted details to every building, character role, airship, tree, bird, rabbit and instanced flower while preserving the animation rig and game mechanics. Six full-resolution PBR normal/roughness material sets improve the surfaces. The original structural meshes and pivots remain in `art/characters.js` and `art/art-kit.js`; [`art/blender-pack.js`](art/blender-pack.js) integrates the Blender details in the browser. See the [Blender source and regeneration guide](docs/BLENDER-OVERHAUL.md) and the live gallery at **http://127.0.0.1:8765/art/characters.html**.

## Verification

```sh
npm install --ignore-scripts
npx playwright install chromium
node tools/serve.mjs
# in another terminal
npm test
node tests/network.mjs
```

On Windows the browser tests use installed Google Chrome; on Linux they use Playwright Chromium. The network test needs internet. Tests write reports and screenshots to `test-results/`, which is ignored by Git. See [the tested scope and remaining limitations](docs/TEST-REPORT.md).

The browser suite includes dedicated effect and mana checks for all 19 spells, transport, timed status effects and save/load. AI tests exercise four-minute economy simulations, an eight-minute simulation on the original starting terrain, mixed training, attacks with defensive reserves, raid response, retreats and worker recovery. Browser CI runs on pushes and pull requests. No publishing step is included.

`tests/strategy-long.mjs` adds four AI scenarios totaling 65 simulated minutes, including an armed raid and loss of all workers. `tests/materials.mjs` captures an in-game close-up and verifies that the detailed building textures load without WebGL errors.

The existing support links below are preserved.

Please support me on Patreon:
https://www.patreon.com/posts/populate-155676276?utm_medium=clipboard_copy&utm_source=copyLink&utm_campaign=postshare_creator&utm_content=join_link

Please support me on kickstarter:
https://www.kickstarter.com/profile/asconsulting

Game on itch.io:
https://asbest1.itch.io/populate-the-rebeginning

Game on Gamejolt:
https://gamejolt.com/games/PopulateTheRebeginning/1072190
