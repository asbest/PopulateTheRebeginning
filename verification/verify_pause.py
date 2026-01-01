
import os
import time
from playwright.sync_api import sync_playwright, expect

def verify_pause(page):
    filepath = os.path.abspath("PopulateTheRebeginning.html")
    page.goto(f"file://{filepath}")

    expect(page.locator("#loading")).not_to_be_visible(timeout=10000)

    btn = page.locator("#btn-pause")
    expect(btn).to_be_visible()

    # Check initial text
    text = btn.inner_text()
    print(f"Initial Text: {text}")

    # Click
    btn.click()

    # Check updated text
    text_after = btn.inner_text()
    print(f"Text after click: {text_after}")

    page.screenshot(path="verification/pause_check.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={'width': 800, 'height': 600})
        try:
            verify_pause(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            browser.close()
