from playwright.sync_api import sync_playwright
import os
import time

def run():
    with sync_playwright() as p:
        # Launch with args to help with rendering in headless (though webgl might still be software)
        browser = p.chromium.launch(headless=True, args=['--use-gl=egl'])
        page = browser.new_page()

        # Console logging
        page.on("console", lambda msg: print(f"Console: {msg.text}"))

        url = f"file://{os.getcwd()}/PopulateTheRebeginning.html"
        print(f"Navigating to {url}")
        page.goto(url)

        # Wait for game load
        try:
            page.wait_for_selector("#loading", state="hidden", timeout=10000)
            print("Game loaded")
        except:
            print("Loading timed out")
            browser.close()
            return

        # --- TEST 1: RADIAL MENU ---
        print("\n--- Test 1: Radial Menu ---")

        # Helper to get icon text
        def get_icon_text():
            return page.evaluate("document.getElementById('main-icon').innerText")

        print(f"Initial Icon: '{get_icon_text()}'")

        # Perform Drag to Spells
        main_icon = page.locator("#main-icon")
        box = main_icon.bounding_box()
        if not box:
            print("Could not find main-icon bounding box")
        else:
            center_x = box['x'] + box['width'] / 2
            center_y = box['y'] + box['height'] / 2

            # Hover & Hold
            page.mouse.move(center_x, center_y)
            page.mouse.down()
            page.wait_for_timeout(600) # Wait > 500ms for potentially safer hold logic (though no timer in code, just event)

            # Drag to Spells (Up 65px)
            # We move in steps to ensure 'mousemove' fires cleanly
            page.mouse.move(center_x, center_y - 30, steps=5)
            page.mouse.move(center_x, center_y - 65, steps=5)
            page.wait_for_timeout(500) # Wait for highlight

            # Release
            page.mouse.up()

            # Check Result
            page.wait_for_timeout(500) # Wait for DOM update
            text = get_icon_text()
            print(f"Icon after drag-to-spells: '{text}'")

            if '⚡' in text:
                print("PASS: Switched to Spells")
            else:
                print(f"FAIL: Expected '⚡', got '{text}'")
                page.screenshot(path="verification/fail_menu_spells.png")

            # Test Default Revert (Drag to nowhere)
            # Click hold again
            page.mouse.move(center_x, center_y)
            page.mouse.down()
            page.wait_for_timeout(500)
            page.mouse.move(center_x + 100, center_y, steps=5) # Drag right 100px (Void)
            page.wait_for_timeout(200)
            page.mouse.up()

            page.wait_for_timeout(500)
            text = get_icon_text()
            print(f"Icon after drag-to-void: '{text}'")

            if '👣' in text:
                print("PASS: Reverted to Walking")
            else:
                print(f"FAIL: Expected '👣', got '{text}'")
                page.screenshot(path="verification/fail_menu_revert.png")


        # --- TEST 2: WATER DAMAGE ---
        print("\n--- Test 2: Water Damage ---")

        # Inject test unit in deep water (h < 2.0).
        # We need to find a water spot.
        # We can use the noise function logic or just brute force find one via evaluate.
        page.evaluate("""
            window.testUnit = new Humanoid(0, 'wild', 0, 0);
            window.units.push(window.testUnit);

            // Force position to water (ensure height < 2.0)
            // We'll just override height function locally for this unit's position check
            // OR find a spot. Let's find a spot.
            let found = false;
            for(let x=0; x<100; x+=5) {
                if(getHeight(x, 0) < 1.5) {
                    window.testUnit.mesh.position.set(x, 1.0, 0);
                    found = true;
                    break;
                }
            }
            if(!found) {
                // Force water level?
                // Or just spawn it and manually setting position and forcing update
                window.testUnit.mesh.position.set(999, 1.0, 999); // Likely water far away
            }
        """)

        # Verify it is in water
        in_water = page.evaluate("getHeight(window.testUnit.mesh.position.x, window.testUnit.mesh.position.z) < 2.0")
        if not in_water:
            print("Could not find water spot easily, forcing damage test by mocking height check? No, integration test better.")
            print("Skipping Water Damage test due to setup difficulty in random terrain.")
        else:
            print("Unit spawned in water.")
            initial_hp = page.evaluate("window.testUnit.hp")
            print(f"Initial HP: {initial_hp}")

            # Wait 1 second
            page.wait_for_timeout(1000)

            final_hp = page.evaluate("window.testUnit.hp")
            print(f"Final HP (1s later): {final_hp}")

            # Damage should be 10% of 100 = 10.
            # So HP should be ~90.
            # Allow some margin for frame times (88-92)
            if 85 <= final_hp <= 95:
                print(f"PASS: Water damage applied correctly (Dropped ~{initial_hp - final_hp})")
            else:
                print(f"FAIL: Water damage incorrect. Expected drop ~10, got {initial_hp - final_hp}")


        # --- TEST 3: AI RANDOM WALK ---
        print("\n--- Test 3: AI Random Walk ---")

        # Force AI Think
        # 1. Ensure we have an idle enemy brave.
        page.evaluate("""
            // Create specific test AI unit
            window.aiTestUnit = new Humanoid(1, 'wild', 0, 0);
            // Put it on land
            const safe = findNearestLand(0, 0);
            window.aiTestUnit.mesh.position.set(safe.x, getHeight(safe.x, safe.z), safe.z);
            window.units.push(window.aiTestUnit);
            window.aiTestUnit.state = 'idle';
            window.aiTestUnit.target = null;
        """)

        print("Triggering AI Think...")
        page.evaluate("enemyAI.think()")

        # Check if unit started moving
        # The logic: 50% chance to move if idle.
        # We can try a few times if it doesn't move immediately.

        moved = False
        for i in range(5):
             state = page.evaluate("window.aiTestUnit.state")
             target = page.evaluate("window.aiTestUnit.target")
             if state == 'move' and target:
                 moved = True
                 print(f"AI Unit moved to {target}")
                 break

             # Force think again
             page.evaluate("enemyAI.think()")
             page.wait_for_timeout(100)

        if moved:
            print("PASS: AI Unit started moving randomly")
        else:
            print("FAIL: AI Unit did not move after multiple think cycles")

        browser.close()

if __name__ == "__main__":
    run()
