from playwright.sync_api import sync_playwright, expect
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 800, 'height': 600})
        page = context.new_page()

        # Load the HTML file
        # Since we are in /app, the file is at /app/PopulateTheRebeginning.html
        url = "file://" + os.path.abspath("PopulateTheRebeginning.html")
        print(f"Loading {url}")
        page.goto(url)

        # Wait for loading screen to disappear
        print("Waiting for game load...")
        expect(page.locator("#loading")).to_have_css("display", "none", timeout=10000)

        # Open Spells Menu
        print("Opening Spells Menu...")
        # Hold mouse on main icon to open menu
        # Simulating hold-drag logic from setupRadialMenu
        # Since logic relies on mouseup over an option, we can simulate clicks if setupRadialMenu supports it?
        # No, setupRadialMenu uses mousedown -> move -> mouseup.

        # However, window.switchTab is global. We can just call it to force the menu open for verification.
        page.evaluate("window.switchTab('spells')")

        # Wait for Spells menu to be visible
        expect(page.locator("#menu-spells")).to_be_visible()

        # Verify Heal Button
        print("Verifying Heal Button...")
        heal_btn = page.locator("#btn-heal")
        expect(heal_btn).to_be_visible()
        expect(heal_btn).to_contain_text("Heal (10)")

        # Screenshot Spells
        page.screenshot(path="verification/ui_spells.png")
        print("Screenshot saved: verification/ui_spells.png")

        # Verify Unit List Styling
        # Wait for at least one unit to appear (should be instant after load)
        page.wait_for_selector(".unit-item", timeout=5000)

        # Verify CSS class .unit-item width
        # We can just screenshot the unit list
        unit_list = page.locator("#unit-list")
        unit_list.screenshot(path="verification/ui_unitlist.png")
        print("Screenshot saved: verification/ui_unitlist.png")

        browser.close()

if __name__ == "__main__":
    run()
