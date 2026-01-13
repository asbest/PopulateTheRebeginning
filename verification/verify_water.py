from playwright.sync_api import sync_playwright

def verify_water_walking():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Load local file
        page.goto("file:///app/PopulateTheRebeginning.html")

        # Wait for game to init (loading screen gone)
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Wait a bit for terrain generation and units to settle
        page.wait_for_timeout(2000)

        # We can execute JS to check unit positions and heights
        # Check if units are grounded correctly (visual offset)
        unit_data = page.evaluate("""
            () => {
                return window.units.map(u => ({
                    type: u.type,
                    y: u.mesh.position.y,
                    groundH: window.getHeight(u.mesh.position.x, u.mesh.position.z),
                    scaleY: u.mesh.scale.y
                }));
            }
        """)

        print("Unit Data:", unit_data)

        for u in unit_data:
            expected_y = u['groundH'] - 0.1 * u['scaleY']
            if abs(u['y'] - expected_y) > 0.01:
                print(f"FAIL: Unit {u['type']} at Y={u['y']} expected {expected_y}")
            else:
                print(f"PASS: Unit {u['type']} grounded correctly.")

        # Take screenshot
        page.screenshot(path="/app/verification/water_walking_verify.png")
        browser.close()

if __name__ == "__main__":
    verify_water_walking()
