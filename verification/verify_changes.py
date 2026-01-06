
from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the file directly from the filesystem
        cwd = os.getcwd()
        file_path = f"file://{cwd}/PopulateTheRebeginning.html"
        page.goto(file_path)

        # Wait for game to initialize (loading screen to disappear)
        try:
            page.wait_for_selector("#loading", state="hidden", timeout=5000)
        except:
            print("Loading screen didn't disappear, forcing screenshot anyway")

        # Check styling of the pause button
        pause_btn = page.locator("#btn-pause")

        # Take a screenshot of the pause button area
        page.screenshot(path="verification/pause_check_visual.png", clip={"x": 0, "y": 0, "width": 100, "height": 60})

        # Verify CSS properties using JS
        bg = pause_btn.evaluate("element => getComputedStyle(element).backgroundColor")
        border = pause_btn.evaluate("element => getComputedStyle(element).border")

        print(f"Background: {bg}")
        print(f"Border: {border}")

        browser.close()

if __name__ == "__main__":
    run()
