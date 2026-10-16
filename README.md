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

The visual renewal follows the readable tribal silhouettes of *Populous: The Beginning*, with newly authored meshes, materials, vector icons and title art. The campaign now tells [The Price of Divinity](CAMPAIGN.md), a twelve-chapter continuation about the consequences of a shaman's ascension. Its existing battles and progression, unit statistics, mana costs, terrain mechanics and multiplayer mode remain in the browser game.

The character bodies are fully replaced: sculpted faces, articulated limbs, copper-haired shaman, warrior, fire warrior, spy and wild follower. A revised 1254 × 1254 skin texture, embroidered cloth, leather, bronze and strand-detailed hair materials add surface detail. Faces have finer eyes, ears and nose profiles. Reload an already open game tab to load the latest models.

Characters use predicted forward touchdown, a shared pelvis, opposite arm swing and heel-to-toe foot roll. The first step starts at the correct support position. Locomotion uses smooth heading, distance-driven steps, articulated ankles and terrain-aware legs. Ground colliders use the exact visible mesh and physics runs at a fixed 60 Hz.

The enemy AI keeps builders and a defensive reserve, expands onto reachable land, trains a mixture of warriors, fire warriors and spies, responds to raids and retreats with injured units. It also replaces lost workers and uses terrain bridges when its army cannot reach the opponent. The normal landscape uses vivid green hills, golden beaches and layered blue water, with rock and snow reserved for higher elevations. Huts have layered reed eaves, framed windows and stone footings; the warrior house has a timber gable. Trees have branched trunks and varied leaf clusters.

The complete game runs on Three.js. The four 1254 × 1254 source textures are in `art/materials/`. Grass uses a world-space surface pattern; roofs, walls and timber have mipmaps, anisotropic filtering and surface relief so they remain readable from the RTS camera. Terrain blends grass, dirt, wet mud, gravel, moss, sand and triplanar rock. GPU-instanced grass uses tapered, wind-bent volume blades with computed normals, height gradients and per-cluster color variation; bushes, stones and flowers add density without becoming gameplay obstacles. Water uses displaced waves, analytic normals, Fresnel reflection, shore foam and directional highlights.

The terrain, model and character textures have bundled KTX2/Basis variants with mipmaps. The browser selects GPU block compression when supported and loads the original PNG/WebP for unsupported devices or missing KTX2 assets. Add `?textures=png` to the game URL to compare the uncompressed path. The source images remain editable; after changing one, run `npm install` and `npm run build:ktx2` to regenerate its KTX2 variant. No build step is needed to play or publish the checked-in game.

The environment has animated tree crowns, a procedural atmosphere, biome-aware exposure, soft contact shadows and persistent short-lived footprints and spell scorch marks. Directional Gerstner waves now displace and shade the water consistently, while shoreline breakers emit wind-driven spray. Layered clouds drift, breathe and cast moving ground shadows beneath an atmospheric sky with cirrus, sun and moon light, horizon haze and a procedural star field. Buildings show scaffolding while rising and structural damage below 70% health. Graphics profiles can be switched between Low, Medium, High and Ultra from the pause menu or with `setGraphicsQuality('low'|'medium'|'high'|'ultra')`; the chosen profile is remembered, and dynamic resolution still responds to sustained frame rate.

Each spell has a distinct locally generated sound: fire and lightning have sharp attacks and low impacts, terrain spells use stone-like rumbles, and protective spells have softer tonal layers. Swamp, swarm, tornado, firestorm and volcano also have quiet looping sound beds for their actual in-game lifetime; these pause with the game and fade when the effect ends. Android uses preloaded WAV media playback for reliable touch-triggered audio. Run `node tools/generate-sfx.mjs` to regenerate the checked-in WAV files.

Press **C**, or use **Camera** in the pause menu, to switch between the overhead strategy camera and a lower cinematic perspective. Both views allow unit selection, orders and spells; the choice persists across reloads. The normal biome has warmer directional light and a clearer blue sky. Shoreline rocks share the existing instanced stone draw call, and slender coastal palms share one instanced mesh per occupied chunk. Completed buildings reveal terrain-following stone paths, including after loading a save. These additions retain the browser's quality tiers and chunk culling. The title illustration is key art; the cinematic view is an actual interactive rendering of the game world.

## 3D models

The editable Blender 5.2 source is [`art/blender/Overhaul.blend`](art/blender/Overhaul.blend). Its indexed model pack includes complete articulated rabbit and bird silhouettes, role-specific details for every building and character, the airship, trees and instanced flowers. Twenty-one full-resolution PBR material sets cover the structures, characters, vegetation, wildlife and terrain; distant fine details use LOD. Rabbits have animated head, ears, paws and tail with terrain-following hops; birds have a flapping/gliding wing cycle, banking and altitude control. Human gait and combat body motion, and airship visual sway, retain the original game mechanics. Brighter grass, sand and triplanar natural rock use deterministic world-space noise for varied, seamless biome transitions, and close-range sun shadows track the camera. The original structural meshes and pivots remain in `art/characters.js` and `art/art-kit.js`; [`art/blender-pack.js`](art/blender-pack.js) integrates the Blender models in the browser. See the [Blender source and regeneration guide](docs/BLENDER-OVERHAUL.md).

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

The browser suite includes dedicated effect and mana checks for all 18 spells, transport, timed status effects and save/load. Campaign tests cover all twelve playable levels, progression, the midpoint clue, the journal and both persistent endings. AI tests exercise four-minute economy simulations, an eight-minute simulation on the original starting terrain, mixed training, attacks with defensive reserves, raid response, retreats and worker recovery. Browser CI runs on pushes and pull requests. No publishing step is included.

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
