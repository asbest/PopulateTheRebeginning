from playwright.sync_api import sync_playwright

def verify_ui_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # Set viewport size to capture more of the UI
        page.set_viewport_size({"width": 1280, "height": 720})

        print("Navigating to page...")
        page.goto("file:///app/PopulateTheRebeginning.html")

        print("Waiting for loading to finish...")
        # Wait for loading screen to disappear
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        print("Opening menus to capture screenshots...")

        # 1. Main View (Radial Menu Closed)
        page.screenshot(path="verification/ui_main.png")

        # 2. Spells Menu
        # Click main icon to open radial? Or use switchTab global function?
        # The radial menu requires hold/drag which is hard to simulate perfectly in basic script,
        # but we can call the global switchTab function exposed in window.
        page.evaluate("window.switchTab('spells')")
        page.wait_for_timeout(500) # Wait for UI update
        page.screenshot(path="verification/ui_spells.png")

        # 3. Build Menu
        page.evaluate("window.switchTab('build')")
        page.wait_for_timeout(500)
        page.screenshot(path="verification/ui_build.png")

        # 4. Basic Menu
        page.evaluate("window.switchTab('basic')")
        page.wait_for_timeout(500)
        page.screenshot(path="verification/ui_basic.png")

        # Capture specific elements to verify size
        # Action button
        btn = page.query_selector("#btn-move")
        if btn:
             btn.screenshot(path="verification/btn_move.png")

        # Unit List (needs units)
        # We can inject a dummy unit or wait for game start
        # Game starts with units.
        page.wait_for_selector("#unit-list .unit-item", timeout=5000)
        unit_list = page.query_selector("#unit-list")
        if unit_list:
            unit_list.screenshot(path="verification/unit_list.png")

        browser.close()
        print("Screenshots captured.")

if __name__ == "__main__":
    verify_ui_changes()
