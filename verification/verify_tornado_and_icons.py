import os
import sys
import time
from playwright.sync_api import sync_playwright

def verify_tornado_and_icons():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the game file
        file_path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto(f"file://{file_path}")

        # Wait for game initialization
        page.wait_for_timeout(2000)

        # 1. Verify UNIT_ICONS
        print("Verifying UNIT_ICONS...")
        icons = page.evaluate("window.UNIT_ICONS")
        expected_icons = {
            'wild': '👷',
            'warrior': '⚔️',
            'firewarrior': '🏹',
            'shaman': '🧙',
            'spy': '🕵️',
            'airship': '🎈'
        }

        for key, value in expected_icons.items():
            if icons.get(key) != value:
                print(f"FAIL: Icon for {key} is {icons.get(key)}, expected {value}")
                sys.exit(1)
            else:
                print(f"PASS: Icon for {key} is {value}")

        # 2. Verify Tornado Behavior
        print("\nVerifying Tornado Behavior...")

        # Pause game to prevent automatic updates interfering with our manual checks
        page.evaluate("window.isPaused = true")

        # Ensure Shaman exists
        shaman_exists = page.evaluate("window.units.some(u => u.isShaman)")
        if not shaman_exists:
            print("FAIL: No shaman found to cast spell.")
            sys.exit(1)

        # Cast Tornado
        page.evaluate("""
            const shaman = window.units.find(u => u.isShaman);
            if(shaman) {
                window.executeSpell('tornado', 0, 0, shaman);
            }
        """)

        # Check if Tornado added to activeEffects
        effect_count = page.evaluate("window.activeEffects.length")
        if effect_count == 0:
            print("FAIL: Tornado not added to activeEffects.")
            sys.exit(1)

        # Check initial moveDelay
        # Since we paused, it should be close to 5.0 (maybe slightly less if a frame ran before pause)
        initial_delay = page.evaluate("window.activeEffects[window.activeEffects.length-1].moveDelay")
        print(f"Initial moveDelay: {initial_delay}")

        # Allow slight deviation if frame ran
        if initial_delay < 4.8 or initial_delay > 5.0:
            print(f"FAIL: Initial moveDelay is {initial_delay}, expected ~5.0")
            sys.exit(1)

        print("Verifying stationary behavior...")
        # Get initial position
        initial_pos = page.evaluate("window.activeEffects[window.activeEffects.length-1].pos")

        # Manually update with dt=0.1 to simulate time passing but less than 5s
        # We do this 10 times = 1.0s
        for _ in range(10):
            page.evaluate("window.activeEffects[window.activeEffects.length-1].update(0.1)")

        current_pos = page.evaluate("window.activeEffects[window.activeEffects.length-1].pos")
        current_delay = page.evaluate("window.activeEffects[window.activeEffects.length-1].moveDelay")

        print(f"After 1.0s simulation: Delay={current_delay}, Pos={current_pos}")

        if abs(current_pos['x'] - initial_pos['x']) > 0.001 or abs(current_pos['z'] - initial_pos['z']) > 0.001:
             print("FAIL: Tornado moved while delay > 0")
             sys.exit(1)
        else:
             print("PASS: Tornado remained stationary.")

        if current_delay >= initial_delay:
             print("FAIL: moveDelay did not decrease.")
             sys.exit(1)

        # Force delay to expire
        print("Forcing moveDelay to expire...")
        page.evaluate("window.activeEffects[window.activeEffects.length-1].moveDelay = -1")

        # Update again
        page.evaluate("window.activeEffects[window.activeEffects.length-1].update(0.1)")
        final_pos = page.evaluate("window.activeEffects[window.activeEffects.length-1].pos")
        print(f"Pos after forcing expire: {final_pos}")

        if abs(final_pos['x'] - initial_pos['x']) < 0.001 and abs(final_pos['z'] - initial_pos['z']) < 0.001:
             print("FAIL: Tornado did NOT move after delay expired.")
             sys.exit(1)
        else:
             print("PASS: Tornado moved after delay expired.")

        browser.close()
        print("\nAll verifications passed!")

if __name__ == "__main__":
    verify_tornado_and_icons()
