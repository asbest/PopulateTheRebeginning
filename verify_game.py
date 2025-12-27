from playwright.sync_api import sync_playwright
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        # Load local file
        page.goto("file://" + os.path.abspath("PopulateTheRebeginning.html"))
        # Wait for loading to finish (loading div hidden)
        page.wait_for_selector("#loading", state="hidden", timeout=10000)
        # Wait a bit more for rendering
        page.wait_for_timeout(2000)
        # Take screenshot
        page.screenshot(path="game_verified.png")
        print("Screenshot saved to game_verified.png")
        browser.close()

if __name__ == "__main__":
    run()
