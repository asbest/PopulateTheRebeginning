"""Build the browser detail pack and PBR maps with Blender 5.2.

Run: blender --background --factory-startup --python tools/blender_overhaul.py
The editable .blend and the browser-ready mesh pack are generated together.
"""
import bpy
import json
import math
from pathlib import Path
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "art" / "blender"
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
collections = {}
objects = []


def collection(key):
    if key not in collections:
        col = bpy.data.collections.new(key.replace("/", " · "))
        bpy.context.scene.collection.children.link(col)
        collections[key] = col
    return collections[key]


def put(key, material, name, vertices, faces):
    mesh = bpy.data.meshes.new(name)
    # Models are authored in browser/world coordinates; Blender displays Z-up.
    mesh.from_pydata([(x, -z, y) for x, y, z in vertices], [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    collection(key).objects.link(obj)
    obj["browser_model"] = key
    obj["material_key"] = material
    objects.append(obj)


def box(key, material, name, p, s):
    x, y, z = p
    a, b, c = (v / 2 for v in s)
    v = [(x-a,y-b,z-c),(x+a,y-b,z-c),(x+a,y+b,z-c),(x-a,y+b,z-c),
         (x-a,y-b,z+c),(x+a,y-b,z+c),(x+a,y+b,z+c),(x-a,y+b,z+c)]
    put(key, material, name, v, [(0,1,5,4),(3,7,6,2),(4,5,6,7),
                                  (1,0,3,2),(0,4,7,3),(5,1,2,6)])


def beam(key, material, name, start, end, radius, sides=8, radius_end=None):
    a = np.array(start, dtype=float)
    b = np.array(end, dtype=float)
    direction = b-a
    direction /= np.linalg.norm(direction)
    reference = np.array([0., 0., 1.]) if abs(direction[2]) < .85 else np.array([1., 0., 0.])
    u = np.cross(direction, reference)
    u /= np.linalg.norm(u)
    v = np.cross(direction, u)
    r2 = radius if radius_end is None else radius_end
    verts = []
    for center, r in [(a,radius),(b,r2)]:
        for i in range(sides):
            q = center+r*(u*math.cos(i*2*math.pi/sides)+v*math.sin(i*2*math.pi/sides))
            verts.append(tuple(q))
    faces = [tuple(reversed(range(sides))), tuple(range(sides,2*sides))]
    faces += [(i,(i+1)%sides,(i+1)%sides+sides,i+sides) for i in range(sides)]
    put(key, material, name, verts, faces)


def ring(key, material, name, y, radius, width=.055, sides=24):
    verts = []
    for h, r in [(y-width/2,radius-width/2),(y-width/2,radius+width/2),
                 (y+width/2,radius-width/2),(y+width/2,radius+width/2)]:
        verts.extend((math.sin(i*2*math.pi/sides)*r,h,math.cos(i*2*math.pi/sides)*r) for i in range(sides))
    faces = []
    for i in range(sides):
        j = (i+1)%sides
        faces.extend([(i,j,sides+j,sides+i),(2*sides+i,3*sides+i,3*sides+j,2*sides+j),
                      (sides+i,sides+j,3*sides+j,3*sides+i)])
    put(key,material,name,verts,faces)


def gem(key, material, name, center, sx, sy, sz):
    x,y,z=center
    vertices=[(x,y+sy,z),(x+sx,y,z),(x,y,z+sz),(x-sx,y,z),(x,y,z-sz),(x,y-sy,z)]
    faces=[(0,1,2),(0,2,3),(0,3,4),(0,4,1),(5,2,1),(5,3,2),(5,4,3),(5,1,4)]
    put(key,material,name,vertices,faces)


def leaf(key, material, name, center, direction, length=.34, width=.12):
    x,y,z=center
    dx,dz=direction
    n=math.hypot(dx,dz)
    dx,dz=dx/n,dz/n
    side=(-dz,dx)
    vertices=[(x,y,z),(x+dx*length*.4+side[0]*width,y+length*.17,z+dz*length*.4+side[1]*width),
              (x+dx*length,y+length*.26,z+dz*length),
              (x+dx*length*.4-side[0]*width,y+length*.17,z+dz*length*.4-side[1]*width)]
    put(key,material,name,vertices,[(0,1,2),(0,2,3)])


def roof_fibers(kind, apex, base, radius, count, tone="thatch"):
    key=f"building/{kind}/root"
    for i in range(count):
        a=i*2*math.pi/count
        foot=(math.sin(a)*radius,base,math.cos(a)*radius)
        beam(key,tone,f"Hand-bound reed {i:02}",(0,apex,0),foot,.012,5,.017)
        if i%4==0:
            beam(key,"wood",f"Exposed rafter {i:02}",(0,apex-.13,0),
                 (foot[0]*.96,base-.04,foot[2]*.96),.035,7,.046)
    for j in range(3):
        frac=(j+1)/4
        ring(key,"wood",f"Rope roof tie {j}",apex+(base-apex)*frac,
             radius*frac,.022,48)


for kind in ("hut","spy"):
    key=f"building/{kind}/root"
    roof_fibers(kind,2.84,1.49,1.8,54,"dark" if kind=="spy" else "thatch")
    for course in range(3):
        for i in range(20):
            a=(i+(course%2)*.5)*2*math.pi/20
            x,z=math.sin(a)*1.83,math.cos(a)*1.83
            box(key,"stone",f"Hand-set foundation {course}-{i}",(x,.17+course*.12,z),(.20,.11,.16))
    for side in (-1,1):
        for i in range(5):
            box(key,"wood",f"Door carving {side}-{i}",(side*(.34+i*.042),.65+i*.12,1.48),(.025,.14,.025))
    if kind=="spy":
        for i in range(8):
            a=i*math.pi/4
            gem(key,"bronze",f"Hidden obsidian rune {i}",(math.sin(a)*1.56,1.46,math.cos(a)*1.56),.055,.13,.055)

key="building/tower/root"
for course in range(17):
    y=.34+course*.17
    for i in range(14):
        a=(i+(course%2)*.5)*math.tau/14
        r=.94-course*.006
        box(key,"stone",f"Tower masonry {course}-{i}",(math.sin(a)*r,y,math.cos(a)*r),(.20,.14,.16))
roof_fibers("tower",5.6,4.6,1.58,40)
for i in range(10):
    a=i*math.tau/10
    beam(key,"wood",f"Parapet post {i}",(math.sin(a)*1.30,3.88,math.cos(a)*1.30),
         (math.sin(a)*1.30,4.53,math.cos(a)*1.30),.055)

key="building/warrior/root"
for side in (-1,1):
    for row in range(7):
        for col in range(13):
            x=-1.48+col*.25+(row%2)*.12
            z=side*(.73+row*.115)
            y=2.6-row*.125
            box(key,"thatch",f"Overlapping roof shingle {side}-{row}-{col}",(x,y,z),(.22,.06,.2))
for side in (-1,1):
    for i in range(7):
        beam(key,"wood",f"Ribbed palisade {side}-{i}",(side*1.60,.35,-.82+i*.27),
             (side*1.6,1.8,-.82+i*.27),.037)
for side in (-1,1):
    gem(key,"bronze",f"Martial shield boss {side}",(side*1.2,1.13,1.14),.13,.13,.075)

key="building/fire/root"
roof_fibers("fire",3.9,2.6,1.83,42)
for i in range(14):
    a=i*math.tau/14
    x,z=math.sin(a)*1.7,math.cos(a)*1.7
    gem(key,"ember",f"Ember inset {i}",(x,.58,z),.075,.22,.075)
    beam(key,"dark",f"Basalt rib {i}",(x,.5,z),(x*.76,2.42,z*.76),.045)
for i in range(6):
    a=i*math.tau/6
    gem(key,"ember",f"Fire altar crystal {i}",(math.sin(a)*.56,1.75,math.cos(a)*.56),.10,.27,.10)

key="building/shipyard/root"
for i in range(24):
    z=-2.3+i*.20
    box(key,"wood",f"Individual deck plank {i}",(0,.36,z),(2.9,.055,.16))
    for side in (-1,1):
        gem(key,"bronze",f"Forged rivet {side}-{i}",(side*1.30,.40,z),.023,.025,.023)
for i in range(7):
    z=-1.8+i*.6
    beam(key,"wood",f"Curved hull rib {i}",(-.82,.48,z),(0,1.28,z),.065)
    beam(key,"wood",f"Curved hull rib mirror {i}",(.82,.48,z),(0,1.28,z),.065)
for i in range(8):
    beam(key,"rope",f"Rigging tension {i}",(-1.1+i*.28,.30,-1.8),(0,2.8,-1.0),.012,5)

# Articulated overlays live on the existing gameplay pivots. No animation or collision is replaced.
for role in ("wild","warrior","shaman","firewarrior","spy"):
    torso=f"character/{role}/torso"
    head=f"character/{role}/head"
    for side in (-1,1):
        for row in range(5):
            gem(torso,"bronze" if role in ("warrior","firewarrior") else "faction",
                f"Torso embroidery {side}-{row}",(side*(.08+row*.014),.15-row*.085,.143),.015,.026,.01)
        beam(torso,"leather",f"Tied shoulder seam {side}",(side*.18,.18,-.05),
             (side*.13,-.22,.08),.015,6)
        for i in range(3):
            gem(head,"bronze" if role!="spy" else "dark",f"Braided hair bead {side}-{i}",
                (side*(.112+i*.015),.04-i*.07,-.055),.014,.023,.014)
        for part in ("armL","armR","legL","legR"):
            attach=f"character/{role}/{part}"
            for i in range(3):
                y=-.07-i*.07
                beam(attach,"leather",f"Woven binding {side}-{i}",
                     (side*.055,y,-.045),(side*.055,y+.02,.048),.007,5)
    if role=="warrior":
        for row in range(4):
            for col in range(5):
                x=(col-2)*.079
                y=.17-row*.105
                gem(torso,"bronze",f"Overlapping cuirass scale {row}-{col}",(x,y,.16),.045,.065,.016)
        ring(head,"bronze","Forged helmet brow",.08,.145,.028,28)
    elif role=="shaman":
        for i in range(7):
            a=i*math.tau/7
            gem(head,"ivory",f"Ceremonial crown shell {i}",(math.sin(a)*.13,.15,math.cos(a)*.12),.025,.075,.025)
        for i in range(9):
            a=i*math.tau/9
            gem(torso,"ember",f"Staff aura bead {i}",(math.sin(a)*.25,.02,math.cos(a)*.19),.018,.028,.018)
    elif role=="firewarrior":
        for i in range(5):
            gem(head,"ember",f"Mask flame engraving {i}",((i-2)*.035,.08-abs(i-2)*.02,.12),.018,.052,.012)
    elif role=="spy":
        for i in range(8):
            beam(torso,"dark",f"Cloak seam {i}",((i-4)*.052,.12,-.14),
                 ((i-4)*.072,-.52,-.18),.009,5)
    else:
        for i in range(8):
            gem(torso,"ivory",f"Worked bone stitch {i}",((i-4)*.035,-.08,.151),.012,.021,.009)

key="character/airship/root"
for i in range(18):
    a=i*math.tau/18
    x,z=math.sin(a)*1.86,math.cos(a)*2.75
    beam(key,"rope",f"Balloon lashing {i}",(x*.84,3.6,z*.84),(x,5.4,z),.014,5)
for i in range(8):
    z=-1.12+i*.32
    box(key,"wood",f"Gondola deck {i}",(0,.16,z),(1.12,.05,.27))
for side in (-1,1):
    for i in range(5):
        beam(key,"wood",f"Gondola railing {side}-{i}",(side*.75,.24,-1.18+i*.56),
             (side*.75,.82,-1.18+i*.56),.027,6)
    beam(key,"wood",f"Top rail {side}",(side*.75,.81,-1.2),(side*.75,.81,1.2),.031)

# Four compact flower meshes replace the old primitive instanced geometry.
beam("prop/flower/stem","leaf0","Tapered flower stem",(0,-.20,0),(0,.20,0),.018,8,.012)
gem("prop/flower/center","bronze","Seed-dotted flower heart",(0,0,0),.055,.048,.055)
put("prop/flower/petal","ivory","Curved daisy petal",
    [(0,0,-.07),(-.035,.015,-.01),(-.032,.025,.07),(0,.018,.10),
     (.032,.025,.07),(.035,.015,-.01)],
    [(0,1,2),(0,2,3),(0,3,4),(0,4,5),(2,1,0),(3,2,0),(4,3,0),(5,4,0)])
put("prop/flower/tulip","faction","Sculpted tulip cup petal",
    [(0,-.05,0),(-.045,.025,.035),(-.04,.095,.025),(0,.14,.035),
     (.04,.095,.025),(.045,.025,.035)],
    [(0,1,2),(0,2,3),(0,3,4),(0,4,5),(2,1,0),(3,2,0),(4,3,0),(5,4,0)])

for i in range(16):
    a=i*2.399963
    reach=.36+.09*(i%5)
    y=2.22+.08*(i%4)
    beam("tree/trunk","wood",f"Forked bough {i}",(0,1.62,0),
         (math.sin(a)*reach,y,math.cos(a)*reach),.027,6,.012)
    for j in range(5):
        leaf("tree/crown","leaf"+str((i+j)%3),f"Sculpted leaf {i}-{j}",
             (math.sin(a)*reach,2.45+(j%3)*.12,math.cos(a)*reach),
             (math.sin(a+(j-2)*.43),math.cos(a+(j-2)*.43)),.36+.05*j,.11)

# Wildlife is also Blender-authored, scaled to each creature's procedural body size.
for side in (-1,1):
    beam("critter/bunny/root","ivory",f"Whisker {side} A",(side*.12,.32,.29),
         (side*.29,.35,.38),.004,5)
    beam("critter/bunny/root","ivory",f"Whisker {side} B",(side*.12,.31,.29),
         (side*.28,.26,.38),.004,5)
    gem("critter/bunny/root","dark",f"Glossy eye {side}",(side*.13,.39,.20),.025,.027,.015)
    gem("critter/bunny/root","leather",f"Inner ear {side}",(side*.085,.70,.21),.045,.15,.018)
for i in range(24):
    a=i*2.399963
    leaf("critter/bunny/root","fur",f"Fur tuft {i}",
         (math.sin(a)*.16,.32+math.sin(i)*.05,math.cos(a)*.19),
         (math.sin(a),math.cos(a)),.10,.025)
for side in (-1,1):
    gem("critter/bird/root","dark",f"Bird eye {side}",(side*.21,.18,.53),.028,.028,.014)
    for row in range(4):
        for i in range(8):
            leaf("critter/bird/root","feather",f"Flight plumage {side}-{row}-{i}",
                 (side*(.10+row*.10),.11-i*.014,-.10+i*.09),
                 (side*.9,.3),.16+row*.035,.045)


def export():
    groups={}
    for obj in objects:
        mesh=obj.data
        mesh.calc_loop_triangles()
        key=obj["browser_model"]
        material=obj["material_key"]
        group=groups.setdefault(key,{}).setdefault(material,{"position":[],"normal":[],"uv":[]})
        for tri in mesh.loop_triangles:
            nx,ny,nz=tri.normal
            for vertex_id in tri.vertices:
                bx,by,bz=mesh.vertices[vertex_id].co
                x,y,z=bx,bz,-by
                group["position"].extend((round(x,5),round(y,5),round(z,5)))
                group["normal"].extend((round(nx,5),round(nz,5),round(-ny,5)))
                group["uv"].extend((round(x*.38+z*.09,5),round(y*.41+z*.19,5)))
    payload={"version":1,"blender":bpy.app.version_string,"models":groups}
    (OUT/"mesh-pack.json").write_text(json.dumps(payload,separators=(",",":")),encoding="utf8")
    return len(groups),sum(len(part["position"])//3 for group in groups.values() for part in group.values())


def maps():
    sources=[("grass",ROOT/"art/materials/grass.png",.88,.18),
             ("stone",ROOT/"art/materials/stone.png",.90,.28),
             ("wood",ROOT/"art/materials/wood.png",.75,.20),
             ("thatch",ROOT/"art/materials/thatch.png",.88,.26),
             ("skin",ROOT/"art/character-skin-v2.png",.63,.08),
             ("cloth",ROOT/"art/character-cloth.png",.89,.13)]
    for name,path,base,strength in sources:
        image=bpy.data.images.load(str(path),check_existing=False)
        width,height=image.size
        rgba=np.empty(width*height*4,dtype=np.float32)
        image.pixels.foreach_get(rgba)
        color=rgba.reshape(height,width,4)[:,:,:3]
        lum=np.dot(color,np.array([.2126,.7152,.0722],dtype=np.float32))
        dx=(np.roll(lum,-1,axis=1)-np.roll(lum,1,axis=1))*strength
        dy=(np.roll(lum,-1,axis=0)-np.roll(lum,1,axis=0))*strength
        normal=np.stack((-dx,-dy,np.ones_like(dx)),axis=-1)
        normal/=np.maximum(np.linalg.norm(normal,axis=-1,keepdims=True),1e-6)
        normal=normal*.5+.5
        rough=np.clip(base+(lum-np.mean(lum))*.16,.28,.98)
        for suffix,rgb in (("normal",normal),("roughness",np.repeat(rough[:,:,None],3,axis=2))):
            out=bpy.data.images.new(name+"-"+suffix,width=width,height=height,alpha=True,float_buffer=False)
            pixels=np.empty((height,width,4),dtype=np.float32)
            pixels[:,:,:3]=rgb
            pixels[:,:,3]=1
            out.pixels.foreach_set(pixels.ravel())
            out.filepath_raw=str(OUT/(name+"-"+suffix+".png"))
            out.file_format="PNG"
            out.save()
            bpy.data.images.remove(out)
        bpy.data.images.remove(image)
        print("PBR",name,width,height,flush=True)


def assign_blender_materials():
    specifications={
        "stone":("stone",0xe7d6b5,0),"wood":("wood",0xe8d7b9,0),
        "thatch":("thatch",0xf4dfaf,0),"rope":("thatch",0xcab391,0),
        "leather":("wood",0x8c6446,0),"bronze":("wood",0xc6a46a,.68),
        "ivory":("stone",0xf0e1bc,0),"dark":("wood",0x53626b,.08),
        "faction":("cloth",0x387bb7,0),"ember":("stone",0xffa653,.15),
        "leaf0":("grass",0x80b262,0),"leaf1":("grass",0x609349,0),
        "leaf2":("grass",0xacc46b,0),"fur":("cloth",0xb8a58b,0),
        "feather":("cloth",0x9e967d,0)}
    made={}
    for key,(source,color,metallic) in specifications.items():
        mat=bpy.data.materials.new("PBR · "+key)
        mat.use_nodes=True
        mat.diffuse_color=tuple(((color>>shift)&255)/255 for shift in (16,8,0))+(1,)
        nodes=mat.node_tree.nodes
        links=mat.node_tree.links
        principled=nodes.get("Principled BSDF")
        principled.inputs["Metallic"].default_value=metallic
        base=nodes.new("ShaderNodeTexImage")
        base.label="Project-authored albedo"
        base.location=(-650,250)
        base_path=ROOT/("art/character-cloth.png" if source=="cloth" else "art/materials/"+source+".png")
        base.image=bpy.data.images.load(str(base_path),check_existing=True)
        base.image.filepath="//../character-cloth.png" if source=="cloth" else "//../materials/"+source+".png"
        tint=nodes.new("ShaderNodeMixRGB")
        tint.blend_type="MULTIPLY"
        tint.inputs[0].default_value=1
        tint.inputs[2].default_value=mat.diffuse_color
        tint.location=(-350,230)
        links.new(base.outputs["Color"],tint.inputs[1])
        links.new(tint.outputs["Color"],principled.inputs["Base Color"])
        normal_image=nodes.new("ShaderNodeTexImage")
        normal_image.label="Blender-generated tangent normal"
        normal_image.image=bpy.data.images.load(str(OUT/(source+"-normal.png")),check_existing=True)
        normal_image.image.filepath="//"+source+"-normal.png"
        normal_image.image.colorspace_settings.name="Non-Color"
        normal_image.location=(-650,-80)
        normal=nodes.new("ShaderNodeNormalMap")
        normal.location=(-340,-80)
        normal.inputs["Strength"].default_value=.55
        links.new(normal_image.outputs["Color"],normal.inputs["Color"])
        links.new(normal.outputs["Normal"],principled.inputs["Normal"])
        rough_image=nodes.new("ShaderNodeTexImage")
        rough_image.label="Blender-generated roughness"
        rough_image.image=bpy.data.images.load(str(OUT/(source+"-roughness.png")),check_existing=True)
        rough_image.image.filepath="//"+source+"-roughness.png"
        rough_image.image.colorspace_settings.name="Non-Color"
        rough_image.location=(-650,-350)
        links.new(rough_image.outputs["Color"],principled.inputs["Roughness"])
        if key=="ember":
            principled.inputs["Emission Color"].default_value=(1,.13,.02,1)
            principled.inputs["Emission Strength"].default_value=.5
        made[key]=mat
    for obj in objects:
        obj.data.materials.append(made[obj["material_key"]])


model_count,vertices=export()
maps()
assign_blender_materials()
bpy.context.preferences.filepaths.save_version=0
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/"Overhaul.blend"))
print(f"BLENDER OVERHAUL: {model_count} articulated/static model parts, {vertices} vertices",flush=True)
