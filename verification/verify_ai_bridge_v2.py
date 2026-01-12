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

        # Setup test: Place Enemy Shaman near water
        setup_script = """() => {
            if(!window.enemyAI) return {error: "No AI"};

            const enemyShaman = window.units.find(u => u.isShaman && u.faction === 1);
            if(!enemyShaman) return {error: "No Enemy Shaman"};

            // Raise land at 100,100 to height 5.0
            const currentH = window.getHeight(100, 100);
            window.modifyTerrain(100, 100, 5, 5.0 - currentH);
            window.updateChunks(true);

            enemyShaman.mesh.position.set(100, 5, 100);
            enemyShaman.velocity.set(0,0,0);

            const playerShaman = window.units.find(u => u.isShaman && u.faction === 0);
            if(playerShaman) playerShaman.mesh.position.set(150, 5, 100);

            // Create water barrier at 105 to 110 (Height 1.0)
            for(let x=105; x<=110; x++) {
                const k = `${x},100`;
                const base = window.getBaseHeight(x, 100);
                window.terrainMods.set(k, 1.0 - base);
            }
            window.updateChunks(true);

            return {
               shamanX: 100, shamanZ: 100,
               waterX: 106, waterZ: 100,
               baseH: window.getHeight(106, 100),
               shamanGroundH: window.getHeight(100, 100)
            };
        }"""

        data = page.evaluate(setup_script)
        if data.get('error'):
            print(f"Setup Failed: {data['error']}")
            return

        print(f"Setup Data: {data}")

        # Force AI update
        print("Triggering AI Update...")
        page.evaluate("""() => {
             window.enemyAI.lastBridgeTime = -1000;
             window.enemyAI.updateShaman(0.1);
        }""")

        time.sleep(1) # Allow bridge to form

        # Check height at waterX
        new_h = page.evaluate("""(data) => {
            return window.getHeight(data.waterX, data.waterZ);
        }""", data)

        print(f"Height at {data['waterX']}: Before={data['baseH']}, After={new_h}")

        if new_h > 2.0:
            print("SUCCESS: Landbridge created over water.")
        else:
            print("FAILURE: Water still present.")

        browser.close()

if __name__ == "__main__":
    run()
