# Blender model and material overhaul

The browser game uses an editable Blender 5.2 source at [`art/blender/Overhaul.blend`](../art/blender/Overhaul.blend). It contains 59 model parts: six building types, the five articulated human roles, the airship, trees, complete rabbits and birds with independently animated parts, and four instanced flower parts. The indexed pack has 176,910 triangle corners after beveling hard edges and adding organic wildlife volumes and role-specific accessories, and is exported as [`mesh-pack.json`](../art/blender/mesh-pack.json). The original Three.js character pivots remain in place, so gait, turning, combat poses, physics and save data continue to work.

The Blender project now defines 17 PBR material sets. Six existing 1254 × 1254 albedos for grass, stone, wood, thatch, skin and cloth have Blender-generated normal and roughness maps. Eleven 1024 × 1024 material sets—rope, leather, bronze, ivory, dark stone, ember, foliage, fur, feather, sand and natural cliff—have independently generated albedo, height-derived normal and roughness maps. The source uses procedural physical patterns, rather than photographic scans or true displacement. The browser caches geometry and materials across instances and drops small Blender details at distant camera ranges while keeping the game silhouettes.

Terrain now uses brighter world-space grass and sand plus triplanar cliff mapping, so vertical slopes do not stretch the ground texture. Deterministic broad and fine noise bends the height-based material bands, varies their color and breaks up repetition without altering terrain height or collision. Because the noise is sampled in world coordinates, adjacent chunks remain seamless. The sun's shadow frustum follows the camera and changes with zoom to improve close-range shadow density without increasing the shadow-map size.

The articulated characters retain the terrain-aware gait and gain idle breathing, cloth motion and torso recoil during combat. Rabbits replace their primitive bodies with smooth Blender volumes on head, ear, leg and tail pivots; their jumps ease in and out and sample the terrain throughout flight. Birds replace their primitive bodies and heads too, alternating flapping and gliding with bounded bank, head counter-rotation and terrain-safe altitude. The airship gains visual sway without changing its physics body. Fireballs have a layered glowing core and shockwave on impact; their damage, timing and mana cost are unchanged.

Regenerate the editable project and exported runtime assets on Windows:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tools/blender_overhaul.py
```

The browser loads [`art/blender-pack.js`](../art/blender-pack.js), which reads the mesh pack and PBR textures from the repository. If the pack is unavailable, the existing meshes remain usable. The complete game needs no Blender installation at play time and runs from static HTTP hosting without a build step. The Blender source uses relative image paths, so keep the `art/blender/` directory and original albedo files together when editing it.

[Rendered wildlife preview](wildlife-preview.png) · [rendered character preview](blender-overhaul-preview.png) · [in-game building close-up](blender-building-preview.png)

The forms and color language take inspiration from the tribal fantasy style of *Populous: The Beginning*. All mesh geometry and maps in this overhaul were created for this project; no assets from that game were imported. The result is an optimized browser RTS art pass, not a claim of literal AAA production fidelity at every zoom level. Reaching that standard would still require individually sculpted high-poly characters and buildings, retopology, baked maps, authored skeletal animation and comprehensive biome art.
