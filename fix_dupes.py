import re

with open('PopulateTheRebeginning.html', 'r') as f:
    content = f.read()

# The duplicates look like:
# redShirt: new THREE.MeshStandardMaterial({color: COLORS.red, roughness: 0.7, metalness: 0.1}),
#         eyeWhite: new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.2, metalness: 0.0}),
#         eyeBlack: new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.2, metalness: 0.0}),
#         shoe: new THREE.MeshStandardMaterial({color: 0x332211, roughness: 0.9, metalness: 0.0}),
#         eyeWhite: new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.2, metalness: 0.0}),
# ...

# We can just remove all extra occurrences of eyeWhite, eyeBlack, and shoe using regex
content = re.sub(
    r'(eyeWhite: new THREE\.MeshStandardMaterial\(\{color: 0xffffff, roughness: 0\.2, metalness: 0\.0\}\),\s*)+',
    r'eyeWhite: new THREE.MeshStandardMaterial({color: 0xffffff, roughness: 0.2, metalness: 0.0}),\n        ',
    content
)

content = re.sub(
    r'(eyeBlack: new THREE\.MeshStandardMaterial\(\{color: 0x111111, roughness: 0\.2, metalness: 0\.0\}\),\s*)+',
    r'eyeBlack: new THREE.MeshStandardMaterial({color: 0x111111, roughness: 0.2, metalness: 0.0}),\n        ',
    content
)

content = re.sub(
    r'(shoe: new THREE\.MeshStandardMaterial\(\{color: 0x332211, roughness: 0\.9, metalness: 0\.0\}\),\s*)+',
    r'shoe: new THREE.MeshStandardMaterial({color: 0x332211, roughness: 0.9, metalness: 0.0}),\n        ',
    content
)

with open('PopulateTheRebeginning.html', 'w') as f:
    f.write(content)
