# Battle rendering and simulation

The original character hierarchy remains authoritative. Collision capsules,
weapon/staff pivots, attack contact phases, gait IK, foot samples, airborne
rotation, prone recovery and network poses run at their existing cadence.
Rapier retains its fixed 1/60-second step. No animation frames, physics steps,
damage events or weapon swings are deliberately dropped in a busy battle.

`art/character-batches.js` copies each eligible mesh's current world matrix and
linear material color into shared instanced meshes immediately before drawing.
It groups compatible geometry/PBR materials, preserving skin/hair variants and
tribe colors. Original meshes remain available on a dedicated raycast layer.
Transparent, custom-shader, mirrored or sheared meshes use the original drawing
path. The first-person hidden head is respected. Small populations and unsupported
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

## Measurements and regression checks

- `node tools/benchmark-lightning.mjs`: windup, impact, sustained and overlapping
  three-second bolts, then expiry. Checks a stable visible point-light count,
  shared white lightning illumination on High/Ultra, and no bulk shader compilation.
  `--tier=low` verifies the unlit effect path. Reports GPU-synchronized frame times
  for diagnosis; timings depend on the machine. Lightning and its impact share the
  existing two prewarmed battle lights, so casting and expiry do not add/remove
  shader light variants. Low/Medium retain the emissive bolt and sky effect.
- `node tools/benchmark-armies.mjs`: 80 mixed, animated units; compares original
  versus batched draw calls and pixels with full shadows, checks unchanged rig
  and Rapier state, exact terrain samples, fallback, and distant shadow LOD.
- `node tools/benchmark-battle-live.mjs`: at least five seconds and 60 frames of an actual 64-unit fight
  with eight additional fireballs every half second after terrain streaming settles. Reports median/p95 frame time, render calls,
  particle peaks, path queues and separate CPU phase timings. `--original`
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
