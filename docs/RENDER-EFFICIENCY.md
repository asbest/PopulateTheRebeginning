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
