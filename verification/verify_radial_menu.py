from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto("http://localhost:8000/PopulateTheRebeginning.html")
        page.wait_for_selector("#loading", state="hidden", timeout=10000)

        # Verify initial state: Main icon should show Foot, Basic menu visible
        main_icon_text = page.inner_text("#main-icon")
        print(f"Initial Icon: {main_icon_text}")

        basic_menu_visible = page.is_visible("#menu-basic")
        print(f"Basic Menu Visible: {basic_menu_visible}")

        if "👣" not in main_icon_text or not basic_menu_visible:
            print("FAILURE: Initial state incorrect")

        # Perform Hold and Drag to Spells
        # Center of main icon
        box = page.locator("#main-icon").bounding_box()
        cx = box['x'] + box['width'] / 2
        cy = box['y'] + box['height'] / 2

        # Target: Spells option (data-tab="spells")
        # It's at translate(0px, -90px) relative to container top-left + padding?
        # Container is relative.
        # Actually we can just locate the element directly even if hidden/transparent?
        # It has opacity 0 but display block.
        # Let's get its box.

        # Simulate hold on main icon
        page.mouse.move(cx, cy)
        page.mouse.down()
        time.sleep(0.5) # Hold

        # We need to find where the spells option is.
        # In CSS: .radial-option[data-tab="spells"] { transform: translate(0px, -90px); }
        # Container is centered horizontally `margin: 0 auto`.
        # Spells option starts at top:10px, left:10px of container.
        # Then translated up 90px.
        # Let's try to drag mouse upwards by 100px.

        page.mouse.move(cx, cy - 100)
        time.sleep(0.2)
        page.mouse.up()

        # Verify Switch
        main_icon_text = page.inner_text("#main-icon")
        spells_visible = page.is_visible("#menu-spells")
        print(f"Post-Drag Icon: {main_icon_text}")
        print(f"Spells Menu Visible: {spells_visible}")

        if "⚡" in main_icon_text and spells_visible:
            print("SUCCESS: Radial menu switch worked")
        else:
            print("FAILURE: Switch failed")

        page.screenshot(path="/home/jules/verification/radial_interaction.png")

        browser.close()

if __name__ == "__main__":
    run()
