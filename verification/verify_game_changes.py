import os
import sys
from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the game file
        file_path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto(f"file://{file_path}")

        # Wait for initialization
        page.wait_for_timeout(2000)

        # 1. Verify Landbridge Width Logic
        print("Verifying Landbridge Width...")
        # Inspect the function source code for 'r = 4'.
        bridge_source = page.evaluate("window.castLandbridge.toString()")
        if "const r = 4" in bridge_source:
             print("SUCCESS: castLandbridge uses radius 4.")
        else:
             print(f"FAILURE: castLandbridge does not seem to use radius 4. Source snippet: {bridge_source[:200]}...")

        # 2. Verify WASD Controls
        print("Verifying WASD Controls...")
        # Simulate Key Press
        page.keyboard.down("w")
        page.wait_for_timeout(100)

        # Check keyboardVector
        kb_vec_y = page.evaluate("window.keyboardVector ? window.keyboardVector.y : null")
        if kb_vec_y == 1:
            print("SUCCESS: 'w' key updates keyboardVector.y to 1.")
        else:
            print(f"FAILURE: 'w' key did not update keyboardVector.y correctly. Value: {kb_vec_y}")

        page.keyboard.up("w")
        page.wait_for_timeout(100)
        kb_vec_y_up = page.evaluate("window.keyboardVector ? window.keyboardVector.y : null")
        if kb_vec_y_up == 0:
             print("SUCCESS: Releasing 'w' resets keyboardVector.y.")
        else:
             print(f"FAILURE: Releasing 'w' did not reset keyboardVector.y. Value: {kb_vec_y_up}")

        # 3. Verify Fire Warrior Visuals Code Presence
        print("Verifying Fire Warrior Visuals...")
        humanoid_source = page.evaluate("Humanoid.prototype.constructor.toString()")
        if "firewarrior" in humanoid_source and "emissive" in humanoid_source:
             print("SUCCESS: Humanoid constructor contains firewarrior logic with emissive material.")
        else:
             print("FAILURE: Humanoid constructor missing firewarrior emissive logic.")

        update_source = page.evaluate("Humanoid.prototype.update.toString()")
        if "spawnFire" in update_source or ("firewarrior" in update_source and "Particle" in update_source):
             print("SUCCESS: Humanoid update contains firewarrior particle logic.")
        else:
             print("FAILURE: Humanoid update missing firewarrior particle logic.")

        browser.close()

if __name__ == "__main__":
    verify_changes()
