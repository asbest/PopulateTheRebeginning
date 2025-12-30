
from playwright.sync_api import sync_playwright
import os

def run():
    file_path = os.path.abspath('PopulateTheRebeginning.html')
    url = f'file://{file_path}'

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        page.goto(url)

        # Wait for game to initialize (remove loading screen)
        page.wait_for_selector('#loading', state='hidden', timeout=10000)

        # Wait a bit for game loop to run and AI to potentially do something (though 5s might be long for a test)
        # We mainly verify the game loads and UI is present
        page.wait_for_timeout(2000)

        # Take screenshot of the initial state
        page.screenshot(path='verification/game_screen.png')

        browser.close()

if __name__ == '__main__':
    run()
