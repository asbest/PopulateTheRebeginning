import re

with open('PopulateTheRebeginning.html', 'r') as f:
    content = f.read()

# Update bunny spawn logic
new_bunny_code = """
    spawnBunny: function(randomPos=false) {
        const group = new THREE.Group();
        const color = new THREE.Color().setHSL(Math.random(), 0.8 + Math.random()*0.2, 0.4 + Math.random()*0.4);
        const mat = new THREE.MeshStandardMaterial({color: color, roughness: 0.8});

        const bodySize = (0.2 + Math.random() * 0.1) * 1.7;
        const bodyGeo = new THREE.SphereGeometry(bodySize * 0.6, 16, 16);
        const body = new THREE.Mesh(bodyGeo, mat);
        body.scale.set(1.0, 0.8, 1.2);
        body.position.y = bodySize * 0.4;
        group.add(body);

        const headGeo = new THREE.SphereGeometry(bodySize * 0.4, 16, 16);
        const head = new THREE.Mesh(headGeo, mat);
        head.position.set(0, bodySize * 0.8, bodySize * 0.5);
        group.add(head);

        const earGeo = new THREE.SphereGeometry(bodySize * 0.15, 12, 12);
        const leftEar = new THREE.Mesh(earGeo, mat);
        leftEar.scale.set(1, 3, 0.5);
        leftEar.position.set(-bodySize * 0.2, bodySize * 1.2, bodySize * 0.5);
        leftEar.rotation.x = -0.2;
        group.add(leftEar);

        const rightEar = new THREE.Mesh(earGeo, mat);
        rightEar.scale.set(1, 3, 0.5);
        rightEar.position.set(bodySize * 0.2, bodySize * 1.2, bodySize * 0.5);
        rightEar.rotation.x = -0.2;
        group.add(rightEar);
"""

# Replace bunny
pattern_bunny = r"    spawnBunny: function\(randomPos=false\) \{[\s\S]*?(?=        let x, z;)"
content = re.sub(pattern_bunny, new_bunny_code + "\n", content, count=1)

# Update bird size
pattern_bird = r"        const size = 0.3 \+ Math\.random\(\) \* 0\.2;"
content = content.replace(pattern_bird, "        const size = (0.3 + Math.random() * 0.2) * 1.7;")

with open('PopulateTheRebeginning.html', 'w') as f:
    f.write(content)
