
import os
from playwright.sync_api import sync_playwright

def verify_pathfinding():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Capture console messages
        page.on("console", lambda msg: print(f"Console {msg.type}: {msg.text}"))
        page.on("pageerror", lambda exc: print(f"Page error: {exc}"))

        # Load the HTML file directly
        file_path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto(f"file://{file_path}")

        # Wait for loading to finish (indicated by 'Generating World...' disappearing)
        try:
            page.wait_for_selector("#loading", state="hidden", timeout=30000)
            print("Game loaded successfully.")
        except Exception as e:
            print("Timeout waiting for game to load.")
            page.screenshot(path="verification/error.png")
            raise e

        # Wait a bit for initialization
        page.wait_for_timeout(2000)

        # Take screenshot
        os.makedirs("verification", exist_ok=True)
        screenshot_path = os.path.abspath("verification/game_screen.png")
        page.screenshot(path=screenshot_path)
        print(f"Screenshot saved to {screenshot_path}")

        browser.close()

if __name__ == "__main__":
    verify_pathfinding()
