import os
from playwright.sync_api import sync_playwright

def verify_range_visual():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()

        # Load the HTML file
        file_path = os.path.abspath("PopulateTheRebeginning.html")
        page.goto(f"file://{file_path}")

        # Wait for loading
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # 1. Verify RangeRing Geometry Type
        # We can inspect the global variable 'rangeRing'
        geom_type = page.evaluate("rangeRing.geometry.type")
        print(f"Geometry Type: {geom_type}")
        if geom_type == "CylinderGeometry":
            print("SUCCESS: Range ring is a Cylinder.")
        else:
            print(f"FAILURE: Range ring is {geom_type}, expected CylinderGeometry.")

        # 2. Verify Visibility Logic
        # Initially invisible
        visible = page.evaluate("rangeRing.visible")
        print(f"Initial Visibility: {visible}")
        if not visible:
            print("SUCCESS: Initially invisible.")
        else:
            print("FAILURE: Initially visible.")

        # Select Spell
        page.evaluate("selectAction('blast')")
        page.wait_for_timeout(500)

        visible = page.evaluate("rangeRing.visible")
        print(f"Post-select Visibility: {visible}")
        if visible:
            print("SUCCESS: Visible after spell select.")
        else:
            print("FAILURE: Not visible after spell select.")

        # 3. Verify Position and Scale
        # Scale Y should be 60.
        scale_y = page.evaluate("rangeRing.scale.y")
        print(f"Scale Y: {scale_y}")
        if scale_y == 60:
            print("SUCCESS: Height scale is 60.")
        else:
            print(f"FAILURE: Scale Y is {scale_y}, expected 60.")

        # Take screenshot
        page.screenshot(path="verification/range_visual.png")
        print("Screenshot taken.")

        browser.close()

if __name__ == "__main__":
    verify_range_visual()
