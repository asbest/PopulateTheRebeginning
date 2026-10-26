# Art sources

## Progressive downloads

Normal startup uses generated WebP textures (at most 256 pixels) and the initial
model group: inhabitants, shaman, huts, vegetation and wildlife. Other role and
building details load once when first needed; the original articulated meshes
remain playable during loading or network failure. All authored geometry is
preserved in the split groups.
The loading/story background uses a 1280-pixel WebP derivative; its full source
illustration remains available in the repository.

Close zoom (scale 14 or below) and first person upgrade nearby material textures
to the original GPU-compressed KTX2 assets, with at most two upgrades in flight.
Texture objects, tiling and material metadata survive the transition. A failed
upgrade retains the preview. Missing or stalled previews use the existing full
texture pipeline, including its original-image fallback. `?assets=full` loads
all model details and HD textures immediately for inspection; `?textures=png`
retains the explicit original-image compatibility mode.

Music and effects use `preload=none`. The first gesture prepares common combat
sounds; selected spells and active effects request their own audio. Desktop Web
Audio and mobile media playback retain their fallback paths.

Run `npm run build:startup` after changing source textures or mesh-pack.json.
Run `npm run build:asset-manifest` after other runtime changes. Generated files
are committed so deployment requires no image tools. Content hashes version the
asset URLs; an optional service worker caches only assets actually used, reuses
unchanged content and keeps one previous release. Cache/storage restrictions
fall back to ordinary downloads. This is an asset cache, not a promise that the
complete game, every level or every sound is available offline.

The download suite verifies the generated content, actual desktop/mobile startup
requests, lazy models, close-up upgrades, failure paths and versioned cache hits.

- `blender/Overhaul.blend`: editable Blender 5.2 source for 48 model parts covering buildings, characters, the airship, trees, wildlife with articulated bird wings and flowers. `blender/mesh-pack.json` is the corresponding indexed browser export; the source generator is `tools/blender_overhaul.py`. Seventeen PBR material sets include distinct leather, bronze, foliage, fur, feather, sand and cliff surfaces. See [the Blender guide](../docs/BLENDER-OVERHAUL.md).
- `blender-pack.js`: loads and shares the Blender-authored geometry and PBR maps across web-game instances. It retains the existing articulated pivots and has a fallback to the original meshes.

- `art-kit.js`: original project-authored browser building and vegetation meshes with textured reed roofs, structural timber, stone foundations and branched leaf canopies. Trees preserve the trunk/crown layout expected by the original burn mechanic.
- All seven building types carry hanging wall banners in their tribe's color, with gold borders, spiral emblems, folded cloth and notched hems inspired by the splash illustration. Banner geometry and materials are shared; their small cloth textures are generated locally without network downloads.
- `characters.js`: complete replacement character meshes, sculpted faces with finer features, anatomical limb profiles, articulated elbows/knees, role outfits and hand-bound weapons. The five human roles and airship use the original gameplay pivots, stats and collisions. Geometry and materials are shared between instances; hair receives a shared 512 × 512 strand map.
- `character-skin-v2.png`, `character-cloth.png`: independently generated **1254 × 1254** native-resolution skin and embroidered linen textures. The previous `character-skin.png` and `character-materials.png` remain as source references. Characters now load the dedicated skin and cloth maps plus the Blender-generated leather and bronze sets; the old split atlas is no longer fetched. No upscaled 4K or scanned-map claim.
- `locomotion.js`: distance-driven gait, shortest-path turning, planted feet, two-bone legs, articulated ankles, surface adhesion and idle braking. [Recorded preview](../docs/locomotion-preview.gif).
- `icons.js`: original vector symbols for units, buildings and elemental spells.
- `presentation.css`: browser interface, loading screen and story presentation.
- `key-art.png`: newly generated illustration, created with Imagegen for this project. Used as menu/story illustration, not represented as a gameplay screenshot.
- The pre-existing character atlas remains in the repo for provenance, but **is no longer loaded or applied to units**. Original music, promotional images and video are preserved.

The art direction uses rounded tribal architecture, conical straw roofs, strong team colors, elemental magic and ocean islands inspired by Populous: The Beginning. No meshes, textures or logos from that game were imported.
