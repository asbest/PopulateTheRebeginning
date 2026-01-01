from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the file
        cwd = os.getcwd()
        page.goto(f"file://{cwd}/PopulateTheRebeginning.html")

        # Wait for loading to finish
        try:
            page.wait_for_selector("#loading", state="hidden", timeout=10000)
        except:
            print("Loading screen didn't hide in time, maybe stuck?")

        # Verify Joystick
        joystick = page.locator("#joystick-area")
        if joystick.count() > 0 and joystick.is_visible():
            print("Joystick found and visible")
        else:
            print("Joystick NOT found or not visible")

        # Verify Right Menu
        right_menu = page.locator("#right-menu")
        if right_menu.count() > 0 and right_menu.is_visible():
            print("Right Menu found and visible")
        else:
            print("Right Menu NOT found or not visible")

        # Verify Unit List
        unit_list = page.locator("#unit-list")
        if unit_list.count() > 0 and unit_list.is_visible():
            print("Unit List found and visible")

        # Take screenshot
        page.screenshot(path="verification/ui_verification.png")
        print("Screenshot saved to verification/ui_verification.png")

        browser.close()

if __name__ == "__main__":
    run()
