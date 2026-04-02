from playwright.sync_api import sync_playwright

def run_cuj(page):
    # Load game from local file path
    page.goto("file:///app/PopulateTheRebeginning.html")

    # Wait for the game to start
    page.wait_for_selector("#loading", state="hidden", timeout=30000)
    page.wait_for_timeout(1000)

    # Click pause button to open pause menu
    page.click("#btn-pause")
    page.wait_for_timeout(1000)

    # Take screenshot of pause menu showing "Tribes" button
    page.screenshot(path="/app/verification/pause_menu.png")

    # Click Tribes button
    page.get_by_role("button", name="Tribes").click()
    page.wait_for_timeout(1000)

    # Take screenshot of Tribes menu
    page.screenshot(path="/app/verification/tribes_menu_initial.png")

    # Add a new tribe
    page.get_by_role("button", name="Add Tribe").click()
    page.wait_for_timeout(1000)

    # Take screenshot of Tribes menu after adding a tribe
    page.screenshot(path="/app/verification/tribes_menu_added.png")

    # Change team of Player (first input)
    inputs = page.locator("#tribe-list input[type='number']").all()
    if len(inputs) > 0:
        inputs[0].fill("1")
        page.keyboard.press("Enter")
        page.wait_for_timeout(1000)

    # Take screenshot of Tribes menu after changing team
    page.screenshot(path="/app/verification/tribes_menu_team_changed.png")

    # Click Back
    page.get_by_role("button", name="Back").click()
    page.wait_for_timeout(1000)

    # Click Resume
    page.get_by_role("button", name="Resume").click()
    page.wait_for_timeout(2000)

    # Take final screenshot in game
    page.screenshot(path="/app/verification/game_after_changes.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context(
            record_video_dir="/app/verification/"
        )
        page = context.new_page()
        try:
            run_cuj(page)
        except Exception as e:
            print(f"Test failed: {e}")
        finally:
            context.close()
            browser.close()
