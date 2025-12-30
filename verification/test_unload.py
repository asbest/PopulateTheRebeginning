from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the HTML file directly
        file_path = os.path.abspath("verification/index.html")
        page.goto(f"file://{file_path}")

        # Wait for initialization (loading screen gone)
        page.wait_for_selector("#loading", state="hidden")

        # Inject code to force selection of an airship with passengers to test the button visibility
        # Mock tab-spells/build/basic if they don't exist to avoid error in updateContextMenus
        page.evaluate("""
            // Mock selected units
            const airship = {
                type: 'airship',
                passengers: ['p1'], // Simulate passengers
                unload: function() { console.log("Unload called"); }
            };
            selectedUnits = [airship];

            // Override updateContextMenus to fix null element error if it persists
            // or just call it after ensuring elements exist
            updateContextMenus();
        """)

        # Check if the unload button is visible
        unload_btn = page.locator("#btn-unload")
        if unload_btn.is_visible():
            print("Unload button is visible.")
            unload_btn.screenshot(path="verification/unload_btn.png")
            page.screenshot(path="verification/full_screen.png")
        else:
            print("Unload button is NOT visible.")

        browser.close()

if __name__ == "__main__":
    run()
