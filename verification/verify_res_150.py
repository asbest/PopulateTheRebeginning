from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/PopulateTheRebeginning.html")
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Verify CHUNK_RES value
        chunk_res = page.evaluate("CHUNK_RES")
        print(f"CHUNK_RES: {chunk_res}")

        # Verify we didn't break chunk generation (should be objects in scene)
        chunk_count = page.evaluate("Object.keys(chunks).length")
        print(f"Chunks Loaded: {chunk_count}")

        # Take a screenshot to ensure it renders without error
        page.screenshot(path="/home/jules/verification/high_res_terrain_150.png")

        browser.close()

if __name__ == "__main__":
    run()
