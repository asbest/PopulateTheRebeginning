from playwright.sync_api import sync_playwright
import os

def take_screenshots():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the game file
        file_path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto(f"file://{file_path}")

        # Wait for initialization
        page.wait_for_timeout(2000)

        # Screenshot 1: UI and Map
        page.screenshot(path="verification/ui_verification.png")

        # Screenshot 2: Create Fire Warrior (Simulated) and Zoom in
        page.evaluate("""() => {
            const safe = findNearestLand(0, 0);
            const u = new Humanoid(0, 'firewarrior', safe.x, safe.z);
            units.push(u);
            window.cameraLookAt.copy(u.mesh.position);
            window.viewScale = 10;
            window.updateCameraZoom();
            window.updateCameraPosition();
        }""")
        page.wait_for_timeout(1000) # Wait for potential particles
        page.screenshot(path="verification/firewarrior_verification.png")

        browser.close()

if __name__ == "__main__":
    take_screenshots()
