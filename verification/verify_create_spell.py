import os
from playwright.sync_api import sync_playwright

def verify_create_spell():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the HTML file
        file_path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto(f"file://{file_path}")

        # Wait for loading
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # 1. Verify Create Button Exists
        create_btn = page.query_selector("#btn-create")
        if create_btn:
            print("SUCCESS: Create button found.")
            label = page.locator("#btn-create .label").inner_text()
            print(f"Create Label: '{label}'")
            if label.strip() == "100":
                print("SUCCESS: Label is 100.")
            else:
                print(f"FAILURE: Label is '{label}', expected '100'.")
        else:
            print("FAILURE: Create button not found.")

        # 2. Verify Spell Execution (Mocking mana and action)
        # We need to give player mana first, as cost is 100
        page.evaluate("mana = 200; updateUI();")

        # Get initial unit count
        initial_count = page.evaluate("units.length")
        print(f"Initial unit count: {initial_count}")

        # Select Create spell
        page.evaluate("selectAction('create')")

        # Click on terrain near shaman (assumed at 0,0 approx)
        # We'll click slightly offset
        page.evaluate("performAction(5, 5)")

        # Wait for potential update
        page.wait_for_timeout(500)

        new_count = page.evaluate("units.length")
        print(f"New unit count: {new_count}")

        if new_count == initial_count + 1:
            print("SUCCESS: New unit created.")
            # Verify type
            new_unit_type = page.evaluate("units[units.length-1].type")
            print(f"New unit type: {new_unit_type}")
            if new_unit_type == 'wild':
                print("SUCCESS: New unit is a brave (wild).")
            else:
                print("FAILURE: New unit type incorrect.")
        else:
            print("FAILURE: Unit count did not increase.")

        # Take screenshot
        page.screenshot(path="verification/create_spell_verification.png")
        print("Screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_create_spell()
