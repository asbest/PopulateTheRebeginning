import os
from playwright.sync_api import sync_playwright

def run_cuj(page):
    file_path = os.path.abspath("PopulateTheRebeginning.html")
    page.goto(f"file://{file_path}")

    # Wait for loading to finish
    try:
        page.wait_for_selector("#loading", state="hidden", timeout=30000)
        print("Game loaded successfully.")
    except Exception as e:
        print("Timeout waiting for game to load.")
        page.screenshot(path="/home/jules/verification/screenshots/error.png")
        raise e

    # Wait a bit for the terrain and chunks to render
    page.wait_for_timeout(2000)

    # Zoom out or move camera a bit to see more terrain
    # We can try to dispatch wheel events or just capture what's there
    for _ in range(5):
        page.mouse.wheel(0, 100)
        page.wait_for_timeout(500)

    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    os.makedirs("/home/jules/verification/videos", exist_ok=True)
    os.makedirs("/home/jules/verification/screenshots", exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={"width": 1280, "height": 720}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
