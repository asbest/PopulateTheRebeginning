from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/PopulateTheRebeginning.html")
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Build a Hut (Cost 15 -> Time 15s)
        # We need to simulate the user action or call performAction directly if we have mana
        # Initially mana is 100. Hut costs 15.

        # Find shaman position
        shaman_pos = page.evaluate("""
            () => {
                return shaman.mesh.position;
            }
        """)

        # Build near shaman
        bx = shaman_pos['x'] + 5
        bz = shaman_pos['z'] + 5

        page.evaluate(f"""
            () => {{
                selectAction('build_hut');
                performAction({bx}, {bz});
            }}
        """)

        # Monitor building
        # Get the new building (last in array)

        print("Monitoring construction...")
        for i in range(18): # check for 18 seconds
            time.sleep(1.0)
            status = page.evaluate("""
                () => {
                    const b = buildings[buildings.length-1];
                    if(!b) return null;
                    return {
                        underConstruction: b.underConstruction,
                        timer: b.constructionTimer,
                        scaleY: b.visualMesh.scale.y
                    };
                }
            """)
            if status:
                print(f"T={i+1}s: Construction={status['underConstruction']}, Timer={status['timer']:.2f}, ScaleY={status['scaleY']:.2f}")
            else:
                print("No building found")

        # Take verification screenshot
        page.screenshot(path="/home/jules/verification/construction_test.png")

        browser.close()

if __name__ == "__main__":
    run()
