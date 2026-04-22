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

    # Expose CritterManager to window
    page.evaluate("""
        window._getBird = function() {
            // Find an object in the scene that might be a bird
            // We know state.scene has children. A bird group has 5 children (body, head, beak, tail, 2 wings -> 6 children)
            for (let i = 0; i < state.scene.children.length; i++) {
                let obj = state.scene.children[i];
                if (obj.isGroup && obj.children.length >= 5 && obj.position.y > 15) {
                    return obj;
                }
            }
            return null;
        }
    """)

    # Move camera to the sky and find a bird
    page.evaluate("""
        const bird = window._getBird();
        if (bird) {
            state.cameraX = bird.position.x;
            state.cameraZ = bird.position.z + 2; // Closer to see detail
            state.cameraZoom = 2; // closer

            // Just for the screenshot, let's stop it
            bird.userData.speed = 0;
            // Let's modify the lookAt so we can see its side
            bird.rotation.y += Math.PI / 2;
        }
    """)
    page.wait_for_timeout(1000)
    page.screenshot(path="/home/jules/verification/screenshots/verification_birds.png", animations="disabled", timeout=0)

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
