import re

with open('PopulateTheRebeginning.html', 'r') as f:
    content = f.read()

# Let's extract the exact block we want and replace the messy part
start_str = "        redShirt: new THREE.MeshStandardMaterial({color: COLORS.red, roughness: 0.7, metalness: 0.1}),"
end_str = "        hpBack: new THREE.MeshBasicMaterial({color: 0x880000}),"

start_idx = content.find(start_str)
end_idx = content.find(end_str)

if start_idx != -1 and end_idx != -1:
    clean_block = """        redShirt: new THREE.MeshStandardMaterial({color: COLORS.red, roughness: 0.7, metalness: 0.1}),
        eyeWhite: new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.2, metalness: 0.0}),
        eyeBlack: new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.2, metalness: 0.0}),
        shoe: new THREE.MeshStandardMaterial({color: 0x332211, roughness: 0.9, metalness: 0.0}),
"""
    new_content = content[:start_idx] + clean_block + content[end_idx:]
    with open('PopulateTheRebeginning.html', 'w') as f:
        f.write(new_content)
