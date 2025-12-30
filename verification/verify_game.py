from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 720})

        # 1. Load the game
        page.goto("http://localhost:8080/PopulateTheRebeginning.html")

        # Wait for loading screen to disappear
        page.wait_for_selector("#loading", state="hidden")

        # 2. Directly switch tab using JS because the UI interaction is tricky with the custom radial menu
        page.evaluate("window.switchTab('build')")

        # Give it a moment
        page.wait_for_timeout(500)

        # Take screenshot of Build Menu
        page.screenshot(path="verification/build_menu.png")

        # 3. Check for Boat Button/Action
        shipyard_btn = page.locator("#btn-build_shipyard")
        if shipyard_btn.is_visible():
            print("Shipyard button visible")
        else:
            print("Shipyard button NOT visible")

        # Check for AIRSHIP button now, not boat
        boat_btn = page.locator("#btn-build_airship")
        if boat_btn.is_visible():
            print("Airship button visible")
        else:
            print("Airship button NOT visible")

        # 4. Check Unload Button existence (initially hidden)
        unload_btn = page.locator("#btn-unload")
        # Check if it exists in DOM
        if unload_btn.count() > 0:
            print("Unload button exists in DOM")
        else:
            print("Unload button MISSING from DOM")

        # Close browser
        browser.close()

if __name__ == "__main__":
    verify_changes()
