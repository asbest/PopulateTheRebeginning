from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        # Assuming server is running on port 8000
        page.goto("http://localhost:8000/PopulateTheRebeginning.html")

        # Wait for loading to finish
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Spawn some units to populate the list
        page.evaluate("""
            () => {
                // Spawn 10 wildmen to fill the list
                for(let i=0; i<10; i++) {
                    units.push(new Humanoid(0, 'wild', 0, 0));
                }
                updateUnitList();
            }
        """)

        time.sleep(1)

        # Take screenshot of the unit list area
        # We can clip the screenshot to the relevant area
        page.screenshot(path="/home/jules/verification/unit_list_ui.png", clip={"x":0, "y":0, "width":100, "height":600})

        # Also log the computed styles to verify dimensions
        styles = page.evaluate("""
            () => {
                const list = document.getElementById('unit-list');
                const item = document.querySelector('.unit-item');
                return {
                    listWidth: window.getComputedStyle(list).width,
                    itemWidth: item ? window.getComputedStyle(item).width : 'N/A',
                    itemHeight: item ? window.getComputedStyle(item).height : 'N/A'
                };
            }
        """)
        print(f"List Width: {styles['listWidth']}")
        print(f"Item Width: {styles['itemWidth']}")
        print(f"Item Height: {styles['itemHeight']}")

        browser.close()

if __name__ == "__main__":
    run()
