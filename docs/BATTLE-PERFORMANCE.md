# Battle rendering and simulation

The original character hierarchy remains authoritative. Collision capsules,
weapon/staff pivots, attack contact phases, gait IK, foot samples, airborne
rotation, prone recovery and network poses run at their existing cadence.
Rapier retains its fixed 1/60-second step. No animation frames, physics steps,
damage events or weapon swings are deliberately dropped in a busy battle.

`art/character-batches.js` copies each eligible mesh's current world matrix and
linear material color into shared instanced meshes immediately before drawing.
The same path now includes rabbits and birds with their full-rate joint animation
and original detailed shadows; no wildlife animation frames are skipped.
It groups compatible geometry/PBR materials, preserving skin/hair variants and
tribe colors. Original meshes remain available on a dedicated raycast layer.
Transparent/custom-shader meshes, mirrored transforms and explicit tangent
attributes use the original drawing path. The batch shader uses the full inverse
transpose of the instance matrix for normals. Joint-induced affine shear during
combat and falling therefore remains batched with the original PBR lighting,
instead of reverting thousands of animated parts to individual draw calls. The first-person hidden head is respected. Small
populations and unsupported
instancing fall back to original meshes; partial batching errors restore all
original render layers. Shared source geometry/materials are never disposed.

Detailed unit shadow range is 20/32/45/60 world units for Low/Medium/High/Ultra,
measured horizontally from the strategy focus (or the eye in first person).
Distant units use one shared contact-shadow draw call. Shadow simplification is
based on distance and quality, not on combat state. It never changes a pose or
collision body. Bodies outside the view and detailed-shadow range skip drawing
while their simulation and animation continue.

Animation CPU work is reduced without lowering frequency or sampling accuracy:
each gait/grounding pass reuses terrain vertex reads from the same rendered
triangle cell; all original barycentric calculations and sandal contact samples
remain. Ankle lookups and temporary rotation objects are reused.

`art/battle-work.js` budgets ordinary target searches to eight per frame once
32 units exist; direct/manual attacks and damage checks are unaffected. Combat
path requests share the existing pathfinding Worker, with at most three new
searches and approximately three milliseconds of dispatch/fallback work per
frame. Clear routes bypass A*. Worker results are checked against current
terrain/water revision, target identity, faction, state and displacement, and
against tree obstacles. A blocked, missing, failed or stalled Worker falls back
to the original pathfinder through the same bounded queue. Stalled combat jobs
fall back after 500ms; late results cannot overwrite a newer route. First-person
controlled combat retains immediate synchronous path handling.

Scenery follows a separate spatial batching path in `art/scenery-batches.js`.
Eligible opaque building, tree and ritual meshes with the same source geometry,
material, layer and shadow settings become instances within 40-unit cells.
The original geometry, textures, materials, visibility and world transforms are
retained. Unsupported/custom/transparent/sheared meshes keep their original path.
Camera-visible parts are batched; off-screen original meshes retain their
original shadow casting. Conservative per-batch bounds also preserve shadow-
frustum culling. This prevents dispersed scenery batches from increasing camera
draw calls. Sparse views with fewer than 64 candidate saved calls use originals
and periodically reconsider batching; new buildings/chunks trigger an immediate
recheck. Batch keys are cached instead of rebuilding long material strings
for every character and scenery part each frame. GPU matrix buffers upload only when membership or source transforms change. Render
replicas do not intercept raycasts; original building/tree hierarchies remain
selectable. A rendering failure restores original meshes. Disposal releases only
batch-owned bounds/VAOs/instance buffers, preserving shared source buffers.

`art/terrain-kernel.js` contains the existing terrain maths, shared unchanged by
main-thread rendering and `art/terrain-worker.js`. The Worker prepares positions,
continuous normals, linear colours, cavity/material attributes, water foam and
depth for distant streamed chunks. Two jobs and eight ready results bound memory;
ready results arrive as transferable typed arrays. Terrain edits, biome changes
and world resets invalidate results. Noise permutations, relevant terrain edits,
and ordered height-cache snapshots preserve deterministic computation, including
cache eviction. Nearby terrain, terrain around units and explicit edits use the
original synchronous path. Missing/blocked/failed/stalled Workers fall back to it.
Mesh/decor creation and Rapier collider installation remain on the main thread;
this does not move the authoritative simulation into an asynchronous Worker.

Battle particle records use a fixed reusable pool at the existing capacities.
Particle counts, motion, lifetimes and colours remain unchanged. `art/gpu-timer.js`
provides optional asynchronous WebGL2 timer queries: enable
`gameTestAPI.GpuTimer.enabled` in test mode and inspect `.report()`. It never waits
for results, bounds pending queries to four and discards disjoint samples. The
normal game keeps this diagnostic disabled; unsupported drivers continue without
GPU timings. CPU phase measurements remain separately available.

## Measurements and regression checks

- `node tools/benchmark-lightning.mjs`: the first actual strike hits a nearby
  loaded tree, including charred vegetation and its fire/smoke pass. Checks zero
  new shader programs and bolt allocations through windup, overlapping three-second
  effects and expiry. Reports browser-frame intervals as well as GPU-synchronized
  draw timings and the actual GPU backend. Unrelated idle world streaming is frozen
  after current building models load. Initial presentation frames are reported
  separately; yielding between phases avoids filling the compositor's presentation
  queue inside one long synchronous browser script. `--software-gl` reproduces
  SwiftShader, and `--tier=low` checks the unlit quality path.
  Bolts reuse one original eight-sided cylinder and ten segment transforms, normally
  in one instanced draw. Eight bolts are prepared before input is enabled; expired
  entries are reused with at most sixteen inactive entries retained. Overflow still
  displays every bolt. Platforms without instancing retain ten original mesh draws
  sharing the same geometry. Lightning and vegetation-fire shader variants and actual
  instance buffers are prepared during loading, including a one-pixel scissored draw
  in the game's framebuffer. Vegetation fire uploads only its active instance range.
  The shared two-light budget, white illumination on High/Ultra, three-second sky
  envelope, damage, chain hits and knockback are preserved.
- `node tests/lightning-fx.mjs`: exact connected segment vertices match the original
  cylinder geometry; verifies duration, concurrent effects, overflow, reuse, reset,
  stale-effect safety and the non-instanced fallback. `tests/spells.mjs` retains damage,
  chain-hit, impulse and sky restoration checks. Sky pixel checks isolate the sky
  shader so an overlapping cloud or bright bolt cannot conceal its darkening.
- `node tools/benchmark-scenery.mjs`: original-versus-batched pixel comparison,
  draw-call savings, unchanged-buffer uploads, live construction/visibility,
  destruction and fallback recovery, with full original landscape detail.
- `node tests/terrain-worker.mjs`: real Worker arrays match synchronous terrain
  byte-for-byte across biomes and deformation; blocked/error/timeout/stale jobs
  exercise the fallback and bounded queues.
- `node tools/benchmark-armies.mjs`: 80 mixed, animated units; compares original
  versus batched draw calls and pixels with full shadows, checks unchanged rig
  and Rapier state, exact terrain samples, fallback, and distant shadow LOD.
  A second image/draw comparison covers mixed combat, fall and walking poses.
- `node tools/benchmark-battle-live.mjs`: at least five seconds and 60 frames of an actual 64-unit fight
  with eight additional fireballs every half second after the complete camera
  terrain ring has loaded. The setup reports readiness and elapsed time separately;
  software CI suspends drawing only during CPU fixture preparation, then restores
  it for all warmup, measured battle and A/B frames. Reports median/p95 frame time, render calls,
  particle peaks, path queues, scenery/terrain-worker statistics, separate CPU
  phase timings and optional asynchronous GPU timings (`--gpu-timing`) when
  supported. The ordinary FPS measurement leaves queries disabled to avoid
  driver-query overhead affecting the baseline. A frozen-pose A/B comparison
  checks that scenery batching does not increase draw calls in the same battle. `--original`
  compares against unbatched character rendering on the same machine. Sampling
  stops after 120 seconds locally (300 seconds for software CI) if 60 frames
  cannot be collected and fails explicitly.
  First-frame stalls remain in the reported maximum/frame distribution instead
  of prematurely ending the measurement. `--first-frame-delay-ms=6000` reproduces
  a first sample longer than the nominal five-second window for regression checks.
  GitHub Actions automatically uses a bounded software-rendering profile (pixel
  ratio capped at 0.25, a 512-pixel shadow map and decorative background ground
  cover/flowers/palms/trees omitted from drawing, terrain drawing limited to the
  3-by-3 chunks around the battle); `--ci-rendering` reproduces it locally.
  Terrain/obstacle physics remains intact. Actor counts and actor geometry,
  physics/animation frequency, PBR, effects and
  sample requirements are unchanged. Results explicitly label the profile and
  render dimensions; CI frame times are not native-resolution FPS measurements.
  The separate army image-parity/draw-budget benchmark retains full resolution.
  Landscape vegetation remains covered by the rendering group. `--software-gl`
  selects Chromium's SwiftShader driver for local reproduction. Reports include
  the actual GPU backend and peak triangle count.
- `node tests/combat-worker.mjs`: a real Worker route and disabled-Worker fallback
  match the original pathfinder around a building without moving the physics body.
- `node tests/battle-work.mjs`: frame budgets, stuns, faction/terrain changes,
  missing/error/stalled Workers, and late-result rejection.

Both army benchmarks are included in the GitHub performance group. Existing
locomotion, combat, weapon-grip, spell and browser suites retain their functional
checks, including falling/getting up and contact at 30/60/120 FPS.

`gameTestAPI.BattleProfiler.report()` exposes bounded rolling samples for total
JavaScript frame time, physics, simulation, render submission and other work.
The profiler keeps at most 240 samples per phase; `reset()` starts a new window.
These live CPU phase timings are not GPU timer queries. The army render comparison
uses `gl.finish()` only inside the benchmark, never in the normal game loop.
FPS depends on GPU, resolution, driver and battle size; benchmark timings are
machine-specific and are not a universal frame-rate guarantee.
