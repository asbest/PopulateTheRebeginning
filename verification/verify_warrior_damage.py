from playwright.sync_api import sync_playwright
import os

def run():
    file_path = os.path.abspath("PopulateTheRebeginning.html")
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto(f"file://{file_path}")

        # Wait for initialization
        page.wait_for_timeout(1000)

        # Verify Warrior Damage
        damage = page.evaluate("""() => {
            const w = new Humanoid(0, 'warrior', 0, 0);
            return w.damage;
        }""")

        print(f"Warrior Damage: {damage}")

        if damage == 35:
            print("VERIFICATION PASSED: Warrior damage is 35.")
        else:
            print(f"VERIFICATION FAILED: Expected 35, got {damage}")
            exit(1)

        browser.close()

if __name__ == "__main__":
    run()
