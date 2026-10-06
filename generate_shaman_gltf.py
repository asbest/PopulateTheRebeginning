import json
import math
import struct
import base64
import os

# --- High Definition Geometry Generation Helpers ---

def create_box_mesh(dx, dy, dz, offset=(0, 0, 0)):
    hx, hy, hz = dx / 2.0, dy / 2.0, dz / 2.0
    ox, oy, oz = offset

    verts = [
        [ox - hx, oy - hy, oz + hz], # 0
        [ox + hx, oy - hy, oz + hz], # 1
        [ox + hx, oy + hy, oz + hz], # 2
        [ox - hx, oy + hy, oz + hz], # 3
        [ox - hx, oy - hy, oz - hz], # 4
        [ox + hx, oy - hy, oz - hz], # 5
        [ox + hx, oy + hy, oz - hz], # 6
        [ox - hx, oy + hy, oz - hz], # 7
    ]

    faces = [
        ([0, 1, 2, 3], [0, 0, 1]),  # Front
        ([5, 4, 7, 6], [0, 0, -1]), # Back
        ([3, 2, 6, 7], [0, 1, 0]),  # Top
        ([4, 5, 1, 0], [0, -1, 0]), # Bottom
        ([1, 5, 6, 2], [1, 0, 0]),  # Right
        ([4, 0, 3, 7], [-1, 0, 0])  # Left
    ]

    positions = []
    normals = []
    uvs = []
    indices = []
    uv_coords = [[0, 0], [1, 0], [1, 1], [0, 1]]

    idx_counter = 0
    for quad, norm in faces:
        for i, v_idx in enumerate(quad):
            positions.append(verts[v_idx])
            normals.append(norm)
            uvs.append(uv_coords[i])
        indices.extend([idx_counter, idx_counter + 1, idx_counter + 2, idx_counter, idx_counter + 2, idx_counter + 3])
        idx_counter += 4

    return {'positions': positions, 'normals': normals, 'uvs': uvs, 'indices': indices}

def create_cylinder_mesh(radius_top, radius_bottom, height, segments=16, offset=(0, 0, 0), rot_z=0.0, rot_x=0.0):
    ox, oy, oz = offset
    positions = []
    normals = []
    uvs = []
    indices = []

    half_h = height / 2.0

    cos_rx, sin_rx = math.cos(rot_x), math.sin(rot_x)
    cos_rz, sin_rz = math.cos(rot_z), math.sin(rot_z)

    def transform(x, y, z):
        # Rotate X then Z then translate
        y1 = y * cos_rx - z * sin_rx
        z1 = y * sin_rx + z * cos_rx
        rx = x * cos_rz - y1 * sin_rz
        ry = x * sin_rz + y1 * cos_rz
        return [ox + rx, oy + ry, oz + z1]

    def transform_norm(nx, ny, nz):
        ny1 = ny * cos_rx - nz * sin_rx
        nz1 = ny * sin_rx + nz * cos_rx
        rx = nx * cos_rz - ny1 * sin_rz
        ry = nx * sin_rz + ny1 * cos_rz
        return [rx, ry, nz1]

    side_verts_bottom = []
    side_verts_top = []
    for i in range(segments):
        angle = 2.0 * math.pi * i / segments
        cos_a = math.cos(angle)
        sin_a = math.sin(angle)
        side_verts_bottom.append(transform(radius_bottom * cos_a, -half_h, radius_bottom * sin_a))
        side_verts_top.append(transform(radius_top * cos_a, half_h, radius_top * sin_a))

    idx = 0
    for i in range(segments):
        next_i = (i + 1) % segments
        angle_i = 2.0 * math.pi * i / segments
        angle_next = 2.0 * math.pi * next_i / segments

        n1 = transform_norm(math.cos(angle_i), 0, math.sin(angle_i))
        n2 = transform_norm(math.cos(angle_next), 0, math.sin(angle_next))

        positions.extend([side_verts_bottom[i], side_verts_bottom[next_i], side_verts_top[next_i], side_verts_top[i]])
        normals.extend([n1, n2, n2, n1])
        uvs.extend([[i / segments, 0], [(i + 1) / segments, 0], [(i + 1) / segments, 1], [i / segments, 1]])

        indices.extend([idx, idx + 1, idx + 2, idx, idx + 2, idx + 3])
        idx += 4

    return {'positions': positions, 'normals': normals, 'uvs': uvs, 'indices': indices}

def create_sphere_mesh(radius, lat_segments=16, lon_segments=20, offset=(0, 0, 0), scale=(1.0, 1.0, 1.0)):
    ox, oy, oz = offset
    sx, sy, sz = scale
    positions = []
    normals = []
    uvs = []
    indices = []

    for i in range(lat_segments + 1):
        v = i / lat_segments
        lat_angle = math.pi * (v - 0.5)
        sin_lat = math.sin(lat_angle)
        cos_lat = math.cos(lat_angle)

        for j in range(lon_segments + 1):
            u = j / lon_segments
            lon_angle = 2 * math.pi * u
            sin_lon = math.sin(lon_angle)
            cos_lon = math.cos(lon_angle)

            nx = cos_lat * cos_lon
            ny = sin_lat
            nz = cos_lat * sin_lon

            positions.append([ox + radius * sx * nx, oy + radius * sy * ny, oz + radius * sz * nz])
            normals.append([nx, ny, nz])
            uvs.append([u, v])

    for i in range(lat_segments):
        for j in range(lon_segments):
            p1 = i * (lon_segments + 1) + j
            p2 = p1 + (lon_segments + 1)
            indices.extend([p1, p2, p1 + 1, p1 + 1, p2, p2 + 1])

    return {'positions': positions, 'normals': normals, 'uvs': uvs, 'indices': indices}

def create_feather_mesh(width, height, offset=(0, 0, 0), tilt_z=0.0, curve_forward=0.1):
    # Detailed curved feather with rib
    ox, oy, oz = offset
    cos_t = math.cos(tilt_z)
    sin_t = math.sin(tilt_z)

    steps = 8
    positions = []
    normals = []
    uvs = []
    indices = []

    left_verts = []
    right_verts = []
    spine_verts = []

    for s in range(steps + 1):
        t = s / steps
        y = t * height
        z = math.sin(t * math.pi * 0.8) * curve_forward
        w = math.sin(t * math.pi) * (width / 2.0)

        # Center spine
        spine_verts.append([0, y, z])
        left_verts.append([-w, y, z])
        right_verts.append([w, y, z])

    def transform(x, y, z):
        rx = x * cos_t - y * sin_t
        ry = x * sin_t + y * cos_t
        return [ox + rx, oy + ry, oz + z]

    idx = 0
    for s in range(steps):
        p_l1 = transform(*left_verts[s])
        p_r1 = transform(*right_verts[s])
        p_s1 = transform(*spine_verts[s])
        p_l2 = transform(*left_verts[s+1])
        p_r2 = transform(*right_verts[s+1])
        p_s2 = transform(*spine_verts[s+1])

        n_front = [0, 0, 1.0]

        # Left quad
        positions.extend([p_l1, p_s1, p_s2, p_l2])
        normals.extend([n_front]*4)
        uvs.extend([[0, s/steps], [0.5, s/steps], [0.5, (s+1)/steps], [0, (s+1)/steps]])
        indices.extend([idx, idx+1, idx+2, idx, idx+2, idx+3])
        idx += 4

        # Right quad
        positions.extend([p_s1, p_r1, p_r2, p_s2])
        normals.extend([n_front]*4)
        uvs.extend([[0.5, s/steps], [1.0, s/steps], [1.0, (s+1)/steps], [0.5, (s+1)/steps]])
        indices.extend([idx, idx+1, idx+2, idx, idx+2, idx+3])
        idx += 4

    return {'positions': positions, 'normals': normals, 'uvs': uvs, 'indices': indices}

def merge_meshes(mesh_list):
    combined_positions = []
    combined_normals = []
    combined_uvs = []
    combined_indices = []

    offset = 0
    for m in mesh_list:
        combined_positions.extend(m['positions'])
        combined_normals.extend(m['normals'])
        combined_uvs.extend(m['uvs'])
        combined_indices.extend([idx + offset for idx in m['indices']])
        offset += len(m['positions'])

    return {
        'positions': combined_positions,
        'normals': combined_normals,
        'uvs': combined_uvs,
        'indices': combined_indices
    }

# --- Construct High Definition Shaman Mesh Components ---

# 1. Torso & Layered Robes
robe_skirt = create_cylinder_mesh(0.24, 0.42, 0.65, segments=20, offset=(0, -0.12, 0))
tunic_chest = create_cylinder_mesh(0.26, 0.24, 0.38, segments=20, offset=(0, 0.22, 0))
shoulder_pads_l = create_sphere_mesh(0.12, offset=(0.28, 0.32, 0), scale=(1.2, 0.8, 1.0))
shoulder_pads_r = create_sphere_mesh(0.12, offset=(-0.28, 0.32, 0), scale=(1.2, 0.8, 1.0))
shaman_cape = create_box_mesh(0.48, 0.78, 0.06, offset=(0, 0.05, -0.22))
cape_collar = create_cylinder_mesh(0.28, 0.26, 0.12, segments=16, offset=(0, 0.35, -0.05))
belt_ring = create_cylinder_mesh(0.28, 0.28, 0.09, segments=20, offset=(0, -0.1, 0))
belt_pendant = create_box_mesh(0.12, 0.22, 0.05, offset=(0, -0.25, 0.26))
torso_mesh = merge_meshes([robe_skirt, tunic_chest, shoulder_pads_l, shoulder_pads_r, shaman_cape, cape_collar, belt_ring, belt_pendant])

# 2. Head & Carved Ceremonial Mask
head_sphere = create_sphere_mesh(0.16, lat_segments=16, lon_segments=20, offset=(0, 0.12, 0))
mask_main = create_box_mesh(0.28, 0.32, 0.1, offset=(0, 0.12, 0.15))
mask_crest = create_box_mesh(0.14, 0.18, 0.08, offset=(0, 0.30, 0.16))
jaw_ridge = create_cylinder_mesh(0.12, 0.08, 0.15, segments=12, offset=(0, -0.02, 0.16), rot_x=0.3)
tusk_l1 = create_cylinder_mesh(0.01, 0.045, 0.35, segments=12, offset=(0.18, 0.22, 0.08), rot_z=-0.4)
tusk_r1 = create_cylinder_mesh(0.01, 0.045, 0.35, segments=12, offset=(-0.18, 0.22, 0.08), rot_z=0.4)
tusk_l2 = create_cylinder_mesh(0.01, 0.035, 0.25, segments=12, offset=(0.16, 0.08, 0.12), rot_z=-0.6)
tusk_r2 = create_cylinder_mesh(0.01, 0.035, 0.25, segments=12, offset=(-0.16, 0.08, 0.12), rot_z=0.6)
head_mesh = merge_meshes([head_sphere, mask_main, mask_crest, jaw_ridge, tusk_l1, tusk_r1, tusk_l2, tusk_r2])

# 3. High Definition Feather Crown Headdress
f_c = create_feather_mesh(0.14, 0.75, offset=(0, 0.0, 0), tilt_z=0.0, curve_forward=0.15)
f_l1 = create_feather_mesh(0.13, 0.68, offset=(-0.06, 0.0, 0), tilt_z=-0.22, curve_forward=0.12)
f_r1 = create_feather_mesh(0.13, 0.68, offset=(0.06, 0.0, 0), tilt_z=0.22, curve_forward=0.12)
f_l2 = create_feather_mesh(0.12, 0.58, offset=(-0.12, 0.0, 0), tilt_z=-0.44, curve_forward=0.10)
f_r2 = create_feather_mesh(0.12, 0.58, offset=(0.12, 0.0, 0), tilt_z=0.44, curve_forward=0.10)
f_l3 = create_feather_mesh(0.10, 0.48, offset=(-0.18, 0.0, 0), tilt_z=-0.66, curve_forward=0.08)
f_r3 = create_feather_mesh(0.10, 0.48, offset=(0.18, 0.0, 0), tilt_z=0.66, curve_forward=0.08)
crown_circlet = create_cylinder_mesh(0.18, 0.20, 0.1, segments=20, offset=(0, -0.04, 0))
headdress_mesh = merge_meshes([f_c, f_l1, f_r1, f_l2, f_r2, f_l3, f_r3, crown_circlet])

# 4. Left Arm (ArmL)
armL_upper = create_cylinder_mesh(0.075, 0.065, 0.28, segments=16, offset=(0, -0.14, 0))
armL_lower = create_cylinder_mesh(0.065, 0.055, 0.28, segments=16, offset=(0, -0.36, 0))
armL_guard = create_cylinder_mesh(0.07, 0.068, 0.12, segments=16, offset=(0, -0.34, 0))
armL_hand = create_sphere_mesh(0.06, lat_segments=12, lon_segments=16, offset=(0, -0.52, 0))
armL_mesh = merge_meshes([armL_upper, armL_lower, armL_guard, armL_hand])

# 5. Right Arm (ArmR)
armR_upper = create_cylinder_mesh(0.075, 0.065, 0.28, segments=16, offset=(0, -0.14, 0))
armR_lower = create_cylinder_mesh(0.065, 0.055, 0.28, segments=16, offset=(0, -0.36, 0))
armR_guard = create_cylinder_mesh(0.07, 0.068, 0.12, segments=16, offset=(0, -0.34, 0))
armR_hand = create_sphere_mesh(0.06, lat_segments=12, lon_segments=16, offset=(0, -0.52, 0))
armR_mesh = merge_meshes([armR_upper, armR_lower, armR_guard, armR_hand])

# 6. Shaman Staff with Twisted Shaft, Totem & Mystical Orb
staff_shaft1 = create_cylinder_mesh(0.04, 0.038, 0.9, segments=12, offset=(0, -0.1, 0))
staff_shaft2 = create_cylinder_mesh(0.038, 0.042, 0.9, segments=12, offset=(0, 0.7, 0), rot_z=0.08)
totem_head = create_box_mesh(0.22, 0.22, 0.22, offset=(0, 1.15, 0))
totem_skull = create_sphere_mesh(0.12, offset=(0, 1.28, 0.08))
prong_l = create_cylinder_mesh(0.015, 0.03, 0.35, segments=12, offset=(0.1, 1.35, 0), rot_z=-0.35)
prong_r = create_cylinder_mesh(0.015, 0.03, 0.35, segments=12, offset=(-0.1, 1.35, 0), rot_z=0.35)
mystic_orb = create_sphere_mesh(0.12, lat_segments=16, lon_segments=20, offset=(0, 1.42, 0))
talisman1 = create_feather_mesh(0.06, 0.3, offset=(-0.12, 1.0, 0), tilt_z=-0.3)
talisman2 = create_feather_mesh(0.06, 0.3, offset=(0.12, 1.0, 0), tilt_z=0.3)
staff_mesh = merge_meshes([staff_shaft1, staff_shaft2, totem_head, totem_skull, prong_l, prong_r, mystic_orb, talisman1, talisman2])

# 7. Left Leg (LegL)
legL_upper = create_cylinder_mesh(0.085, 0.075, 0.32, segments=16, offset=(0, -0.16, 0))
legL_lower = create_cylinder_mesh(0.075, 0.065, 0.32, segments=16, offset=(0, -0.42, 0))
legL_foot = create_box_mesh(0.11, 0.09, 0.22, offset=(0, -0.58, 0.06))
legL_mesh = merge_meshes([legL_upper, legL_lower, legL_foot])

# 8. Right Leg (LegR)
legR_upper = create_cylinder_mesh(0.085, 0.075, 0.32, segments=16, offset=(0, -0.16, 0))
legR_lower = create_cylinder_mesh(0.075, 0.065, 0.32, segments=16, offset=(0, -0.42, 0))
legR_foot = create_box_mesh(0.11, 0.09, 0.22, offset=(0, -0.58, 0.06))
legR_mesh = merge_meshes([legR_upper, legR_lower, legR_foot])

# Map nodes
node_configs = [
    {'name': 'Torso', 'mesh': torso_mesh, 'translation': [0, 0.9, 0], 'children': ['Head', 'ArmL', 'ArmR', 'LegL', 'LegR']},
    {'name': 'Head', 'mesh': head_mesh, 'translation': [0, 0.4, 0], 'children': ['Headdress']},
    {'name': 'Headdress', 'mesh': headdress_mesh, 'translation': [0, 0.25, 0], 'children': []},
    {'name': 'ArmL', 'mesh': armL_mesh, 'translation': [0.28, 0.15, 0], 'children': []},
    {'name': 'ArmR', 'mesh': armR_mesh, 'translation': [-0.28, 0.15, 0], 'children': ['Staff']},
    {'name': 'Staff', 'mesh': staff_mesh, 'translation': [0, -0.4, 0.1], 'children': []},
    {'name': 'LegL', 'mesh': legL_mesh, 'translation': [0.12, -0.35, 0], 'children': []},
    {'name': 'LegR', 'mesh': legR_mesh, 'translation': [-0.12, -0.35, 0], 'children': []},
]

# --- Generate shaman.obj and shaman.mtl ---

def generate_obj_mtl():
    mtl_content = """# Populous HD Shaman Materials
newmtl ShamanRobe
Kd 0.85 0.25 0.10
Ka 0.20 0.05 0.02
Ks 0.15 0.15 0.15
Ns 15

newmtl ShamanSkin
Kd 0.82 0.70 0.55
Ka 0.20 0.15 0.10
Ks 0.1 0.1 0.1
Ns 5

newmtl ShamanMask
Kd 0.95 0.85 0.30
Ka 0.25 0.22 0.08
Ks 0.4 0.4 0.4
Ns 40

newmtl ShamanFeather
Kd 0.98 0.98 0.98
Ka 0.25 0.25 0.25
Ks 0.2 0.2 0.2
Ns 20

newmtl ShamanStaff
Kd 0.45 0.28 0.12
Ka 0.12 0.06 0.03
Ks 0.15 0.15 0.15
Ns 10

newmtl ShamanOrb
Kd 1.00 0.84 0.00
Ka 0.50 0.40 0.00
Ks 0.9 0.9 0.9
Ns 80
"""
    with open('shaman.mtl', 'w') as f:
        f.write(mtl_content)

    obj_lines = ["# Populous HD Shaman OBJ Model", "mtllib shaman.mtl\n"]

    mat_map = {
        'Torso': 'ShamanRobe',
        'Head': 'ShamanMask',
        'Headdress': 'ShamanFeather',
        'ArmL': 'ShamanSkin',
        'ArmR': 'ShamanSkin',
        'Staff': 'ShamanStaff',
        'LegL': 'ShamanRobe',
        'LegR': 'ShamanRobe'
    }

    def get_world_transform(node_name):
        chain = []
        curr = node_name
        while curr:
            cfg = next(c for c in node_configs if c['name'] == curr)
            chain.append(cfg['translation'])
            parent_cfg = next((c for c in node_configs if curr in c['children']), None)
            curr = parent_cfg['name'] if parent_cfg else None

        tx = sum(c[0] for c in chain)
        ty = sum(c[1] for c in chain)
        tz = sum(c[2] for c in chain)
        return tx, ty, tz

    v_offset = 1
    vn_offset = 1
    vt_offset = 1

    for cfg in node_configs:
        name = cfg['name']
        mesh = cfg['mesh']
        tx, ty, tz = get_world_transform(name)
        mat = mat_map.get(name, 'ShamanRobe')

        obj_lines.append(f"g {name}")
        obj_lines.append(f"usemtl {mat}")

        for px, py, pz in mesh['positions']:
            obj_lines.append(f"v {px+tx:.4f} {py+ty:.4f} {pz+tz:.4f}")
        for nx, ny, nz in mesh['normals']:
            obj_lines.append(f"vn {nx:.4f} {ny:.4f} {nz:.4f}")
        for u, v in mesh['uvs']:
            obj_lines.append(f"vt {u:.4f} {v:.4f}")

        for i in range(0, len(mesh['indices']), 3):
            i1 = mesh['indices'][i] + v_offset
            i2 = mesh['indices'][i+1] + v_offset
            i3 = mesh['indices'][i+2] + v_offset
            obj_lines.append(f"f {i1}/{i1}/{i1} {i2}/{i2}/{i2} {i3}/{i3}/{i3}")

        v_offset += len(mesh['positions'])

    with open('shaman.obj', 'w') as f:
        f.write("\n".join(obj_lines))

# --- Generate shaman.gltf and shaman_data.js ---

def generate_gltf():
    buffer_bytes = bytearray()
    buffer_views = []
    accessors = []
    meshes = []
    nodes = []
    materials = [
        {'name': 'ShamanRobe', 'pbrMetallicRoughness': {'baseColorFactor': [0.85, 0.25, 0.10, 1.0], 'roughnessFactor': 0.6, 'metallicFactor': 0.1}},
        {'name': 'ShamanSkin', 'pbrMetallicRoughness': {'baseColorFactor': [0.82, 0.70, 0.55, 1.0], 'roughnessFactor': 0.7, 'metallicFactor': 0.05}},
        {'name': 'ShamanMask', 'pbrMetallicRoughness': {'baseColorFactor': [0.95, 0.85, 0.30, 0.9], 'roughnessFactor': 0.4, 'metallicFactor': 0.3}},
        {'name': 'ShamanFeather', 'pbrMetallicRoughness': {'baseColorFactor': [0.98, 0.98, 0.98, 1.0], 'roughnessFactor': 0.8, 'metallicFactor': 0.05}},
        {'name': 'ShamanStaff', 'pbrMetallicRoughness': {'baseColorFactor': [0.45, 0.28, 0.12, 1.0], 'roughnessFactor': 0.7, 'metallicFactor': 0.1}},
        {'name': 'ShamanOrb', 'pbrMetallicRoughness': {'baseColorFactor': [1.0, 0.84, 0.0, 1.0], 'roughnessFactor': 0.1, 'metallicFactor': 0.9}},
    ]

    mat_indices = {
        'Torso': 0,
        'Head': 2,
        'Headdress': 3,
        'ArmL': 1,
        'ArmR': 1,
        'Staff': 4,
        'LegL': 0,
        'LegR': 0
    }

    name_to_node_idx = {cfg['name']: i for i, cfg in enumerate(node_configs)}

    for cfg in node_configs:
        name = cfg['name']
        mesh_data = cfg['mesh']
        mat_idx = mat_indices.get(name, 0)

        # 1. Pack Positions
        pos_bytes = bytearray()
        min_pos = [float('inf')]*3
        max_pos = [float('-inf')]*3
        for px, py, pz in mesh_data['positions']:
            pos_bytes.extend(struct.pack('<fff', px, py, pz))
            min_pos[0] = min(min_pos[0], px)
            min_pos[1] = min(min_pos[1], py)
            min_pos[2] = min(min_pos[2], pz)
            max_pos[0] = max(max_pos[0], px)
            max_pos[1] = max(max_pos[1], py)
            max_pos[2] = max(max_pos[2], pz)

        pos_bv_idx = len(buffer_views)
        buffer_views.append({'buffer': 0, 'byteOffset': len(buffer_bytes), 'byteLength': len(pos_bytes), 'target': 34962})
        buffer_bytes.extend(pos_bytes)

        pos_acc_idx = len(accessors)
        accessors.append({
            'bufferView': pos_bv_idx, 'byteOffset': 0, 'componentType': 5126, 'count': len(mesh_data['positions']),
            'type': 'VEC3', 'min': min_pos, 'max': max_pos
        })

        # 2. Pack Normals
        norm_bytes = bytearray()
        for nx, ny, nz in mesh_data['normals']:
            norm_bytes.extend(struct.pack('<fff', nx, ny, nz))

        norm_bv_idx = len(buffer_views)
        buffer_views.append({'buffer': 0, 'byteOffset': len(buffer_bytes), 'byteLength': len(norm_bytes), 'target': 34962})
        buffer_bytes.extend(norm_bytes)

        norm_acc_idx = len(accessors)
        accessors.append({
            'bufferView': norm_bv_idx, 'byteOffset': 0, 'componentType': 5126, 'count': len(mesh_data['normals']), 'type': 'VEC3'
        })

        # 3. Pack UVs
        uv_bytes = bytearray()
        for u, v in mesh_data['uvs']:
            uv_bytes.extend(struct.pack('<ff', u, v))

        uv_bv_idx = len(buffer_views)
        buffer_views.append({'buffer': 0, 'byteOffset': len(buffer_bytes), 'byteLength': len(uv_bytes), 'target': 34962})
        buffer_bytes.extend(uv_bytes)

        uv_acc_idx = len(accessors)
        accessors.append({
            'bufferView': uv_bv_idx, 'byteOffset': 0, 'componentType': 5126, 'count': len(mesh_data['uvs']), 'type': 'VEC2'
        })

        # 4. Pack Indices
        idx_bytes = bytearray()
        for idx in mesh_data['indices']:
            idx_bytes.extend(struct.pack('<H', idx))

        if len(buffer_bytes) % 4 != 0:
            buffer_bytes.extend(b'\x00' * (4 - (len(buffer_bytes) % 4)))

        idx_bv_idx = len(buffer_views)
        buffer_views.append({'buffer': 0, 'byteOffset': len(buffer_bytes), 'byteLength': len(idx_bytes), 'target': 34963})
        buffer_bytes.extend(idx_bytes)

        if len(buffer_bytes) % 4 != 0:
            buffer_bytes.extend(b'\x00' * (4 - (len(buffer_bytes) % 4)))

        idx_acc_idx = len(accessors)
        accessors.append({
            'bufferView': idx_bv_idx, 'byteOffset': 0, 'componentType': 5123, 'count': len(mesh_data['indices']), 'type': 'SCALAR'
        })

        mesh_idx = len(meshes)
        meshes.append({
            'name': name + 'Mesh',
            'primitives': [{
                'attributes': {'POSITION': pos_acc_idx, 'NORMAL': norm_acc_idx, 'TEXCOORD_0': uv_acc_idx},
                'indices': idx_acc_idx,
                'material': mat_idx
            }]
        })

        child_indices = [name_to_node_idx[c] for c in cfg['children']]
        node_obj = {
            'name': name,
            'translation': cfg['translation'],
            'mesh': mesh_idx
        }
        if child_indices:
            node_obj['children'] = child_indices
        nodes.append(node_obj)

    base64_buffer = base64.b64encode(buffer_bytes).decode('ascii')

    gltf_dict = {
        'asset': {'version': '2.0', 'generator': 'generate_shaman_gltf.py (HD)'},
        'scenes': [{'nodes': [0]}],
        'nodes': nodes,
        'meshes': meshes,
        'materials': materials,
        'accessors': accessors,
        'bufferViews': buffer_views,
        'buffers': [{'byteLength': len(buffer_bytes), 'uri': f'data:application/octet-stream;base64,{base64_buffer}'}]
    }

    with open('shaman.gltf', 'w') as f:
        json.dump(gltf_dict, f, indent=2)

    with open('shaman_data.js', 'w') as f:
        f.write('window.shamanGltfData = ' + json.dumps(gltf_dict) + ';\n')

if __name__ == '__main__':
    generate_obj_mtl()
    generate_gltf()
    print("Successfully generated HD shaman.obj, shaman.mtl, shaman.gltf, and shaman_data.js")
