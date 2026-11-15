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

Desktop Chromium checks include `tests/render-efficiency.mjs`,
`tests/cpu-efficiency.mjs`, `tests/terrain-refresh.mjs`,
`tests/shadow-cache.mjs`, `tests/effect-efficiency.mjs`,
`tests/graphics-quality.mjs` and the scenery, armies, crowd-detail, firewarriors,
first-fireball and settlement-entry benchmarks. Pixel comparisons cover moving
casters, light changes, construction, destruction, flame animation and combat
poses. No mobile-platform testing or mobile FPS claims accompany these changes.
