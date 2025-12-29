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

        # Spawn enough units to overflow the list (e.g. 20 units)
        # Height is window height - 70 - 120. If window is 600, height is ~410.
        # Items are 32+5 = 37px. 20 * 37 = 740px. This should overflow.
        page.evaluate("""
            () => {
                for(let i=0; i<20; i++) {
                    units.push(new Humanoid(0, 'wild', 0, 0));
                }
                updateUnitList();
            }
        """)

        time.sleep(1)

        # Take screenshot of the unit list area
        page.screenshot(path="/home/jules/verification/unit_list_scrollbar.png", clip={"x":0, "y":0, "width":100, "height":600})

        # Check if scroll height > client height
        scroll_status = page.evaluate("""
            () => {
                const list = document.getElementById('unit-list');
                return {
                    scrollHeight: list.scrollHeight,
                    clientHeight: list.clientHeight,
                    isScrollable: list.scrollHeight > list.clientHeight
                };
            }
        """)
        print(f"Scroll Status: {scroll_status}")

        browser.close()

if __name__ == "__main__":
    run()
