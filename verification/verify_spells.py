import os
from playwright.sync_api import sync_playwright

def run_cuj(page):
    file_path = os.path.abspath("PopulateTheRebeginning.html")
    page.goto(f"file://{file_path}")

    # Wait for loading
    page.wait_for_selector("#loading", state="hidden", timeout=30000)
    page.wait_for_timeout(2000)

    page.screenshot(path="/app/verification/verification.png")
    page.wait_for_timeout(1000)

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/app/verification/videos",
            viewport={'width': 1280, 'height': 720}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        finally:
            context.close()
            browser.close()
