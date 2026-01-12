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

        # Setup test: Unit on flat land
        setup_script = """() => {
            window.mana = 1000;
            const dummyCaster = {faction: 0, mesh: {position: {x:100, y:5, z:100}}};
            window.executeSpell('create', 100, 100, dummyCaster);
            const u = window.units[window.units.length-1];

            // Raise land to 5.0
            window.modifyTerrain(100, 100, 50, 5.0 - window.getBaseHeight(100,100));
            window.updateChunks(true);

            u.mesh.position.set(100, 5, 100);
            u.velocity.set(0,0,0);

            // Create a path scenario
            // (100,100) -> (110, 110)
            // If pathfinding uses grid size 2, steps might be (100,100)->(102,102)->...
            // Or (100,100)->(102,100)->(102,102)... depending on neighbors.
            // With diagonal enabled, it's straight-ish.
            // But smoothing should reduce node count if line of sight is clear.

            return {
               unitX: 100, unitZ: 100,
               targetX: 110, targetZ: 110
            };
        }"""

        data = page.evaluate(setup_script)
        print(f"Setup Data: {data}")

        # Check raw path vs smooth path length
        path_data = page.evaluate("""(data) => {
            const start = new THREE.Vector3(data.unitX, 0, data.unitZ);
            const end = new THREE.Vector3(data.targetX, 0, data.targetZ);

            const rawPath = window.Pathfinder.findPath(start, end, false);
            // smoothPath is defined globally now or inside closure?
            // It was defined globally in the patch.
            // But wait, it uses 'getHeight' and 'isBlocked' which are global.
            // But 'isWalkableLine' is also global.

            // Let's call smoothPath if available
            let smoothLen = -1;
            if (typeof window.smoothPath === 'undefined') {
                // It might be inside the closure if I put it there?
                // I put it before Humanoid class. It should be global.
            }

            // Actually, I put it in global scope in the patch.
            // BUT verify script might need to access it via window if not explicitly attached?
            // Functions declared in global scope in non-module script are on window.

            let smoothed = [];
            try {
                smoothed = window.smoothPath(rawPath, false);
            } catch(e) {
                return {error: e.toString()};
            }

            return {
                rawLen: rawPath.length,
                smoothLen: smoothed.length
            };
        }""", data)

        print(f"Path Data: {path_data}")

        # We expect smooth path to be shorter (fewer nodes) than raw path if it was zig-zaggy or had many small steps.
        # 100,100 -> 110,110 is 10*sqrt(2) dist ~14.
        # Grid size 2.
        # Raw path steps ~5-7?
        # Smoothed path should be just 2 points (Start, End) if clear.

        if path_data.get('smoothLen') == 2:
            print("SUCCESS: Path smoothed to straight line.")
        elif path_data.get('smoothLen') < path_data.get('rawLen'):
            print("SUCCESS: Path smoothed (nodes reduced).")
        else:
            print("FAILURE: Path smoothing didn't reduce nodes (or raw path was already minimal).")

        browser.close()

if __name__ == "__main__":
    run()
