from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the local HTML file
        file_path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto(f"file://{file_path}")

        # Wait for game to initialize
        try:
            page.wait_for_selector("#ui-layer", timeout=10000)
        except:
            print("Timeout waiting for UI")
            page.screenshot(path="verification/error.png")
            return

        time.sleep(2) # Allow init

        # Evaluate JS to setup the test scenario
        setup_script = """() => {
            try {
                if(!window.enemyAI) return {error: "No AI"};

                // Find Enemy Shaman and Player Shaman
                const enemyShaman = window.units.find(u => u.isShaman && u.faction === 1);
                const playerShaman = window.units.find(u => u.isShaman && u.faction === 0);

                if(!enemyShaman) return {error: "No Enemy Shaman"};
                if(!playerShaman) return {error: "No Player Shaman"};

                // Move Enemy Shaman to flat land
                // We'll create a flat area for him
                const startX = 100; const startZ = 100;
                window.modifyTerrain(startX, startZ, 10, 5.0 - window.getHeight(startX, startZ) + 2.0); // Ensure height ~2+
                window.updateChunks(true);

                enemyShaman.mesh.position.set(startX, window.getHeight(startX, startZ), startZ);
                enemyShaman.velocity.set(0,0,0);
                enemyShaman.state = 'idle';

                // Place Player Shaman far away
                playerShaman.mesh.position.set(startX + 50, 5, startZ);

                const dir = playerShaman.mesh.position.clone().sub(enemyShaman.mesh.position).normalize();

                // Create water exactly 4 units in front (where AI checks i=1)
                const waterPos = enemyShaman.mesh.position.clone().addScaledVector(dir, 4.0);

                // Force terrain to be water at waterPos
                window.modifyTerrain(waterPos.x, waterPos.z, 2, -10.0); // Deep hole
                window.updateChunks(true);

                const h = window.getHeight(waterPos.x, waterPos.z);

                // Reset AI timers to force think
                window.enemyAI.timer = 6.0;
                window.enemyAI.lastBridgeTime = -100;

                return {
                    success: true,
                    waterX: waterPos.x,
                    waterZ: waterPos.z,
                    startHeight: h
                };
            } catch(e) { return {error: e.toString()}; }
        }"""

        print("Setting up scenario...")
        setup_result = page.evaluate(setup_script)
        print("Setup Result:", setup_result)

        if setup_result.get('error'):
            print("Setup failed:", setup_result['error'])
            return

        # Take initial screenshot
        page.screenshot(path="verification/ai_bridge_before.png")

        print("Triggering AI Update...")
        # Force AI update
        page.evaluate("""() => {
             // Mock clock delta to ensure update runs
             window.enemyAI.update(0.1);
        }""")

        time.sleep(1) # Wait for spell effect (Raise has delay? No, modifyTerrain is instant, but visual might take a frame)

        # Check result
        check_script = """(data) => {
            const h = window.getHeight(data.waterX, data.waterZ);
            return h;
        }"""

        final_height = page.evaluate(check_script, setup_result)

        print(f"Height at water pos: before={setup_result['startHeight']}, after={final_height}")

        page.screenshot(path="verification/ai_bridge_after.png")

        if final_height > setup_result['startHeight']:
            print("SUCCESS: Terrain was raised.")
            diff = final_height - setup_result['startHeight']
            print(f"Raised by: {diff}")
        else:
            print("FAILURE: Terrain height did not increase.")

        browser.close()

if __name__ == "__main__":
    run()
