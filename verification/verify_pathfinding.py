from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        file_path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto(f"file://{file_path}")

        try:
            page.wait_for_selector("#ui-layer", timeout=10000)
        except:
            print("Timeout waiting for UI")
            return

        time.sleep(2)

        # Setup test: Unit on one side of a C-shaped lake, target on other
        setup_script = """() => {
            window.mana = 1000;
            const dummyCaster = {faction: 0, mesh: {position: {x:100, y:5, z:100}}};
            window.executeSpell('create', 100, 100, dummyCaster);
            const u = window.units[window.units.length-1];

            // Raise land generally to 5.0
            window.modifyTerrain(100, 100, 50, 5.0 - window.getBaseHeight(100,100));
            window.updateChunks(true);

            // Create C-shaped lake
            // Center at 110, 100.
            // Wall of water from 105, 90 to 105, 110.
            // But checking manual override.
            // Let's just create a wall of water at x=105, z=-20 to 20

            for(let z=-20; z<=20; z++) {
                // water at x=105
                const k = `105,${100+z}`;
                const base = window.getBaseHeight(105, 100+z);
                window.terrainMods.set(k, 1.0 - base);
            }
            window.updateChunks(true);

            // Unit at 100, 100
            u.mesh.position.set(100, 5, 100);

            // Target at 110, 100 (Behind wall)
            const targetPos = {x: 110, z: 100};

            // Should find path around the ends (z > 120 or z < 80)
            // 20 length wall? 100+z -> 80 to 120.

            return {
               unitX: 100, unitZ: 100,
               targetX: 110, targetZ: 100
            };
        }"""

        data = page.evaluate(setup_script)
        print(f"Setup Data: {data}")

        # Check path
        print("Finding Path...")
        path_check = page.evaluate("""(data) => {
            const start = new THREE.Vector3(data.unitX, 0, data.unitZ);
            const end = new THREE.Vector3(data.targetX, 0, data.targetZ);
            const path = window.Pathfinder.findPath(start, end, false);
            return {
                length: path.length,
                points: path.map(v => ({x: v.x, z: v.z}))
            };
        }""", data)

        print(f"Path Length: {path_check['length']}")

        # Verify path goes around
        # Check if any point in path has x=105 and z between 80 and 120 (approx)
        # Grid size is 2.

        goes_through_water = False
        for p_pt in path_check['points']:
            if abs(p_pt['x'] - 105) < 1.0 and 80 <= p_pt['z'] <= 120:
                goes_through_water = True
                break

        if not goes_through_water and path_check['length'] > 2:
            print("SUCCESS: Path goes around the water barrier.")
        elif goes_through_water:
            print("FAILURE: Path goes through water.")
        else:
            print("FAILURE: Path too short or invalid (length <= 2 implies direct failure?).")
            # If pathfinder fails it returns [endPos]. Length 1.
            # If pathfinder finds path, length > 1 usually.

        # Also check Manual Move Block in Combat
        # Place unit at 104, 100 (Edge)
        # Target at 106, 100.
        # Force combat state and see if it moves.

        print("Testing Combat Move Block...")
        combat_block = page.evaluate("""(data) => {
            const u = window.units[window.units.length-1];
            u.mesh.position.set(104, 5, 100);
            u.velocity.set(0,0,0);
            u.state = 'combat';

            // Mock target
            u.attackTarget = {
                mesh: { position: new THREE.Vector3(106, 5, 100) },
                state: 'idle'
            };

            // Force update (dt = 0.1)
            u.update(0.1);

            // Check if moved towards 106
            return u.velocity.lengthSq() > 0.001;
        }""", data)

        print(f"Moved into water in combat? {combat_block}")

        if not combat_block:
            print("SUCCESS: Combat movement blocked at water edge.")
        else:
            print("FAILURE: Unit walked into water.")

        browser.close()

if __name__ == "__main__":
    run()
