# Verification — 9 October 2026

Tested locally on Windows with Google Chrome and Playwright 1.62.1. These are functional checks and visual previews, not a certification of all possible matches or hardware.

## Complete browser version

**30 / 30 checks passed.**

- Local entry point stays on its current host; WebGL and Rapier initialize from repository assets.
- All six building types produce detailed faction-marked meshes.
- All six unit types retain their original animation rig and base statistics.
- All six types instantiate replacement models (version 2). Dedicated skin/cloth textures load at 1254 × 1254; elbows/knees animate and conversion changes faction clothing. Combat checks exercise melee damage, shaman hand effects, fireball creation and spy conversion with the replacement rigs.
- Movement commands, spell effects and original mana costs work.
- Terrain raising changes ground height and rebuilding remains active.
- Construction, training queues and rally points work.
- Save/load preserves the active tribe, terrain, buildings and mana.
- SVG portraits and action icons render correctly instead of being shown as text.
- Airship passengers are saved once; upgrades, flight height, rally points, queued training and campaign settings survive loading.
- Keyboard select-all, deselection, hotkeys, pointer selection and wheel zoom work.
- Desktop and 390 × 844 layouts were rendered and visually inspected.
- Real emulated touch events select a unit, choose a spell and cast it in the world.
- Each of the twelve campaign levels independently starts with its intended level number, biome and enemy roster.
- No JavaScript or shader errors, or failed local asset requests, occurred. The index's expected cancelled redirect navigation is recorded separately from asset failures.

**Online multiplayer: 6 / 6 checks passed on 8 October.** Two independent headless browser pages connected through the existing PeerJS service, opened a WebRTC connection, synchronized the initial tribe and delivered a movement command from client to host. A client shield cast was executed with the exact host mana cost and the resulting shield state was synchronized back to the client. This does not establish long-session network reliability or behavior behind every NAT/firewall. Networking was not changed or retested during the 9 October AI update.

The tests are in `tests/browser.mjs` and `tests/network.mjs`. Full reports are generated in `test-results/`. The committed [browser preview](browser-preview.png) is actual rendered gameplay; [title art](../art/key-art.png) is an illustration used in loading and campaign story screens.

The [character close-up](characters-preview.png) is a real WebGL rendering of the meshes used by the game.

**Locomotion: 10 / 10 additional checks passed.** Terrain colliders are triangle meshes copied from the visible ground instead of incorrectly scaled heightfields. Sixteen rays across a whole chunk match its surface. Heading survives physics synchronization and the ±180° wrap. The distance-driven gait uses planted feet, two-bone legs and ankle pivots: five human roles were tested on flat ground and ±15% grades, with a maximum measured stance sole error below 0.008 m, using the rotated sandal ellipsoid rather than a single sole-center point in those fixtures. This does not certify every possible steep or dynamically deformed surface. Real Rapier movement covered 5.76 m, kept the root on the surface, and stopped without sliding. Knockback remains physical. Eight seconds of simulation after saving/loading and rebuilding terrain complete without runtime errors.

A live-frame regression now commands both the player and enemy shaman to reachable destinations 8 m away, verifies arrival within 1.5 m, then verifies the return trip including the uphill player route. These checks reproduce the actual spawn terrain; the earlier short movement fixture did not catch capsule penetration on its steep slopes. Ground adhesion now samples the capsule footprint and separates its collision clearance from visual foot height, preventing sideways ejection and blocked uphill travel.

Terrain-contact regression: the previous shared-pelvis solver could lower the hip below the root on steep terrain (measured -0.125 model units on the player route). Foot targets are now constrained to reachable terrain positions, pelvis height stays at least 0.52, and full 3D leg/ankle rotations preserve lateral foot placement. Sole support samples toe, heel and side surfaces rather than only the foot center. All five human roles were checked using every rendered sandal vertex on positive/negative longitudinal and cross slopes up to 2:1 and a diagonal slope. The [in-game steep-slope close-up](terrain-contact.png) records the corrected model. The landing fallback also preserves collision clearance and clamps the visual root in the same frame.

Physics uses an accumulator with a fixed 1/60 s step. Render time is measured independently of combat clock queries. Connected clients interpolate heading/position and animate locally. Forward touchdown, shared hip height, knee bend and opposite arm swing are checked at 30/60/120 FPS, including pelvis height from the first step. Front/side walking and running frames were inspected; cloth stays attached to the torso while following the thigh. [Recorded animation frames](locomotion-preview.gif) show the actual rendered gait.

## Spell and action regression suite

**27 / 27 browser checks passed** in `tests/spells.mjs`, now included in `npm test` and browser CI. Each of the 19 spells is tested in an isolated game with its original mana cost and actual effect: blast, lightning, raise, lower, flatten, landbridge, swamp, invisibility, shield, hypnotise, swarm, tornado, firestorm, volcano, heal, teleport, create, phantom and blink. The suite checks friendly/enemy targeting, projectile impact, damage, healing, terrain changes, summoning, conversion/reversion, hazard expiration, and teleport position after physics advances. Additional checks cover mana/range/dead-caster rejection, spy range, free divine spells, status refresh/expiration/save-load, phantom expiration, unload physics, missing-shipyard refunds and all referenced configuration fields.

Verified fixes:

- Blink and phantom are dispatched as spells and use the same caster/range validation as other spells.
- Teleport/blink and cargo unloading synchronize the visual position, physics body, heading, movement orders, gait and idle anchor. Cargo bodies are disabled in transit and duplicate boarding is rejected.
- Unload is handled before paid actions; missing shipyards are rejected before spending mana.
- Volcano damage/terrain ticks use the correct combat configuration fields.
- Shield/invisibility/phantom lifetimes use simulation time, refresh cleanly and survive save/load. A shield cannot make a phantom permanent.
- Forced terrain updates invalidate height caches explicitly. Zero-length landbridges avoid invalid coordinates.
- Shield and invisibility flags synchronize to connected clients.

The [spell report](spells-report.json) records the browser results. These tests cover individual spell effects and selected combinations; they do not establish every possible combination during a full campaign or long multiplayer match.

## AI and landscape update

**8 / 8 browser strategy checks passed.** On the unchanged browser starting island, the AI had seven buildings and all three combat classes after eight simulated minutes, with an offensive underway.

The AI preserves builders, trains warriors/fire warriors/spies as their facilities become available, keeps a defensive reserve, responds to raids and retreats with wounded troops and its shaman. Expansion checks terrain, building spacing and reachable routes. Browser construction now uses the actual AI faction instead of a hardcoded enemy faction. Training reservations keep the last builders from entering a nearby school accidentally. Spies select eligible units. Converted units discard their previous AI roles.

`tests/strategy.mjs` runs a seeded four-minute economy fixture on flat terrain using actual unit movement, construction and training. Separate checks exercise an offensive with a home reserve, raid response, retreat, replacement of lost workers, departure from a building footprint and conversion cleanup. A second simulation runs eight minutes on the unchanged starting landscape and checks shaman survival, expansion, all three combat classes and entry into an offensive. Its player is protected to keep the test opponent available; this is not a competitive balance benchmark. Report: [browser strategy](strategy-report.json).

The extended simulation exposed building congestion and insufficient building-site sampling on the narrow starting island. The planner now samples more sites and builds the spy school before additional housing. Pathfinding permits units to leave a building footprint without permitting entry into unrelated buildings. Failed replanning no longer dereferences a cleared movement target.

The normal biome now retains green vegetation over more of its height range, with golden shores, blue water and warmer rock. Terrain geometry and collision heights are unchanged by this palette update. Terrain vertex colors are supplied in linear space, avoiding washed-out or overbright colors. The automated gameplay, locomotion and spell suites were also rerun for this update.

## Fixes found during verification

- Corrected the Rapier collision API used by projectiles; the previous invocation could stop the animation loop.
- Bundled the correct Rapier ES module and initialized it consistently.
- Corrected the local entry point, which previously redirected to the upstream hosted version.
- Preserved campaign settings, unit upgrades, training queues and rally points when loading browser saves. Retired unit body handles are detached and spatial lookup is rebuilt immediately, preventing stale combat targets from accessing removed Rapier bodies.
- Avoided duplicated passengers in airship saves and restored pending shaman rebirth.
- Prevented optional visit counters from issuing internet requests in localhost play.

## Practical limits

Campaign startup checks do not mean that all twelve missions were played to victory. Balance, long-term performance, every spell/biome combination, accessibility beyond the controls tested, and real mobile hardware still need longer play sessions. The visual upgrade is an iteration toward a polished game, not a claim that production readiness or contemporary AAA fidelity has been achieved.

Changes are local on `codex/visual-renewal`. GitHub and the live Pages site are unchanged until this branch is reviewed and pushed/deployed.

## 11 October 2026: detailed materials and extended AI verification

The browser game uses newly authored 1254 × 1254 grass, reed thatch, sandstone and wood source textures. House roofs, walls and timber use material relief and mipmapped anisotropic filtering. The browser close-up visually confirms the source detail. The [materials report](materials-report.json) records loaded resolutions and no WebGL or asset errors. The [texture source and prompt details](MATERIALS.md) describe exactly how the assets were produced.

The extended [browser AI report](strategy-long-report.json) covers four deterministic scenarios totaling **65 simulated minutes**: default (20), swarmer with a three-warrior raid and full worker loss (15), sorcerer (15), and fortress (15). All five checks passed, including no runtime errors. In every scenario the shaman survived, the settlement grew to at least seven buildings, all three combat classes appeared and attackers moved. The raid scenario recorded a defensive response, damage to attackers and recovery of workers within two minutes. The player shaman had a large health pool to keep an opponent in play; neither the raiders nor AI troops were invulnerable. These simulations do not establish optimal balance or prove every possible campaign result.

Browser regression finished **30/30** after the materials were integrated. The shorter browser strategy suite also finished **8/8**.

## 11 October 2026: browser-only model and landscape pass

The original browser game remains the sole playable implementation. New renders show layered hut eaves and stone foundations, a timber gable on the warrior house, branched tree canopies, more continuous blue water, subtler facial features and a revised 1254 × 1254 skin texture. The [current gameplay preview](browser-preview.png), [character preview](characters-preview.png) and [building close-up](materials-close.png) are captured from the running WebGL application.

After these edits, the browser suite passed **30/30**, locomotion **10/10**, all spell and action checks **27/27**, and AI strategy **8/8**. The materials close-up test also passed with no WebGL, shader or asset-load error. These are functional and visual checks, not a claim of photorealism or completion of every campaign mission.
