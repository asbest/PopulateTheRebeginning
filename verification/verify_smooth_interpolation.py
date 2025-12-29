from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/PopulateTheRebeginning.html")
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Test smooth interpolation
        # Raise terrain at (10, 10)
        page.evaluate("""
            () => {
                terrainMods.set('10,10', 10);
            }
        """)

        # Check height at 10,10, 10.5,10, 11,10
        h10 = page.evaluate("getHeight(10, 10)")
        h10_5 = page.evaluate("getHeight(10.5, 10)")
        h11 = page.evaluate("getHeight(11, 10)")

        # Base height around 10,10 might vary, but modification should interpolate.
        # h10 should have +10. h11 should have +0 (as grid point).
        # h10.5 should have +5 (linear interpolation) plus base height.

        print(f"H(10,10): {h10}")
        print(f"H(10.5,10): {h10_5}")
        print(f"H(11,10): {h11}")

        # We can approximate base height by checking without mods?
        # Actually base height is deterministic.
        base10 = page.evaluate("getBaseHeight(10, 10)")
        base10_5 = page.evaluate("getBaseHeight(10.5, 10)")

        print(f"Base(10,10): {base10}")
        print(f"Base(10.5,10): {base10_5}")

        diff10 = h10 - base10
        diff10_5 = h10_5 - base10_5

        print(f"Diff 10: {diff10}")
        print(f"Diff 10.5: {diff10_5}")

        if abs(diff10 - 10) < 0.1 and abs(diff10_5 - 5) < 0.1:
            print("SUCCESS: Interpolation working")
        else:
            print("FAILURE: Interpolation check failed")

        browser.close()

if __name__ == "__main__":
    run()
