import os
from playwright.sync_api import sync_playwright

def verify_changes():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the HTML file directly
        file_path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto(f"file://{file_path}")

        # Wait for loading to finish
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # 1. Verify Convert Spell Removed and Spell Labels Updated
        # Click on Spells tab (middle icon in radial menu)
        # Note: Radial menu interaction is complex.
        # We can inspect the DOM directly for the spell buttons.
        # Buttons are in #menu-spells

        # Check if #btn-convert exists (Should NOT exist)
        convert_btn = page.query_selector("#btn-convert")
        if convert_btn:
            print("FAILURE: Convert button still exists!")
        else:
            print("SUCCESS: Convert button removed.")

        # Check labels for Blast
        blast_label = page.locator("#btn-blast .label").inner_text()
        print(f"Blast Label: '{blast_label}'")
        if blast_label.strip() == "10":
            print("SUCCESS: Blast label updated to cost only.")
        else:
            print(f"FAILURE: Blast label is '{blast_label}', expected '10'.")

        # 2. Verify Wildmen Removed
        # Check unit list content.
        # Initial units: Shaman (Player), Enemy Shaman, Enemy Hut, Enemy Tower.
        # Player Wildmen should be gone.

        # Wait a bit for initialization
        page.wait_for_timeout(2000)

        # Get all unit items
        unit_items = page.locator(".unit-item").all()
        print(f"Total units in list: {len(unit_items)}")

        # We can't easily check unit types from the list icons alone without mapping them back.
        # But we can check window.units in console.
        units_info = page.evaluate("""() => {
            return window.units.map(u => ({faction: u.faction, type: u.type}));
        }""")

        player_wildmen = [u for u in units_info if u['faction'] == 0 and u['type'] == 'wild']
        print(f"Player Wildmen Count: {len(player_wildmen)}")

        if len(player_wildmen) == 0:
            print("SUCCESS: No player wildmen found.")
        else:
            print(f"FAILURE: Found {len(player_wildmen)} player wildmen.")

        # 3. Verify Range Ring
        # Check if rangeRing exists in scene.
        # We can't easily check visibility without selecting a spell.
        # Select 'blast' action.
        page.evaluate("selectAction('blast')")
        page.wait_for_timeout(500)

        # Take screenshot of UI and Scene
        page.screenshot(path="verification/verification.png")
        print("Screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_changes()
