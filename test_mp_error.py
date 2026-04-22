from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.on("console", lambda msg: print(f"CONSOLE: {msg.text}"))

        page.goto("file:///app/PopulateTheRebeginning.html")
        page.wait_for_timeout(1000)

        # Click "Multiplayer" if possible, or directly trigger startHost
        page.evaluate("window.startHost()")

        # Keep waiting to see if there's an error over time
        for i in range(10):
            page.wait_for_timeout(1000)
            status = page.evaluate("document.getElementById('mp-status').innerText")
            print(f"Status at {i}s: {status}")

        browser.close()

if __name__ == "__main__":
    run()
