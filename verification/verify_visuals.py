
from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.set_viewport_size({"width": 1280, "height": 720})

        # Load the local HTML file
        path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto("file://" + path)

        # Wait for game to init
        time.sleep(3)

        # Take screenshot of initial state
        page.screenshot(path="verification/screenshot_initial.png")
        print("Initial screenshot taken.")

        # Simulate zooming out to see clouds
        page.mouse.wheel(0, -500)
        time.sleep(1)
        page.screenshot(path="verification/screenshot_zoomout.png")
        print("Zoom out screenshot taken.")

        browser.close()

if __name__ == "__main__":
    run()
