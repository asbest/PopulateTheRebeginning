import os
from playwright.sync_api import sync_playwright

def run_cuj(page):
    page.goto(f"file://{os.path.abspath('PopulateTheRebeginning.html')}")
    page.wait_for_timeout(2000) # Wait for load and initialization

    # Let the AI build a bit
    page.wait_for_timeout(5000)

    # We can try to cast spells via executing JS to demonstrate them visually
    # Cast a few spells using the window.executeSpell method exposed
    page.evaluate("""
        const shaman = state.shaman;
        if(shaman) {
            // Give lots of mana
            state.mana = 10000;

            // Cast explosion/blast nearby
            window.executeSpell('blast', shaman.mesh.position.x + 10, shaman.mesh.position.z + 10, shaman);
        }
    """)
    page.wait_for_timeout(1500)

    page.evaluate("""
        const shaman = state.shaman;
        if(shaman) {
            // Cast healing
            window.executeSpell('heal', shaman.mesh.position.x, shaman.mesh.position.z, shaman);
        }
    """)
    page.wait_for_timeout(1500)

    page.evaluate("""
        const shaman = state.shaman;
        if(shaman) {
            // Cast raise to see dust
            window.executeSpell('raise', shaman.mesh.position.x + 15, shaman.mesh.position.z, shaman);
        }
    """)
    page.wait_for_timeout(1500)

    page.evaluate("""
        const shaman = state.shaman;
        if(shaman) {
            // Cast volcano
            window.executeSpell('volcano', shaman.mesh.position.x - 15, shaman.mesh.position.z, shaman);
        }
    """)
    page.wait_for_timeout(3000)

    page.evaluate("""
        const shaman = state.shaman;
        if(shaman) {
            // Cast tornado
            window.executeSpell('tornado', shaman.mesh.position.x, shaman.mesh.position.z + 15, shaman);
        }
    """)
    page.wait_for_timeout(3000)

    page.evaluate("""
        const shaman = state.shaman;
        if(shaman) {
            // Cast lightning
            window.executeSpell('lightning', shaman.mesh.position.x - 10, shaman.mesh.position.z - 10, shaman);
        }
    """)
    page.wait_for_timeout(500)

    # Take screenshot at the key moment
    page.screenshot(path="/home/jules/verification/screenshots/verification.png")
    page.wait_for_timeout(2000)  # Hold final state for the video

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=['--use-gl=swiftshader'])
        context = browser.new_context(
            record_video_dir="/home/jules/verification/videos",
            viewport={'width': 1280, 'height': 720}
        )
        page = context.new_page()
        try:
            run_cuj(page)
        except Exception as e:
            print(f"Error: {e}")
        finally:
            context.close()  # MUST close context to save the video
            browser.close()
