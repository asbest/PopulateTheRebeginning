from playwright.sync_api import sync_playwright
import time
import os

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(f"file://{os.getcwd()}/PopulateTheRebeginning.html")
        page.wait_for_selector("canvas")
        time.sleep(2) # Wait for init

        # Verify Cloud Opacity
        opacity = page.evaluate("""() => {
            const clouds = CloudManager.clouds;
            if(clouds.length > 0) {
                // Check first chunk of first cloud
                return clouds[0].mesh.children[0].material.opacity;
            }
            return -1;
        }""")

        print(f"Cloud Opacity: {opacity}")
        if opacity == 0.85:
            print("PASS: Cloud opacity is 0.85")
        else:
            print(f"FAIL: Cloud opacity is {opacity}")

        # Verify Cloud Speed
        speed = page.evaluate("""() => {
             const clouds = CloudManager.clouds;
             if(clouds.length > 0) return clouds[0].speed;
             return -1;
        }""")
        print(f"Cloud Speed Sample: {speed}")
        if 1.0 <= speed <= 3.0:
             print("PASS: Cloud speed is within reduced range [1, 3]")
        else:
             print(f"FAIL: Cloud speed {speed} is out of range")

        # Take Screenshot looking up
        # We'll rotate camera to look up
        page.evaluate("cameraRotation = 0; cameraLookAt.set(0,0,0); updateCameraPosition();")
        # Look up? It's ortho or perspective?
        # Ortho camera is fixed angle usually.
        # Let's just capture the scene. Clouds should be visible.
        page.screenshot(path="verification/clouds_final.png")
        print("Screenshot saved to verification/clouds_final.png")

        browser.close()

if __name__ == "__main__":
    run()
