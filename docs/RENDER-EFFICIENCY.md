# Rendering efficiency without additional quality reductions

The optimization path keeps the selected graphics profile, textures, particle
counts, animation timing and physics. Existing profile-specific LOD policies
are independent of these changes.

- `art/box-instances.js` validates procedural box buffers before sharing a unit
  box across different dimensions. Instance scaling preserves dimensions and UVs.
  Edited, custom and subdivided geometry keeps its original rendering path.
- `art/instance-writer.js` compares float32 GPU values and uploads only changed
  contiguous ranges. Stationary poses and unchanged faction colours need no
  upload. Reordered instances and conversions still update immediately.
- `art/shadow-cache.js` reuses a complete shadow map only while its inputs are
  unchanged. Moving casters, geometry, alpha textures, visibility, lights and
  explicit invalidation refresh it. Unsupported custom depth paths retain full
  updates. Continuously changing scenes temporarily bypass cache inspection to
  avoid adding graph traversal to every combat frame. This does not combine
  separate static and dynamic shadow maps or reduce shadow update frequency.
- Firewarrior flame meshes trim only corners outside the shader's maximum
  visible envelope, retaining UV coordinates. Zero-alpha fragments are discarded.
- Fireball effect batches maintain conservative bounds for camera culling.
  Off-screen particles retain their lifetime and motion and become visible again
  when the camera returns. Existing particles are not deleted to save rendering.
- Batch bookkeeping reuses arrays and bounds instead of allocating replacements
  every frame. Original meshes remain available for selection and fallback.
- `art/static-transforms.js` avoids recomposing unchanged building/chunk
  transforms. Position, rotation and scale edits are synchronized before world
  matrices update, including explicit world-position queries. Dynamic actors
  retain their ordinary update path; detached parts regain automatic updates.
- `art/scene-index.js` shares cached subtree lists across scenery and shadow
  processing. Normal add/remove/clear/reparent operations invalidate affected
  ancestors, while visibility is evaluated live. Unrelated effects do not
  rebuild static subtree lists.
- `art/hud-cache.js` reuses connected HUD elements and skips unchanged text.
  Frame-level visitor-field objects and temporary living-unit arrays are gone.
- `art/terrain-refresh.js` compares exact local edits, configuration, noise and
  geometry inputs before rebuilding ground/water attributes. Its footprint
  includes border interpolation and normal samples. Terrain colliders reuse
  unchanged geometry and refresh when position/index buffers or worlds change.

## Validation

Screen-space LOD supplies full, intermediate and distant packed-model/tree
detail, with hysteresis and a projected geometry-error limit. Selected actors
keep full packed details. Shared scene lists update LOD once per camera, object
or quality change rather than repeatedly through renderer/batch passes.

Terrain and water use separate render meshes sharing authoritative vertex data.
Adaptive indices combine 2/4/8-cell patches in one mesh, retaining full chunk
borders and matching mixed-size edges without additional draw calls. A local
projected error budget keeps difficult patches fine without rejecting their
entire chunk. Shore terrain/water stays fine; wave bounds cover storm strength.
Original 80x80 collision/raycast topology and the area near the strategy focus
or FPV camera remain full detail. Distant FPV patches use the same pixel limit.
Indices prepare through the frame budget and GPU warmup; full geometry remains
the fallback. Off-screen patches do not start new preparation. Each mesh retains
at most three prepared error-budget variants; deformation invalidates them.
Unchanged cameras/terrain reuse their selection and attribute bindings.
`tests/lod.mjs` checks closed mixed topology, borders and local error budgets;
`tests/lod-browser.mjs` compares images, rendering counts, selection, real FPV
near/far behavior, cache reuse and authoritative collision/physics data.

Scenery batch reuse validates original topology, visibility, transforms,
geometry, material eligibility, layers and draw settings. Stable views keep
their masks, membership, bounds and GPU instance buffers. Camera/source changes
rebuild immediately; continuously changing sources back off cache creation.
Animation and simulation cadence remain unchanged. The scenery benchmark checks
pixel parity and invalidation after individual part/material/visibility/layer
edits, construction, destruction and fallback. Model/tree LOD avoids repeated
visibility or geometry assignments when its result is unchanged.

`art/building-geometry.js` combines anonymous opaque static building parts by
material and draw settings. Positions/normals are baked into shared local-space
buffers; triangle order within each group and UVs remain intact. Identical
shapes share geometry across buildings, types and tribe colours. Named roof
landmarks, banners, emissive effects, custom shaders and packed LOD branches
retain their original objects. Mirrored/unsupported sources and disabled merging
use the original path. Originals are never disposed by the merger.

Scaffolding and damage rigs also merge their static members, while their parent
growth/rotation/visibility remains live. Visible rigs participate in spatial
instancing. Whole-building preparation includes paths and hidden rig shaders,
avoiding first-entry compilation. The fire-house glow shares its unchanged
material. Collision, navigation, selection, training and save formats are
unchanged; no animation/simulation steps are skipped.

`tests/building-geometry.mjs` verifies triangle/normal/UV equivalence, ownership,
sharing and fallback. `tools/benchmark-buildings.mjs` compares six building types
from opposite views and at construction scales, then compares the same 32-house
settlement in finished, construction and damaged states with original/merged
geometry and active instancing. The rendering comparison keeps actual finished
scaffolding hidden. The performance CI group runs this benchmark. Saved draw
calls depend on the mix: already-instanced finished houses benefit less than
construction sites; desktop timings do not predict mobile FPS.

Finished buildings also use `art/building-batches.js`: different opaque meshes
sharing an exact material are combined within 40-unit spatial cells. Each batch
retains every source triangle, normal and UV, original textures, shadow flags,
render order and layers. Batches cap at 32,768 vertices to retain 16-bit indices.
Animated flames, construction and damage rigs keep their existing live paths.
Original objects and buffers remain authoritative for collision and selection;
layer 29 masks only their rendering after preparation succeeds. Singletons stay
on their original path. Legacy instancing explicitly relinquishes ownership
before the static batches take over.

Preparation copies at most 4,096 vertices or 8,192 indices per scheduled step,
using the existing one-step-per-frame resource budget. GPU buffers are warmed
before publication; unknown shader variants wait out combat. Changes to source
transforms, visibility, materials, geometry versions, LOD, construction or
destruction invalidate affected groups immediately and restore original meshes
while replacements prepare. Continuously changing roots use a short cooldown;
unsupported meshes and errors retain the original rendering. Unchanged groups
reuse buffers. Diagnostics expose an immutable `scene.buildingBatching` snapshot.

`tests/building-batches.mjs` checks these transitions against the original
rendering, including immediate fallback and unchanged source buffers. The
32-building desktop fixture reduced finished-settlement calls from 883 with
the existing model merge/instancing to 807 with material batches (about 9%).
This fixture is comparative evidence, not a mobile FPS guarantee.

The pause menu's **Performance diagnostics** replaces the sound-test button.
Choose **Record 15 seconds**, play the slow situation, then **Copy report**.
The game pauses automatically at completion; pausing or hiding the page ends
the recording early. Reports include CPU phases, optional GPU timings,
browser/adapter information and render counts. GPU timing is only enabled for
the recording and its previous state is restored. Rendering CPU time includes
driver waits and batching; simulation includes AI/unit/building timings. These
overlapping timings must not be added together. Unsupported GPU timing is
reported as unavailable. If clipboard access is blocked, select/copy the report
manually using the provided text field.

`scene.terrainLod` is an immutable final-frame snapshot. Its totals include
loaded off-screen meshes, while `visible` counts the main camera frustum.
`reasons` distinguishes off-screen meshes, protected near terrain, disabled LOD,
pending preparation, local pixel-error limits and shoreline/detail protection.
Camera mode, zoom, strategy view scale and drawing-buffer height are included.
`terrainLodRecording` counts active/full-detail frames over the whole recording,
camera modes and frames containing each loaded protection reason. `activeFrames`
requires savings in the camera frustum; `loadedActiveFrames` includes off-screen
meshes. Scenery/model counters expose reuse. These counters do not measure GPU
time or guarantee 30 FPS. `graphics.triangles` remains the renderer's frame count.

Height-cache capacity evicts 2,000 old entries instead of clearing all 20,000.
Local edits invalidate affected chunk samples including interpolation support.
World changes retain full invalidation. The persistent terrain Worker reuses
noise, kernel and geometry for identical configurations, and invalidates its
own height cache on edit changes. Jobs no longer serialize the main height cache.
Transferred output copies preserve ownership of the reusable workspace buffers.

Blender buffers use first-use vertex ordering (`art/vertex-fetch.js`), preserving
every attribute value and triangle order, including transparent faces. There is
no quantization, simplification or additional dependency.

Desktop Chromium checks include `tests/render-efficiency.mjs`,
`tests/cpu-efficiency.mjs`, `tests/terrain-refresh.mjs`,
`tests/shadow-cache.mjs`, `tests/effect-efficiency.mjs`,
`tests/graphics-quality.mjs` and the scenery, armies, crowd-detail, firewarriors,
first-fireball and settlement-entry benchmarks. Pixel comparisons cover moving
casters, light changes, construction, destruction, flame animation and combat
poses. No mobile-platform testing or mobile FPS claims accompany these changes.
