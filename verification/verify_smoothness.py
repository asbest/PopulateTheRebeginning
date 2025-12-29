from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/PopulateTheRebeginning.html")
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Verify flatShading is false
        is_flat = page.evaluate("chunkTerrainMat.flatShading")
        print(f"flatShading: {is_flat}")

        # Take a screenshot to inspect smoothness
        page.screenshot(path="/home/jules/verification/smooth_terrain.png")

        browser.close()

if __name__ == "__main__":
    run()
