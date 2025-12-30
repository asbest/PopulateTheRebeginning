from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-gl=egl'])
        page = browser.new_page()

        url = f"file://{os.getcwd()}/PopulateTheRebeginning.html"
        print(f"Navigating to {url}")
        page.goto(url)
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Open Spells Menu
        # Click on main icon to hold? No, need to trigger radial menu open.
        # Simulating touch or mouse hold is tricky in headless for canvas/overlay mix.
        # But we can force switchTab('spells') via JS
        page.evaluate("switchTab('spells')")
        page.wait_for_timeout(500)

        # Take screenshot of the spell menu to see the Heal button
        # The menu is #menu-spells
        # We want to see the action bar
        page.screenshot(path="verification/spells_menu.png")
        print("Screenshot saved to verification/spells_menu.png")

        browser.close()

if __name__ == "__main__":
    run()
