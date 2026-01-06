
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the file
        cwd = os.getcwd()
        file_path = f"file://{cwd}/PopulateTheRebeginning.html"
        page.goto(file_path)

        # Wait for initialization
        try:
            page.wait_for_selector("#loading", state="hidden", timeout=5000)
        except:
            print("Loading screen didn't disappear")

        # Inject verification logic
        # 1. Create a building at (10, 10)
        # 2. Check isBlocked near it
        # 3. Pathfind from (0,0) to (20,20) through (10,10)? No, from (8,10) to (12,10).

        result = page.evaluate("""() => {
            // Mock buildings
            buildings.length = 0; // Clear existing

            // Create a mock building object at 10,10
            const mockBuilding = {
                mesh: { position: { x: 10, y: 0, z: 10 } },
                dead: false,
                underConstruction: false
            };
            buildings.push(mockBuilding);

            // Test isBlocked
            const blocked1 = isBlocked(10, 10); // Center, should be blocked
            const blocked2 = isBlocked(10.5, 10); // dist 0.5 < 2, blocked
            const blocked3 = isBlocked(13, 13); // dist sqrt(18) ~4.2 > 2, not blocked

            // Test Pathfinder
            // Should find path around (10,10)
            const start = { x: 8, z: 10 };
            const end = { x: 12, z: 10 };

            // Note: GRID_SIZE is 2.0.
            // 8,10 -> grid 4,5
            // 12,10 -> grid 6,5
            // 10,10 -> grid 5,5 (BLOCKED)

            // A* should go around 5,5.

            const path = Pathfinder.findPath(new THREE.Vector3(8,0,10), new THREE.Vector3(12,0,10), false);

            return {
                blockedCenter: blocked1,
                blockedNear: blocked2,
                blockedFar: blocked3,
                pathLength: path.length,
                pathPoints: path.map(p => ({x:p.x, z:p.z}))
            };
        }""")

        print(f"Blocked Center (should be True): {result['blockedCenter']}")
        print(f"Blocked Near (should be True): {result['blockedNear']}")
        print(f"Blocked Far (should be False): {result['blockedFar']}")

        path = result['pathPoints']
        print(f"Path Length: {len(path)}")
        for p in path:
            print(f"Point: {p}")

        # Verify path avoids 10,10 (which is blocked)
        avoids = True
        for p in path:
            if abs(p['x'] - 10) < 1.0 and abs(p['z'] - 10) < 1.0:
                avoids = False
                print(f"Path failed: went through blocked point {p}")

        if avoids and len(path) > 0:
            print("Path successfully avoided the obstacle!")

        page.screenshot(path="verification/ai_intelligence.png")
        browser.close()

if __name__ == "__main__":
    run()
