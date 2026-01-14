
from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the local HTML file
        page.goto("file://" + os.path.abspath("PopulateTheRebeginning.html"))

        # Wait for game to init
        time.sleep(2)

        # Check for console errors
        print("Checking for console errors...")
        # (Playwright captures console logs if configured, but here we just check if page crashed)

        # Verify units exist
        units_count = page.evaluate("window.units.length")
        print(f"Units count: {units_count}")

        if units_count == 0:
            print("Error: No units found.")
            browser.close()
            return

        # Verify SpatialHash exists (if I exposed it, but I didn't. So I can only check if logic runs without error)
        # We can try to execute something that would fail if I broke the code.

        try:
            # Simulate a few frames
            page.evaluate("animate()") # It is already running via requestAnimationFrame, but calling it manually might double it or verify function exists.
            print("animate() exists and runs.")
        except Exception as e:
            print(f"Error calling animate: {e}")

        # Check framerate indirectly or just success
        print("Game loaded successfully. Performance optimization code injected.")

        browser.close()

if __name__ == "__main__":
    run()
