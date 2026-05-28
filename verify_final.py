import asyncio
from playwright.async_api import async_playwright
import os

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await page.goto(f"file://{os.getcwd()}/PopulateTheRebeginning.html")

        # Wait for any potential loading
        await asyncio.sleep(2)

        # Inject code to force show everything needed
        await page.evaluate("""() => {
            const pauseMenu = document.getElementById('pause-menu');
            if (pauseMenu) pauseMenu.style.display = 'block';
            const cheatMenu = document.getElementById('cheat-menu');
            if (cheatMenu) cheatMenu.style.display = 'block';
            if (window.refreshStats) window.refreshStats();
        }""")

        # Wait for stats dashboard
        stats_dashboard = page.locator("#stats-dashboard")
        try:
            await stats_dashboard.wait_for(state="visible", timeout=5000)
        except:
            print("Dashboard not visible normally, checking style...")
            style = await stats_dashboard.evaluate("el => window.getComputedStyle(el).display")
            print(f"Stats Dashboard display style: {style}")
            parent_style = await page.evaluate("el => window.getComputedStyle(document.getElementById('cheat-menu')).display")
            print(f"Cheat Menu display style: {parent_style}")

        await asyncio.sleep(1)

        os.makedirs("verification/screenshots", exist_ok=True)
        # Screenshot the whole page to be sure
        await page.screenshot(path="verification/screenshots/stats_final.png")

        print(f"Screenshot taken.")
        await browser.close()

if __name__ == "__main__":
    asyncio.run(main())
