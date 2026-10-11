# Art sources

- `art-kit.js`: original project-authored browser building and vegetation meshes with textured reed roofs, structural timber, stone foundations and branched leaf canopies. Trees preserve the trunk/crown layout expected by the original burn mechanic.
- `characters.js`: complete replacement character meshes, sculpted faces with finer features, anatomical limb profiles, articulated elbows/knees, role outfits and hand-bound weapons. The five human roles and airship use the original gameplay pivots, stats and collisions. Geometry and materials are shared between instances; hair receives a shared 512 × 512 strand map.
- `character-skin-v2.png`, `character-cloth.png`: independently generated **1254 × 1254** native-resolution skin and embroidered linen textures. The previous `character-skin.png` remains as a source reference. `character-materials.png` is a **1254 × 1254** atlas with leather and bronze quadrants (627 × 627 per quadrant). No upscaled 4K claim. Color maps also provide subtle shader bump detail; these are not scanned normal maps.
- `characters.html`: interactive live 3D model gallery, not a concept illustration. [Actual rendered preview](../docs/characters-preview.png).
- `locomotion.js`: distance-driven gait, shortest-path turning, planted feet, two-bone legs, articulated ankles, surface adhesion and idle braking. The gallery has running/stop and terrain controls; [recorded preview](../docs/locomotion-preview.gif).
- `icons.js`: original vector symbols for units, buildings and elemental spells.
- `presentation.css`: browser interface, loading screen and story presentation.
- `key-art.png`: newly generated illustration, created with Imagegen for this project. Used as menu/story illustration, not represented as a gameplay screenshot.
- The pre-existing character atlas remains in the repo for provenance, but **is no longer loaded or applied to units**. Original music, promotional images and video are preserved.

The art direction uses rounded tribal architecture, conical straw roofs, strong team colors, elemental magic and ocean islands inspired by Populous: The Beginning. No meshes, textures or logos from that game were imported.
