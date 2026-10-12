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
    # Broad highlights on masonry, timber and shingles read much better at RTS scale.
    if material in {"stone", "wood", "thatch", "dark"}:
        bevel = objects[-1].modifiers.new("Soft hand-worked edges", "BEVEL")
        bevel.width = min(s) * (.11 if material == "stone" else .08)
        bevel.segments = 1
        bevel.affect = "EDGES"


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


def ellipsoid(key, material, name, center, radii, segments=24, rings=12):
    """Closed, smooth organic volume in browser coordinates."""
    cx,cy,cz=center
    rx,ry,rz=radii
    vertices=[]
    for j in range(rings+1):
        theta=math.pi*j/rings
        for i in range(segments):
            phi=2*math.pi*i/segments
            vertices.append((cx+rx*math.sin(theta)*math.cos(phi),
                             cy+ry*math.cos(theta),
                             cz+rz*math.sin(theta)*math.sin(phi)))
    faces=[]
    for j in range(rings):
        for i in range(segments):
            a=j*segments+i
            b=j*segments+(i+1)%segments
            c=b+segments
            d=a+segments
            faces.append((a,b,c,d))
    put(key,material,name,vertices,faces)
    mesh=objects[-1].data
    uv=mesh.uv_layers.new(name="Organic UV")
    for face_index,polygon in enumerate(mesh.polygons):
        polygon.use_smooth=True
        row=face_index//segments
        column=face_index%segments
        corners=((column,row),(column+1,row),(column+1,row+1),(column,row+1))
        for loop_id,(u,v) in zip(polygon.loop_indices,corners):
            uv.data[loop_id].uv=(u/segments*3,v/rings*2)


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
    # Larger role-specific forms establish silhouettes before the micro-detail is visible.
    for side in (-1,1):
        beam(torso,"leather",f"Shoulder harness {side}",(side*.16,.21,-.07),
             (side*.11,-.19,.155),.024,8,.017)
        for part in ("legL","legR"):
            leg=f"character/{role}/{part}"
            for turn in range(3):
                beam(leg,"leather",f"Cross-laced gaiter {side}-{turn}",
                     (side*.052,-.13-turn*.105,-.052),
                     (-side*.052,-.18-turn*.105,.056),.009,6)
        for part in ("armL","armR"):
            arm=f"character/{role}/{part}"
            gem(arm,"bronze" if role in ("warrior","firewarrior") else "ivory",
                f"Wrist clasp {side}",(side*.045,-.16,.05),.024,.032,.013)
    if role == "warrior":
        for side in (-1,1):
            for row in range(3):
                gem(torso,"bronze",f"Layered shoulder plate {side}-{row}",
                    (side*(.17+row*.035),.17-row*.055,.045),.09,.042,.105)
    elif role == "shaman":
        for side in (-1,1):
            for i in range(6):
                leaf(torso,"feather",f"Ceremonial mantle fringe {side}-{i}",
                     (side*(.07+i*.025),-.27,-.13),(side*.4,-1),.23,.045)
        for i in range(7):
            gem(head,"ivory",f"Forehead shell inlay {i}",((i-3)*.033,.10,.11),.019,.028,.013)
    elif role == "firewarrior":
        for side in (-1,1):
            for i in range(4):
                gem(torso,"ember",f"Volcanic chest shard {side}-{i}",
                    (side*(.045+i*.04),.12-i*.07,.16),.026,.055,.018)
    elif role == "spy":
        for side in (-1,1):
            for i in range(5):
                leaf(torso,"dark",f"Layered stealth cloak {side}-{i}",
                     (side*.13,-.15-i*.07,-.17),(side*.18,-1),.31,.09)
    else:
        for side in (-1,1):
            for i in range(4):
                gem(torso,"ivory",f"Carved tribal talisman {side}-{i}",
                    (side*(.09+i*.02),-.12-i*.048,.155),.025,.04,.012)

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

# Complete wildlife silhouettes. Moving parts use local pivot coordinates.
ellipsoid("critter/bunny/body","fur","Rabbit torso",(0,.19,-.055),(.225,.18,.33),32,18)
ellipsoid("critter/bunny/body","ivory","Chest bib",(0,.14,.205),(.13,.12,.085),20,12)
ellipsoid("critter/bunny/head","fur","Rabbit head",(0,.045,.055),(.155,.14,.165),28,16)
ellipsoid("critter/bunny/head","ivory","Muzzle",(0,-.035,.18),(.10,.065,.07),20,12)
gem("critter/bunny/head","leather","Nose",(0,-.018,.247),.033,.021,.016)
for side in (-1,1):
    ellipsoid("critter/bunny/head","dark",f"Eye {side}",(side*.128,.073,.113),(.023,.026,.014),14,8)
    gem("critter/bunny/head","ivory",f"Catchlight {side}",(side*.133,.083,.125),.006,.006,.005)
    for row in (-1,0,1):
        beam("critter/bunny/head","ivory",f"Whisker {side} {row}",
             (side*.07,-.046,.227),(side*.24,-.04+row*.04,.26),.0028,5)
    ear=f"critter/bunny/ear{'L' if side<0 else 'R'}"
    ellipsoid(ear,"fur",f"Tapered ear {side}",(side*.015,.135,0),(.057,.17,.033),18,12)
    ellipsoid(ear,"leather",f"Ear velvet {side}",(side*.015,.14,.029),(.037,.125,.009),18,10)
    for position in ("front","hind"):
        key=f"critter/bunny/{position}Leg{'L' if side<0 else 'R'}"
        ellipsoid(key,"fur",f"{position} leg {side}",(0,-.065,0),
                  (.065,.105,.075) if position=="front" else (.095,.12,.11),20,12)
        ellipsoid(key,"ivory",f"{position} paw {side}",(0,-.145,.052),(.065,.034,.105),18,10)
ellipsoid("critter/bunny/tail","ivory","Cottontail",(0,.02,0),(.09,.09,.09),20,12)
for i in range(26):
    a=i*2.399963
    leaf("critter/bunny/root","fur",f"Fur tuft {i}",
         (math.sin(a)*.18,.26+math.sin(i)*.04,math.cos(a)*.22),
         (math.sin(a),math.cos(a)),.075,.018)

ellipsoid("critter/bird/body","feather","Streamlined body",(0,.02,-.025),(.31,.245,.54),32,18)
ellipsoid("critter/bird/body","ivory","Breast plumage",(0,-.115,.25),(.22,.105,.245),24,14)
ellipsoid("critter/bird/head","feather","Bird head",(0,0,.035),(.22,.205,.23),28,16)
for side in (-1,1):
    ellipsoid("critter/bird/head","dark",f"Bright eye {side}",(side*.194,.045,.125),(.027,.03,.018),14,8)
    gem("critter/bird/head","ivory",f"Eye glint {side}",(side*.204,.058,.138),.007,.008,.005)
    wing="critter/bird/wingL" if side<0 else "critter/bird/wingR"
    ellipsoid(wing,"feather",f"Wing shoulder {side}",(side*.21,.015,-.075),(.26,.07,.21),20,10)
    outline=[(side*.13,.02,.09),(side*.42,.05,.15),(side*1.30,.03,-.12),
             (side*1.05,-.02,-.30),(side*.48,-.035,-.37)]
    put(wing,"feather",f"Swept flight wing {side}",outline,
        [(0,1,4),(1,2,3),(1,3,4),(4,1,0),(3,2,1),(4,3,1)])
    for i in range(9):
        x=side*(.28+i*.112)
        ellipsoid(wing,"feather",f"Primary feather {side}-{i}",
                  (x,-.012,-.18-i*.013),(.055,.013,.24-i*.007),14,6)
    for i in range(8):
        leaf("critter/bird/root","feather",f"Mantle feather {side}-{i}",
             (side*(.13+i*.016),.17,-.28+i*.09),(side*.5,.8),.12,.035)
beam("critter/bird/head","bronze","Tapered upper beak",(0,-.035,.225),
     (0,-.082,.45),.058,12,.006)
beam("critter/bird/head","dark","Beak seam",(0,-.085,.26),
     (0,-.09,.41),.012,10,.003)
for i in range(9):
    spread=(i-4)*.23
    leaf("critter/bird/tail","feather",f"Fan tail feather {i}",
         (spread*.04,0,-.28),(spread,-1),.42+.12*(1-abs(spread)),.065)
ellipsoid("critter/bird/tail","feather","Tail covert",(0,.025,-.38),(.18,.055,.20),20,10)


def export():
    groups={}
    depsgraph=bpy.context.evaluated_depsgraph_get()
    for obj in objects:
        evaluated=obj.evaluated_get(depsgraph)
        mesh=evaluated.to_mesh()
        mesh.calc_loop_triangles()
        key=obj["browser_model"]
        material=obj["material_key"]
        group=groups.setdefault(key,{}).setdefault(material,{"position":[],"normal":[],"uv":[],"index":[]})
        lookup=group.setdefault("_lookup",{})
        for tri in mesh.loop_triangles:
            for loop_id in tri.loops:
                vertex_id=mesh.loops[loop_id].vertex_index
                nx,ny,nz=mesh.corner_normals[loop_id].vector
                bx,by,bz=mesh.vertices[vertex_id].co
                x,y,z=bx,bz,-by
                if mesh.uv_layers.active:
                    u,v=mesh.uv_layers.active.data[loop_id].uv
                else:
                    u,v=x*.38+z*.09,y*.41+z*.19
                item=(round(x,5),round(y,5),round(z,5),
                      round(nx,5),round(nz,5),round(-ny,5),
                      round(u,5),round(v,5))
                if item not in lookup:
                    lookup[item]=len(group["position"])//3
                    group["position"].extend(item[:3])
                    group["normal"].extend(item[3:6])
                    group["uv"].extend(item[6:])
                group["index"].append(lookup[item])
        evaluated.to_mesh_clear()
    for model in groups.values():
        for group in model.values():
            del group["_lookup"]
    payload={"version":2,"blender":bpy.app.version_string,"models":groups}
    (OUT/"mesh-pack.json").write_text(json.dumps(payload,separators=(",",":")),encoding="utf8")
    return len(groups),sum(len(part["index"]) for group in groups.values() for part in group.values())


def surface_noise(size, seed, octaves=5):
    rng=np.random.default_rng(seed)
    x,y=np.meshgrid(np.arange(size,dtype=np.float32)/size,
                    np.arange(size,dtype=np.float32)/size)
    result=np.zeros((size,size),dtype=np.float32)
    total=0.
    for octave in range(octaves):
        frequency=2**(octave+1)
        amplitude=.55**octave
        phase=rng.uniform(0,math.tau,4)
        layer=(np.sin(math.tau*(x*frequency)+phase[0])*
               np.sin(math.tau*(y*frequency)+phase[1])+
               .45*np.cos(math.tau*(x*frequency*2+y*frequency)+phase[2])+
               .3*np.sin(math.tau*(x*frequency-y*frequency*2)+phase[3]))
        result+=amplitude*layer
        total+=amplitude*1.75
    return result/total


def save_rgb(name, rgb):
    height,width=rgb.shape[:2]
    image=bpy.data.images.new(name,width=width,height=height,alpha=True,float_buffer=False)
    pixels=np.empty((height,width,4),dtype=np.float32)
    pixels[:,:,:3]=np.clip(rgb,0,1)
    pixels[:,:,3]=1
    image.pixels.foreach_set(pixels.ravel())
    image.filepath_raw=str(OUT/(name+".png"))
    image.file_format="PNG"
    image.save()
    bpy.data.images.remove(image)


def crafted_maps():
    size=1024
    x,y=np.meshgrid(np.arange(size,dtype=np.float32)/size,
                    np.arange(size,dtype=np.float32)/size)
    surfaces={
        "leather":(0xdecbb6,.82,.12),"bronze":(0xe6d7b0,.38,.12),
        "ivory":(0xeee4cd,.59,.07),"dark":(0xbcc6c6,.84,.14),
        "ember":(0xe9b69b,.68,.22),"foliage":(0xd9e6b2,.91,.12),
        "fur":(0xe2d4b9,.91,.13),"feather":(0xd6d4c8,.82,.11),
        "rope":(0xe0d2b3,.94,.15),"sand":(0xe9d0a1,.97,.12),
        "cliff":(0xb9ae98,.93,.24),
    }
    for number,(name,(color,roughness,strength)) in enumerate(surfaces.items()):
        noise=surface_noise(size,200+number)
        grain=surface_noise(size,400+number,7)
        if name=="leather":
            pattern=np.sin(math.tau*(x*72+y*5))*.13+np.cos(math.tau*y*121)*.07
        elif name=="bronze":
            pattern=np.cos(math.tau*x*83)*np.cos(math.tau*y*71)*.11
        elif name=="ivory":
            pattern=np.sin(math.tau*(x*29+y*3))*.12
        elif name=="dark":
            pattern=np.sin(math.tau*(x*12+y*19+noise*.6))*.19
        elif name=="ember":
            pattern=np.maximum(0,np.sin(math.tau*(x*8+y*11+noise*.5))-.8)*.95
        elif name=="foliage":
            pattern=np.sin(math.tau*(x*7+y*2))*.12+np.sin(math.tau*(x*37-y*23))*.06
        elif name=="fur":
            pattern=np.sin(math.tau*(x*170+y*17))*.10
        elif name=="feather":
            pattern=np.sin(math.tau*(y*115+np.abs(x-.5)*23))*.13
        elif name=="rope":
            pattern=np.sin(math.tau*(x*14+y*42))*.21
        elif name=="cliff":
            pattern=np.abs(np.sin(math.tau*(y*9+noise*.7)))*.13+np.sin(math.tau*(x*21+y*15))*.06
        else:
            pattern=np.sin(math.tau*x*187)*np.sin(math.tau*y*173)*.10
        height=np.clip(.5+noise*.33+grain*.24+pattern,.02,.98)
        base=np.array([(color>>16&255),(color>>8&255),(color&255)],dtype=np.float32)/255
        value=np.clip(.90+noise*.26+grain*.13+pattern*.31,.55,1.15)
        albedo=np.clip(base[None,None,:]*value[:,:,None],0,1)
        dx=(np.roll(height,-1,axis=1)-np.roll(height,1,axis=1))*strength
        dy=(np.roll(height,-1,axis=0)-np.roll(height,1,axis=0))*strength
        normal=np.stack((-dx,-dy,np.ones_like(dx)),axis=-1)
        normal/=np.maximum(np.linalg.norm(normal,axis=-1,keepdims=True),1e-6)
        normal=normal*.5+.5
        rough=np.clip(roughness+noise*.16+grain*.10-pattern*.15,.18,.99)
        save_rgb(name+"-albedo",albedo)
        save_rgb(name+"-normal",normal)
        save_rgb(name+"-roughness",np.repeat(rough[:,:,None],3,axis=2))
        print("CRAFTED PBR",name,size,flush=True)


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
        physical_height=.58*lum+.42*surface_noise(width,100+len(name))
        dx=(np.roll(physical_height,-1,axis=1)-np.roll(physical_height,1,axis=1))*strength
        dy=(np.roll(physical_height,-1,axis=0)-np.roll(physical_height,1,axis=0))*strength
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
    crafted_maps()


def assign_blender_materials():
    specifications={
        "stone":("stone",0xe7d6b5,0),"wood":("wood",0xe8d7b9,0),
        "thatch":("thatch",0xf4dfaf,0),"rope":("rope",0xcab391,0),
        "leather":("leather",0x8c6446,0),"bronze":("bronze",0xc6a46a,.68),
        "ivory":("ivory",0xf0e1bc,0),"dark":("dark",0x53626b,.08),
        "faction":("cloth",0x387bb7,0),"ember":("ember",0xffa653,.15),
        "leaf0":("foliage",0x80b262,0),"leaf1":("foliage",0x609349,0),
        "leaf2":("foliage",0xacc46b,0),"fur":("fur",0xb8a58b,0),
        "feather":("feather",0x9e967d,0)}
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
        crafted=source in {"rope","leather","bronze","ivory","dark","ember","foliage","fur","feather"}
        base_path=(OUT/(source+"-albedo.png") if crafted else
                   ROOT/("art/character-cloth.png" if source=="cloth" else "art/materials/"+source+".png"))
        base.image=bpy.data.images.load(str(base_path),check_existing=True)
        base.image.filepath=("//"+source+"-albedo.png" if crafted else
                             "//../character-cloth.png" if source=="cloth" else
                             "//../materials/"+source+".png")
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
