from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(viewport={'width': 1280, 'height': 720})
        page = context.new_page()

        # Load page
        page.goto(f"file://{os.getcwd()}/PopulateTheRebeginning.html")
        page.wait_for_selector("canvas")

        # Wait for game init
        time.sleep(2)

        # Select the first unit (Shaman) from the list
        print("Selecting unit...")
        # The first unit item in the list
        unit_item = page.locator(".unit-item").first
        if unit_item.count() > 0:
            unit_item.click()
            time.sleep(1)

            # Zoom in to trigger FPV
            # Need to scroll UP (negative deltaY) to zoom in (reduce viewScale)
            # viewScale starts ~35. target <= 3. delta = 32. step=0.05. total = 640.
            print("Zooming in to enter FPV...")
            page.mouse.move(640, 360) # Center
            for _ in range(10):
                page.mouse.wheel(0, -100)
                time.sleep(0.1)

            time.sleep(2) # Wait for camera update

            # Take screenshot of FPV view
            page.screenshot(path="verification/fpv_final.png")
            print("Screenshot saved to verification/fpv_final.png")

        else:
            print("No units found to select!")

        # Verify Pause Menu logic again briefly
        print("Verifying Pause Menu...")
        page.evaluate("togglePause()")
        time.sleep(0.5)
        if page.is_visible("#pause-menu"):
            print("Pause menu visible.")
        else:
            print("Pause menu NOT visible.")

        browser.close()

if __name__ == "__main__":
    run()
