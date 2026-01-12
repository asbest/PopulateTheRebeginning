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

        # Setup test
        setup_script = """() => {
            window.mana = 1000;
            const dummyCaster = {faction: 0, mesh: {position: {x:100, y:5, z:100}}};
            window.executeSpell('create', 100, 100, dummyCaster);
            const u = window.units[window.units.length-1];

            // Create sharp cliff at 104
            // To ensure 103 is safe (2.0) and 104 is water (1.5)
            // modifyTerrain blends.
            // We can hack terrainMods directly.

            // Set terrain at 104,100 to 1.5
            // Set terrain at 103,100 to 2.5
            // We need to set base to flat first maybe?
            // Just force override values nearby

            const setH = (x, z, val) => {
               const k = `${x},${z}`;
               const base = window.getBaseHeight(x, z);
               window.terrainMods.set(k, val - base);
            };

            setH(103, 100, 2.5);
            setH(104, 100, 1.5);

            // Place unit at 103
            u.mesh.position.set(103, 2.5, 100);
            u.velocity.set(0,0,0);

            return {
               unitX: 103, unitZ: 100,
               h_unit: window.getHeight(103, 100),
               h_water: window.getHeight(104, 100)
            };
        }"""

        data = page.evaluate(setup_script)
        print(f"Setup Data: {data}")

        # Test 2: Manual Move Block
        can_move = page.evaluate("""(data) => {
            const u = window.units[window.units.length-1];
            u.state = 'idle';
            u.velocity.set(0,0,0);

            // Try to move towards water (104, 100)
            // Dist 1.0 away.
            // manualMove checks future pos = pos + speed * 0.1
            // speed=6. 0.6 dist.
            // 103 + 0.6 = 103.6.
            // Interpolated height between 103(2.5) and 104(1.5).
            // At 103.6 -> 0.4 from 103, 0.6 from 104.
            // h = 2.5 * 0.4 + 1.5 * 0.6 = 1.0 + 0.9 = 1.9.
            // So 103.6 should be < 2.0.

            const vec = new THREE.Vector3(1, 0, 0);
            u.manualMove(vec);

            return {
                vel: u.velocity.lengthSq() > 0.001,
                futureH: window.getHeight(103.6, 100)
            };
        }""", data)

        print(f"Result: {can_move}")

        if not can_move['vel']:
            print("SUCCESS: Movement into shallow water was blocked.")
        else:
            print("FAILURE: Unit moved into shallow water.")

        browser.close()

if __name__ == "__main__":
    run()
