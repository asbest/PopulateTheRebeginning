import asyncio
from playwright.async_api import async_playwright
import os

async def run():
    async with async_playwright() as p:
        browser = await p.chromium.launch(
            args=['--no-sandbox', '--disable-setuid-sandbox']
        )
        page = await browser.new_page()

        # Capture logs
        page.on("console", lambda msg: print(f"BROWSER LOG: {msg.text}"))
        page.on("pageerror", lambda err: print(f"BROWSER ERROR: {err}"))

        url = 'file://' + os.getcwd() + '/PopulateTheRebeginning.html'
        print(f"Loading: {url}")
        await page.goto(url)

        print("Waiting 20 seconds for AI...")
        await page.wait_for_timeout(20000)

        enemy_buildings = await page.evaluate("() => buildings.filter(b => b.faction === 1 && !b.dead).length")
        print(f"Enemy Buildings: {enemy_buildings}")

        # Take screenshot regardless of result to visualize the state
        await page.screenshot(path="verification/game_screen.png")

        if enemy_buildings > 2:
            print("SUCCESS: Enemy AI has built new buildings.")
        else:
            print(f"FAILURE: Enemy AI failed to expand (Count: {enemy_buildings})")

        await browser.close()

if __name__ == "__main__":
    asyncio.run(run())
