# Blender model and material overhaul

The browser game uses an editable Blender 5.2 source at [`art/blender/Overhaul.blend`](../art/blender/Overhaul.blend). It contains 48 model parts: six building types, the five articulated human roles, the airship, trees, birds including animated wings and tails, rabbits and four instanced flower parts. The indexed pack has 128,154 triangle corners after beveling hard edges and adding role-specific accessories, and is exported as [`mesh-pack.json`](../art/blender/mesh-pack.json). The original Three.js character pivots remain in place, so gait, turning, combat poses, physics and save data continue to work.

The Blender project now defines 17 PBR material sets. Six existing 1254 × 1254 albedos for grass, stone, wood, thatch, skin and cloth have Blender-generated normal and roughness maps. Eleven 1024 × 1024 material sets—rope, leather, bronze, ivory, dark stone, ember, foliage, fur, feather, sand and natural cliff—have independently generated albedo, height-derived normal and roughness maps. The source uses procedural physical patterns, rather than photographic scans or true displacement. The browser caches geometry and materials across instances and drops small Blender details at distant camera ranges while keeping the game silhouettes.

Terrain now uses world-space grass and sand plus triplanar cliff mapping, so vertical slopes do not stretch the ground texture. The sun's shadow frustum follows the camera and changes with zoom to improve close-range shadow density without increasing the shadow-map size.

The articulated characters retain the terrain-aware gait and gain subtle idle breathing and cloth motion. The original flat bird wings and tail are replaced by Blender-authored feather meshes on the existing animated pivots. Fireballs now have a layered glowing core and shockwave on impact; their damage, timing and mana cost are unchanged.

Regenerate the editable project and exported runtime assets on Windows:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tools/blender_overhaul.py
```

The browser loads [`art/blender-pack.js`](../art/blender-pack.js), which reads the mesh pack and PBR textures from the repository. If the pack is unavailable, the existing meshes remain usable. The complete game needs no Blender installation at play time and runs from static HTTP hosting without a build step. The Blender source uses relative image paths, so keep the `art/blender/` directory and original albedo files together when editing it.

[Rendered character preview](blender-overhaul-preview.png) · [in-game building close-up](blender-building-preview.png) · [interactive 3D gallery](../art/characters.html)

The forms and color language take inspiration from the tribal fantasy style of *Populous: The Beginning*. All mesh geometry and maps in this overhaul were created for this project; no assets from that game were imported. The result is an optimized browser RTS art pass, not a claim of literal AAA production fidelity at every zoom level. Reaching that standard would still require individually sculpted high-poly characters and buildings, retopology, baked maps, authored skeletal animation and comprehensive biome art.
