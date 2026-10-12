# Blender model and material overhaul

The browser game uses an editable Blender 5.2 source at [`art/blender/Overhaul.blend`](../art/blender/Overhaul.blend). It contains 45 model parts: six building types, the five articulated human roles, the airship, trees, birds, rabbits and four instanced flower parts. The pack has 65,388 triangle vertices and is exported as [`mesh-pack.json`](../art/blender/mesh-pack.json). The original Three.js character pivots remain in place, so gait, turning, combat poses, physics and save data continue to work.

The Blender project also defines PBR materials. Six albedo sources are paired with generated 1254 × 1254 tangent-normal and roughness maps for grass, stone, wood, thatch, skin and cloth. These maps are shared between the Blender details and the original structural meshes. The browser runtime caches geometry and materials across instances. The albedo is source artwork from this repository; the normal and roughness maps are derived from it in Blender. They are not scanned materials or true displacement maps.

Regenerate the editable project and exported runtime assets on Windows:

```powershell
& 'C:\Program Files\Blender Foundation\Blender 5.2\blender.exe' --background --factory-startup --python tools/blender_overhaul.py
```

The browser loads [`art/blender-pack.js`](../art/blender-pack.js), which reads the mesh pack and PBR textures from the repository. If the pack is unavailable, the existing meshes remain usable. The complete game needs no Blender installation at play time and runs from static HTTP hosting without a build step. The Blender source uses relative image paths, so keep the `art/blender/` directory and original albedo files together when editing it.

[Rendered character preview](blender-overhaul-preview.png) · [in-game building close-up](blender-building-preview.png) · [interactive 3D gallery](../art/characters.html)

The forms and color language take inspiration from the tribal fantasy style of *Populous: The Beginning*. All mesh geometry and maps in this overhaul were created for this project; no assets from that game were imported. The result is an optimized browser RTS art pass, not a claim of film-resolution or literal AAA production fidelity at every zoom level.
