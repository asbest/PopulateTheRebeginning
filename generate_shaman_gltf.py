import json
import math
import struct
import base64
import os

# --- Geometry Generation Functions ---

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

def create_cylinder_mesh(radius_top, radius_bottom, height, segments=8, offset=(0, 0, 0), rot_z=0.0):
    ox, oy, oz = offset
    positions = []
    normals = []
    uvs = []
    indices = []

    half_h = height / 2.0
    cos_rz = math.cos(rot_z)
    sin_rz = math.sin(rot_z)

    def transform(x, y, z):
        # Rotate around Z, then add offset
        rx = x * cos_rz - y * sin_rz
        ry = x * sin_rz + y * cos_rz
        return [ox + rx, oy + ry, oz + z]

    def transform_norm(nx, ny, nz):
        rx = nx * cos_rz - ny * sin_rz
        ry = nx * sin_rz + ny * cos_rz
        return [rx, ry, nz]

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

def create_sphere_mesh(radius, lat_segments=8, lon_segments=10, offset=(0, 0, 0)):
    ox, oy, oz = offset
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

            positions.append([ox + radius * nx, oy + radius * ny, oz + radius * nz])
            normals.append([nx, ny, nz])
            uvs.append([u, v])

    for i in range(lat_segments):
        for j in range(lon_segments):
            p1 = i * (lon_segments + 1) + j
            p2 = p1 + (lon_segments + 1)
            indices.extend([p1, p2, p1 + 1, p1 + 1, p2, p2 + 1])

    return {'positions': positions, 'normals': normals, 'uvs': uvs, 'indices': indices}

def create_feather_mesh(width, height, offset=(0, 0, 0), tilt_z=0.0):
    # Feather modeled as a tapered diamond box
    ox, oy, oz = offset
    cos_t = math.cos(tilt_z)
    sin_t = math.sin(tilt_z)

    # 4 points along feather body
    pts = [
        [0, 0, 0],
        [-width/2, height*0.4, 0],
        [0, height, 0],
        [width/2, height*0.4, 0]
    ]

    positions = []
    normals = []
    uvs = []
    indices = []

    transformed_pts = []
    for px, py, pz in pts:
        rx = px * cos_t - py * sin_t
        ry = px * sin_t + py * cos_t
        transformed_pts.append([ox + rx, oy + ry, oz + pz])

    norm_f = [-sin_t, cos_t, 1.0]
    norm_b = [-sin_t, cos_t, -1.0]

    # Front face
    positions.extend(transformed_pts)
    normals.extend([norm_f]*4)
    uvs.extend([[0.5,0], [0,0.4], [0.5,1.0], [1,0.4]])
    indices.extend([0, 1, 2, 0, 2, 3])

    # Back face
    positions.extend(transformed_pts)
    normals.extend([norm_b]*4)
    uvs.extend([[0.5,0], [0,0.4], [0.5,1.0], [1,0.4]])
    indices.extend([4, 6, 5, 4, 7, 6])

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

# --- Build Node Geometry Parts ---

# 1. Torso
robe = create_cylinder_mesh(0.22, 0.38, 0.6, segments=10, offset=(0, -0.1, 0))
chest = create_box_mesh(0.48, 0.35, 0.28, offset=(0, 0.2, 0))
cape = create_box_mesh(0.45, 0.7, 0.05, offset=(0, 0.0, -0.2))
belt = create_cylinder_mesh(0.27, 0.27, 0.08, segments=10, offset=(0, -0.12, 0))
torso_mesh = merge_meshes([robe, chest, cape, belt])

# 2. Head
head_base = create_sphere_mesh(0.16, offset=(0, 0.12, 0))
mask = create_box_mesh(0.26, 0.3, 0.1, offset=(0, 0.12, 0.14))
horn1 = create_cylinder_mesh(0.01, 0.04, 0.3, segments=6, offset=(0.15, 0.2, 0.08), rot_z=-0.3)
horn2 = create_cylinder_mesh(0.01, 0.04, 0.3, segments=6, offset=(-0.15, 0.2, 0.08), rot_z=0.3)
head_mesh = merge_meshes([head_base, mask, horn1, horn2])

# 3. Headdress
f_center = create_feather_mesh(0.12, 0.65, offset=(0, 0.0, 0), tilt_z=0.0)
f_left1 = create_feather_mesh(0.11, 0.55, offset=(-0.05, 0.0, 0), tilt_z=-0.25)
f_right1 = create_feather_mesh(0.11, 0.55, offset=(0.05, 0.0, 0), tilt_z=0.25)
f_left2 = create_feather_mesh(0.10, 0.45, offset=(-0.1, 0.0, 0), tilt_z=-0.5)
f_right2 = create_feather_mesh(0.10, 0.45, offset=(0.1, 0.0, 0), tilt_z=0.5)
crown_base = create_cylinder_mesh(0.16, 0.18, 0.08, segments=8, offset=(0, -0.04, 0))
headdress_mesh = merge_meshes([f_center, f_left1, f_right1, f_left2, f_right2, crown_base])

# 4. ArmL
armL_upper = create_cylinder_mesh(0.07, 0.06, 0.25, segments=8, offset=(0, -0.12, 0))
armL_lower = create_cylinder_mesh(0.06, 0.05, 0.25, segments=8, offset=(0, -0.32, 0))
armL_hand = create_sphere_mesh(0.055, offset=(0, -0.46, 0))
armL_mesh = merge_meshes([armL_upper, armL_lower, armL_hand])

# 5. ArmR
armR_upper = create_cylinder_mesh(0.07, 0.06, 0.25, segments=8, offset=(0, -0.12, 0))
armR_lower = create_cylinder_mesh(0.06, 0.05, 0.25, segments=8, offset=(0, -0.32, 0))
armR_hand = create_sphere_mesh(0.055, offset=(0, -0.46, 0))
armR_mesh = merge_meshes([armR_upper, armR_lower, armR_hand])

# 6. Staff
shaft = create_cylinder_mesh(0.035, 0.035, 1.8, segments=8, offset=(0, 0.2, 0))
totem = create_box_mesh(0.18, 0.18, 0.18, offset=(0, 0.95, 0))
orb = create_sphere_mesh(0.1, offset=(0, 1.12, 0))
staff_mesh = merge_meshes([shaft, totem, orb])

# 7. LegL
legL_upper = create_cylinder_mesh(0.08, 0.07, 0.3, segments=8, offset=(0, -0.15, 0))
legL_lower = create_cylinder_mesh(0.07, 0.06, 0.3, segments=8, offset=(0, -0.4, 0))
legL_foot = create_box_mesh(0.1, 0.08, 0.2, offset=(0, -0.56, 0.05))
legL_mesh = merge_meshes([legL_upper, legL_lower, legL_foot])

# 8. LegR
legR_upper = create_cylinder_mesh(0.08, 0.07, 0.3, segments=8, offset=(0, -0.15, 0))
legR_lower = create_cylinder_mesh(0.07, 0.06, 0.3, segments=8, offset=(0, -0.4, 0))
legR_foot = create_box_mesh(0.1, 0.08, 0.2, offset=(0, -0.56, 0.05))
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
    mtl_content = """# Populous Shaman Materials
newmtl ShamanRobe
Kd 0.85 0.25 0.10
Ka 0.20 0.05 0.02
Ks 0.1 0.1 0.1
Ns 10

newmtl ShamanSkin
Kd 0.82 0.70 0.55
Ka 0.20 0.15 0.10
Ks 0.1 0.1 0.1
Ns 5

newmtl ShamanMask
Kd 0.95 0.85 0.30
Ka 0.20 0.20 0.05
Ks 0.3 0.3 0.3
Ns 30

newmtl ShamanFeather
Kd 0.95 0.95 0.95
Ka 0.20 0.20 0.20
Ks 0.1 0.1 0.1
Ns 10

newmtl ShamanStaff
Kd 0.45 0.28 0.12
Ka 0.10 0.05 0.02
Ks 0.1 0.1 0.1
Ns 5

newmtl ShamanOrb
Kd 1.00 0.84 0.00
Ka 0.40 0.30 0.00
Ks 0.8 0.8 0.8
Ns 50
"""
    with open('shaman.mtl', 'w') as f:
        f.write(mtl_content)

    obj_lines = ["# Populous Shaman OBJ Model", "mtllib shaman.mtl\n"]

    # Material map per node name
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

    # Helper to calculate world positions for OBJ export
    def get_world_transform(node_name):
        # Accumulate translations
        chain = []
        curr = node_name
        while curr:
            cfg = next(c for c in node_configs if c['name'] == curr)
            chain.append(cfg['translation'])
            # find parent
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

        # Vertices
        for px, py, pz in mesh['positions']:
            obj_lines.append(f"v {px+tx:.4f} {py+ty:.4f} {pz+tz:.4f}")
        # Normals
        for nx, ny, nz in mesh['normals']:
            obj_lines.append(f"vn {nx:.4f} {ny:.4f} {nz:.4f}")
        # UVs
        for u, v in mesh['uvs']:
            obj_lines.append(f"vt {u:.4f} {v:.4f}")

        # Faces
        for i in range(0, len(mesh['indices']), 3):
            i1 = mesh['indices'][i] + v_offset
            i2 = mesh['indices'][i+1] + v_offset
            i3 = mesh['indices'][i+2] + v_offset
            obj_lines.append(f"f {i1}/{i1}/{i1} {i2}/{i2}/{i2} {i3}/{i3}/{i3}")

        v_offset += len(mesh['positions'])

    with open('shaman.obj', 'w') as f:
        f.write("\n".join(obj_lines))

# --- Generate shaman.gltf (GLTF 2.0 with embedded binary buffer) ---

def generate_gltf():
    buffer_bytes = bytearray()
    buffer_views = []
    accessors = []
    meshes = []
    nodes = []
    materials = [
        {'name': 'ShamanRobe', 'pbrMetallicRoughness': {'baseColorFactor': [0.85, 0.25, 0.10, 1.0], 'roughnessFactor': 0.7, 'metallicFactor': 0.1}},
        {'name': 'ShamanSkin', 'pbrMetallicRoughness': {'baseColorFactor': [0.82, 0.70, 0.55, 1.0], 'roughnessFactor': 0.7, 'metallicFactor': 0.1}},
        {'name': 'ShamanMask', 'pbrMetallicRoughness': {'baseColorFactor': [0.95, 0.85, 0.30, 0.8], 'roughnessFactor': 0.6, 'metallicFactor': 0.2}},
        {'name': 'ShamanFeather', 'pbrMetallicRoughness': {'baseColorFactor': [0.95, 0.95, 0.95, 1.0], 'roughnessFactor': 0.8, 'metallicFactor': 0.1}},
        {'name': 'ShamanStaff', 'pbrMetallicRoughness': {'baseColorFactor': [0.45, 0.28, 0.12, 1.0], 'roughnessFactor': 0.8, 'metallicFactor': 0.1}},
        {'name': 'ShamanOrb', 'pbrMetallicRoughness': {'baseColorFactor': [1.0, 0.84, 0.0, 1.0], 'roughnessFactor': 0.2, 'metallicFactor': 0.8}},
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
            idx_bytes.extend(struct.pack('<H', idx)) # unsigned short

        # Pad bufferView to 4-byte boundary
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
        'asset': {'version': '2.0', 'generator': 'generate_shaman_gltf.py'},
        'scenes': [{'nodes': [0]}], # Node 0 is Torso
        'nodes': nodes,
        'meshes': meshes,
        'materials': materials,
        'accessors': accessors,
        'bufferViews': buffer_views,
        'buffers': [{'byteLength': len(buffer_bytes), 'uri': f'data:application/octet-stream;base64,{base64_buffer}'}]
    }

    with open('shaman.gltf', 'w') as f:
        json.dump(gltf_dict, f, indent=2)

if __name__ == '__main__':
    generate_obj_mtl()
    generate_gltf()
    print("Successfully generated shaman.obj, shaman.mtl, and shaman.gltf")
