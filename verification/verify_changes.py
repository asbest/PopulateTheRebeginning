from playwright.sync_api import sync_playwright
import os

def verify_pause_menu_and_fpv():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 720})

        # Use absolute path correctly
        cwd = os.getcwd()
        path = f"file://{cwd}/PopulateTheRebeginning.html"
        print(f"Navigating to {path}")
        page.goto(path)

        # Wait for loading to finish
        page.wait_for_selector("#loading", state="hidden", timeout=30000)
        print("Page loaded.")

        # 2. Click Pause Button to show menu
        page.click("#btn-pause")

        # Wait for menu to appear
        pause_menu = page.locator("#pause-menu")
        if pause_menu.is_visible():
            print("Pause menu is visible.")
        else:
            print("Pause menu NOT visible.")

        # Take screenshot of Pause Menu
        page.screenshot(path="verification/pause_menu.png")

        # Close menu by clicking Resume
        page.get_by_text("Resume").click()

        # 3. Select a unit and zoom in for FPV check
        # We can use JS to select the shaman
        page.evaluate("if(units.length > 0) { selectedUnits = [units[0]]; isFPV = true; updateCameraPosition(); }")

        # Take screenshot of FPV
        page.wait_for_timeout(1000) # Wait for render
        page.screenshot(path="verification/fpv_view.png")

        # 4. Save Game Test (mock alert)
        page.on("dialog", lambda dialog: dialog.accept())
        page.evaluate("saveGame()")
        print("Save Game executed.")

        browser.close()

if __name__ == "__main__":
    verify_pause_menu_and_fpv()
