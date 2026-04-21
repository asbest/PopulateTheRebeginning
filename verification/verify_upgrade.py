from playwright.sync_api import sync_playwright
import time
import os

def run_cuj(page):
    page.goto("file:///app/PopulateTheRebeginning.html")
    page.wait_for_timeout(1000)

    # Click "Begin" button on the story overlay first
    page.evaluate("""
        const beginBtn = document.querySelector('#story-overlay button');
        if (beginBtn) {
            beginBtn.click();
        }
    """)
    page.wait_for_timeout(2000)

    # Enable cheat to get mana and select unit easily
    page.evaluate("state.mana = 1000;")

    # Select player's unit
    page.evaluate("""
        const playerUnit = state.units.find(u => u.faction === 0 && u.type === 'wild');
        if (playerUnit) {
            state.selectedUnits = [playerUnit];
            playerUnit.selectRing.visible = true;
            window.updateContextMenus();
        }
    """)
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/screenshots/verification_selected.png", animations="disabled", timeout=0)

    # Click the upgrade button
    page.evaluate("""
        const btn = document.getElementById('btn-upgrade_unit');
        if (btn) btn.click();
    """)
    page.wait_for_timeout(1000)

    # Take screenshot of the upgrade effect
    page.screenshot(path="/home/jules/verification/screenshots/verification.png", animations="disabled", timeout=0)
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
