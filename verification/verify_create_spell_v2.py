import os
from playwright.sync_api import sync_playwright

def verify_create_spell():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        file_path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto(f"file://{file_path}")
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Give mana
        page.evaluate("mana = 200; updateUI();")

        initial_count = page.evaluate("units.length")
        print(f"Initial unit count: {initial_count}")

        # Select Create spell
        page.evaluate("selectAction('create')")

        # Get Shaman position
        shaman_pos = page.evaluate("""() => {
            if(!shaman || !shaman.mesh) return null;
            return {x: shaman.mesh.position.x, z: shaman.mesh.position.z};
        }""")

        if not shaman_pos:
            print("FAILURE: Shaman not found.")
            return

        print(f"Shaman pos: {shaman_pos}")

        # Click very close to shaman (within range)
        # Create spell creates a new unit. Range check in performAction applies.
        # "10.0 + shaman.mesh.position.y" is the range.

        target_x = shaman_pos['x'] + 2
        target_z = shaman_pos['z'] + 2

        print(f"Casting at: {target_x}, {target_z}")

        page.evaluate(f"performAction({target_x}, {target_z})")
        page.wait_for_timeout(500)

        new_count = page.evaluate("units.length")
        print(f"New unit count: {new_count}")

        if new_count == initial_count + 1:
            print("SUCCESS: New unit created.")
        else:
            print("FAILURE: Unit count did not increase.")
            # Check mana
            current_mana = page.evaluate("mana")
            print(f"Current mana: {current_mana}")

        browser.close()

if __name__ == "__main__":
    verify_create_spell()
